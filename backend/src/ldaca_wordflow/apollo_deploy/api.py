"""The built-in Apollo LLM provider, read-only.

GET /api/apollo/provider describes the provider; GET /api/apollo/models lists
its models with a one-line description each, for the model picker.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from ..api.responses import api_errors
from ..api.security import CurrentSessionSecurityDep
from ..domain.annotation import provider_failure_message
from ..infrastructure.providers.annotation_adapter import AnnotationAiError
from ..shared.errors import AnnotationProviderError, ProviderCredentialMissingError
from .catalogue import apollo_models
from .config import (
    APOLLO_CONFIGURATION_ID,
    APOLLO_MAX_CONCURRENCY,
    APOLLO_PLACEHOLDER_BASE_URL,
    APOLLO_PROVIDER_NAME,
    apollo_settings,
)


class ApolloProviderConfiguration(BaseModel):
    """Shaped like a provider configuration; never holds the key or real URL."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: uuid.UUID
    name: str
    provider: Literal["custom"]
    base_url: str
    has_api_key: Literal[True]


class ApolloProvider(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    enabled: bool
    configuration: ApolloProviderConfiguration | None
    default_model: str | None
    max_concurrency: int


class ApolloModelResource(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    description: str | None


class ApolloModels(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    models: list[ApolloModelResource]


router = APIRouter(prefix="/apollo", tags=["apollo"], responses=api_errors(401))


@router.get("/provider", response_model=ApolloProvider, responses=api_errors(500))
async def get_apollo_provider(_principal: CurrentSessionSecurityDep) -> ApolloProvider:
    settings = apollo_settings()
    if not settings.enabled:
        return ApolloProvider(
            enabled=False,
            configuration=None,
            default_model=None,
            max_concurrency=APOLLO_MAX_CONCURRENCY,
        )
    return ApolloProvider(
        enabled=True,
        configuration=ApolloProviderConfiguration(
            id=APOLLO_CONFIGURATION_ID,
            name=APOLLO_PROVIDER_NAME,
            provider="custom",
            base_url=APOLLO_PLACEHOLDER_BASE_URL,
            has_api_key=True,
        ),
        default_model=settings.default_model,
        max_concurrency=APOLLO_MAX_CONCURRENCY,
    )


@router.get(
    "/models",
    response_model=ApolloModels,
    responses=api_errors(409, 500, 502),
)
async def get_apollo_models(_principal: CurrentSessionSecurityDep) -> ApolloModels:
    if not apollo_settings().enabled:
        raise ProviderCredentialMissingError(
            f"{APOLLO_PROVIDER_NAME} is not available on this server"
        )
    try:
        models = await apollo_models()
    except AnnotationAiError as exc:
        raise AnnotationProviderError(
            exc.code,
            provider_failure_message(exc.code, "custom"),
            provider="custom",
        ) from exc
    return ApolloModels(
        models=[
            ApolloModelResource(id=model.id, description=model.description)
            for model in models
        ]
    )


__all__ = ["ApolloModels", "ApolloProvider", "router"]
