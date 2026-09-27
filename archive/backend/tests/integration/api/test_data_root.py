from __future__ import annotations
from tests.support.data_root import _FakeRuntime, _store
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, cast
import anyio
import pytest
from fastapi.testclient import TestClient
from ldaca_wordflow.main import RuntimeContextFactory, create_app
from ldaca_wordflow.runtime import Runtime
from ldaca_wordflow.settings import Settings



def test_control_plane_is_live_while_unconfigured_then_becomes_ready(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = _store(tmp_path)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[_FakeRuntime]:
        yield _FakeRuntime(settings.get_data_root())

    app = create_app(
        Settings(),
        cast(RuntimeContextFactory, factory),
        serve_frontend=False,
        data_root_config_store=store,
    )
    with TestClient(app, base_url="http://localhost") as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 503
        assert client.get("/api/session").status_code == 503
        initial = client.get("/api/data-root").json()
        assert initial["state"] == "unconfigured"
        assert initial["source"] == "none"
        assert initial["mutable"] is True
        assert initial["suggested_data_root"] == str(store.paths.suggested_data_root)

        denied = client.put(
            "/api/data-root",
            headers={
                "Origin": "http://localhost",
                "X-Data-Root-Token": "wrong-token",
            },
            json={"data_root": str(tmp_path / "denied")},
        )
        assert denied.status_code == 403

        response = client.put(
            "/api/data-root",
            headers={
                "Origin": "http://localhost",
                "X-Data-Root-Token": initial["change_token"],
            },
            json={"data_root": "~/selected"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["state"] == "ready"
        assert response.json()["data_root"] == str(tmp_path / "selected")
        assert response.json()["runtime_generation"] == 1
        assert client.get("/health/ready").status_code == 200


def test_failed_http_initialization_exposes_the_python_error_in_response_and_state(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[_FakeRuntime]:
        if settings.get_data_root().name == "selected":
            raise PermissionError("[Errno 13] Permission denied while opening SQLite")
        yield _FakeRuntime(settings.get_data_root())

    app = create_app(
        Settings(),
        cast(RuntimeContextFactory, factory),
        serve_frontend=False,
        data_root_config_store=store,
    )
    with TestClient(app, base_url="http://localhost") as client:
        initial = client.get("/api/data-root").json()
        response = client.put(
            "/api/data-root",
            headers={
                "Origin": "http://localhost",
                "X-Data-Root-Token": initial["change_token"],
            },
            json={"data_root": str(tmp_path / "selected")},
        )
        refreshed = client.get("/api/data-root")

    assert response.status_code == 500
    assert response.json()["code"] == "data_root_initialization_failed"
    assert response.json()["message"] == (
        "PermissionError: [Errno 13] Permission denied while opening SQLite"
    )
    assert refreshed.json()["error"] == {
        "code": "data_root_initialization_failed",
        "message": "PermissionError: [Errno 13] Permission denied while opening SQLite",
    }


def test_multi_user_startup_failure_exposes_diagnostic_but_redacts_paths(
    tmp_path: Path,
) -> None:
    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[_FakeRuntime]:
        raise OSError("database schema could not be loaded")
        yield _FakeRuntime(settings.get_data_root())

    app = create_app(
        Settings(
            data_root=tmp_path,
            multi_user=True,
            google_client_id="client",
            trusted_hosts=("wordflow.example",),
        ),
        cast(RuntimeContextFactory, factory),
        serve_frontend=False,
    )
    with TestClient(app, base_url="https://wordflow.example") as client:
        response = client.get("/api/data-root")

    assert response.status_code == 200
    assert response.json()["data_root"] is None
    assert response.json()["error"] == {
        "code": "data_root_unavailable",
        "message": "OSError: database schema could not be loaded",
    }


def test_http_switch_replaces_a_task_group_runtime_without_restarting_the_app(
    tmp_path: Path,
) -> None:
    store = _store(tmp_path)
    original = (tmp_path / "original").resolve()
    candidate = (tmp_path / "candidate").resolve()
    store.write(original)

    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[Runtime]:
        async with anyio.create_task_group():
            yield cast(Runtime, _FakeRuntime(settings.get_data_root()))

    app = create_app(
        Settings(),
        factory,
        serve_frontend=False,
        data_root_config_store=store,
    )
    with TestClient(app, base_url="http://localhost") as client:
        initial = client.get("/api/data-root").json()

        response = client.put(
            "/api/data-root",
            headers={
                "Origin": "http://localhost",
                "X-Data-Root-Token": initial["change_token"],
            },
            json={"data_root": str(candidate)},
        )

        assert response.status_code == 200, response.text
        assert response.json()["state"] == "ready"
        assert response.json()["data_root"] == str(candidate)
        assert response.json()["runtime_generation"] == 2
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 200
        assert store.read() == candidate


def test_multi_user_data_root_response_redacts_paths(tmp_path: Path) -> None:
    @asynccontextmanager
    async def factory(settings: Settings) -> AsyncIterator[_FakeRuntime]:
        yield _FakeRuntime(settings.get_data_root())

    app = create_app(
        Settings(
            data_root=tmp_path,
            multi_user=True,
            google_client_id="client",
            trusted_hosts=("wordflow.example",),
        ),
        cast(RuntimeContextFactory, factory),
        serve_frontend=False,
    )
    with TestClient(app, base_url="https://wordflow.example") as client:
        payload: dict[str, Any] = client.get("/api/data-root").json()
        assert payload["state"] == "ready"
        assert payload["data_root"] is None
        assert payload["suggested_data_root"] is None
        assert payload["change_token"] is None
        assert payload["mutable"] is False
