"""Server AI providers (issue 411): LLMs the server offers to every signed-in user.

A YAML file named by ``SERVER_AI_PROVIDERS_FILE`` lists them. Keys stay in the
environment; the file names the variable that holds each key. Without the
file, Wordflow offers no server providers and behaves as before.

    providers:
      - slug: apollo
        name: Apollo LLM
        base_url: https://litellm.example.edu.au/v1
        api_key_env: APOLLO_LLM_API_KEY
        models: [qwen3.8-27b]
        send_user: email
        max_requests_per_user: 1

See docs/deploy/server-ai-providers.md.
"""

from __future__ import annotations

import functools
import os
import re
import uuid
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from ..domain.annotation import normalize_annotation_provider_base_url

PROVIDERS_FILE_ENV = "SERVER_AI_PROVIDERS_FILE"
MODEL_DESCRIPTION_MAX_CHARS = 200
# The browser and saved requests see this placeholder, never the real address.
PLACEHOLDER_HOST_SUFFIX = ".server-ai.invalid"
_ID_NAMESPACE = uuid.UUID("5f0b8a4e-2b9c-4f7e-9d61-0c3a2e8b7d15")
_SLUG = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?")
_ENV_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,127}")


class ServerAiProvider(BaseModel):
    """One server-provided, OpenAI-compatible provider."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    slug: str
    name: str = Field(min_length=1, max_length=80)
    # Optional fixed id, so Projects saved against an earlier id still point
    # here (Apollo kept its id from the deploy/apollo build).
    configuration_id: uuid.UUID | None = None
    base_url: str = Field(max_length=2_000)
    api_key_env: str
    # Offer only these models, in this order; empty offers all the server lists.
    models: tuple[str, ...] = ()
    default_model: str | None = None
    model_descriptions: dict[str, str] = Field(default_factory=dict)
    # The OpenAI ``user`` field, from the signed-in account; never from the client.
    send_user: Literal["email", "subject", "none"] = "email"
    # Requests at once per person; empty means the Run's own setting.
    max_requests_per_user: int | None = Field(default=None, ge=1, le=32)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        if not _SLUG.fullmatch(value):
            raise ValueError("slug uses lower-case letters, digits and hyphens (up to 40)")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = " ".join(value.split())
        if not name:
            raise ValueError("name can't be empty")
        return name

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        try:
            return normalize_annotation_provider_base_url(value)
        except ValueError:
            # Never echo the value: it may hold credentials.
            raise ValueError(
                "base_url must be an absolute HTTP(S) URL without user information, "
                "query or fragment"
            ) from None

    @field_validator("api_key_env")
    @classmethod
    def validate_api_key_env(cls, value: str) -> str:
        if not _ENV_NAME.fullmatch(value):
            raise ValueError("api_key_env must be an environment variable name")
        return value

    @field_validator("models")
    @classmethod
    def validate_models(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        models = tuple(item.strip() for item in value)
        if any(not item for item in models):
            raise ValueError("models can't contain empty ids")
        if len(set(models)) != len(models):
            raise ValueError("models can't repeat an id")
        return models

    @field_validator("model_descriptions")
    @classmethod
    def validate_model_descriptions(cls, value: dict[str, str]) -> dict[str, str]:
        descriptions: dict[str, str] = {}
        for model, text in value.items():
            model, text = model.strip(), " ".join(str(text).split())
            if not model or not text:
                raise ValueError("model_descriptions needs non-empty model ids and texts")
            if len(text) > MODEL_DESCRIPTION_MAX_CHARS:
                raise ValueError(
                    f"model_descriptions texts must be at most {MODEL_DESCRIPTION_MAX_CHARS} characters"
                )
            descriptions[model] = text
        return descriptions

    @model_validator(mode="after")
    def validate_default_model(self) -> ServerAiProvider:
        if self.default_model is not None and self.models and self.default_model not in self.models:
            raise ValueError("default_model must be one of models")
        return self

    @property
    def id(self) -> uuid.UUID:
        """The configuration id the browser and saved requests use."""

        return self.configuration_id or uuid.uuid5(_ID_NAMESPACE, self.slug)

    @property
    def placeholder_base_url(self) -> str:
        return f"https://{self.slug}{PLACEHOLDER_HOST_SUFFIX}/v1"

    def api_key(self) -> str:
        key = os.environ.get(self.api_key_env, "").strip()
        if not key:
            raise RuntimeError(f"{self.api_key_env} is not set")
        return key


class _ProvidersFile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    providers: tuple[ServerAiProvider, ...] = ()

    @model_validator(mode="after")
    def validate_unique(self) -> _ProvidersFile:
        slugs = [provider.slug for provider in self.providers]
        ids = [provider.id for provider in self.providers]
        if len(set(slugs)) != len(slugs) or len(set(ids)) != len(ids):
            raise ValueError("each provider needs its own slug and configuration_id")
        return self


class ServerAiProviders:
    """The providers in one file, looked up by slug or configuration id."""

    def __init__(self, providers: tuple[ServerAiProvider, ...] = ()) -> None:
        self.providers = providers
        self._by_slug = {provider.slug: provider for provider in providers}
        self._by_id = {provider.id: provider for provider in providers}

    def __bool__(self) -> bool:
        return bool(self.providers)

    def by_slug(self, slug: str) -> ServerAiProvider | None:
        return self._by_slug.get(slug)

    def by_id(self, configuration_id: uuid.UUID | str | None) -> ServerAiProvider | None:
        if configuration_id is None:
            return None
        try:
            return self._by_id.get(uuid.UUID(str(configuration_id)))
        except ValueError:
            return None


def load_providers(path: Path) -> ServerAiProviders:
    """Read and check one providers file; the keys must be in the environment.

    Errors name the file and the problem, never a key.
    """

    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise ValueError(f"{PROVIDERS_FILE_ENV} ({path}) can't be read: {type(exc).__name__}") from None
    try:
        parsed = _ProvidersFile.model_validate(raw if raw is not None else {})
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(part) for part in error['loc']) or 'file'}: {error['msg']}"
            for error in exc.errors(include_input=False, include_url=False)
        )
        raise ValueError(f"{PROVIDERS_FILE_ENV} ({path}) is invalid: {problems}") from None
    for provider in parsed.providers:
        if not os.environ.get(provider.api_key_env, "").strip():
            raise ValueError(
                f"{PROVIDERS_FILE_ENV}: provider {provider.slug} needs {provider.api_key_env} set"
            )
    return ServerAiProviders(parsed.providers)


@functools.cache
def _load_cached(path: str) -> ServerAiProviders:
    return load_providers(Path(path))


def server_ai_providers() -> ServerAiProviders:
    """The configured providers, read once per process and file.

    Read from the environment, so spawned Analysis workers see the same file.
    """

    path = os.environ.get(PROVIDERS_FILE_ENV, "").strip()
    if not path:
        return ServerAiProviders()
    return _load_cached(path)


def clear_server_ai_providers() -> None:
    """For tests, and after the file changes."""

    _load_cached.cache_clear()


__all__ = [
    "MODEL_DESCRIPTION_MAX_CHARS",
    "PLACEHOLDER_HOST_SUFFIX",
    "PROVIDERS_FILE_ENV",
    "ServerAiProvider",
    "ServerAiProviders",
    "clear_server_ai_providers",
    "load_providers",
    "server_ai_providers",
]
