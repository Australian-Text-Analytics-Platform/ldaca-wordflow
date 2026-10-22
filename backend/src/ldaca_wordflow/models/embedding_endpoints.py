"""Remote embedding endpoints for Topic Modelling (issue 412 follow-up).

An endpoint is an OpenAI-compatible ``/v1/embeddings`` server, such as vLLM
behind a LiteLLM gateway, that embeds Topic Modelling's segments on a remote
GPU. It is set up apart from the AI providers used by Annotation: the same
gateway can serve both, but an embedding server need not run an LLM.

A server's own endpoints come from its providers file (``server_ai``); on a
desktop (single-user) people add their own, with an optional API key that is
stored privately and never returned.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, StringConstraints, field_validator

from ..domain.annotation import normalize_annotation_provider_base_url
from ..domain.workspace import TopicEmbeddingModel

EndpointName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]
ServedModelName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _check_base_url(value: str) -> str:
    try:
        return normalize_annotation_provider_base_url(value)
    except ValueError:
        # Never echo the value: it may hold credentials.
        raise ValueError(
            "The address must be an http or https URL without a user name, "
            "password, query or fragment, such as https://gateway.example/v1"
        ) from None


class EmbeddingEndpointCreate(_StrictModel):
    name: EndpointName
    base_url: str = Field(max_length=2_000)
    api_key: SecretStr | None = None
    # Topic Modelling model -> its name on this endpoint, chosen from the
    # endpoint's own list (EmbeddingEndpointModels); models it doesn't serve
    # are left out, and at least one is needed.
    models: dict[TopicEmbeddingModel, ServedModelName] = Field(min_length=1)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        return _check_base_url(value)


class EmbeddingEndpointUpdate(_StrictModel):
    """A partial update; ``api_key: null`` removes the key."""

    name: EndpointName | None = None
    base_url: str | None = Field(default=None, max_length=2_000)
    api_key: SecretStr | None = None
    models: dict[TopicEmbeddingModel, ServedModelName] | None = Field(default=None, min_length=1)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str | None) -> str | None:
        return None if value is None else _check_base_url(value)


class EmbeddingEndpointResource(_StrictModel):
    """An endpoint as the browser sees it: never a key, and for a server's
    endpoint a placeholder instead of its real address."""

    id: uuid.UUID
    name: str
    base_url: str
    source: Literal["server", "user"]
    has_api_key: bool
    models: dict[TopicEmbeddingModel, str]
    # Ticks Remote GPU in new Topic Modelling tabs (server endpoints only).
    default: bool


class EmbeddingEndpointList(_StrictModel):
    # "backend": people can add endpoints (desktop); "server": only the
    # server's own endpoints (a shared server keeps no personal keys).
    storage: Literal["backend", "server"]
    endpoints: list[EmbeddingEndpointResource]
    # How this Wordflow reads text without a Topic Modelling server: on the
    # Mac's GPU (Apple silicon, Core ML) or on the processor. Suggestions use it.
    local_embedding: Literal["gpu", "cpu"]


class EmbeddingEndpointCheck(_StrictModel):
    """What a check of an endpoint found; ``message`` explains a failure."""

    reachable: bool
    served_models: list[str]
    # For each Topic Modelling model: does the endpoint embed it?
    available: dict[TopicEmbeddingModel, bool]
    message: str | None


class EmbeddingEndpointModelsRequest(_StrictModel):
    """List a server's models before it is saved, which also checks the key.

    When changing a saved endpoint, ``endpoint_id`` lets the saved key be used
    if none is typed, but only for the address it was saved with.
    """

    base_url: str = Field(max_length=2_000)
    api_key: SecretStr | None = None
    endpoint_id: uuid.UUID | None = None

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        return _check_base_url(value)


class EmbeddingEndpointModels(_StrictModel):
    """A server's models for Topic Modelling, or why they couldn't be listed."""

    reachable: bool
    # The server's embedding models when it says which those are (LiteLLM),
    # otherwise every model it lists.
    models: list[str]
    # A likely name for each Topic Modelling model, only when unambiguous.
    suggested: dict[TopicEmbeddingModel, str]
    message: str | None


class StoredEmbeddingEndpoint(_StrictModel):
    id: uuid.UUID
    name: EndpointName
    base_url: str
    api_key: SecretStr | None = None
    models: dict[TopicEmbeddingModel, ServedModelName] = Field(min_length=1)


class StoredEmbeddingEndpoints(_StrictModel):
    """Private representation in the single user's ``embedding-endpoints.toml``."""

    schema_version: Literal[1] = 1
    endpoints: list[StoredEmbeddingEndpoint] = Field(default_factory=list)


__all__ = [
    "EmbeddingEndpointCheck",
    "EmbeddingEndpointCreate",
    "EmbeddingEndpointModels",
    "EmbeddingEndpointModelsRequest",
    "EmbeddingEndpointList",
    "EmbeddingEndpointResource",
    "EmbeddingEndpointUpdate",
    "StoredEmbeddingEndpoint",
    "StoredEmbeddingEndpoints",
]
