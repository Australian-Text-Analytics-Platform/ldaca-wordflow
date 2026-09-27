"""Exercise FastAPI's SSE encoder through the real route with a finite source."""


import json

import anyio
import httpx

from fastapi.sse import ServerSentEvent

from ldaca_wordflow.api import events


async def test_events_are_framed_as_sse_and_finite_stream_terminates(
    files_test_client, monkeypatch
):
    closed = []

    async def finite_events(*_args):
        try:
            yield ServerSentEvent(
                event="stream_ready", data={"sequence": 7}, id="7", retry=1000
            )
            yield ServerSentEvent(
                event="resource_changed", data={"name": "Café"}, id="8"
            )
        finally:
            closed.append(True)

    monkeypatch.setattr(events, "_events", finite_events)

    async def app_with_lifespan_state(scope, receive, send):
        scope["state"] = files_test_client.app_state.copy()
        await files_test_client.app(scope, receive, send)

    with anyio.fail_after(2):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app_with_lifespan_state),
            base_url="http://testserver",
            cookies=dict(files_test_client.cookies),
        ) as client:
            response = await client.get("/api/events")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    frames = [
        frame
        for frame in response.text.replace("\r\n", "\n").split("\n\n")
        if frame.strip()
    ]
    decoded = [
        dict(line.split(": ", 1) for line in frame.splitlines()) for frame in frames
    ]
    assert [(frame["event"], frame["id"]) for frame in decoded] == [
        ("stream_ready", "7"),
        ("resource_changed", "8"),
    ]
    assert [json.loads(frame["data"]) for frame in decoded] == [
        {"sequence": 7},
        {"name": "Café"},
    ]
    assert decoded[0]["retry"] == "1000"
    assert closed == [True]
