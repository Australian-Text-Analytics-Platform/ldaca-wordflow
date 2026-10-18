"""Apollo LLM models with a one-line description each, for the model picker.

The ids come from the gateway's model list (filtered and ordered by
APOLLO_LLM_MODELS). Descriptions come from LiteLLM's `GET /model/info`
(`data[].model_name` -> `model_info.description`), fetched on the server with
the gateway key and cached for a few minutes; APOLLO_LLM_MODEL_DESCRIPTIONS
wins where set. A missing or failing /model/info never fails the list.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import anyio
import httpx

from .adapter import ApolloAnnotationAdapter
from .config import MODEL_DESCRIPTION_MAX_CHARS, apollo_settings

logger = logging.getLogger(__name__)

DESCRIPTIONS_CACHE_SECONDS = 300.0
# After a failed /model/info, try again sooner than after a good one.
DESCRIPTIONS_RETRY_SECONDS = 60.0
_DESCRIPTIONS_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


@dataclass(frozen=True, slots=True)
class ApolloModel:
    id: str
    description: str | None


class _DescriptionCache:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.expires_at = 0.0
        self.lock = anyio.Lock()


_cache = _DescriptionCache()


def reset_description_cache() -> None:
    """For tests and after a configuration change."""

    global _cache
    _cache = _DescriptionCache()


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
        text = info.get("description") if isinstance(info, dict) else None
        if not isinstance(name, str) or not isinstance(text, str):
            continue
        name, text = name.strip(), " ".join(text.split())
        # One model name can have several deployments; the first text wins.
        if name and text and name not in descriptions:
            descriptions[name] = text[:MODEL_DESCRIPTION_MAX_CHARS]
    return descriptions


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=_DESCRIPTIONS_TIMEOUT)


async def _fetch_gateway_descriptions() -> dict[str, str]:
    settings = apollo_settings()
    url = f"{settings.base_url}/model/info"
    try:
        async with _http_client() as client:
            response = await client.get(
                url, headers={"Authorization": f"Bearer {settings.gateway_key()}"}
            )
            response.raise_for_status()
            return _parse_model_info(response.json())
    except Exception as exc:  # noqa: BLE001 - descriptions are optional
        # The type only: a message could carry the URL or a key.
        logger.warning(
            "Apollo LLM model descriptions are unavailable (%s)", type(exc).__name__
        )
        raise


async def gateway_descriptions() -> dict[str, str]:
    """The gateway's descriptions, cached; {} when /model/info fails."""

    cache = _cache
    async with cache.lock:
        now = time.monotonic()
        if now < cache.expires_at:
            return cache.values
        try:
            cache.values = await _fetch_gateway_descriptions()
            cache.expires_at = now + DESCRIPTIONS_CACHE_SECONDS
        except Exception:  # noqa: BLE001 - logged in the fetch
            cache.values = {}
            cache.expires_at = now + DESCRIPTIONS_RETRY_SECONDS
        return cache.values


async def apollo_models() -> list[ApolloModel]:
    """Models in the configured order, each with its description or None."""

    ids = await ApolloAnnotationAdapter().list_models(None)
    descriptions = {**await gateway_descriptions(), **apollo_settings().model_descriptions}
    return [ApolloModel(model, descriptions.get(model)) for model in ids]


__all__ = ["ApolloModel", "apollo_models", "gateway_descriptions", "reset_description_cache"]
