"""Answers in code fences and server-enforced label schemas (issue 406).

Models behind LiteLLM/vLLM wrapped correct answers in Markdown code fences or
returned one label too few, so batches were halved down to single rows.
"""

from __future__ import annotations

from typing import Any

import pytest

from ldaca_wordflow.domain import AnnotationClass
from ldaca_wordflow.infrastructure.providers.annotation_adapter import (
    AnnotationResponseError,
    InferenceConfig,
)
from ldaca_wordflow.infrastructure.providers.annotation_ai import (
    _annotate_batch,
    align_labels,
    build_labels_schema,
)
from ldaca_wordflow.infrastructure.providers.annotation_openai import (
    _LABELS_SCHEMA_REJECTED,
    _THINKING_SWITCH_REJECTED,
    CustomOpenAICompatibleAnnotationAdapter,
    OpenAIAnnotationAdapter,
)
from ldaca_wordflow.analysis.annotation_examples import AnnotationExample

CLASSES = ["Promise", "Critic", "Neutral"]
CONFIG = InferenceConfig(temperature=0.0, reasoning_enabled=False, reasoning_effort="low")


# Tolerant parsing ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "content",
    [
        '{"labels": ["Promise", "critic", null]}',
        '```json\n{"labels": ["Promise", "critic", null]}\n```',
        '```\n{"labels": ["Promise", "critic", null]}\n```',
        '  ```JSON\n  {"labels": ["Promise", "critic", null]}\n```  \n',
        'Here are the labels:\n```json\n{"labels": ["Promise", "critic", null]}\n```\nDone.',
        'Sure! {"labels": ["Promise", "critic", null]} Hope this helps.',
    ],
)
def test_fenced_or_wrapped_answers_are_accepted(content: str) -> None:
    assert align_labels(content, 3, CLASSES) == ["Promise", "Critic", None]


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ('```json\n{"labels": ["Promise", "Critic"]}\n```', "exactly one label"),
        ('```json\n{"labels": ["Promise", "Critic", "Other"]}\n```', "unknown class"),
        ('```json\n["Promise", "Critic", null]\n```', '"labels" array'),
        ("```json\nnot json at all\n```", "not valid JSON"),
        ("I can't classify these.", "not valid JSON"),
    ],
)
def test_wrong_answers_still_fail(content: str, message: str) -> None:
    with pytest.raises(AnnotationResponseError, match=message):
        align_labels(content, 3, CLASSES)


# The labels schema ---------------------------------------------------------------------


def test_labels_schema_has_the_count_the_labels_and_null() -> None:
    schema = build_labels_schema(["Promise", "Critic", "Neutral", "Critic"], 20)

    assert schema == {
        "type": "object",
        "additionalProperties": False,
        "required": ["labels"],
        "properties": {
            "labels": {
                "type": "array",
                "minItems": 20,
                "maxItems": 20,
                "items": {"enum": ["Promise", "Critic", "Neutral", None]},
            }
        },
    }


@pytest.mark.anyio
async def test_each_batch_asks_for_its_own_count_and_example_labels() -> None:
    seen: list[Any] = []

    class _Adapter:
        async def complete(self, model, api_key, system, user, config) -> str:
            seen.append(config.labels_schema)
            return '{"labels": ["Promise", "Sarcasm"]}'

        async def list_models(self, api_key) -> list[str]:
            return []

    labels = await _annotate_batch(
        _Adapter(),
        "model",
        None,
        "Classify",
        [AnnotationClass(name=name) for name in CLASSES],
        ["one", "two"],
        CONFIG,
        0,
        [AnnotationExample(text="so great", label="Sarcasm")],
    )

    assert labels == ["Promise", "Sarcasm"]
    items = seen[0]["properties"]["labels"]
    assert (items["minItems"], items["maxItems"]) == (2, 2)
    assert items["items"]["enum"] == [*CLASSES, "Sarcasm", None]


# Sending it, and the 400 fallback --------------------------------------------------------


class _StatusError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


def _fake_openai(monkeypatch: pytest.MonkeyPatch, reject: Any) -> list[dict]:
    """Record each create(); ``reject(kwargs)`` says whether to answer 400."""

    calls: list[dict] = []

    class _Choice:
        finish_reason = "stop"
        message = type("Message", (), {"content": '{"labels": ["Promise"]}'})()

    class _Completions:
        async def create(self, **kwargs: Any) -> Any:
            calls.append(kwargs)
            if reject(kwargs):
                raise _StatusError(400)
            return type("Completion", (), {"choices": [_Choice()]})()

    class _FakeAsyncOpenAI:
        def __init__(self, **_kwargs: Any) -> None:
            self.chat = type("Chat", (), {"completions": _Completions()})()

        async def __aenter__(self) -> Any:
            return self

        async def __aexit__(self, *_exc: object) -> None:
            return None

    monkeypatch.setattr("openai.AsyncOpenAI", _FakeAsyncOpenAI)
    return calls


def _schema_config() -> InferenceConfig:
    return InferenceConfig(
        temperature=0.0,
        reasoning_enabled=False,
        reasoning_effort="low",
        labels_schema=build_labels_schema(CLASSES, 1),
    )


def _format_type(call: dict) -> str | None:
    value = call.get("response_format")
    return value.get("type") if isinstance(value, dict) else None


@pytest.fixture
def base_url() -> Any:
    url = "http://schema-test.local/v1"
    _LABELS_SCHEMA_REJECTED.discard(url)
    _THINKING_SWITCH_REJECTED.discard(url)
    yield url
    _LABELS_SCHEMA_REJECTED.discard(url)
    _THINKING_SWITCH_REJECTED.discard(url)


@pytest.mark.anyio
async def test_custom_providers_send_the_strict_labels_schema(
    monkeypatch: pytest.MonkeyPatch, base_url: str
) -> None:
    calls = _fake_openai(monkeypatch, lambda _kwargs: False)

    await CustomOpenAICompatibleAnnotationAdapter(base_url).complete(
        "model", None, "s", "u", _schema_config()
    )

    assert calls[0]["response_format"] == {
        "type": "json_schema",
        "json_schema": {
            "name": "labels",
            "strict": True,
            "schema": build_labels_schema(CLASSES, 1),
        },
    }
    assert calls[0]["extra_body"] == {"chat_template_kwargs": {"enable_thinking": False}}


@pytest.mark.anyio
async def test_a_server_that_rejects_the_schema_gets_the_request_without_it(
    monkeypatch: pytest.MonkeyPatch, base_url: str
) -> None:
    calls = _fake_openai(monkeypatch, lambda kwargs: _format_type(kwargs) == "json_schema")
    adapter = CustomOpenAICompatibleAnnotationAdapter(base_url)

    await adapter.complete("model", None, "s", "u", _schema_config())
    await adapter.complete("model", None, "s", "u", _schema_config())

    # First call: schema refused, sent again without it (thinking switch kept).
    assert [_format_type(call) for call in calls] == ["json_schema", None, None]
    assert all(call["extra_body"] is not None for call in calls)
    assert base_url in _LABELS_SCHEMA_REJECTED
    assert base_url not in _THINKING_SWITCH_REJECTED


@pytest.mark.anyio
async def test_a_server_that_rejects_the_thinking_switch_keeps_the_schema(
    monkeypatch: pytest.MonkeyPatch, base_url: str
) -> None:
    calls = _fake_openai(monkeypatch, lambda kwargs: kwargs["extra_body"] is not None)

    await CustomOpenAICompatibleAnnotationAdapter(base_url).complete(
        "model", None, "s", "u", _schema_config()
    )

    assert [(_format_type(c), c["extra_body"] is not None) for c in calls] == [
        ("json_schema", True),
        (None, True),
        ("json_schema", False),
    ]
    assert base_url in _THINKING_SWITCH_REJECTED
    assert base_url not in _LABELS_SCHEMA_REJECTED


@pytest.mark.anyio
async def test_a_request_rejected_for_another_reason_remembers_nothing(
    monkeypatch: pytest.MonkeyPatch, base_url: str
) -> None:
    calls = _fake_openai(monkeypatch, lambda _kwargs: True)

    with pytest.raises(Exception, match="HTTP 400"):
        await CustomOpenAICompatibleAnnotationAdapter(base_url).complete(
            "model", None, "s", "u", _schema_config()
        )

    assert len(calls) == 4
    assert base_url not in _LABELS_SCHEMA_REJECTED
    assert base_url not in _THINKING_SWITCH_REJECTED


@pytest.mark.anyio
async def test_openai_and_openrouter_keep_json_object(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_openai(monkeypatch, lambda _kwargs: False)

    await OpenAIAnnotationAdapter().complete("gpt", "key", "s", "u", _schema_config())

    assert calls[0]["response_format"] == {"type": "json_object"}
