"""The AI Code Designer route streams progress, then a draft or an error."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from ldaca_wordflow.infrastructure.providers.annotation_ai import AnnotationAiError
from ldaca_wordflow.main import create_app
from ldaca_wordflow.settings import Settings


def _client(tmp_path: Path) -> TestClient:
    return TestClient(
        create_app(
            Settings(
                data_root=tmp_path,
                multi_user=False,
                session_cookie_secure=False,
                cors_allowed_origins=("http://testserver",),
                trusted_hosts=("testserver",),
            ),
            serve_frontend=False,
        ),
        base_url="http://testserver",
    )


def _events(body: str) -> list[tuple[str, dict[str, Any]]]:
    events: list[tuple[str, dict[str, Any]]] = []
    for block in body.split("\n\n"):
        name = None
        data = None
        for line in block.splitlines():
            if line.startswith("event:"):
                name = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data = json.loads(line.removeprefix("data:").strip())
        if name is not None and data is not None:
            events.append((name, data))
    return events


class _Adapter:
    def __init__(self, answer: str | Exception) -> None:
        self.answer = answer
        self.calls: list[tuple[str, str, str]] = []
        self.api_keys: list[str | None] = []

    async def complete(self, model, api_key, system, user, config):
        self.calls.append((model, system, user))
        self.api_keys.append(api_key)
        self.config = config
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer

    async def list_models(self, _api_key):
        return []


def _setup(client: TestClient) -> tuple[dict[str, str], str, str, dict[str, object]]:
    csrf = client.get("/api/session").json()["csrf_token"]
    unsafe = {"Origin": "http://testserver", "X-CSRF-Token": csrf}
    content = b"text\n" + b"".join(
        f"tweet number {index} about jobs\n".encode() for index in range(40)
    )
    assert (
        client.post(
            "/api/user-files/uploads",
            params={"path": "tweets.csv"},
            content=content,
            headers={**unsafe, "Content-Type": "application/octet-stream"},
        ).status_code
        == 201
    )
    workspace_id = client.post(
        "/api/workspaces", json={"name": "Designer"}, headers=unsafe
    ).json()["id"]
    assert (
        client.put(f"/api/workspaces/{workspace_id}/open", headers=unsafe).status_code
        == 200
    )
    node_id = client.post(
        f"/api/workspaces/{workspace_id}/nodes",
        json={"kind": "file", "file_path": "tweets.csv"},
        headers=unsafe,
    ).json()["id"]
    configuration = client.post(
        "/api/provider-credentials/annotation-providers",
        json={"name": "OpenAI", "provider": "openai", "api_key": "provider-secret"},
        headers=unsafe,
    ).json()
    request = {
        "provider_configuration_id": configuration["id"],
        "provider": "openai",
        "model": "gpt-test",
        "text_column": "text",
        "brief": "How candidates talk about jobs.",
        "task_context": "Tweets from an election.",
        "max_classes": 3,
        "sample_size": 20,
        "sample_seed": 1,
        "reasoning_effort": "high",
        "system_prompt": "Design a first-draft codebook.",
    }
    return unsafe, workspace_id, node_id, request


def test_designer_streams_stages_then_the_draft(tmp_path: Path, monkeypatch) -> None:
    adapter = _Adapter(
        json.dumps(
            {
                "codes": [
                    {"name": "Promise", "definition": "Jobs created or protected."},
                    {"name": "Cuts", "definition": "Jobs lost or at risk."},
                    {"name": "Other", "definition": "Anything else."},
                ]
            }
        )
    )
    monkeypatch.setattr(
        "ldaca_wordflow.services.annotations.resolve_provider_adapter",
        lambda *_args: adapter,
    )
    with _client(tmp_path) as client:
        unsafe, workspace_id, node_id, request = _setup(client)
        response = client.post(
            f"/api/workspaces/{workspace_id}/nodes/{node_id}/codebook-draft",
            json=request,
            headers=unsafe,
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _events(response.text)
    assert [name for name, _ in events] == ["stage", "stage", "stage", "draft"]
    # A person's own provider: their key goes to the model unchanged.
    assert adapter.api_keys == ["provider-secret"]
    assert [data.get("stage") for _, data in events[:3]] == [
        "sampling",
        "waiting",
        "reading",
    ]
    assert events[1][1]["sampled"] == 20
    assert events[1][1]["available"] == 40
    draft = events[3][1]
    assert [code["name"] for code in draft["codes"]] == ["Promise", "Cuts", "Other"]
    assert draft["model"] == "gpt-test"

    model, system, user = adapter.calls[0]
    assert model == "gpt-test"
    assert system.startswith("Design a first-draft codebook.")
    assert "at most 3 real classes" in system
    assert "Brief:\nHow candidates talk about jobs." in user
    assert "Task context:\nTweets from an election." in user
    assert adapter.config.reasoning_enabled is True
    assert adapter.config.reasoning_effort == "high"


def test_designer_reports_provider_and_column_failures_as_error_events(
    tmp_path: Path, monkeypatch
) -> None:
    adapter = _Adapter(
        AnnotationAiError(
            "provider says no", code="annotation_provider_authentication_failed"
        )
    )
    monkeypatch.setattr(
        "ldaca_wordflow.services.annotations.resolve_provider_adapter",
        lambda *_args: adapter,
    )
    with _client(tmp_path) as client:
        unsafe, workspace_id, node_id, request = _setup(client)
        url = f"/api/workspaces/{workspace_id}/nodes/{node_id}/codebook-draft"
        provider_failure = _events(
            client.post(
                url, json={**request, "reasoning_effort": "none"}, headers=unsafe
            ).text
        )
        missing_column = _events(
            client.post(
                url, json={**request, "text_column": "body"}, headers=unsafe
            ).text
        )

    assert provider_failure[-1][0] == "error"
    assert "rejected the API key" in str(provider_failure[-1][1]["message"])
    assert provider_failure[-1][1]["detail"] == "provider says no"
    assert adapter.config.reasoning_enabled is False
    assert missing_column[-1][0] == "error"
    assert "“body”" in str(missing_column[-1][1]["message"])
