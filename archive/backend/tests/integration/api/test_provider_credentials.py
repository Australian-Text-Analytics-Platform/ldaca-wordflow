from __future__ import annotations
import pytest


def test_single_user_api_creates_an_annotation_provider_configuration(
    files_test_client,
) -> None:
    response = files_test_client.post(
        "/api/provider-credentials/annotation-providers",
        json={
            "name": "OpenAI work",
            "provider": "openai",
            "api_key": "api-secret",
        },
    )

    assert response.status_code == 201
    assert response.json() == {
        "id": response.json()["id"],
        "name": "OpenAI work",
        "provider": "openai",
        "base_url": None,
        "has_api_key": True,
    }
    summary = files_test_client.get("/api/provider-credentials").json()
    assert summary["annotation_providers"] == [response.json()]
    assert "api-secret" not in str(summary)


def test_annotation_provider_configuration_api_updates_deletes_and_clears(
    files_test_client,
) -> None:
    first = files_test_client.post(
        "/api/provider-credentials/annotation-providers",
        json={"name": "First", "provider": "openai", "api_key": "first-key"},
    ).json()
    second = files_test_client.post(
        "/api/provider-credentials/annotation-providers",
        json={
            "name": "Second",
            "provider": "openrouter",
            "api_key": "second-key",
        },
    ).json()

    updated = files_test_client.patch(
        f"/api/provider-credentials/annotation-providers/{second['id']}",
        json={"name": "First", "api_key": "replacement-key"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "First"
    assert updated.json()["has_api_key"] is True
    assert "replacement-key" not in updated.text
    cleared = files_test_client.patch(
        f"/api/provider-credentials/annotation-providers/{second['id']}",
        json={"api_key": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["has_api_key"] is False
    assert (
        files_test_client.delete(
            f"/api/provider-credentials/annotation-providers/{first['id']}"
        ).status_code
        == 204
    )
    assert (
        files_test_client.delete(
            "/api/provider-credentials/annotation-providers"
        ).status_code
        == 204
    )
    assert (
        files_test_client.get("/api/provider-credentials").json()[
            "annotation_providers"
        ]
        == []
    )


def test_multi_user_api_denies_annotation_provider_configuration_writes(
    multi_user_test_client,
) -> None:
    response = multi_user_test_client.post(
        "/api/provider-credentials/annotation-providers",
        json={"name": "OpenAI", "provider": "openai", "api_key": "browser-key"},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "access_denied"
    assert (
        multi_user_test_client.get("/api/provider-credentials").json()[
            "annotation_providers"
        ]
        is None
    )

    update = multi_user_test_client.patch(
        "/api/provider-credentials/annotation-providers/"
        "74a93227-c081-4db9-af2e-ad357b62278d",
        json={"name": "Renamed"},
    )
    assert update.status_code == 403


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": None},
        {"name": ""},
        {"api_key": ""},
        {"provider": "openai"},
        {"base_url": "https://example.test/v1"},
        {"unexpected": True},
    ],
)
def test_annotation_provider_update_rejects_invalid_patch_shapes(
    files_test_client,
    payload: dict[str, object],
) -> None:
    created = files_test_client.post(
        "/api/provider-credentials/annotation-providers",
        json={"name": "OpenAI", "provider": "openai"},
    ).json()

    response = files_test_client.patch(
        f"/api/provider-credentials/annotation-providers/{created['id']}",
        json=payload,
    )

    assert response.status_code == 422


def test_annotation_provider_update_returns_not_found(files_test_client) -> None:
    response = files_test_client.patch(
        "/api/provider-credentials/annotation-providers/"
        "74a93227-c081-4db9-af2e-ad357b62278d",
        json={"name": "Missing"},
    )

    assert response.status_code == 404
