"""Shared contract and safe policy primitives for Annotation providers."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from ...domain.annotation import AnnotationProviderFailureCode

INFERENCE_TIMEOUT_SECONDS = 300.0
# A connection that can't be opened fails fast; a long answer still has the
# full inference time.
INFERENCE_CONNECT_TIMEOUT_SECONDS = 15.0
MODEL_DISCOVERY_TIMEOUT_SECONDS = 90.0
MODEL_DISCOVERY_MAX_RETRIES = 1
ANSWER_TOKEN_HEADROOM = 4096

_CONTEXT_LIMIT_ERROR_MARKERS = (
    "context_length_exceeded",
    "maximum context length",
    "context window",
    "prompt is too long",
    "input token count",
    "too many input tokens",
    "exceeds the maximum number of tokens",
)
_REASONING_BUDGET_TOKENS: dict[str, int] = {
    "low": 1024,
    "medium": 4096,
    "high": 12000,
}


class AnnotationAiError(Exception):
    """One provider failure with a stable classification code."""

    def __init__(
        self,
        message: str,
        *,
        code: AnnotationProviderFailureCode = "annotation_provider_failed",
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class AnnotationContextLimitError(AnnotationAiError):
    """A request too large for the model's context window.

    ``limit`` is the window in tokens and ``requested`` the size of the
    refused request, where the provider's message states them (issue 493).
    """

    def __init__(
        self,
        message: str,
        *,
        limit: int | None = None,
        requested: int | None = None,
    ) -> None:
        super().__init__(
            message,
            code="annotation_provider_context_limit",
            retryable=False,
        )
        self.limit = limit
        self.requested = requested


_NUMBER = r"(\d[\d,]*)"
# How providers state the window and the refused request's size:
# OpenAI, vLLM, LiteLLM and OpenRouter: "maximum context length is 262144
# tokens. However, you requested 366000 tokens"; Anthropic: "prompt is too
# long: 213000 tokens > 200000 maximum"; Google: "The input token count
# (1234567) exceeds the maximum number of tokens allowed (1048576)".
_LIMIT_PATTERNS = (
    re.compile(rf"maximum context length (?:is|of) {_NUMBER}"),
    re.compile(rf"> {_NUMBER} maximum"),
    re.compile(rf"maximum number of tokens allowed \({_NUMBER}\)"),
    re.compile(rf"context (?:window|length) (?:is|of) {_NUMBER}"),
)
_REQUESTED_PATTERNS = (
    re.compile(rf"requested (?:about )?{_NUMBER} tokens"),
    re.compile(rf"{_NUMBER} tokens > "),
    re.compile(rf"input token count \({_NUMBER}\)"),
)


def _first_number(patterns: tuple[re.Pattern[str], ...], text: str) -> int | None:
    for pattern in patterns:
        found = pattern.search(text)
        if found is not None:
            value = int(found.group(1).replace(",", ""))
            if value > 0:
                return value
    return None


def context_limit_numbers(message: str) -> tuple[int | None, int | None]:
    """The context window and the refused request's tokens a refusal states."""

    text = message.casefold()
    return _first_number(_LIMIT_PATTERNS, text), _first_number(_REQUESTED_PATTERNS, text)


class AnnotationResponseError(AnnotationAiError):
    def __init__(self, message: str) -> None:
        super().__init__(
            message,
            code="annotation_provider_invalid_response",
            retryable=True,
        )


def completion_error(error: Exception, fallback: str) -> AnnotationAiError:
    """Normalize SDK status and transport failures into stable safe categories."""

    message = str(error) or fallback
    details = " ".join(
        (
            message,
            str(getattr(error, "code", "")),
            str(getattr(error, "body", "")),
        )
    ).casefold()
    if any(marker in details for marker in _CONTEXT_LIMIT_ERROR_MARKERS):
        limit, requested = context_limit_numbers(details)
        return AnnotationContextLimitError(message, limit=limit, requested=requested)
    status = getattr(error, "status_code", None)
    if not isinstance(status, int):
        status = getattr(getattr(error, "response", None), "status_code", None)
    if not isinstance(status, int):
        candidate = getattr(error, "code", None)
        status = candidate if isinstance(candidate, int) else None
    error_name = type(error).__name__.casefold()
    timed_out = (
        status in {408, 504}
        or isinstance(error, TimeoutError)
        or "timeout" in error_name
    )
    if status == 401:
        code: AnnotationProviderFailureCode = (
            "annotation_provider_authentication_failed"
        )
    elif status == 403:
        code = "annotation_provider_access_denied"
    elif status == 429:
        code = "annotation_provider_rate_limited"
    elif timed_out or (isinstance(status, int) and status >= 500):
        code = "annotation_provider_unavailable"
    elif isinstance(status, int) and 400 <= status < 500:
        code = "annotation_provider_request_rejected"
    else:
        if isinstance(error, (ConnectionError, TimeoutError)) or any(
            marker in error_name
            for marker in ("connection", "connect", "network", "timeout")
        ):
            code = "annotation_provider_unavailable"
        else:
            code = "annotation_provider_failed"
    return AnnotationAiError(
        message,
        code=code,
        # A timeout is retried too: a busy local server (a request queued
        # behind others) usually answers the next attempt.
        retryable=code
        in {
            "annotation_provider_rate_limited",
            "annotation_provider_unavailable",
        },
    )


@dataclass(frozen=True, slots=True)
class InferenceConfig:
    temperature: float
    reasoning_enabled: bool
    reasoning_effort: Literal["low", "medium", "high"]
    # The JSON schema of one batch's answer (issue 406): exactly one label per
    # text, each a known label or null. Adapters that can make the server
    # enforce it send it; the others ignore it.
    labels_schema: dict[str, Any] | None = None
    # Called with the request's prompt tokens when the provider reports them,
    # so batch sizes follow the model's own count (issue 493).
    on_usage: Callable[[int], None] | None = None


def reasoning_budget_tokens(effort: str) -> int:
    return _REASONING_BUDGET_TOKENS[effort]


def report_prompt_tokens(config: InferenceConfig, prompt_tokens: object) -> None:
    """Pass a provider's prompt token count on; never fails the request."""

    if config.on_usage is None or isinstance(prompt_tokens, bool):
        return
    if isinstance(prompt_tokens, int) and prompt_tokens > 0:
        config.on_usage(prompt_tokens)


def max_completion_tokens(config: InferenceConfig) -> int:
    if not config.reasoning_enabled:
        return ANSWER_TOKEN_HEADROOM
    return reasoning_budget_tokens(config.reasoning_effort) + ANSWER_TOKEN_HEADROOM


class AnnotationProviderAdapter(Protocol):
    """Minimal provider-specific surface consumed by shared orchestration."""

    async def complete(
        self,
        model: str,
        api_key: str | None,
        system: str,
        user: str,
        config: InferenceConfig,
    ) -> str: ...

    async def list_models(self, api_key: str | None) -> list[str]: ...

    # Optional: ``async def context_window(model, api_key) -> int | None``, the
    # tokens one request may hold, where the provider says (issue 493).


__all__ = [
    "ANSWER_TOKEN_HEADROOM",
    "AnnotationAiError",
    "AnnotationContextLimitError",
    "AnnotationProviderAdapter",
    "AnnotationResponseError",
    "INFERENCE_CONNECT_TIMEOUT_SECONDS",
    "INFERENCE_TIMEOUT_SECONDS",
    "InferenceConfig",
    "MODEL_DISCOVERY_MAX_RETRIES",
    "MODEL_DISCOVERY_TIMEOUT_SECONDS",
    "completion_error",
    "context_limit_numbers",
    "max_completion_tokens",
    "report_prompt_tokens",
    "reasoning_budget_tokens",
]
