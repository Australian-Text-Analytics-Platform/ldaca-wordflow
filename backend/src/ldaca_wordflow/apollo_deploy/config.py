"""Apollo LLM deployment settings (deploy/apollo branch only).

Everything secret or site-specific comes from ``APOLLO_LLM_*`` environment
variables. Without ``APOLLO_LLM_BASE_URL`` the build behaves exactly like
upstream Wordflow. The provider name, its default selection and the limit of
one request at a time per user are fixed behaviour of this build, not settings.
"""

from __future__ import annotations

import functools
import uuid
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from ..domain.annotation import normalize_annotation_provider_base_url

APOLLO_PROVIDER_NAME = "Apollo LLM"
# A fixed configuration id, the same for every user and every restart, so a
# saved Annotation request keeps pointing at the Apollo provider.
APOLLO_CONFIGURATION_ID = uuid.UUID("3c4d70f7-4c43-5e66-9f39-6a4b478319bc")
# The browser and saved requests carry this placeholder, never the real
# gateway URL; the server swaps in APOLLO_LLM_BASE_URL when it calls out.
APOLLO_PLACEHOLDER_BASE_URL = "https://apollo-llm.invalid/v1"
# One in-flight request per user: one Run at a time, one request in a Run.
APOLLO_MAX_CONCURRENCY = 1
# The model list shows one line per model.
MODEL_DESCRIPTION_MAX_CHARS = 200


class ApolloSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APOLLO_LLM_",
        case_sensitive=False,
        extra="ignore",
        env_ignore_empty=True,
        frozen=True,
    )

    base_url: str | None = Field(default=None, max_length=2_000)
    api_key: SecretStr | None = None
    # A JSON array of model ids. When set, only these models are offered and
    # accepted, in this order.
    models: tuple[str, ...] = ()
    default_model: str | None = None
    # A JSON object, model id -> one line shown under the model in the model
    # list. Wins over the gateway's own description (LiteLLM /model/info).
    model_descriptions: dict[str, str] = Field(default_factory=dict)
    user_field: Literal["email", "subject"] = "email"

    @field_validator("base_url")
    @classmethod
    def normalize_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            return normalize_annotation_provider_base_url(value)
        except ValueError:
            # Never echo the value: it may hold credentials.
            raise ValueError(
                "APOLLO_LLM_BASE_URL must be an absolute HTTP(S) URL without "
                "user information, query or fragment"
            ) from None

    @field_validator("models")
    @classmethod
    def validate_models(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        models = tuple(item.strip() for item in value)
        if any(not item for item in models):
            raise ValueError("APOLLO_LLM_MODELS cannot contain empty model ids")
        if len(set(models)) != len(models):
            raise ValueError("APOLLO_LLM_MODELS cannot repeat a model id")
        return models

    @field_validator("model_descriptions")
    @classmethod
    def validate_model_descriptions(cls, value: dict[str, str]) -> dict[str, str]:
        descriptions: dict[str, str] = {}
        for model, text in value.items():
            model, text = model.strip(), " ".join(text.split())
            if not model or not text:
                raise ValueError(
                    "APOLLO_LLM_MODEL_DESCRIPTIONS needs non-empty model ids and texts"
                )
            if len(text) > MODEL_DESCRIPTION_MAX_CHARS:
                raise ValueError(
                    "APOLLO_LLM_MODEL_DESCRIPTIONS texts must be at most "
                    f"{MODEL_DESCRIPTION_MAX_CHARS} characters"
                )
            descriptions[model] = text
        return descriptions

    @model_validator(mode="after")
    def validate_complete(self) -> ApolloSettings:
        if self.base_url is None:
            return self
        if self.api_key is None or not self.api_key.get_secret_value().strip():
            raise ValueError("APOLLO_LLM_API_KEY is required with APOLLO_LLM_BASE_URL")
        if (
            self.default_model is not None
            and self.models
            and self.default_model not in self.models
        ):
            raise ValueError("APOLLO_LLM_DEFAULT_MODEL must be one of APOLLO_LLM_MODELS")
        return self

    @property
    def enabled(self) -> bool:
        return self.base_url is not None

    def gateway_key(self) -> str:
        if self.api_key is None:
            raise RuntimeError("Apollo LLM is not configured")
        return self.api_key.get_secret_value().strip()


@functools.cache
def apollo_settings() -> ApolloSettings:
    """Read once per process; spawned workers read the same environment."""

    return ApolloSettings()


__all__ = [
    "APOLLO_CONFIGURATION_ID",
    "APOLLO_MAX_CONCURRENCY",
    "APOLLO_PLACEHOLDER_BASE_URL",
    "APOLLO_PROVIDER_NAME",
    "ApolloSettings",
    "apollo_settings",
]
