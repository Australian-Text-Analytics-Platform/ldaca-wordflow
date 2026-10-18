"""One-line model descriptions for the Annotation model picker (issue 407).

Descriptions are optional and found on the server, in this order:
1. a ``description`` field on the provider's own model list (OpenRouter and
   Google include one);
2. for Custom OpenAI-compatible providers, LiteLLM's ``GET {base_url}/model/info``
   (``data[].model_name`` -> ``model_info.description``), asked with the same
   key, at most 5 s, cached per base URL and key. Anything else (404, 401, a
   timeout, another shape) means no descriptions; it never fails the list.
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


@dataclass(frozen=True, slots=True)
class ModelOption:
    id: str
    description: str | None = None


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


def _parse_model_info(payload: object) -> dict[str, str]:
    descriptions: dict[str, str] = {}
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return descriptions
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get("model_name")
        info = item.get("model_info")
        text = sanitize_description(info.get("description") if isinstance(info, dict) else None)
        # One model name can have several deployments; the first text wins.
        if isinstance(name, str) and name.strip() and text and name not in descriptions:
            descriptions[name.strip()] = text
    return descriptions


_cache: dict[tuple[str, str], tuple[float, dict[str, str]]] = {}


def clear_model_info_cache() -> None:
    _cache.clear()


def _key_fingerprint(api_key: str | None) -> str:
    return hashlib.sha256((api_key or "").encode("utf-8")).hexdigest()[:16]


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=MODEL_INFO_TIMEOUT_SECONDS, follow_redirects=False)


async def litellm_model_descriptions(base_url: str, api_key: str | None) -> dict[str, str]:
    """Descriptions from a LiteLLM gateway's /model/info; {} on any failure."""

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
        descriptions = (
            _parse_model_info(response.json()) if response.status_code == 200 else {}
        )
    except Exception as exc:  # noqa: BLE001 - descriptions are optional
        # The type only: a message could carry the URL or a key.
        logger.info("Model descriptions unavailable (%s)", type(exc).__name__)
        descriptions = {}
    ttl = MODEL_INFO_CACHE_SECONDS if descriptions else MODEL_INFO_RETRY_SECONDS
    _cache[cache_key] = (now + ttl, descriptions)
    return descriptions


__all__ = [
    "DESCRIPTION_MAX_CHARS",
    "ModelOption",
    "clear_model_info_cache",
    "litellm_model_descriptions",
    "sanitize_description",
]
