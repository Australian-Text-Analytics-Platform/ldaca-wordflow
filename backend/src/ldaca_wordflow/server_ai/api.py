"""GET /api/server-ai-providers: the server's own LLM providers, read-only (issue 411)."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from ..api.responses import api_errors
from ..api.security import CurrentSessionSecurityDep
from .config import server_ai_providers


class ServerAiProviderConfiguration(BaseModel):
    """Shaped like a provider configuration; never holds a key or the real address."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: uuid.UUID
    name: str
    provider: Literal["custom"]
    base_url: str
    has_api_key: Literal[True]


class ServerAiProviderResource(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    configuration: ServerAiProviderConfiguration
    default_model: str | None
    # Requests at once per person; null when the Run's own setting applies.
    max_requests_per_user: int | None


class ServerAiProviders(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    providers: list[ServerAiProviderResource]


router = APIRouter(
    prefix="/server-ai-providers",
    tags=["annotations"],
    responses=api_errors(401),
)


@router.get("", response_model=ServerAiProviders, responses=api_errors(500))
async def list_server_ai_providers(_principal: CurrentSessionSecurityDep) -> ServerAiProviders:
    return ServerAiProviders(
        providers=[
            ServerAiProviderResource(
                configuration=ServerAiProviderConfiguration(
                    id=provider.id,
                    name=provider.name,
                    provider="custom",
                    base_url=provider.placeholder_base_url,
                    has_api_key=True,
                ),
                default_model=provider.default_model,
                max_requests_per_user=provider.max_requests_per_user,
            )
            for provider in server_ai_providers().providers
        ]
    )


__all__ = ["ServerAiProviders", "router"]
