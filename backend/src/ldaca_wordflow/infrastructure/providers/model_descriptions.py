"""One-line model descriptions for the Annotation model picker (issue 407).

Descriptions are optional and found on the server, in this order:
1. a ``description`` field on the provider's own model list (OpenRouter and
   Google include one);
2. for Custom OpenAI-compatible providers, LiteLLM's ``GET {base_url}/model/info``
   (``data[].model_name`` -> ``model_info.description``), asked with the same
   key, at most 5 s, cached per base URL and key. Anything else (404, 401, a
   timeout, another shape) means no descriptions; it never fails the list.

The same two sources say what kind of model each is (``mode``): LiteLLM marks
embedding, OCR, rerank and other models that can't answer a chat request.
Annotation lists only chat models; Topic Modelling servers offer embedding
models (issues 415, 417).
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from dataclasses import dataclass

import anyio
import httpx

logger = logging.getLogger(__name__)

DESCRIPTION_MAX_CHARS = 200
MODEL_INFO_TIMEOUT_SECONDS = 5.0
MODEL_INFO_CACHE_SECONDS = 300.0
# A server without /model/info is asked again sooner than a working one.
MODEL_INFO_RETRY_SECONDS = 60.0

_HTML_TAG = re.compile(r"<[^>]{0,200}>")
_MARKDOWN_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_MARKDOWN_MARKS = re.compile(r"[*_`#>]+")


# Modes that answer a chat request; a model without a mode counts as chat.
CHAT_MODES = frozenset({"chat", "completion", "responses"})
EMBEDDING_MODE = "embedding"


@dataclass(frozen=True, slots=True)
class ModelOption:
    id: str
    description: str | None = None


@dataclass(frozen=True, slots=True)
class ModelInfo:
    """What LiteLLM's /model/info says: descriptions and each model's mode."""

    descriptions: dict[str, str]
    modes: dict[str, str]


def model_mode(value: object) -> str | None:
    """A model's mode in lower case, or None when it has none."""

    return value.strip().lower() or None if isinstance(value, str) else None


def is_chat_model(mode: str | None) -> bool:
    return mode is None or mode in CHAT_MODES


def sanitize_description(value: object) -> str | None:
    """Plain text on one line, at most 200 characters; None when empty."""

    if not isinstance(value, str):
        return None
    text = _MARKDOWN_LINK.sub(r"\1", _HTML_TAG.sub(" ", value))
    text = " ".join(_MARKDOWN_MARKS.sub("", text).split())
    if not text:
        return None
    if len(text) > DESCRIPTION_MAX_CHARS:
        text = text[: DESCRIPTION_MAX_CHARS - 1].rstrip() + "…"
    return text


def _parse_model_info(payload: object) -> ModelInfo:
    descriptions: dict[str, str] = {}
    modes: dict[str, str] = {}
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return ModelInfo(descriptions, modes)
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get("model_name")
        info = item.get("model_info")
        if not isinstance(name, str) or not name.strip():
            continue
        name = name.strip()
        info = info if isinstance(info, dict) else {}
        text = sanitize_description(info.get("description"))
        # One model name can have several deployments; the first value wins.
        if text and name not in descriptions:
            descriptions[name] = text
        mode = model_mode(info.get("mode"))
        if mode and name not in modes:
            modes[name] = mode
    return ModelInfo(descriptions, modes)


_cache: dict[tuple[str, str], tuple[float, ModelInfo]] = {}


def clear_model_info_cache() -> None:
    _cache.clear()


def _key_fingerprint(api_key: str | None) -> str:
    return hashlib.sha256((api_key or "").encode("utf-8")).hexdigest()[:16]


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=MODEL_INFO_TIMEOUT_SECONDS, follow_redirects=False)


async def litellm_model_descriptions(base_url: str, api_key: str | None) -> dict[str, str]:
    """Descriptions from a LiteLLM gateway's /model/info; {} on any failure."""

    return (await litellm_model_info(base_url, api_key)).descriptions


async def litellm_model_info(base_url: str, api_key: str | None) -> ModelInfo:
    """A LiteLLM gateway's /model/info; empty on any failure."""

    cache_key = (base_url, _key_fingerprint(api_key))
    cached = _cache.get(cache_key)
    now = time.monotonic()
    if cached is not None and now < cached[0]:
        return cached[1]
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        # The whole call, not each phase, is capped, so the list never waits longer.
        with anyio.fail_after(MODEL_INFO_TIMEOUT_SECONDS):
            async with _http_client() as client:
                response = await client.get(
                    f"{base_url.rstrip('/')}/model/info", headers=headers
                )
        info = (
            _parse_model_info(response.json())
            if response.status_code == 200
            else ModelInfo({}, {})
        )
    except Exception as exc:  # noqa: BLE001 - model info is optional
        # The type only: a message could carry the URL or a key.
        logger.info("Model descriptions unavailable (%s)", type(exc).__name__)
        info = ModelInfo({}, {})
    found = info.descriptions or info.modes
    ttl = MODEL_INFO_CACHE_SECONDS if found else MODEL_INFO_RETRY_SECONDS
    _cache[cache_key] = (now + ttl, info)
    return info


__all__ = [
    "CHAT_MODES",
    "DESCRIPTION_MAX_CHARS",
    "EMBEDDING_MODE",
    "ModelInfo",
    "ModelOption",
    "clear_model_info_cache",
    "is_chat_model",
    "litellm_model_descriptions",
    "litellm_model_info",
    "model_mode",
    "sanitize_description",
]
