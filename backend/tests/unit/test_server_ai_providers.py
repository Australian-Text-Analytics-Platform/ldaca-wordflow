"""Server AI providers (issue 411): provider, key, user and per-person limits."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

import anyio
import httpx
import pytest
import yaml
from fastapi.testclient import TestClient

from ldaca_wordflow import server_ai
from ldaca_wordflow.server_ai import binding as server_binding
from ldaca_wordflow.server_ai.adapter import ServerAiAnnotationAdapter, redact
from ldaca_wordflow.infrastructure.providers import model_descriptions
from ldaca_wordflow.server_ai.config import (
    PROVIDERS_FILE_ENV,
    ServerAiProvider,
    clear_server_ai_providers,
    load_providers,
    server_ai_providers,
)
from ldaca_wordflow.server_ai.gate import (
    ServerAiRunActiveError,
    reset_user_gate,
    waiting_message,
)
from ldaca_wordflow.domain.annotation import AnnotationProviderSnapshot
from ldaca_wordflow.domain.workspace import (
    AnalysisExecutionScope,
    AnalysisKind,
    AnnotationAnalysisSubmission,
    AnnotationRunAllAnalysisRequest,
    AnnotationRunAllSubmission,
)
from ldaca_wordflow.infrastructure.providers.annotation_adapter import (
    AnnotationAiError,
    InferenceConfig,
)
from ldaca_wordflow.infrastructure.providers.annotation_ai import (
    annotate_all,
    resolve_provider_adapter,
)
from ldaca_wordflow.infrastructure.providers.annotation_openai import (
    CustomOpenAICompatibleAnnotationAdapter,
    OpenAIAnnotationAdapter,
)
from ldaca_wordflow.services.analysis_execution_types import AnalysisExecutionKey
from ldaca_wordflow.services.analysis_scheduler import (
    AnalysisScheduler,
    ScheduledAnalysis,
)
from ldaca_wordflow.shared.errors import InvalidInputError, ProviderCredentialMissingError

from .test_analysis_service import (
    _analysis_service,
    _credential_store,
    _ExecutionControl,
    _opened_workspace_with_tab,
    _submit,
)

GATEWAY_KEY = "sk-research-gateway-secret-0123456789"
GATEWAY_URL = "https://litellm.research.example.edu/v1"
KEY_ENV = "RESEARCH_LLM_API_KEY"
CONFIG = InferenceConfig(temperature=0.0, reasoning_enabled=False, reasoning_effort="low")
# A fixed configuration id, as an operator may set to keep saved Projects pointing here.
RESEARCH_ID = uuid.UUID("5b0d6e2a-8f43-4c1e-9a7d-2c3b4e5f6a71")
PLACEHOLDER = "https://research.server-ai.invalid/v1"

PROVIDER: dict[str, Any] = {
    "slug": "research",
    "name": "Research LLM",
    "configuration_id": str(RESEARCH_ID),
    "base_url": GATEWAY_URL,
    "api_key_env": KEY_ENV,
    "models": ["llama-3.3-70b", "qwen3-32b"],
    "default_model": "qwen3-32b",
    "send_user": "email",
    "max_requests_per_user": 1,
}


def _clear() -> None:
    clear_server_ai_providers()
    model_descriptions.clear_model_info_cache()
    reset_user_gate()
    server_ai._resolver = None


def _write_providers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, *providers: dict[str, Any]
) -> Path:
    path = tmp_path / "ai-providers.yaml"
    path.write_text(yaml.safe_dump({"providers": list(providers)}), encoding="utf-8")
    monkeypatch.setenv(PROVIDERS_FILE_ENV, str(path))
    clear_server_ai_providers()
    return path


def _provider() -> ServerAiProvider:
    provider = server_ai_providers().by_slug("research")
    assert provider is not None
    return provider


_MODEL_INFO_SEEN: list[httpx.Request] = []


def _model_info_responder(payload: dict | None) -> Any:
    async def handler(request: httpx.Request) -> httpx.Response:
        _MODEL_INFO_SEEN.append(request)
        if payload is None:
            return httpx.Response(404)
        return httpx.Response(200, json=payload)

    return lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def _no_network_model_info(monkeypatch: pytest.MonkeyPatch) -> None:
    """/model/info answers 404 unless a test sets descriptions."""

    _MODEL_INFO_SEEN.clear()
    monkeypatch.setattr(model_descriptions, "_http_client", _model_info_responder(None))


@pytest.fixture
def research_env(tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv(KEY_ENV, GATEWAY_KEY)
    _write_providers(tmp_path_factory.mktemp("config"), monkeypatch, PROVIDER)
    _clear()
    yield
    _clear()


@pytest.fixture
def no_research_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv(PROVIDERS_FILE_ENV, raising=False)
    _clear()
    yield
    _clear()


class _FakeResolver:
    def __init__(self, end_users: dict[str, str]) -> None:
        self.end_users = end_users

    async def end_user(self, provider: ServerAiProvider, user_id: str) -> str:
        return self.end_users[user_id]


def _install_resolver(monkeypatch: pytest.MonkeyPatch, end_users: dict[str, str]) -> None:
    monkeypatch.setattr(server_ai, "_resolver", _FakeResolver(end_users))


def _snapshot(**update: Any) -> AnnotationProviderSnapshot:
    values: dict[str, Any] = {
        "provider_configuration_id": RESEARCH_ID,
        "provider": "custom",
        "provider_base_url": PLACEHOLDER,
    }
    values.update(update)
    return AnnotationProviderSnapshot(**values)


def _install_fake_openai(monkeypatch: pytest.MonkeyPatch, outcomes: list[Any]) -> dict:
    """Patch openai.AsyncOpenAI; each create() takes the next outcome."""

    calls: dict[str, list] = {"clients": [], "creates": []}

    class _Choice:
        def __init__(self, content: str) -> None:
            self.finish_reason = "stop"
            self.message = type("Message", (), {"content": content})()

    class _Completions:
        async def create(self, **kwargs: Any) -> Any:
            calls["creates"].append(kwargs)
            outcome = outcomes.pop(0) if outcomes else '{"labels": ["Relevant"]}'
            if isinstance(outcome, BaseException):
                raise outcome
            return type("Completion", (), {"choices": [_Choice(outcome)]})()

    class _Models:
        def list(self) -> Any:
            async def generate() -> Any:
                for model_id in ("qwen3-32b", "gpt-oss-120b", "llama-3.3-70b"):
                    yield type("Model", (), {"id": model_id})()

            return generate()

    class _FakeAsyncOpenAI:
        def __init__(self, **kwargs: Any) -> None:
            calls["clients"].append(kwargs)
            self.chat = type("Chat", (), {"completions": _Completions()})()
            self.models = _Models()

        async def __aenter__(self) -> Any:
            return self

        async def __aexit__(self, *_exc: object) -> None:
            return None

    monkeypatch.setattr("openai.AsyncOpenAI", _FakeAsyncOpenAI)
    return calls


class _StatusError(Exception):
    def __init__(self, status_code: int, message: str, headers: dict | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response = type("Response", (), {"headers": headers or {}})()


def _binding(user_id: str = "user-a", end_user: str = "alice@uni.edu", purpose="run") -> str:
    return server_binding.encode_binding(
        server_binding.ServerAiBinding("research", purpose, user_id, end_user)
    )


# Settings and the provider resource -------------------------------------------------


def test_the_file_names_the_key_and_a_missing_key_stops_start_up(
    research_env: None, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    provider = _provider()
    assert provider.id == RESEARCH_ID
    assert GATEWAY_KEY not in repr(provider)
    assert GATEWAY_KEY not in str(provider.model_dump())
    monkeypatch.delenv(KEY_ENV)
    with pytest.raises(ValueError, match=f"needs {KEY_ENV} set") as error:
        load_providers(_write_providers(tmp_path, monkeypatch, PROVIDER))
    assert GATEWAY_URL not in str(error.value)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"slug": "Bad Slug"}, "slug"),
        ({"base_url": "ftp://user:pw@host/v1"}, "base_url"),
        ({"api_key_env": "not a name"}, "api_key_env"),
        ({"default_model": "not-offered"}, "default_model"),
        ({"max_requests_per_user": 0}, "max_requests_per_user"),
        ({"surprise": True}, "surprise"),
    ],
)
def test_a_wrong_providers_file_stops_start_up_without_showing_secrets(
    research_env: None,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    change: dict[str, Any],
    message: str,
) -> None:
    _write_providers(tmp_path, monkeypatch, {**PROVIDER, **change})

    with pytest.raises(ValueError, match=message) as error:
        server_ai.install(cast(Any, object()))

    assert GATEWAY_KEY not in str(error.value)
    assert "pw@" not in str(error.value)


def test_providers_need_their_own_slug_and_id(
    research_env: None, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    path = _write_providers(tmp_path, monkeypatch, PROVIDER, {**PROVIDER, "slug": "other"})
    with pytest.raises(ValueError, match="own slug and configuration_id"):
        load_providers(path)


def test_provider_route_lists_research_without_key_or_gateway_url(
    research_env: None, multi_user_test_client: TestClient
) -> None:
    response = multi_user_test_client.get("/api/server-ai-providers")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "providers": [
            {
                "configuration": {
                    "id": str(RESEARCH_ID),
                    "name": "Research LLM",
                    "provider": "custom",
                    "base_url": PLACEHOLDER,
                    "has_api_key": True,
                },
                "default_model": "qwen3-32b",
                "max_requests_per_user": 1,
            }
        ]
    }
    assert GATEWAY_KEY not in response.text
    assert GATEWAY_URL not in response.text
    credentials = multi_user_test_client.get("/api/provider-credentials")
    assert GATEWAY_KEY not in credentials.text


def test_models_are_listed_on_the_server_with_the_gateway_key(
    research_env: None,
    multi_user_test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    calls = _install_fake_openai(monkeypatch, [])
    body = {
        "provider_configuration_id": str(RESEARCH_ID),
        "provider": "custom",
        "provider_base_url": PLACEHOLDER,
    }
    caplog.set_level(logging.DEBUG)

    response = multi_user_test_client.post("/api/annotation-providers/models", json=body)

    assert response.status_code == 200
    # The file's models set the offer and its order.
    assert response.json()["models"] == ["llama-3.3-70b", "qwen3-32b"]
    assert calls["clients"][0]["api_key"] == GATEWAY_KEY
    assert calls["clients"][0]["base_url"] == GATEWAY_URL
    assert GATEWAY_KEY not in response.text and GATEWAY_URL not in response.text
    assert GATEWAY_KEY not in caplog.text

    supplied = multi_user_test_client.post(
        "/api/annotation-providers/models", json={**body, "api_key": "user-typed"}
    )
    assert supplied.status_code == 400


def test_gateway_errors_never_carry_the_key(
    research_env: None,
    multi_user_test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    leaked = (
        "Authentication Error, Invalid proxy server token passed. "
        f"Received API Key = {GATEWAY_KEY}, Key Hash (Token) = abc123"
    )

    class _FailingModels:
        def list(self) -> Any:
            raise _StatusError(401, leaked)

    class _FakeAsyncOpenAI:
        def __init__(self, **_kwargs: Any) -> None:
            self.models = _FailingModels()

        async def __aenter__(self) -> Any:
            return self

        async def __aexit__(self, *_exc: object) -> None:
            return None

    monkeypatch.setattr("openai.AsyncOpenAI", _FakeAsyncOpenAI)
    caplog.set_level(logging.DEBUG)

    response = multi_user_test_client.post(
        "/api/annotation-providers/models",
        json={
            "provider_configuration_id": str(RESEARCH_ID),
            "provider": "custom",
            "provider_base_url": PLACEHOLDER,
        },
    )

    assert response.status_code >= 400
    assert GATEWAY_KEY not in response.text
    assert GATEWAY_KEY not in caplog.text
    assert "sk-research" not in response.text + caplog.text


def test_redact_removes_keys_but_keeps_ordinary_words(research_env: None) -> None:
    assert GATEWAY_KEY not in redact(f"bad key {GATEWAY_KEY}")
    assert redact("Authorization: Bearer abcdefghijklmnop") == (
        "Authorization: Bearer [redacted]"
    )
    assert redact("api_key=xyz123") == "api_key=[redacted]"
    message = "maximum context length is 8192 tokens"
    assert redact(message) == message


# Model descriptions and the labels schema ---------------------------------------------

_MODEL_INFO = {
    "data": [
        {"model_name": "qwen3-32b", "model_info": {"description": "Fastest; good for large runs."}},
        {"model_name": "llama-3.3-70b", "model_info": {"description": "Careful;\n slower."}},
    ]
}


def _list_research_models(client: TestClient) -> Any:
    return client.post(
        "/api/annotation-providers/models",
        json={
            "provider_configuration_id": str(RESEARCH_ID),
            "provider": "custom",
            "provider_base_url": PLACEHOLDER,
        },
    )


def test_research_models_keep_the_configured_order_with_gateway_descriptions(
    research_env: None,
    multi_user_test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    tmp_path: Path,
) -> None:
    # Neither alphabetical nor the gateway's order: the configured order wins.
    _write_providers(tmp_path, monkeypatch, {**PROVIDER, "models": ["qwen3-32b", "llama-3.3-70b"]})
    _install_fake_openai(monkeypatch, [])
    monkeypatch.setattr(model_descriptions, "_http_client", _model_info_responder(_MODEL_INFO))
    caplog.set_level(logging.DEBUG)

    response = _list_research_models(multi_user_test_client)

    assert response.status_code == 200
    body = response.json()
    assert body["models"] == ["qwen3-32b", "llama-3.3-70b"]
    assert body["model_descriptions"] == {
        "qwen3-32b": "Fastest; good for large runs.",
        "llama-3.3-70b": "Careful; slower.",
    }
    assert [str(r.url) for r in _MODEL_INFO_SEEN] == [f"{GATEWAY_URL}/model/info"]
    assert _MODEL_INFO_SEEN[0].headers["Authorization"] == f"Bearer {GATEWAY_KEY}"
    assert GATEWAY_KEY not in response.text + caplog.text
    assert GATEWAY_URL not in response.text


def test_configured_descriptions_win_over_the_gateway(
    research_env: None,
    multi_user_test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _write_providers(
        tmp_path,
        monkeypatch,
        {**PROVIDER, "model_descriptions": {"qwen3-32b": "Our pick for big runs."}},
    )
    _install_fake_openai(monkeypatch, [])
    monkeypatch.setattr(model_descriptions, "_http_client", _model_info_responder(_MODEL_INFO))

    body = _list_research_models(multi_user_test_client).json()

    assert body["models"] == ["llama-3.3-70b", "qwen3-32b"]
    assert body["model_descriptions"] == {
        "llama-3.3-70b": "Careful; slower.",
        "qwen3-32b": "Our pick for big runs.",
    }


def test_a_gateway_without_model_info_still_lists_research_models(
    research_env: None, multi_user_test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_fake_openai(monkeypatch, [])

    body = _list_research_models(multi_user_test_client).json()

    assert body["models"] == ["llama-3.3-70b", "qwen3-32b"]
    assert body["model_descriptions"] == {}


@pytest.mark.parametrize(
    "value",
    [{"qwen3-32b": ""}, {"": "text"}, ["qwen3-32b"], {"qwen3-32b": "x" * 201}],
)
def test_wrong_model_descriptions_are_refused(
    research_env: None, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, value: Any
) -> None:
    path = _write_providers(tmp_path, monkeypatch, {**PROVIDER, "model_descriptions": value})
    with pytest.raises(ValueError, match="model_descriptions"):
        load_providers(path)


@pytest.mark.anyio
async def test_research_always_sends_the_labels_schema(
    research_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    from ldaca_wordflow.infrastructure.providers.annotation_ai import build_labels_schema

    calls = _install_fake_openai(monkeypatch, ['{"labels": ["Relevant"]}'])
    config = InferenceConfig(
        temperature=0.0,
        reasoning_enabled=False,
        reasoning_effort="low",
        labels_schema=build_labels_schema(["Relevant"], 1),
    )

    await ServerAiAnnotationAdapter(_provider()).complete("qwen3-32b", _binding(), "s", "u", config)

    assert calls["creates"][-1]["response_format"]["type"] == "json_schema"
    assert calls["creates"][-1]["response_format"]["json_schema"]["strict"] is True


# The user field ------------------------------------------------------------------------


@pytest.mark.anyio
async def test_user_field_comes_from_the_binding_and_only_for_research(
    research_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _install_fake_openai(monkeypatch, ['{"labels": ["Relevant"]}'] * 3)

    await ServerAiAnnotationAdapter(_provider()).complete(
        "qwen3-32b", _binding(end_user="alice@uni.edu"), "system", "user", CONFIG
    )
    assert calls["creates"][-1]["user"] == "alice@uni.edu"
    assert calls["clients"][-1]["api_key"] == GATEWAY_KEY

    # A user-entered provider never gets a user field.
    await CustomOpenAICompatibleAnnotationAdapter("https://llm.example/v1").complete(
        "model", "their-key", "system", "user", CONFIG
    )
    from openai import Omit

    assert isinstance(calls["creates"][-1].get("user"), Omit)
    await OpenAIAnnotationAdapter().complete("gpt", "their-key", "s", "u", CONFIG)
    assert isinstance(calls["creates"][-1].get("user"), Omit)


@pytest.mark.anyio
async def test_forged_or_client_supplied_bindings_are_refused(
    research_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _install_fake_openai(monkeypatch, [])
    forged = _binding(end_user="mallory@uni.edu")
    forged = forged[:-4] + ("0000" if not forged.endswith("0000") else "1111")

    with pytest.raises(AnnotationAiError) as error:
        await ServerAiAnnotationAdapter(_provider()).complete("qwen3-32b", forged, "s", "u", CONFIG)
    assert error.value.code == "annotation_provider_authentication_failed"
    with pytest.raises(AnnotationAiError):
        await ServerAiAnnotationAdapter(_provider()).complete("qwen3-32b", "user-key", "s", "u", CONFIG)
    assert calls["creates"] == []

    with pytest.raises(InvalidInputError):
        server_ai.claims_annotation_provider(_snapshot(), "user-typed-key")
    with pytest.raises(InvalidInputError):
        # A binding typed in for any configuration is refused, not passed on.
        server_ai.claims_annotation_provider(
            _snapshot(
                provider_configuration_id=uuid.uuid4(),
                provider_base_url="https://llm.example/v1",
            ),
            _binding(),
        )
    with pytest.raises(ProviderCredentialMissingError):
        # A user's own configuration cannot point at the placeholder.
        server_ai.claims_annotation_provider(
            _snapshot(provider_configuration_id=uuid.uuid4()), None
        )


@pytest.mark.anyio
async def test_run_submission_binds_the_session_user_and_stores_no_secret(
    research_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_resolver(monkeypatch, {"user": "alice@uni.edu"})
    workspaces, workspace_id, node_id, tab_id = await _opened_workspace_with_tab(
        tmp_path, kind=AnalysisKind.ANNOTATION
    )
    execution = _ExecutionControl()
    service = _analysis_service(tmp_path, workspaces, execution, multi_user=True)
    preview = AnnotationAnalysisSubmission(
        node_id=node_id,
        text_column="text",
        annotation_column="class",
        class_node_id=node_id,
        class_column="text",
        description_column="text",
        classes=[{"name": "Relevant", "description": ""}],
        provider_configuration_id=RESEARCH_ID,
        provider="custom",
        provider_base_url=PLACEHOLDER,
        model="qwen3-32b",
        instruction="Classify the text",
    )
    # A previous Research LLM Run of this user is still going.
    assert server_ai.user_gate().try_start_run("research", "user")

    created = await _submit(
        service,
        "user",
        workspace_id,
        tab_id,
        AnnotationRunAllSubmission(source=preview.persisted_request()),
        execution_scope=AnalysisExecutionScope.RUN_ALL,
    )

    credential = execution.enqueued[0][2]
    _decoded_provider, decoded = server_binding.decode_binding(credential)
    assert (decoded.purpose, decoded.user_id, decoded.end_user) == (
        "run",
        "user",
        "alice@uni.edu",
    )
    assert GATEWAY_KEY not in str(credential)
    assert created.progress is not None
    assert created.progress.message == waiting_message(_provider())
    lock_registry = tmp_path / "workspaces" / ".locks"
    for path in tmp_path.rglob("*"):
        if path.is_file() and lock_registry not in path.parents:
            content = path.read_bytes()
            assert GATEWAY_KEY.encode() not in content
            assert b"server-ai:" not in content


@pytest.mark.anyio
async def test_end_user_comes_from_the_account_email_or_subject(
    research_env: None, multi_user_test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id = multi_user_test_client.get("/api/session").json()["user"]["id"]
    resolver = server_ai._resolver
    assert resolver is not None

    assert await resolver.end_user(_provider(), user_id) == "fixture@example.test"
    by_subject = ServerAiProvider.model_validate({**PROVIDER, "send_user": "subject"})
    assert await resolver.end_user(by_subject, user_id) == "fixture-user"
    nobody = ServerAiProvider.model_validate({**PROVIDER, "send_user": "none"})
    assert await resolver.end_user(nobody, user_id) == ""


# One request at a time per user ------------------------------------------------------


@pytest.mark.anyio
async def test_same_user_runs_wait_while_other_users_go_ahead(research_env: None) -> None:
    started: list[str] = []
    releases = {name: anyio.Event() for name in ("a1", "a2", "b1")}
    workspace_id = uuid.uuid4()
    ids = {name: uuid.uuid4() for name in releases}

    async def runner(item: ScheduledAnalysis) -> None:
        name = next(key for key, value in ids.items() if value == item.key.analysis_id)
        started.append(name)
        await releases[name].wait()

    async def ignore(_key: AnalysisExecutionKey) -> None:
        return

    scheduler = AnalysisScheduler(
        capacity={"fast": 4, "medium": 4},
        runner=runner,
        cancel_running=ignore,
        work_removed=ignore,
    )
    now = datetime.now(UTC)
    async with anyio.create_task_group() as task_group:
        scheduler.start(task_group)
        for offset, (name, user) in enumerate(
            (("a1", "user-a"), ("a2", "user-a"), ("b1", "user-b"))
        ):
            await scheduler.enqueue(
                AnalysisExecutionKey(user, workspace_id, ids[name]),
                created_at=now + timedelta(seconds=offset),
                credential=_binding(user_id=user, end_user=f"{user}@uni.edu"),
                lane="medium",
            )
        with anyio.fail_after(2):
            while len(started) < 2:
                await anyio.sleep(0.01)
        await anyio.sleep(0.05)
        assert started == ["a1", "b1"]
        releases["a1"].set()
        with anyio.fail_after(2):
            while len(started) < 3:
                await anyio.sleep(0.01)
        assert started == ["a1", "b1", "a2"]
        releases["a2"].set()
        releases["b1"].set()
        await scheduler.wait_idle()
        await scheduler.stop_dispatch()
    assert not server_ai.user_gate().run_active("research", "user-a")


@pytest.mark.anyio
async def test_preview_is_refused_during_a_run_and_previews_take_turns(
    research_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = server_ai.user_gate()
    provider = _provider()
    assert gate.try_start_run("research", "user-a")
    with pytest.raises(ServerAiRunActiveError, match="Preview more rows"):
        async with gate.preview(provider, "user-a"):
            pass
    # Another user's Preview is not blocked.
    async with gate.preview(provider, "user-b"):
        pass
    gate.finish_run("research", "user-a")

    in_flight = 0
    most = 0

    async def slow(**_kwargs: Any) -> str:
        nonlocal in_flight, most
        in_flight += 1
        most = max(most, in_flight)
        await anyio.sleep(0.02)
        in_flight -= 1
        return '{"labels": ["Relevant"]}'

    async def fake_complete(self, model, api_key, system, user, config) -> str:
        return await slow()

    monkeypatch.setattr(OpenAIAnnotationAdapter, "complete", fake_complete)
    preview = _binding(user_id="user-a", purpose="preview")
    async with anyio.create_task_group() as task_group:
        for _ in range(3):
            task_group.start_soon(
                ServerAiAnnotationAdapter(_provider()).complete, "qwen3-32b", preview, "s", "u", CONFIG
            )
    assert most == 1
    # A Run does not start while the user's Preview request is in flight.
    async with gate.preview(provider, "user-a"):
        assert not gate.try_start_run("research", "user-a")
    assert gate.try_start_run("research", "user-a")


@pytest.mark.anyio
async def test_a_run_sends_one_request_at_a_time(
    research_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    in_flight = 0
    most = 0

    async def fake_complete(self, model, api_key, system, user, config) -> str:
        nonlocal in_flight, most
        in_flight += 1
        most = max(most, in_flight)
        await anyio.sleep(0.01)
        in_flight -= 1
        return '{"labels": ["Relevant", "Relevant"]}'

    monkeypatch.setattr(OpenAIAnnotationAdapter, "complete", fake_complete)
    source = _annotation_source()
    request = AnnotationRunAllAnalysisRequest(
        source=source, batch_size=2, processing_mode="reprocess_all", max_concurrency=8
    )

    result = await annotate_all(request, _binding(), ["t"] * 12)

    assert result.failed_row_count == 0
    assert most == 1


@pytest.mark.anyio
async def test_rate_limits_are_retried_with_backoff_without_failing_the_batch(
    research_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr("ldaca_wordflow.server_ai.adapter.asyncio.sleep", fake_sleep)
    _install_fake_openai(
        monkeypatch,
        [
            _StatusError(429, "Rate limit reached", {"retry-after": "7"}),
            _StatusError(429, "Rate limit reached"),
            '{"labels": ["Relevant"]}',
        ],
    )

    labels = await ServerAiAnnotationAdapter(_provider()).complete(
        "qwen3-32b", _binding(), "s", "u", CONFIG
    )

    assert labels == '{"labels": ["Relevant"]}'
    assert sleeps[0] == 7
    assert 1 <= sleeps[1] <= 6


# Without SERVER_AI_PROVIDERS_FILE ------------------------------------------------------


@pytest.mark.anyio
async def test_without_a_providers_file_nothing_changes(
    no_research_env: None, tmp_path: Path
) -> None:
    assert not server_ai_providers()
    other = _snapshot(
        provider_configuration_id=uuid.uuid4(),
        provider_base_url="https://llm.example/v1",
    )
    assert server_ai.claims_annotation_provider(other, "key") is None
    assert isinstance(
        resolve_provider_adapter("custom", "https://llm.example/v1"),
        CustomOpenAICompatibleAnnotationAdapter,
    )
    assert server_ai.scheduler_eligible("any-user-key") is True
    assert server_ai.scheduler_eligible(None) is True
    assert await server_ai.bind_credential("their-key", "user", "run") == "their-key"
    store = _credential_store(tmp_path, multi_user=True)
    assert await store.resolve_annotation_provider(other, supplied="key") == "key"
    # A Project made on a server with a provider this one doesn't offer.
    for placeholder in (PLACEHOLDER, "https://elsewhere.server-ai.invalid/v1"):
        with pytest.raises(Exception, match="doesn't offer the AI provider"):
            await store.resolve_annotation_provider(
                _snapshot(provider_base_url=placeholder), supplied=None
            )


def test_the_provider_list_is_empty_without_a_file(
    no_research_env: None, multi_user_test_client: TestClient
) -> None:
    assert multi_user_test_client.get("/api/server-ai-providers").json() == {"providers": []}


def _annotation_source():
    return AnnotationAnalysisSubmission(
        node_id=uuid.uuid4(),
        text_column="text",
        annotation_column="class",
        class_node_id=uuid.uuid4(),
        class_column="text",
        description_column="text",
        classes=[{"name": "Relevant", "description": ""}],
        provider_configuration_id=RESEARCH_ID,
        provider="custom",
        provider_base_url=PLACEHOLDER,
        model="qwen3-32b",
        instruction="Classify the text",
    ).persisted_request()


# Several providers, and providers without a per-person limit ---------------------------

OPEN_PROVIDER: dict[str, Any] = {
    "slug": "campus",
    "name": "Campus LLM",
    "base_url": "https://llm.campus.example/v1",
    "api_key_env": "CAMPUS_LLM_KEY",
    "send_user": "none",
}


@pytest.mark.anyio
async def test_several_providers_keep_their_own_keys_ids_and_limits(
    research_env: None, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("CAMPUS_LLM_KEY", "sk-campus-secret-987654321")
    _write_providers(tmp_path, monkeypatch, PROVIDER, OPEN_PROVIDER)
    providers = server_ai_providers()
    campus = providers.by_slug("campus")
    assert campus is not None and campus.id != RESEARCH_ID
    # A stable id from the slug, and a placeholder named after it.
    assert campus.id == ServerAiProvider.model_validate(OPEN_PROVIDER).id
    assert campus.placeholder_base_url == "https://campus.server-ai.invalid/v1"

    calls = _install_fake_openai(monkeypatch, ['{"labels": ["Relevant"]}'])
    campus_binding = server_binding.encode_binding(
        server_binding.ServerAiBinding("campus", "run", "user-a", "")
    )
    await ServerAiAnnotationAdapter(campus).complete("m", campus_binding, "s", "u", CONFIG)
    assert calls["clients"][-1]["api_key"] == "sk-campus-secret-987654321"
    assert calls["clients"][-1]["base_url"] == "https://llm.campus.example/v1"
    from openai import Omit

    assert isinstance(calls["creates"][-1].get("user"), Omit)  # send_user: none
    # One provider's binding doesn't work for another.
    with pytest.raises(AnnotationAiError, match="another provider"):
        await ServerAiAnnotationAdapter(campus).complete("m", _binding(), "s", "u", CONFIG)
    # Without a per-person limit: no waiting, no Preview refusal, the Run's own setting.
    assert server_ai.scheduler_eligible(campus_binding)
    assert server_ai.scheduler_eligible(campus_binding)
    assert server_ai.queued_progress(campus_binding, "user-a") is None
    assert server_ai.cap_concurrency(ServerAiAnnotationAdapter(campus), 8) == 8
    assert server_ai.cap_concurrency(ServerAiAnnotationAdapter(_provider()), 8) == 1


def test_the_route_lists_every_provider_in_file_order(
    research_env: None,
    multi_user_test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("CAMPUS_LLM_KEY", "sk-campus-secret-987654321")
    _write_providers(tmp_path, monkeypatch, OPEN_PROVIDER, PROVIDER)

    response = multi_user_test_client.get("/api/server-ai-providers")

    providers = response.json()["providers"]
    assert [item["configuration"]["name"] for item in providers] == ["Campus LLM", "Research LLM"]
    assert providers[0]["max_requests_per_user"] is None
    assert "sk-campus" not in response.text and "llm.campus.example" not in response.text
