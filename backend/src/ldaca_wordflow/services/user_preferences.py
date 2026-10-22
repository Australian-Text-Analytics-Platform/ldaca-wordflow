"""Per-user account preference persistence."""

from __future__ import annotations

import logging
import uuid

import anyio
from pydantic import ValidationError

from ..infrastructure.storage.private_toml import (
    PrivateTomlError,
    PrivateTomlPersistence,
)
from ..models.user_preferences import (
    AI_DEFAULT_MODELS_SCHEMA_VERSION,
    MAX_AI_DEFAULT_MODELS,
    PREFERENCES_SCHEMA_VERSION,
    AiDefaultModels,
    StoredAiDefaultModels,
    StoredUserPreferences,
    UserPreferences,
    UserPreferencesPatch,
)
from ..shared.errors import InvalidInputError, UserPreferencesCorruptError

logger = logging.getLogger(__name__)
_PREFERENCES_FILENAME = "preferences.toml"
_AI_DEFAULT_MODELS_FILENAME = "ai-default-models.toml"

class UserPreferenceStore:
    """Own strict preference files under one lock per user."""

    def __init__(
        self,
        persistence: PrivateTomlPersistence,
    ) -> None:
        self._persistence = persistence
        self._locks: dict[str, anyio.Lock] = {}
        self._locks_guard = anyio.Lock()

    async def get(self, user_id: str) -> UserPreferences:
        async with await self._user_lock(user_id):
            preferences = await self._load(user_id)
        return UserPreferences.model_validate(
            preferences.model_dump(exclude={"schema_version"})
        )

    async def update(
        self,
        user_id: str,
        patch: UserPreferencesPatch,
    ) -> UserPreferences:
        async with await self._user_lock(user_id):
            preferences = await self._load(user_id)
            values = preferences.model_dump()
            for field in patch.model_fields_set:
                values[field] = getattr(patch, field)
            updated = StoredUserPreferences.model_validate(values)
            await self._write(user_id, updated)
        return UserPreferences.model_validate(
            updated.model_dump(exclude={"schema_version"})
        )

    async def _load(self, user_id: str) -> StoredUserPreferences:
        try:
            raw = await self._persistence.read(user_id, _PREFERENCES_FILENAME)
        except PrivateTomlError as exc:
            logger.warning("Invalid user preferences for user %s", user_id)
            raise UserPreferencesCorruptError() from exc
        if raw is None:
            preferences = StoredUserPreferences()
            await self._write(user_id, preferences)
            return preferences
        if raw.get("schema_version") != PREFERENCES_SCHEMA_VERSION:
            raise UserPreferencesCorruptError()
        try:
            return StoredUserPreferences.model_validate(raw)
        except ValidationError as exc:
            logger.warning("Invalid user preferences for user %s", user_id)
            raise UserPreferencesCorruptError() from exc

    async def _write(
        self,
        user_id: str,
        preferences: StoredUserPreferences,
    ) -> None:
        payload = preferences.model_dump(mode="json", exclude_none=True)
        try:
            await self._persistence.write(user_id, _PREFERENCES_FILENAME, payload)
        except PrivateTomlError as exc:
            raise UserPreferencesCorruptError() from exc

    async def get_ai_default_models(self, user_id: str) -> AiDefaultModels:
        """Each Annotation provider's default model for this person."""

        async with await self._user_lock(user_id):
            stored = await self._load_ai_default_models(user_id)
        return AiDefaultModels(models=stored.models)

    async def set_ai_default_model(
        self,
        user_id: str,
        configuration_id: uuid.UUID,
        model: str | None,
    ) -> AiDefaultModels:
        """Set one provider's default model, or remove it when ``model`` is None."""

        async with await self._user_lock(user_id):
            stored = await self._load_ai_default_models(user_id)
            models = dict(stored.models)
            if model is None:
                models.pop(configuration_id, None)
            else:
                if configuration_id not in models and len(models) >= MAX_AI_DEFAULT_MODELS:
                    raise InvalidInputError(
                        f"At most {MAX_AI_DEFAULT_MODELS} default models can be saved"
                    )
                models[configuration_id] = model
            updated = StoredAiDefaultModels(models=models)
            payload = updated.model_dump(mode="json")
            try:
                await self._persistence.write(user_id, _AI_DEFAULT_MODELS_FILENAME, payload)
            except PrivateTomlError as exc:
                raise UserPreferencesCorruptError() from exc
        return AiDefaultModels(models=updated.models)

    async def _load_ai_default_models(self, user_id: str) -> StoredAiDefaultModels:
        # Defaults are a convenience: an unreadable file is treated as empty
        # (and replaced on the next change) rather than blocking Annotation.
        try:
            raw = await self._persistence.read(user_id, _AI_DEFAULT_MODELS_FILENAME)
        except PrivateTomlError:
            logger.warning("Unreadable AI default models for user %s", user_id)
            return StoredAiDefaultModels()
        if raw is None:
            return StoredAiDefaultModels()
        if raw.get("schema_version") != AI_DEFAULT_MODELS_SCHEMA_VERSION:
            logger.warning("Unknown AI default models version for user %s", user_id)
            return StoredAiDefaultModels()
        try:
            return StoredAiDefaultModels.model_validate(raw)
        except ValidationError:
            logger.warning("Invalid AI default models for user %s", user_id)
            return StoredAiDefaultModels()

    async def _user_lock(self, user_id: str) -> anyio.Lock:
        async with self._locks_guard:
            return self._locks.setdefault(user_id, anyio.Lock())

__all__ = ["UserPreferenceStore"]
