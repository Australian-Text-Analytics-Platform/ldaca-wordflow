"""A browser or proxy that gives up mid-upload is not a server failure (issue 260).

nginx closes the upstream request when the client stops sending (408 after
client_body_timeout). The backend sees a disconnect while it reads the body; it
must answer with a quiet "upload interrupted", log no error, and leave no file.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ldaca_wordflow.main import create_app
from ldaca_wordflow.settings import Settings


async def _call(
    app, state, method: str, path: str, query: str, headers, events
) -> tuple[int, dict]:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": query.encode(),
        "root_path": "",
        "headers": [(b"host", b"testserver"), *headers],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
        "state": dict(state),
    }
    pending = list(events)
    sent: list[dict] = []

    async def receive() -> dict:
        return pending.pop(0) if pending else {"type": "http.disconnect"}

    async def send(message: dict) -> None:
        sent.append(message)

    await app(scope, receive, send)
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    body = b"".join(
        m.get("body", b"") for m in sent if m["type"] == "http.response.body"
    )
    return status, json.loads(body) if body else {}


@pytest.mark.anyio
async def test_dropped_upload_is_a_quiet_interruption(
    tmp_path: Path, capfd: pytest.CaptureFixture[str]
) -> None:
    settings = Settings(
        data_root=tmp_path,
        multi_user=False,
        session_cookie_secure=False,
        cors_allowed_origins=("http://testserver",),
        trusted_hosts=("testserver",),
    )
    app = create_app(settings, serve_frontend=False)
    async with app.router.lifespan_context(app) as state:
        _, session = await _call(
            app,
            state,
            "GET",
            "/api/session",
            "",
            [],
            [{"type": "http.request", "body": b""}],
        )
        capfd.readouterr()
        status, body = await _call(
            app,
            state,
            "POST",
            "/api/user-files/uploads",
            "path=big.zip",
            [
                (b"content-type", b"application/octet-stream"),
                (b"content-length", b"1000000"),
                (b"origin", b"http://testserver"),
                (b"x-csrf-token", session["csrf_token"].encode()),
            ],
            [
                {"type": "http.request", "body": b"x" * 1000, "more_body": True},
                {"type": "http.disconnect"},
            ],
        )

    assert (status, body["code"]) == (400, "upload_interrupted")
    # Wordflow logs through its own stderr handler, not the root logger.
    logged = capfd.readouterr().err
    assert "upload interrupted by the client" in logged
    assert "Unhandled request failure" not in logged
    assert "ERROR" not in logged
    files = tmp_path / "users" / "root" / "files"
    assert not (files / "big.zip").exists()
    assert list(files.rglob(".*.upload")) == []
