"""Apollo LLM deployment build (deploy/apollo): provider, key, user and limits."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

import anyio
import pytest
from fastapi.testclient import TestClient

from ldaca_wordflow import apollo_deploy
from ldaca_wordflow.apollo_deploy import binding as apollo_binding
from ldaca_wordflow.apollo_deploy.adapter import ApolloAnnotationAdapter, redact
from ldaca_wordflow.apollo_deploy.config import (
    APOLLO_CONFIGURATION_ID,
    APOLLO_PLACEHOLDER_BASE_URL,
    ApolloSettings,
    apollo_settings,
)
from ldaca_wordflow.apollo_deploy.gate import (
    WAITING_MESSAGE,
    ApolloRunActiveError,
    reset_user_gate,
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
from ldaca_wordflow.shared.errors import InvalidInputError

from .test_analysis_service import (
    _analysis_service,
    _credential_store,
    _ExecutionControl,
    _opened_workspace_with_tab,
    _submit,
)

GATEWAY_KEY = "sk-apollo-gateway-secret-0123456789"
GATEWAY_URL = "https://litellm.apollo.example.edu/v1"
CONFIG = InferenceConfig(temperature=0.0, reasoning_enabled=False, reasoning_effort="low")


def _clear() -> None:
    apollo_settings.cache_clear()
    reset_user_gate()
    apollo_deploy._resolver = None


@pytest.fixture
def apollo_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("APOLLO_LLM_BASE_URL", GATEWAY_URL)
    monkeypatch.setenv("APOLLO_LLM_API_KEY", GATEWAY_KEY)
    monkeypatch.setenv("APOLLO_LLM_MODELS", '["llama-3.3-70b", "qwen3-32b"]')
    monkeypatch.setenv("APOLLO_LLM_DEFAULT_MODEL", "qwen3-32b")
    _clear()
    yield
    _clear()


@pytest.fixture
def no_apollo_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for name in (
        "APOLLO_LLM_BASE_URL",
        "APOLLO_LLM_API_KEY",
        "APOLLO_LLM_MODELS",
        "APOLLO_LLM_DEFAULT_MODEL",
        "APOLLO_LLM_USER_FIELD",
    ):
        monkeypatch.delenv(name, raising=False)
    _clear()
    yield
    _clear()


class _FakeResolver:
    def __init__(self, end_users: dict[str, str]) -> None:
        self.end_users = end_users

    async def end_user(self, user_id: str) -> str:
        return self.end_users[user_id]


def _install_resolver(monkeypatch: pytest.MonkeyPatch, end_users: dict[str, str]) -> None:
    monkeypatch.setattr(apollo_deploy, "_resolver", _FakeResolver(end_users))


def _snapshot(**update: Any) -> AnnotationProviderSnapshot:
    values: dict[str, Any] = {
        "provider_configuration_id": APOLLO_CONFIGURATION_ID,
        "provider": "custom",
        "provider_base_url": APOLLO_PLACEHOLDER_BASE_URL,
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
    return apollo_binding.encode_binding(
        apollo_binding.ApolloBinding(purpose, user_id, end_user)
    )


# Settings and the provider resource -------------------------------------------------


def test_settings_keep_the_key_secret_and_require_it_with_a_url(
    apollo_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = apollo_settings()
    assert settings.enabled
    assert GATEWAY_KEY not in repr(settings)
    assert GATEWAY_KEY not in str(settings.model_dump())
    monkeypatch.delenv("APOLLO_LLM_API_KEY")
    with pytest.raises(ValueError, match="APOLLO_LLM_API_KEY is required") as error:
        ApolloSettings()
    assert GATEWAY_URL not in str(error.value)


def test_provider_route_lists_apollo_without_key_or_gateway_url(
    apollo_env: None, multi_user_test_client: TestClient
) -> None:
    response = multi_user_test_client.get("/api/apollo/provider")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "enabled": True,
        "configuration": {
            "id": str(APOLLO_CONFIGURATION_ID),
            "name": "Apollo LLM",
            "provider": "custom",
            "base_url": APOLLO_PLACEHOLDER_BASE_URL,
            "has_api_key": True,
        },
        "default_model": "qwen3-32b",
        "max_concurrency": 1,
    }
    assert GATEWAY_KEY not in response.text
    assert GATEWAY_URL not in response.text
    credentials = multi_user_test_client.get("/api/provider-credentials")
    assert GATEWAY_KEY not in credentials.text


def test_models_are_listed_on_the_server_with_the_gateway_key(
    apollo_env: None,
    multi_user_test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    calls = _install_fake_openai(monkeypatch, [])
    body = {
        "provider_configuration_id": str(APOLLO_CONFIGURATION_ID),
        "provider": "custom",
        "provider_base_url": APOLLO_PLACEHOLDER_BASE_URL,
    }
    caplog.set_level(logging.DEBUG)

    response = multi_user_test_client.post("/api/annotation-providers/models", json=body)

    assert response.status_code == 200
    # APOLLO_LLM_MODELS sets the offer and its order.
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
    apollo_env: None,
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
            "provider_configuration_id": str(APOLLO_CONFIGURATION_ID),
            "provider": "custom",
            "provider_base_url": APOLLO_PLACEHOLDER_BASE_URL,
        },
    )

    assert response.status_code >= 400
    assert GATEWAY_KEY not in response.text
    assert GATEWAY_KEY not in caplog.text
    assert "sk-apollo" not in response.text + caplog.text


def test_redact_removes_keys_but_keeps_ordinary_words(apollo_env: None) -> None:
    assert GATEWAY_KEY not in redact(f"bad key {GATEWAY_KEY}")
    assert redact("Authorization: Bearer abcdefghijklmnop") == (
        "Authorization: Bearer [redacted]"
    )
    assert redact("api_key=xyz123") == "api_key=[redacted]"
    message = "maximum context length is 8192 tokens"
    assert redact(message) == message


def test_wrong_settings_stop_start_up_without_showing_secrets(
    apollo_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APOLLO_LLM_DEFAULT_MODEL", "not-offered")

    with pytest.raises(ValueError, match="APOLLO_LLM_DEFAULT_MODEL") as error:
        apollo_deploy.install(cast(Any, object()))

    assert GATEWAY_KEY not in str(error.value)


# The user field ------------------------------------------------------------------------


@pytest.mark.anyio
async def test_user_field_comes_from_the_binding_and_only_for_apollo(
    apollo_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _install_fake_openai(monkeypatch, ['{"labels": ["Relevant"]}'] * 3)

    await ApolloAnnotationAdapter().complete(
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
    apollo_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _install_fake_openai(monkeypatch, [])
    forged = _binding(end_user="mallory@uni.edu")
    forged = forged[:-4] + ("0000" if not forged.endswith("0000") else "1111")

    with pytest.raises(AnnotationAiError) as error:
        await ApolloAnnotationAdapter().complete("qwen3-32b", forged, "s", "u", CONFIG)
    assert error.value.code == "annotation_provider_authentication_failed"
    with pytest.raises(AnnotationAiError):
        await ApolloAnnotationAdapter().complete("qwen3-32b", "user-key", "s", "u", CONFIG)
    assert calls["creates"] == []

    with pytest.raises(InvalidInputError):
        apollo_deploy.claims_annotation_provider(_snapshot(), "user-typed-key")
    with pytest.raises(InvalidInputError):
        # A binding typed in for any configuration is refused, not passed on.
        apollo_deploy.claims_annotation_provider(
            _snapshot(
                provider_configuration_id=uuid.uuid4(),
                provider_base_url="https://llm.example/v1",
            ),
            _binding(),
        )
    with pytest.raises(InvalidInputError):
        # A user's own configuration cannot point at the placeholder.
        apollo_deploy.claims_annotation_provider(
            _snapshot(provider_configuration_id=uuid.uuid4()), None
        )


@pytest.mark.anyio
async def test_run_submission_binds_the_session_user_and_stores_no_secret(
    apollo_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
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
        provider_configuration_id=APOLLO_CONFIGURATION_ID,
        provider="custom",
        provider_base_url=APOLLO_PLACEHOLDER_BASE_URL,
        model="qwen3-32b",
        instruction="Classify the text",
    )
    # A previous Apollo Run of this user is still going.
    assert apollo_deploy.user_gate().try_start_run("user")

    created = await _submit(
        service,
        "user",
        workspace_id,
        tab_id,
        AnnotationRunAllSubmission(source=preview.persisted_request()),
        execution_scope=AnalysisExecutionScope.RUN_ALL,
    )

    credential = execution.enqueued[0][2]
    decoded = apollo_binding.decode_binding(credential)
    assert (decoded.purpose, decoded.user_id, decoded.end_user) == (
        "run",
        "user",
        "alice@uni.edu",
    )
    assert GATEWAY_KEY not in str(credential)
    assert created.progress is not None
    assert created.progress.message == WAITING_MESSAGE
    lock_registry = tmp_path / "workspaces" / ".locks"
    for path in tmp_path.rglob("*"):
        if path.is_file() and lock_registry not in path.parents:
            content = path.read_bytes()
            assert GATEWAY_KEY.encode() not in content
            assert b"apollo-user:" not in content


@pytest.mark.anyio
async def test_end_user_comes_from_the_account_email_or_subject(
    apollo_env: None, multi_user_test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id = multi_user_test_client.get("/api/session").json()["user"]["id"]
    resolver = apollo_deploy._resolver
    assert resolver is not None

    assert await resolver.end_user(user_id) == "fixture@example.test"
    monkeypatch.setenv("APOLLO_LLM_USER_FIELD", "subject")
    apollo_settings.cache_clear()
    assert await resolver.end_user(user_id) == "fixture-user"


# One request at a time per user ------------------------------------------------------


@pytest.mark.anyio
async def test_same_user_runs_wait_while_other_users_go_ahead(apollo_env: None) -> None:
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
    assert not apollo_deploy.user_gate().run_active("user-a")


@pytest.mark.anyio
async def test_preview_is_refused_during_a_run_and_previews_take_turns(
    apollo_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = apollo_deploy.user_gate()
    assert gate.try_start_run("user-a")
    with pytest.raises(ApolloRunActiveError, match="Preview more rows"):
        async with gate.preview("user-a"):
            pass
    # Another user's Preview is not blocked.
    async with gate.preview("user-b"):
        pass
    gate.finish_run("user-a")

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
                ApolloAnnotationAdapter().complete, "qwen3-32b", preview, "s", "u", CONFIG
            )
    assert most == 1
    # A Run does not start while the user's Preview request is in flight.
    async with gate.preview("user-a"):
        assert not gate.try_start_run("user-a")
    assert gate.try_start_run("user-a")


@pytest.mark.anyio
async def test_a_run_sends_one_request_at_a_time(
    apollo_env: None, monkeypatch: pytest.MonkeyPatch
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
    apollo_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr("ldaca_wordflow.apollo_deploy.adapter.asyncio.sleep", fake_sleep)
    _install_fake_openai(
        monkeypatch,
        [
            _StatusError(429, "Rate limit reached", {"retry-after": "7"}),
            _StatusError(429, "Rate limit reached"),
            '{"labels": ["Relevant"]}',
        ],
    )

    labels = await ApolloAnnotationAdapter().complete(
        "qwen3-32b", _binding(), "s", "u", CONFIG
    )

    assert labels == '{"labels": ["Relevant"]}'
    assert sleeps[0] == 7
    assert 1 <= sleeps[1] <= 6


# Upstream behaviour without APOLLO_LLM_BASE_URL -----------------------------------------


@pytest.mark.anyio
async def test_without_base_url_the_build_behaves_like_upstream(
    no_apollo_env: None, tmp_path: Path
) -> None:
    assert not apollo_settings().enabled
    other = _snapshot(
        provider_configuration_id=uuid.uuid4(),
        provider_base_url="https://llm.example/v1",
    )
    assert apollo_deploy.claims_annotation_provider(other, "key") is False
    assert isinstance(
        resolve_provider_adapter("custom", "https://llm.example/v1"),
        CustomOpenAICompatibleAnnotationAdapter,
    )
    assert apollo_deploy.scheduler_eligible("any-user-key") is True
    assert apollo_deploy.scheduler_eligible(None) is True
    assert await apollo_deploy.bind_credential("their-key", "user", "run") == "their-key"
    store = _credential_store(tmp_path, multi_user=True)
    assert await store.resolve_annotation_provider(other, supplied="key") == "key"
    with pytest.raises(Exception, match="not available on this server"):
        await store.resolve_annotation_provider(_snapshot(), supplied=None)


def test_provider_route_is_disabled_without_base_url(
    no_apollo_env: None, multi_user_test_client: TestClient
) -> None:
    body = multi_user_test_client.get("/api/apollo/provider").json()
    assert body["enabled"] is False
    assert body["configuration"] is None


def _annotation_source():
    return AnnotationAnalysisSubmission(
        node_id=uuid.uuid4(),
        text_column="text",
        annotation_column="class",
        class_node_id=uuid.uuid4(),
        class_column="text",
        description_column="text",
        classes=[{"name": "Relevant", "description": ""}],
        provider_configuration_id=APOLLO_CONFIGURATION_ID,
        provider="custom",
        provider_base_url=APOLLO_PLACEHOLDER_BASE_URL,
        model="qwen3-32b",
        instruction="Classify the text",
    ).persisted_request()
