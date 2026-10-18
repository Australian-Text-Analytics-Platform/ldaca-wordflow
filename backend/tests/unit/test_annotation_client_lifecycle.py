"""Every Annotation provider client is closed when its request ends (issue 404).

Clients left for the garbage collector made about 1 in 80 requests to a hosted
gateway hang until the 300 s timeout.
"""

from __future__ import annotations

import json
import os
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import anyio
import pytest

from ldaca_wordflow.infrastructure.providers.annotation_adapter import (
    AnnotationAiError,
    InferenceConfig,
)
from ldaca_wordflow.infrastructure.providers.annotation_anthropic import (
    AnthropicAnnotationAdapter,
)
from ldaca_wordflow.infrastructure.providers.annotation_google import (
    GoogleAnnotationAdapter,
)
from ldaca_wordflow.infrastructure.providers.annotation_openai import (
    _THINKING_SWITCH_REJECTED,
    CustomOpenAICompatibleAnnotationAdapter,
    OpenAIAnnotationAdapter,
)

CONFIG = InferenceConfig(temperature=0.0, reasoning_enabled=False, reasoning_effort="low")


class _StatusError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


class _Lifecycle:
    """Counts clients made and closed by one adapter call."""

    def __init__(self) -> None:
        self.created = 0
        self.closed = 0

    def assert_all_closed(self, expected_clients: int = 1) -> None:
        assert self.created == expected_clients
        assert self.closed == self.created


def _openai_fake(monkeypatch: pytest.MonkeyPatch, outcomes: list[Any]) -> _Lifecycle:
    lifecycle = _Lifecycle()

    class _Choice:
        finish_reason = "stop"
        message = type("Message", (), {"content": '{"labels": ["positive"]}'})()

    class _Completions:
        async def create(self, **_kwargs: Any) -> Any:
            outcome = outcomes.pop(0) if outcomes else None
            if isinstance(outcome, BaseException):
                raise outcome
            return type("Completion", (), {"choices": [_Choice()]})()

    class _Models:
        def list(self) -> Any:
            async def generate() -> Any:
                if outcomes and isinstance(outcomes[0], BaseException):
                    raise outcomes.pop(0)
                yield type("Model", (), {"id": "model-a"})()

            return generate()

    class _FakeAsyncOpenAI:
        def __init__(self, **_kwargs: Any) -> None:
            lifecycle.created += 1
            self.chat = type("Chat", (), {"completions": _Completions()})()
            self.models = _Models()

        async def __aenter__(self) -> _FakeAsyncOpenAI:
            return self

        async def __aexit__(self, *_exc: object) -> None:
            lifecycle.closed += 1

    monkeypatch.setattr("openai.AsyncOpenAI", _FakeAsyncOpenAI)
    return lifecycle


def _anthropic_fake(monkeypatch: pytest.MonkeyPatch, outcomes: list[Any]) -> _Lifecycle:
    from anthropic.types import TextBlock

    lifecycle = _Lifecycle()

    class _Messages:
        async def create(self, **_kwargs: Any) -> Any:
            if outcomes:
                raise outcomes.pop(0)
            return type(
                "Message",
                (),
                {"content": [TextBlock(type="text", text='{"labels": ["positive"]}')]},
            )()

    class _Models:
        def list(self) -> Any:
            async def generate() -> Any:
                if outcomes:
                    raise outcomes.pop(0)
                yield type("Model", (), {"id": "claude-a"})()

            return generate()

    class _FakeAsyncAnthropic:
        def __init__(self, **_kwargs: Any) -> None:
            lifecycle.created += 1
            self.messages = _Messages()
            self.models = _Models()

        async def __aenter__(self) -> _FakeAsyncAnthropic:
            return self

        async def __aexit__(self, *_exc: object) -> None:
            lifecycle.closed += 1

    monkeypatch.setattr("anthropic.AsyncAnthropic", _FakeAsyncAnthropic)
    return lifecycle


def _google_fake(monkeypatch: pytest.MonkeyPatch, outcomes: list[Any]) -> dict[str, int]:
    counts = {"created": 0, "async_closed": 0, "sync_closed": 0}

    class _Models:
        async def generate_content(self, **_kwargs: Any) -> Any:
            if outcomes:
                raise outcomes.pop(0)
            return type("Response", (), {"text": '{"labels": ["positive"]}'})()

        async def list(self) -> Any:
            if outcomes:
                raise outcomes.pop(0)

            async def generate() -> Any:
                yield type("Model", (), {"name": "models/gemini-a"})()

            return generate()

    class _Aio:
        def __init__(self) -> None:
            self.models = _Models()

        async def __aenter__(self) -> _Aio:
            return self

        async def __aexit__(self, *_exc: object) -> None:
            counts["async_closed"] += 1

    class _Client:
        def __init__(self, **_kwargs: Any) -> None:
            counts["created"] += 1
            self.aio = _Aio()

        def close(self) -> None:
            counts["sync_closed"] += 1

    monkeypatch.setattr("google.genai.Client", _Client)
    return counts


@pytest.mark.anyio
@pytest.mark.parametrize("fails", [False, True])
async def test_openai_requests_close_their_client(
    monkeypatch: pytest.MonkeyPatch, fails: bool
) -> None:
    lifecycle = _openai_fake(monkeypatch, [_StatusError(401)] if fails else [])
    adapter = OpenAIAnnotationAdapter()

    if fails:
        with pytest.raises(AnnotationAiError):
            await adapter.complete("gpt", "key", "system", "user", CONFIG)
    else:
        await adapter.complete("gpt", "key", "system", "user", CONFIG)

    lifecycle.assert_all_closed()


@pytest.mark.anyio
async def test_thinking_switch_retry_uses_and_closes_one_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_url = "http://lifecycle-test.local/v1"
    _THINKING_SWITCH_REJECTED.discard(base_url)
    lifecycle = _openai_fake(monkeypatch, [_StatusError(400)])

    result = await CustomOpenAICompatibleAnnotationAdapter(base_url).complete(
        "model", None, "system", "user", CONFIG
    )

    assert result == '{"labels": ["positive"]}'
    assert base_url in _THINKING_SWITCH_REJECTED
    lifecycle.assert_all_closed()
    _THINKING_SWITCH_REJECTED.discard(base_url)


@pytest.mark.anyio
@pytest.mark.parametrize("fails", [False, True])
async def test_openai_model_listing_closes_its_client(
    monkeypatch: pytest.MonkeyPatch, fails: bool
) -> None:
    lifecycle = _openai_fake(monkeypatch, [_StatusError(503)] if fails else [])

    if fails:
        with pytest.raises(AnnotationAiError):
            await OpenAIAnnotationAdapter().list_models("key")
    else:
        assert await OpenAIAnnotationAdapter().list_models("key") == ["model-a"]

    lifecycle.assert_all_closed()


@pytest.mark.anyio
@pytest.mark.parametrize("fails", [False, True])
async def test_anthropic_requests_and_listing_close_their_client(
    monkeypatch: pytest.MonkeyPatch, fails: bool
) -> None:
    outcomes: list[Any] = [_StatusError(429), _StatusError(429)] if fails else []
    lifecycle = _anthropic_fake(monkeypatch, outcomes)
    adapter = AnthropicAnnotationAdapter()

    if fails:
        with pytest.raises(AnnotationAiError):
            await adapter.complete("claude", "key", "system", "user", CONFIG)
        with pytest.raises(AnnotationAiError):
            await adapter.list_models("key")
    else:
        await adapter.complete("claude", "key", "system", "user", CONFIG)
        assert await adapter.list_models("key") == ["claude-a"]

    lifecycle.assert_all_closed(expected_clients=2)


@pytest.mark.anyio
@pytest.mark.parametrize("fails", [False, True])
async def test_google_requests_and_listing_close_both_clients(
    monkeypatch: pytest.MonkeyPatch, fails: bool
) -> None:
    outcomes: list[Any] = [_StatusError(500), _StatusError(500)] if fails else []
    counts = _google_fake(monkeypatch, outcomes)
    adapter = GoogleAnnotationAdapter()

    if fails:
        with pytest.raises(AnnotationAiError):
            await adapter.complete("gemini", "key", "system", "user", CONFIG)
        with pytest.raises(AnnotationAiError):
            await adapter.list_models("key")
    else:
        await adapter.complete("gemini", "key", "system", "user", CONFIG)
        assert await adapter.list_models("key") == ["gemini-a"]

    assert counts == {"created": 2, "async_closed": 2, "sync_closed": 2}


@pytest.mark.anyio
async def test_inference_fails_fast_to_connect_but_waits_for_long_answers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from openai import Timeout

    timeouts: list[Any] = []
    _openai_fake(monkeypatch, [])
    fake = __import__("openai").AsyncOpenAI
    original_init = fake.__init__

    def recording_init(self: Any, **kwargs: Any) -> None:
        timeouts.append(kwargs["timeout"])
        original_init(self, **kwargs)

    monkeypatch.setattr(fake, "__init__", recording_init)

    await OpenAIAnnotationAdapter().complete("gpt", "key", "system", "user", CONFIG)

    assert timeouts == [Timeout(300.0, connect=15.0)]


# Soak test against a real local server: off by default (a few hundred calls).

_SOAK_REQUESTS = int(os.environ.get("WORDFLOW_ANNOTATION_SOAK_REQUESTS", "0"))


class _ChatHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - base name
        return

    def do_POST(self) -> None:
        self.rfile.read(int(self.headers["Content-Length"]))
        body = json.dumps(
            {
                "id": "x",
                "object": "chat.completion",
                "created": 0,
                "model": "m",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "content": '{"labels": ["positive"]}',
                        },
                    }
                ],
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def local_chat_server() -> Iterator[str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _ChatHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/v1"
    finally:
        server.shutdown()


@pytest.mark.anyio
@pytest.mark.skipif(
    _SOAK_REQUESTS <= 0,
    reason="set WORDFLOW_ANNOTATION_SOAK_REQUESTS to run the soak test",
)
async def test_soak_no_request_waits_for_the_timeout(local_chat_server: str) -> None:
    adapter = OpenAIAnnotationAdapter(base_url=local_chat_server)
    limiter = anyio.CapacityLimiter(2)
    slow: list[int] = []

    async def one(index: int) -> None:
        async with limiter:
            with anyio.move_on_after(30) as scope:
                await adapter.complete("m", None, "system", "user", CONFIG)
            if scope.cancelled_caught:
                slow.append(index)

    async with anyio.create_task_group() as task_group:
        for index in range(_SOAK_REQUESTS):
            task_group.start_soon(one, index)

    assert slow == []
