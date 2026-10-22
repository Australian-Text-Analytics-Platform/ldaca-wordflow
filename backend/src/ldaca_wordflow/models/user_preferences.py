"""Strict account-level preference resources."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

PREFERENCES_SCHEMA_VERSION = 2


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UserPreferences(_StrictModel):
    """Non-secret preferences synchronized for one authenticated user."""

    hidden_views: list[str] = Field(default_factory=list)
    favorite_workspaces: list[str] = Field(default_factory=list)
    # On by default from the next 0.7.x update (issue 359). Saved preferences
    # keep the value they hold.
    analysis_multi_tab_enabled: bool = True
    contextual_hints_enabled: bool = True
    # Suggestions when a result or run looks off (issue 360).
    nudges_enabled: bool = True
    color_theme: Literal["light-2026", "dark-2026"] = "light-2026"

    @field_validator("hidden_views", "favorite_workspaces")
    @classmethod
    def unique_non_empty_values(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for value in values:
            normalized = value.strip()
            if normalized and normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned

class UserPreferencesPatch(_StrictModel):
    """Partial update; only explicitly provided fields are changed."""

    hidden_views: list[str] = Field(default_factory=list)
    favorite_workspaces: list[str] = Field(default_factory=list)
    analysis_multi_tab_enabled: bool = False
    contextual_hints_enabled: bool = True
    nudges_enabled: bool = True
    color_theme: Literal["light-2026", "dark-2026"] = "light-2026"

    @field_validator("hidden_views", "favorite_workspaces")
    @classmethod
    def unique_non_empty_values(cls, values: list[str]) -> list[str]:
        return UserPreferences.unique_non_empty_values(values)

class StoredUserPreferences(UserPreferences):
    """Schema-versioned representation persisted to preferences.toml."""

    schema_version: Literal[2] = Field(default=PREFERENCES_SCHEMA_VERSION, frozen=True)


# Each Annotation provider's default model (Settings, Servers). Kept in its own
# file, not preferences.toml: that file is strict, so a new field would make
# 0.7.15 and earlier refuse everyone's preferences after a rollback.
AI_DEFAULT_MODELS_SCHEMA_VERSION = 1
MAX_AI_DEFAULT_MODELS = 200

AiModelName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=300),
]


class AiDefaultModels(_StrictModel):
    """Default model per Annotation provider configuration (id to model name).

    Not secret. A new Annotation tab starts with a provider's default; a model
    chosen in the tab is kept with the tab.
    """

    models: dict[uuid.UUID, AiModelName] = Field(
        default_factory=dict, max_length=MAX_AI_DEFAULT_MODELS
    )


class AiDefaultModelUpdate(_StrictModel):
    """Set one provider's default model, or remove it with null."""

    model: AiModelName | None


class StoredAiDefaultModels(AiDefaultModels):
    schema_version: Literal[1] = Field(default=AI_DEFAULT_MODELS_SCHEMA_VERSION, frozen=True)


__all__ = [
    "AI_DEFAULT_MODELS_SCHEMA_VERSION",
    "AiDefaultModelUpdate",
    "AiDefaultModels",
    "MAX_AI_DEFAULT_MODELS",
    "StoredAiDefaultModels",
    "PREFERENCES_SCHEMA_VERSION",
    "StoredUserPreferences",
    "UserPreferences",
    "UserPreferencesPatch",
]
