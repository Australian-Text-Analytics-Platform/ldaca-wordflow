"""GET /api/apollo/provider: the built-in Apollo LLM provider, read-only."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from ..api.responses import api_errors
from ..api.security import CurrentSessionSecurityDep
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


__all__ = ["ApolloProvider", "router"]
