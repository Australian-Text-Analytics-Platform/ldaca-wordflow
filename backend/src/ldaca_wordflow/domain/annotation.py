"""Shared annotation values used by durable and stateless requests."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

AnnotationProvider = Literal[
    "openai",
    "openrouter",
    "anthropic",
    "google",
    "custom",
]

AnnotationProviderFailureCode = Literal[
    "annotation_provider_authentication_failed",
    "annotation_provider_access_denied",
    "annotation_provider_rate_limited",
    "annotation_provider_request_rejected",
    "annotation_provider_unavailable",
    "annotation_provider_context_limit",
    "annotation_provider_invalid_response",
    "annotation_provider_failed",
]

_PROVIDER_NAMES: dict[str, str] = {
    "openai": "OpenAI",
    "openrouter": "OpenRouter",
    "anthropic": "Anthropic",
    "google": "Google",
}


def provider_failure_message(code: str, provider: str | None) -> str:
    """A plain sentence, with what to do, for one provider failure (issue 205).

    The provider's own text stays in the diagnostic, shown under Details.
    """

    name = _PROVIDER_NAMES.get(provider or "", "The AI provider")
    messages = {
        "annotation_provider_authentication_failed": (
            f"{name} rejected the API key. Check it in Settings."
        ),
        "annotation_provider_access_denied": (
            f"{name} refused access to this model. Check that your account can "
            "use it, or choose another model."
        ),
        "annotation_provider_rate_limited": (
            f"{name} is receiving too many requests. Wait a minute and try "
            "again, or send fewer rows at a time."
        ),
        "annotation_provider_request_rejected": (
            f"{name} rejected the request. Check the model and settings, then "
            "try again."
        ),
        "annotation_provider_unavailable": (
            f"{name} is not responding. Check your internet connection or the "
            "provider's status, then try again."
        ),
        "annotation_provider_context_limit": (
            "The text is too long for this model. Choose a model that takes "
            "longer texts, use fewer examples, or annotate shorter texts."
        ),
        "annotation_provider_invalid_response": (
            f"{name} returned an answer Wordflow couldn't read. Try again, or "
            "choose another model."
        ),
    }
    fallback_target = _PROVIDER_NAMES.get(provider or "", "the AI provider")
    return messages.get(code, f"The request to {fallback_target} failed. Try again.")


AnnotationExampleSamplingMethod = Literal["random", "first_n", "last_n"]

AnnotationClassName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1),
]


class AnnotationClass(BaseModel):
    """One exact label and optional model-facing description."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    name: AnnotationClassName = Field(max_length=200)
    description: str = Field(default="", max_length=2_000)


def normalize_annotation_provider_base_url(value: str) -> str:
    """Validate and normalize one trusted OpenAI-compatible API root."""

    candidate = value.strip()
    parsed = urlsplit(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Custom base URL must be an absolute HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Custom base URL cannot contain user information")
    if parsed.query or parsed.fragment:
        raise ValueError("Custom base URL cannot contain a query or fragment")
    return urlunsplit(
        (parsed.scheme.lower(), parsed.netloc, parsed.path.rstrip("/"), "", "")
    )


class AnnotationProviderSnapshot(BaseModel):
    """Safe immutable provider locator captured by an Annotation request."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_configuration_id: uuid.UUID
    provider: AnnotationProvider
    provider_base_url: str | None = Field(default=None, max_length=2_000)

    @field_validator("provider_base_url", mode="before")
    @classmethod
    def normalize_base_url(cls, value: object) -> object:
        if value is None or not isinstance(value, str):
            return value
        return normalize_annotation_provider_base_url(value)

    @model_validator(mode="after")
    def validate_locator(self) -> AnnotationProviderSnapshot:
        if self.provider == "custom" and self.provider_base_url is None:
            raise ValueError("Custom providers require a base URL")
        if self.provider != "custom" and self.provider_base_url is not None:
            raise ValueError("Built-in providers cannot define a base URL")
        return self


__all__ = [
    "AnnotationClass",
    "AnnotationExampleSamplingMethod",
    "AnnotationProvider",
    "AnnotationProviderFailureCode",
    "provider_failure_message",
    "AnnotationProviderSnapshot",
    "normalize_annotation_provider_base_url",
]
