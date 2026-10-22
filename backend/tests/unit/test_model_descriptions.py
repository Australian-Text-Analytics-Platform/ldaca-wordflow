"""Optional one-line model descriptions in the model list (issue 407)."""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import anyio
import httpx
import pytest
from fastapi.testclient import TestClient

from ldaca_wordflow.infrastructure.providers import model_descriptions
from ldaca_wordflow.infrastructure.providers.annotation_ai import list_model_options
from ldaca_wordflow.infrastructure.providers.annotation_anthropic import (
    AnthropicAnnotationAdapter,
)
from ldaca_wordflow.infrastructure.providers.annotation_openai import (
    CustomOpenAICompatibleAnnotationAdapter,
    OpenAIAnnotationAdapter,
)
from ldaca_wordflow.infrastructure.providers.model_descriptions import (
    ModelOption,
    sanitize_description,
)

BASE_URL = "https://gateway.example.edu/v1"
KEY = "sk-user-typed-key-0123456789"


@pytest.fixture(autouse=True)
def _fresh_cache() -> Iterator[None]:
    model_descriptions.clear_model_info_cache()
    yield
    model_descriptions.clear_model_info_cache()


def _install_models(monkeypatch: pytest.MonkeyPatch, items: list[dict[str, Any]]) -> list[dict]:
    """A fake OpenAI client whose /models returns ``items`` (extra fields kept)."""

    from openai.types import Model

    clients: list[dict] = []

    class _Models:
        def list(self) -> Any:
            async def generate() -> Any:
                for item in items:
                    yield Model.model_validate(
                        {"object": "model", "created": 0, "owned_by": "x", **item}
                    )

            return generate()

    class _FakeAsyncOpenAI:
        def __init__(self, **kwargs: Any) -> None:
            clients.append(kwargs)
            self.models = _Models()

        async def __aenter__(self) -> Any:
            return self

        async def __aexit__(self, *_exc: object) -> None:
            return None

    monkeypatch.setattr("openai.AsyncOpenAI", _FakeAsyncOpenAI)
    return clients


def _install_model_info(monkeypatch: pytest.MonkeyPatch, respond: Any) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return await respond(request)

    monkeypatch.setattr(
        model_descriptions,
        "_http_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    return seen


def _info(*items: tuple[str, Any]) -> Any:
    async def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": [
                    {"model_name": name, "model_info": {"description": text}}
                    for name, text in items
                ]
            },
        )

    return respond


# Sanitising ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("  Fastest;\n good for   large runs. ", "Fastest; good for large runs."),
        ("<b>Bold</b> and [a link](https://x.example) and **marks**", "Bold and a link and marks"),
        ("", None),
        ("   \n ", None),
        (None, None),
        (42, None),
    ],
)
def test_descriptions_are_plain_one_line_text(value: object, expected: str | None) -> None:
    assert sanitize_description(value) == expected


def test_long_descriptions_are_cut_at_200_characters() -> None:
    text = sanitize_description("word " * 100)
    assert text is not None
    assert len(text) == 200
    assert text.endswith("…")


# Where descriptions come from ------------------------------------------------------------


@pytest.mark.anyio
async def test_a_description_field_on_the_model_list_is_used(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_models(
        monkeypatch,
        [
            {"id": "beta/model", "description": "Second.\nLine."},
            {"id": "Alpha/model"},
        ],
    )

    options = await list_model_options(
        OpenAIAnnotationAdapter(base_url="https://openrouter.ai/api/v1"), "key"
    )

    # Order is unchanged: case-insensitive by id.
    assert options == [
        ModelOption("Alpha/model", None),
        ModelOption("beta/model", "Second. Line."),
    ]


@pytest.mark.anyio
async def test_custom_providers_add_litellm_model_info_descriptions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clients = _install_models(
        monkeypatch,
        [{"id": "qwen", "description": "From the list."}, {"id": "gemma"}, {"id": "ornith"}],
    )
    seen = _install_model_info(
        monkeypatch,
        _info(("gemma", "Fastest; good for large runs."), ("qwen", "Ignored: list wins.")),
    )

    options = await list_model_options(CustomOpenAICompatibleAnnotationAdapter(BASE_URL), KEY)

    assert options == [
        ModelOption("gemma", "Fastest; good for large runs."),
        ModelOption("ornith", None),
        ModelOption("qwen", "From the list."),
    ]
    # The key goes only to the provider's own base URL.
    assert clients[0]["base_url"] == BASE_URL
    assert [str(request.url) for request in seen] == [f"{BASE_URL}/model/info"]
    assert seen[0].headers["Authorization"] == f"Bearer {KEY}"


@pytest.mark.anyio
async def test_model_info_is_cached_per_base_url_and_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_models(monkeypatch, [{"id": "gemma"}])
    seen = _install_model_info(monkeypatch, _info(("gemma", "Fast.")))
    adapter = CustomOpenAICompatibleAnnotationAdapter(BASE_URL)

    await list_model_options(adapter, KEY)
    await list_model_options(adapter, KEY)
    await list_model_options(adapter, "another-key")

    assert len(seen) == 2


@pytest.mark.anyio
@pytest.mark.parametrize("status", [401, 404, 500])
async def test_a_gateway_without_model_info_lists_models_without_descriptions(
    monkeypatch: pytest.MonkeyPatch, status: int
) -> None:
    _install_models(monkeypatch, [{"id": "gemma"}])

    async def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": "nope"})

    _install_model_info(monkeypatch, respond)

    options = await list_model_options(CustomOpenAICompatibleAnnotationAdapter(BASE_URL), KEY)

    assert options == [ModelOption("gemma", None)]


@pytest.mark.anyio
async def test_a_slow_model_info_never_delays_the_list_beyond_its_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(model_descriptions, "MODEL_INFO_TIMEOUT_SECONDS", 0.2)
    _install_models(monkeypatch, [{"id": "gemma"}])

    async def respond(_request: httpx.Request) -> httpx.Response:
        await anyio.sleep(30)
        return httpx.Response(200, json={})

    _install_model_info(monkeypatch, respond)

    started = time.monotonic()
    options = await list_model_options(CustomOpenAICompatibleAnnotationAdapter(BASE_URL), KEY)

    assert options == [ModelOption("gemma", None)]
    assert time.monotonic() - started < 2


@pytest.mark.anyio
async def test_built_in_providers_never_ask_model_info(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_models(monkeypatch, [{"id": "gpt"}])
    seen = _install_model_info(monkeypatch, _info(("gpt", "x")))

    await list_model_options(OpenAIAnnotationAdapter(), "key")

    assert seen == []


@pytest.mark.anyio
async def test_providers_without_descriptions_list_ids_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def list_models(self: Any, api_key: str | None) -> list[str]:
        return ["claude-b", "claude-a"]

    monkeypatch.setattr(AnthropicAnnotationAdapter, "list_models", list_models)

    options = await list_model_options(AnthropicAnnotationAdapter(), "key")

    assert options == [ModelOption("claude-b"), ModelOption("claude-a")]


# The endpoint --------------------------------------------------------------------------


def test_the_models_endpoint_adds_descriptions_and_keeps_the_id_list(
    multi_user_test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_models(monkeypatch, [{"id": "qwen"}, {"id": "gemma"}])
    _install_model_info(monkeypatch, _info(("gemma", "Fastest; good for large runs.")))

    response = multi_user_test_client.post(
        "/api/annotation-providers/models",
        json={
            "provider_configuration_id": "9a7c2c64-3b55-4b2f-9a35-0f1bd3a2a001",
            "provider": "custom",
            "provider_base_url": BASE_URL,
            "api_key": KEY,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["models"] == ["gemma", "qwen"]
    assert body["model_descriptions"] == {"gemma": "Fastest; good for large runs."}
    assert KEY not in response.text


# Only chat models (issue 415) -------------------------------------------------------------


@pytest.mark.anyio
async def test_models_the_list_marks_as_embedding_or_ocr_are_not_offered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_models(
        monkeypatch,
        [
            {"id": "ornith"},
            {"id": "minilm-en", "mode": "embedding"},
            {"id": "ocr-model", "mode": "OCR"},
            {"id": "qwen", "mode": "chat"},
        ],
    )
    _install_model_info(monkeypatch, _info())

    options = await list_model_options(CustomOpenAICompatibleAnnotationAdapter(BASE_URL), KEY)

    assert [option.id for option in options] == ["ornith", "qwen"]


@pytest.mark.anyio
async def test_model_info_modes_hide_models_the_list_does_not_mark(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_models(monkeypatch, [{"id": "ornith"}, {"id": "minilm-en"}, {"id": "rerank"}])

    async def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": [
                    {"model_name": "ornith", "model_info": {"mode": "chat"}},
                    {"model_name": "minilm-en", "model_info": {"mode": "embedding"}},
                    {"model_name": "rerank", "model_info": {"mode": "rerank"}},
                ]
            },
        )

    _install_model_info(monkeypatch, respond)

    options = await list_model_options(CustomOpenAICompatibleAnnotationAdapter(BASE_URL), KEY)

    assert [option.id for option in options] == ["ornith"]
