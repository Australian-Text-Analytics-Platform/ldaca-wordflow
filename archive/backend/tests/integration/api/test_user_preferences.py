from __future__ import annotations
from pathlib import Path
from ldaca_wordflow.infrastructure.storage.layout import (
    user_provider_credentials_path,
)
from ldaca_wordflow.settings import Settings


def test_preferences_api_reads_and_patches_current_user(files_test_client) -> None:
    initial = files_test_client.get("/api/preferences")
    assert initial.status_code == 200
    assert initial.json()["contextual_hints_enabled"] is True
    assert initial.json()["color_theme"] == "light-2026"

    updated = files_test_client.patch(
        "/api/preferences",
        json={
            "favorite_workspaces": ["workspace-a"],
            "contextual_hints_enabled": False,
            "color_theme": "dark-2026",
        },
    )

    assert updated.status_code == 200
    assert updated.json()["favorite_workspaces"] == ["workspace-a"]
    assert updated.json()["contextual_hints_enabled"] is False
    assert updated.json()["analysis_multi_tab_enabled"] is False
    assert updated.json()["color_theme"] == "dark-2026"

    invalid = files_test_client.patch(
        "/api/preferences",
        json={"color_theme": "system"},
    )
    assert invalid.status_code == 422


def test_multi_user_credential_api_reports_browser_ownership_and_denies_writes(
    multi_user_test_client,
    tmp_path: Path,
) -> None:
    user_id = multi_user_test_client.get("/api/session").json()["user"]["id"]
    settings = Settings(
        data_root=tmp_path,
        multi_user=True,
        google_client_id="google-client",
    )
    legacy_path = user_provider_credentials_path(settings, user_id)
    legacy_path.parent.mkdir(parents=True, exist_ok=True)
    legacy_path.write_text("invalid = [", encoding="utf-8")

    status = multi_user_test_client.get("/api/provider-credentials")

    assert status.status_code == 200
    assert status.json() == {
        "storage": "browser",
        "annotation_providers": None,
        "data_portal": {
            "user_configured": None,
            "deployment_configured": False,
        },
    }
    patched = multi_user_test_client.patch(
        "/api/provider-credentials",
        json={"data_portal_api_token": "must-not-persist"},
    )
    assert patched.status_code == 403
    assert patched.json()["code"] == "access_denied"
    deleted = multi_user_test_client.delete("/api/provider-credentials")
    assert deleted.status_code == 403
    assert deleted.json()["code"] == "access_denied"
    assert legacy_path.read_text(encoding="utf-8") == "invalid = ["
