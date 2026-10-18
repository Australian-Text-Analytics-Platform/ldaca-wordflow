"""New-version notice for Binder, pip and server (issue 386)."""

import pytest

from ldaca_wordflow.services import app_update
from ldaca_wordflow.services.app_update import deployment_kind, is_newer, version_key
from ldaca_wordflow.settings import Settings


def _settings(tmp_path, **overrides) -> Settings:
    return Settings(data_root=tmp_path, session_cookie_secure=False, **overrides)


def test_deployment_kind_is_set_or_detected(tmp_path):
    assert deployment_kind(_settings(tmp_path), {}) == "pip"
    assert deployment_kind(_settings(tmp_path), {"BINDER_LAUNCH_HOST": "https://b"}) == "binder"
    assert deployment_kind(_settings(tmp_path), {"LDACA_PARENT_PID": "42"}) == "desktop"
    assert deployment_kind(_settings(tmp_path, deployment_kind="server"), {}) == "server"


def test_versions_compare_by_number():
    assert version_key("v0.7.13") == (0, 7, 13)
    assert version_key("0.7.13.dev1") is None
    assert is_newer("0.7.14", "0.7.13")
    assert is_newer("0.8.0", "0.7.13")
    assert not is_newer("0.7.13", "0.7.13")
    assert not is_newer("0.7.9", "0.7.13")
    assert not is_newer("garbage", "0.7.13")


def test_prereleases_sort_between_releases():
    # 0.7.15-pre installs as 0.7.15rc0: newer than 0.7.14, older than 0.7.15.
    assert version_key("0.7.15rc0") == (0, 7, 15)
    assert version_key("0.7.15-pre") == (0, 7, 15)
    assert not is_newer("0.7.14", "0.7.15rc0")
    assert not is_newer("0.7.15-pre", "0.7.15rc0")
    assert is_newer("0.7.15", "0.7.15rc0")
    assert is_newer("0.7.15", "0.7.15-pre")
    assert is_newer("0.7.15rc1", "0.7.15rc0")
    assert is_newer("0.7.15rc0", "0.7.15b2")
    assert not is_newer("0.7.15rc0", "0.7.15")
    assert not is_newer("0.8", "0.8.0")
    assert is_newer("99.0.0", "0.7.15rc0")


@pytest.mark.parametrize(
    ("latest", "available"), [("99.0.0", True), ("0.0.1", False), (None, False)]
)
def test_app_update_reports_the_newest_release(files_test_client, monkeypatch, latest, available):
    asked: list[str] = []

    async def fake_latest_version(url: str):
        asked.append(url)
        return latest

    monkeypatch.setattr("ldaca_wordflow.api.app_update.latest_version", fake_latest_version)
    monkeypatch.setattr("ldaca_wordflow.api.app_update.version", lambda _name: "0.7.13")
    for name in ("BINDER_LAUNCH_HOST", "BINDER_REPO_URL", "BINDER_REF_URL", "BINDER_REQUEST", "LDACA_PARENT_PID"):
        monkeypatch.delenv(name, raising=False)

    response = files_test_client.get("/api/app-update")

    assert response.status_code == 200
    assert response.json() == {
        "deployment": "pip",
        "current_version": "0.7.13",
        "latest_version": latest,
        "update_available": available,
    }
    # One fetch of the pip copy of the update file, counted by GitHub.
    assert asked == [
        "https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow"
        "/releases/latest/download/latest-web-pip.json"
    ]


@pytest.mark.parametrize(("kind", "fetches"), [("pip", 1), ("binder", 1), ("server", 2)])
def test_pip_and_binder_ask_once_per_start_and_a_server_per_page_load(
    files_test_client, monkeypatch, kind, fetches
):
    asked: list[str] = []

    async def fake_latest_version(url: str):
        asked.append(url)
        return "99.0.0"

    monkeypatch.setattr("ldaca_wordflow.api.app_update.latest_version", fake_latest_version)
    monkeypatch.setattr("ldaca_wordflow.api.app_update.deployment_kind", lambda _settings: kind)

    for _ in range(2):
        assert files_test_client.get("/api/app-update").json()["update_available"]

    assert len(asked) == fetches
    assert asked[0].endswith(f"/latest-web-{kind}.json")


def test_desktop_backend_does_not_ask(files_test_client, monkeypatch):
    async def must_not_run(url: str):  # pragma: no cover - asserts it isn't called
        raise AssertionError(url)

    monkeypatch.setattr("ldaca_wordflow.api.app_update.latest_version", must_not_run)
    monkeypatch.setenv("LDACA_PARENT_PID", "42")

    body = files_test_client.get("/api/app-update").json()

    assert body["deployment"] == "desktop" and body["latest_version"] is None


async def test_latest_version_reads_the_update_file(monkeypatch):
    import httpx

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"version": "0.7.14", "notes": "…"})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        app_update.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    assert await app_update.latest_version("https://example.test/latest-web-pip.json") == "0.7.14"

    def failing(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    monkeypatch.setattr(
        app_update.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(failing), **kwargs),
    )
    assert await app_update.latest_version("https://example.test/missing.json") is None
