"""Authenticated account-level user preference routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from ..models.user_preferences import (
    AiDefaultModels,
    AiDefaultModelUpdate,
    UserPreferences,
    UserPreferencesPatch,
)
from .dependencies import RuntimeDep
from .responses import api_errors
from .security import CurrentSessionSecurityDep

router = APIRouter(
    prefix="/preferences",
    tags=["preferences"],
    responses=api_errors(401),
)


@router.get("", response_model=UserPreferences, responses=api_errors(500))
async def get_preferences(
    principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> UserPreferences:
    return await runtime.user_preference_store.get(principal.user.id)


@router.patch(
    "",
    response_model=UserPreferences,
    responses=api_errors(422, 500),
)
async def update_preferences(
    patch: UserPreferencesPatch,
    principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> UserPreferences:
    return await runtime.user_preference_store.update(principal.user.id, patch)


@router.get(
    "/ai-default-models",
    response_model=AiDefaultModels,
    responses=api_errors(500),
)
async def get_ai_default_models(
    principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> AiDefaultModels:
    """Each Annotation provider's default model, set in Settings, Servers."""

    return await runtime.user_preference_store.get_ai_default_models(principal.user.id)


@router.put(
    "/ai-default-models/{configuration_id}",
    response_model=AiDefaultModels,
    responses=api_errors(400, 422, 500),
)
async def set_ai_default_model(
    configuration_id: uuid.UUID,
    update: AiDefaultModelUpdate,
    principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> AiDefaultModels:
    """Set one provider's default model; null removes it."""

    return await runtime.user_preference_store.set_ai_default_model(
        principal.user.id, configuration_id, update.model
    )


__all__ = ["router"]
