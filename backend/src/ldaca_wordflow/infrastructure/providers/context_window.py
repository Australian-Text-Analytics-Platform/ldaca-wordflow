"""A model's context window, where the provider says it (issue 493).

Annotation sizes its batches to the window, so it stops sending batches the
model must refuse. The window is optional and found in this order:

1. LiteLLM's ``GET {base_url}/model/info`` (``model_info.max_input_tokens``),
   for servers that may be a LiteLLM gateway; already fetched for the model
   descriptions (issue 407).
2. The provider's own model list, ``GET {base_url}/models``: OpenRouter gives
   ``context_length`` (and ``top_provider.context_length``) and vLLM gives
   ``max_model_len``.
3. A refusal: most providers state the limit in the error. Annotation reads
   it there and remembers it here (``remember_context_window``).

OpenAI's and Anthropic's model lists don't give the window. Anything else (a
404, a timeout, another shape) means the window is not known, and batches are
then sized by the number of texts alone, as before. A lookup never raises.
"""

from __future__ import annotations

import logging
import time

import anyio
import httpx

from .model_descriptions import (
    MODEL_INFO_CACHE_SECONDS,
    MODEL_INFO_RETRY_SECONDS,
    MODEL_INFO_TIMEOUT_SECONDS,
    _key_fingerprint,
    litellm_model_info,
    positive_int,
)

logger = logging.getLogger(__name__)

# Smaller numbers are not a context window (a wrong field, a per-minute
# limit): they count as not known.
MIN_CONTEXT_WINDOW = 1024

_listed: dict[tuple[str, str], tuple[float, dict[str, int]]] = {}
_learned: dict[tuple[str, str], int] = {}


def clear_context_window_cache() -> None:
    _listed.clear()
    _learned.clear()


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=MODEL_INFO_TIMEOUT_SECONDS, follow_redirects=False)


def _window(value: object) -> int | None:
    number = positive_int(value)
    return number if number is not None and number >= MIN_CONTEXT_WINDOW else None


def windows_from_model_list(payload: object) -> dict[str, int]:
    """Context windows in an OpenAI-style model list; {} for any other shape."""

    data = payload.get("data") if isinstance(payload, dict) else None
    windows: dict[str, int] = {}
    if not isinstance(data, list):
        return windows
    for item in data:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        top_provider = item.get("top_provider")
        candidates = [
            _window(item.get("context_length")),
            _window(top_provider.get("context_length"))
            if isinstance(top_provider, dict)
            else None,
            _window(item.get("max_model_len")),
        ]
        known = [value for value in candidates if value is not None]
        if known:
            # The smallest: the route a request takes may be the smaller one.
            windows[item["id"]] = min(known)
    return windows


async def _listed_windows(base_url: str, api_key: str | None) -> dict[str, int]:
    cache_key = (base_url, _key_fingerprint(api_key))
    cached = _listed.get(cache_key)
    now = time.monotonic()
    if cached is not None and now < cached[0]:
        return cached[1]
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    windows: dict[str, int] = {}
    try:
        with anyio.fail_after(MODEL_INFO_TIMEOUT_SECONDS):
            async with _http_client() as client:
                response = await client.get(
                    f"{base_url.rstrip('/')}/models", headers=headers
                )
        if response.status_code == 200:
            windows = windows_from_model_list(response.json())
    except Exception as exc:  # noqa: BLE001 - the window is optional
        # The type only: a message could carry the URL or a key.
        logger.info("Model list context windows unavailable (%s)", type(exc).__name__)
    ttl = MODEL_INFO_CACHE_SECONDS if windows else MODEL_INFO_RETRY_SECONDS
    _listed[cache_key] = (now + ttl, windows)
    return windows


def remember_context_window(source: str, model: str, window: int) -> None:
    """Keep a window a provider stated when it refused a request."""

    if window >= MIN_CONTEXT_WINDOW:
        _learned[(source, model)] = min(window, _learned.get((source, model), window))


def learned_context_window(source: str, model: str) -> int | None:
    return _learned.get((source, model))


async def fetch_context_window(
    base_url: str, api_key: str | None, model: str, *, model_info: bool
) -> int | None:
    """The model's context window from the server at ``base_url``, or None.

    ``model_info`` also asks LiteLLM's ``/model/info``, for servers that may be
    a gateway. Results are cached per base URL and key, as descriptions are.
    """

    try:
        if model_info:
            info = await litellm_model_info(base_url, api_key)
            window = _window(info.context_windows.get(model))
            if window is not None:
                return window
        return (await _listed_windows(base_url, api_key)).get(model)
    except Exception as exc:  # noqa: BLE001 - the window is optional
        logger.info("Context window unavailable (%s)", type(exc).__name__)
        return None


__all__ = [
    "MIN_CONTEXT_WINDOW",
    "clear_context_window_cache",
    "fetch_context_window",
    "learned_context_window",
    "remember_context_window",
    "windows_from_model_list",
]
