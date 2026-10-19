"""Apollo routes: the built-in Apollo LLM provider (read-only) and Run:ai sign-in info."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from ..api.responses import api_errors
from ..api.security import CurrentSessionSecurityDep
from .auth_config import apollo_auth_settings
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


class ApolloSession(BaseModel):
    """How this server signs people in; the client uses it to sign out properly."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    runai_proxy: bool
    # Where to send the browser after DELETE /api/session, so the Run:ai
    # sidecar's own session ends too. Null unless APOLLO_AUTH=runai_proxy.
    sign_out_url: str | None


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


@router.get("/session", response_model=ApolloSession)
async def get_apollo_session(_principal: CurrentSessionSecurityDep) -> ApolloSession:
    auth = apollo_auth_settings()
    if not auth.runai_proxy:
        return ApolloSession(runai_proxy=False, sign_out_url=None)
    return ApolloSession(runai_proxy=True, sign_out_url=auth.sign_out_url())


__all__ = ["ApolloProvider", "ApolloSession", "router"]
