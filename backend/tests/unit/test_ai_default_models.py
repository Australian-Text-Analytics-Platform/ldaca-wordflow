"""Each Annotation provider's default model (Settings, Servers).

Kept in its own file so preferences.toml, which 0.7.15 reads strictly, is
never changed by it.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import anyio
import pytest
import rtoml

from ldaca_wordflow.infrastructure.storage.layout import (
    user_preferences_path,
    user_root,
)
from ldaca_wordflow.infrastructure.storage.private_toml import PrivateTomlPersistence
from ldaca_wordflow.models.user_preferences import MAX_AI_DEFAULT_MODELS
from ldaca_wordflow.services.user_preferences import UserPreferenceStore
from ldaca_wordflow.settings import Settings
from ldaca_wordflow.shared.errors import InvalidInputError

from ._storage import unlimited_storage_admission

PROVIDER = uuid.UUID("11111111-2222-4333-8444-555555555555")
OTHER = uuid.UUID("66666666-7777-4888-9999-aaaaaaaaaaaa")


def _store(tmp_path: Path) -> tuple[UserPreferenceStore, Settings]:
    settings = Settings(data_root=tmp_path)
    limiter = anyio.CapacityLimiter(2)
    persistence = PrivateTomlPersistence(
        settings.get_users_root_folder(),
        unlimited_storage_admission(tmp_path, limiter=limiter),
        limiter=limiter,
    )
    return UserPreferenceStore(persistence), settings


@pytest.mark.anyio
async def test_defaults_start_empty_and_are_set_and_removed(tmp_path: Path) -> None:
    store, settings = _store(tmp_path)

    assert (await store.get_ai_default_models("root")).models == {}

    await store.set_ai_default_model("root", PROVIDER, "  gpt-oss-120b ")
    result = await store.set_ai_default_model("root", OTHER, "claude-sonnet")
    assert result.models == {PROVIDER: "gpt-oss-120b", OTHER: "claude-sonnet"}

    result = await store.set_ai_default_model("root", PROVIDER, None)
    assert result.models == {OTHER: "claude-sonnet"}
    assert (await store.get_ai_default_models("root")).models == {OTHER: "claude-sonnet"}

    stored = rtoml.loads(
        (user_root(settings, "root") / "ai-default-models.toml").read_text(encoding="utf-8")
    )
    assert stored == {"schema_version": 1, "models": {str(OTHER): "claude-sonnet"}}


@pytest.mark.anyio
async def test_preferences_file_is_left_as_0715_reads_it(tmp_path: Path) -> None:
    store, settings = _store(tmp_path)
    await store.get("root")
    before = user_preferences_path(settings, "root").read_bytes()

    await store.set_ai_default_model("root", PROVIDER, "gpt-oss-120b")

    assert user_preferences_path(settings, "root").read_bytes() == before


@pytest.mark.anyio
async def test_an_unreadable_file_counts_as_no_defaults(tmp_path: Path) -> None:
    store, settings = _store(tmp_path)
    await store.set_ai_default_model("root", PROVIDER, "gpt-oss-120b")
    target = user_root(settings, "root") / "ai-default-models.toml"

    target.write_text('schema_version = 1\nmodels = { "not-a-uuid" = "x" }\n')
    assert (await store.get_ai_default_models("root")).models == {}

    target.write_text("schema_version = 7\n")
    assert (await store.get_ai_default_models("root")).models == {}

    # The next change replaces it.
    result = await store.set_ai_default_model("root", OTHER, "m")
    assert result.models == {OTHER: "m"}


@pytest.mark.anyio
async def test_the_number_of_defaults_is_limited(tmp_path: Path) -> None:
    store, _settings = _store(tmp_path)
    for index in range(MAX_AI_DEFAULT_MODELS):
        await store.set_ai_default_model("root", uuid.UUID(int=index + 1), "m")

    with pytest.raises(InvalidInputError, match="At most"):
        await store.set_ai_default_model("root", uuid.UUID(int=10_000), "m")
    # Changing an existing one still works.
    result = await store.set_ai_default_model("root", uuid.UUID(int=1), "n")
    assert result.models[uuid.UUID(int=1)] == "n"


def test_default_models_api_sets_reads_and_clears(files_test_client) -> None:
    assert files_test_client.get("/api/preferences/ai-default-models").json() == {"models": {}}

    path = f"/api/preferences/ai-default-models/{PROVIDER}"
    response = files_test_client.put(path, json={"model": "gpt-oss-120b"})
    assert response.status_code == 200
    assert response.json() == {"models": {str(PROVIDER): "gpt-oss-120b"}}

    cleared = files_test_client.put(path, json={"model": None})
    assert cleared.json() == {"models": {}}

    for body in ({"model": ""}, {"model": "x" * 301}, {}, {"model": "m", "extra": 1}):
        assert files_test_client.put(path, json=body).status_code == 422
    assert (
        files_test_client.put(
            "/api/preferences/ai-default-models/not-a-uuid", json={"model": "m"}
        ).status_code
        == 422
    )
