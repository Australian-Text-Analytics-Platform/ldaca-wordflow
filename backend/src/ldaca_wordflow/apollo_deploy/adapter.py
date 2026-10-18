"""The Apollo LLM Annotation adapter: a LiteLLM gateway behind the server.

It takes a signed binding where other adapters take an API key, sends the
bound user as the OpenAI ``user`` field (for per-user billing in LiteLLM),
adds the gateway key and URL from the environment, retries rate limits with
backoff, and keeps the key out of every error it raises.
"""

from __future__ import annotations

import asyncio
import random
import re
from dataclasses import dataclass

from ..infrastructure.providers.annotation_adapter import (
    AnnotationAiError,
    InferenceConfig,
)
from ..infrastructure.providers.annotation_openai import OpenAIAnnotationAdapter
from ..infrastructure.providers.model_descriptions import ModelOption
from .binding import ApolloBindingError, decode_binding
from .config import APOLLO_PROVIDER_NAME, apollo_settings
from .gate import user_gate

# Rate limits (HTTP 429) are waited out here, so a busy gateway slows a Run
# down instead of failing its batches: about 3 minutes in all before the
# batch's own retries take over.
RATE_LIMIT_ATTEMPTS = 8
RATE_LIMIT_MAX_DELAY_SECONDS = 60.0
_KEY_PATTERNS = (
    (re.compile(r"sk-[A-Za-z0-9_\-.]{4,}"), "[redacted]"),
    (re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9_\-.=]{8,}"), r"\1[redacted]"),
    (
        re.compile(
            r"(?i)\b((?:api[ _-]?key|access[ _-]?token|token|authorization)"
            r"[\"']?\s*[:=]\s*[\"']?)(?!bearer\b)[^\s\"',}]+"
        ),
        r"\1[redacted]",
    ),
)


def redact(text: str) -> str:
    """Remove the gateway key, and anything that looks like a key, from text."""

    key = apollo_settings().api_key
    if key is not None and key.get_secret_value():
        text = text.replace(key.get_secret_value(), "[redacted]")
    for pattern, replacement in _KEY_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _safe(error: AnnotationAiError) -> AnnotationAiError:
    """The same failure without the provider exception chained to it."""

    error.args = (redact(str(error)),)
    error.__cause__ = None
    error.__context__ = None
    error.__suppress_context__ = True
    error.__traceback__ = None
    return error


def _retry_after(error: AnnotationAiError) -> float | None:
    response = getattr(error.__cause__, "response", None)
    headers = getattr(response, "headers", None)
    value = headers.get("retry-after") if headers is not None else None
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def _rate_limit_delay(attempt: int, retry_after: float | None) -> float:
    if retry_after is not None and retry_after >= 0:
        return min(retry_after, RATE_LIMIT_MAX_DELAY_SECONDS)
    base = min(2.0 ** (attempt + 1), RATE_LIMIT_MAX_DELAY_SECONDS)
    return base * random.uniform(0.75, 1.25)


@dataclass(frozen=True, slots=True)
class ApolloAnnotationAdapter:
    """Runs keep to one request at a time (``cap_concurrency``), as does the
    scheduler (one Run per user) and the gate (Previews)."""

    def _inner(self, end_user: str | None) -> OpenAIAnnotationAdapter:
        settings = apollo_settings()
        if not settings.enabled:
            raise AnnotationAiError(
                f"{APOLLO_PROVIDER_NAME} is not configured on this server",
                code="annotation_provider_failed",
            )
        return OpenAIAnnotationAdapter(
            base_url=settings.base_url,
            # LiteLLM forwards to many model servers: ask for JSON in the
            # prompt only, and send the thinking switch as Custom providers do.
            supports_json_response_format=False,
            send_thinking_switch=True,
            # vLLM behind LiteLLM enforces it: one known label (or null) per
            # text, so fenced or short answers don't split batches (#406).
            send_labels_schema=True,
            # Descriptions from LiteLLM's /model/info (#407).
            describe_from_model_info=True,
            end_user=end_user,
        )

    async def complete(
        self,
        model: str,
        api_key: str | None,
        system: str,
        user: str,
        config: InferenceConfig,
    ) -> str:
        try:
            binding = decode_binding(api_key)
        except ApolloBindingError as exc:
            raise AnnotationAiError(
                str(exc), code="annotation_provider_authentication_failed"
            ) from None
        settings = apollo_settings()
        if settings.models and model not in settings.models:
            raise AnnotationAiError(
                f"This model is not available through {APOLLO_PROVIDER_NAME}",
                code="annotation_provider_request_rejected",
            )
        inner = self._inner(binding.end_user)
        if binding.purpose == "preview":
            async with user_gate().preview(binding.user_id):
                return await self._complete(inner, model, system, user, config)
        return await self._complete(inner, model, system, user, config)

    async def _complete(
        self,
        inner: OpenAIAnnotationAdapter,
        model: str,
        system: str,
        user: str,
        config: InferenceConfig,
    ) -> str:
        key = apollo_settings().gateway_key()
        for attempt in range(RATE_LIMIT_ATTEMPTS):
            try:
                return await inner.complete(model, key, system, user, config)
            except AnnotationAiError as error:
                if (
                    error.code != "annotation_provider_rate_limited"
                    or attempt == RATE_LIMIT_ATTEMPTS - 1
                ):
                    raise _safe(error) from None
                delay = _rate_limit_delay(attempt, _retry_after(error))
            await asyncio.sleep(delay)
        raise AssertionError("Apollo rate-limit retry loop did not return")

    async def list_models(self, api_key: str | None) -> list[str]:
        """Models from the gateway, with the gateway key; the client's key is ignored."""

        return [option.id for option in await self.list_model_options(api_key)]

    async def list_model_options(self, api_key: str | None) -> list[ModelOption]:
        """Gateway models in the APOLLO_LLM_MODELS order, with descriptions.

        A description comes from APOLLO_LLM_MODEL_DESCRIPTIONS where set, else
        from the gateway (its /models list, then LiteLLM's /model/info).
        """

        settings = apollo_settings()
        try:
            listed = await self._inner(None).list_model_options(settings.gateway_key())
        except AnnotationAiError as error:
            raise _safe(error) from None
        if settings.models:
            by_id = {option.id: option for option in listed}
            listed = [by_id[model] for model in settings.models if model in by_id]
        overrides = settings.model_descriptions
        return [
            ModelOption(option.id, overrides.get(option.id, option.description))
            for option in listed
        ]


__all__ = ["ApolloAnnotationAdapter", "redact"]
