"""Remote embedding endpoints for Topic Modelling (issue 412 follow-up)."""

from __future__ import annotations

import json
import os
import random
import threading
import uuid
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest
import rtoml
import yaml
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from ldaca_wordflow import server_ai
from ldaca_wordflow.domain.workspace import TopicEmbeddingModel, TopicModelingAnalysisRequest
from ldaca_wordflow.models.embedding_endpoints import (
    EmbeddingEndpointCreate,
    EmbeddingEndpointModelsRequest,
    EmbeddingEndpointUpdate,
)
from ldaca_wordflow.services.embedding_endpoints import embedding_models, suggest_served_models
from ldaca_wordflow.server_ai.config import (
    PROVIDERS_FILE_ENV,
    clear_server_ai_providers,
    load_providers,
)
from ldaca_wordflow.services.sessions import SINGLE_USER
from ldaca_wordflow.shared.errors import (
    AccessDeniedError,
    InvalidInputError,
    NotFoundError,
    ProviderCredentialMissingError,
)
from ldaca_wordflow.shared.remote_embedding import (
    RemoteEmbeddingRun,
    decode_embedding_run,
    encode_embedding_run,
)
from ldaca_wordflow.workers import topic_pipeline
from ldaca_wordflow.workers.topic_pipeline import remote_embedding_options

from .test_provider_credentials import _store

ENGLISH = TopicEmbeddingModel.ENGLISH
MULTILINGUAL = TopicEmbeddingModel.MULTILINGUAL
KEY_ENV = "RESEARCH_EMBEDDING_KEY"
SERVER_KEY = "sk-server-embedding-secret-0123456789"
DESKTOP_KEY = "sk-desktop-embedding-secret-9876543210"
ENDPOINT: dict[str, Any] = {
    "slug": "research-gpu",
    "name": "Research GPU",
    "base_url": "https://gateway.research.example.edu/v1",
    "api_key_env": KEY_ENV,
    "models": {ENGLISH.value: "minilm-l6"},
    "send_user": "email",
    "concurrency": 8,
    "default": True,
}


@pytest.fixture
def server_endpoint(
    tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch
) -> Iterator[uuid.UUID]:
    monkeypatch.setenv(KEY_ENV, SERVER_KEY)
    path = tmp_path_factory.mktemp("config") / "ai-providers.yaml"
    path.write_text(yaml.safe_dump({"embedding_endpoints": [ENDPOINT]}), encoding="utf-8")
    monkeypatch.setenv(PROVIDERS_FILE_ENV, str(path))
    clear_server_ai_providers()
    endpoint = server_ai.server_ai_providers().embedding_endpoints[0]
    yield endpoint.id
    clear_server_ai_providers()


@pytest.fixture
def no_server_endpoints(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv(PROVIDERS_FILE_ENV, raising=False)
    clear_server_ai_providers()
    yield
    clear_server_ai_providers()


def _request(endpoint_id: uuid.UUID | None, **values: Any) -> TopicModelingAnalysisRequest:
    node = uuid.uuid4()
    return TopicModelingAnalysisRequest.model_validate(
        {
            "node_ids": [node],
            "node_columns": {node: "text"},
            "embedding_endpoint_id": endpoint_id,
            **values,
        }
    )


class _FakeResolver:
    async def end_user(self, provider: object, user_id: str) -> str:
        return f"{user_id}@uni.example"


# --- server configuration ---------------------------------------------------


def test_a_server_endpoint_needs_its_key_and_known_models(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "ai-providers.yaml"
    path.write_text(yaml.safe_dump({"embedding_endpoints": [ENDPOINT]}), encoding="utf-8")
    monkeypatch.delenv(KEY_ENV, raising=False)
    with pytest.raises(ValueError, match=f"needs {KEY_ENV} set") as error:
        load_providers(path)
    assert SERVER_KEY not in str(error.value)

    monkeypatch.setenv(KEY_ENV, SERVER_KEY)
    unknown = {**ENDPOINT, "models": {"bert-base": "bert"}}
    path.write_text(yaml.safe_dump({"embedding_endpoints": [unknown]}), encoding="utf-8")
    with pytest.raises(ValueError, match="models keys must be Topic Modelling models"):
        load_providers(path)

    path.write_text(yaml.safe_dump({"embedding_endpoints": [ENDPOINT]}), encoding="utf-8")
    loaded = load_providers(path).embedding_endpoints[0]
    assert loaded.models == {ENGLISH.value: "minilm-l6"}
    assert loaded.placeholder_base_url == "https://research-gpu.server-ai.invalid/v1"


def test_embedding_endpoints_need_their_own_slug(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(KEY_ENV, SERVER_KEY)
    path = tmp_path / "ai-providers.yaml"
    path.write_text(
        yaml.safe_dump({"embedding_endpoints": [ENDPOINT, ENDPOINT]}), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="each embedding endpoint needs its own slug"):
        load_providers(path)


# --- listing and the desktop store ------------------------------------------


@pytest.mark.anyio
async def test_a_shared_server_lists_only_its_own_endpoints(
    tmp_path: Path, server_endpoint: uuid.UUID
) -> None:
    store, _ = _store(tmp_path, multi_user=True)

    listed = await store.list_embedding_endpoints()

    assert listed.storage == "server"
    [endpoint] = listed.endpoints
    assert endpoint.id == server_endpoint
    assert endpoint.source == "server"
    assert endpoint.default is True
    assert endpoint.base_url == "https://research-gpu.server-ai.invalid/v1"
    assert SERVER_KEY not in endpoint.model_dump_json()
    with pytest.raises(AccessDeniedError):
        await store.create_embedding_endpoint(
            EmbeddingEndpointCreate(
                name="Mine", base_url="http://localhost:8000/v1", models={ENGLISH: "minilm"}
            )
        )


@pytest.mark.anyio
async def test_desktop_endpoints_are_stored_privately_and_never_returned(
    tmp_path: Path, no_server_endpoints: None
) -> None:
    store, settings = _store(tmp_path)

    created = await store.create_embedding_endpoint(
        EmbeddingEndpointCreate(
            name=" Lab GPU ",
            base_url="https://gpu.lab.example/v1/",
            api_key=SecretStr(DESKTOP_KEY),
            models={ENGLISH: "minilm-en"},
        )
    )

    assert created.name == "Lab GPU"
    assert created.base_url == "https://gpu.lab.example/v1"
    assert created.has_api_key is True
    assert created.models == {ENGLISH: "minilm-en"}
    assert DESKTOP_KEY not in created.model_dump_json()
    path = settings.get_users_root_folder() / SINGLE_USER.id / "embedding-endpoints.toml"
    # Windows has no POSIX modes: the file sits in the person's own profile.
    assert os.name == "nt" or os.stat(path).st_mode & 0o077 == 0
    saved = rtoml.loads(path.read_text())
    assert saved["endpoints"][0]["api_key"] == DESKTOP_KEY
    listed = await store.list_embedding_endpoints()
    assert listed.storage == "backend"
    assert [endpoint.id for endpoint in listed.endpoints] == [created.id]
    # Annotation's credentials file is untouched.
    assert not (settings.get_users_root_folder() / SINGLE_USER.id / "provider-credentials.toml").exists()

    updated = await store.update_embedding_endpoint(
        created.id,
        EmbeddingEndpointUpdate(api_key=None, models={MULTILINGUAL: "multi"}),
    )
    assert updated.has_api_key is False
    assert updated.models == {MULTILINGUAL: "multi"}
    assert updated.name == "Lab GPU"

    await store.delete_embedding_endpoint(created.id)
    assert (await store.list_embedding_endpoints()).endpoints == []
    with pytest.raises(NotFoundError):
        await store.delete_embedding_endpoint(created.id)


def test_an_endpoint_address_must_be_plain_http(no_server_endpoints: None) -> None:
    for address in ("ftp://gpu/v1", "https://me:secret@gpu/v1", "https://gpu/v1?key=secret"):
        with pytest.raises(ValidationError) as error:
            EmbeddingEndpointCreate(name="GPU", base_url=address, models={ENGLISH: "minilm"})
        # The API returns only each error's message (main.py strips inputs).
        messages = [item["msg"] for item in error.value.errors(include_input=False)]
        assert messages and not any("secret" in message for message in messages)


# --- resolving a run ----------------------------------------------------------


@pytest.mark.anyio
async def test_a_server_endpoint_resolves_to_its_key_variable_and_the_signed_in_user(
    tmp_path: Path, server_endpoint: uuid.UUID, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(server_ai, "_resolver", _FakeResolver())
    store, _ = _store(tmp_path, multi_user=True)

    run = await store.resolve_embedding_endpoint(_request(server_endpoint), "alice")

    assert run == RemoteEmbeddingRun(
        endpoint="https://gateway.research.example.edu/v1",
        served_model="minilm-l6",
        api_key_env=KEY_ENV,
        user="alice@uni.example",
        concurrency=8,
    )
    with pytest.raises(InvalidInputError, match="doesn't embed with the Multilingual model"):
        await store.resolve_embedding_endpoint(
            _request(
                server_endpoint,
                embedding_model=MULTILINGUAL.value,
                max_segment_tokens=128,
            ),
            "alice",
        )
    with pytest.raises(ProviderCredentialMissingError, match="doesn't offer"):
        await store.resolve_embedding_endpoint(_request(uuid.uuid4()), "alice")


@pytest.mark.anyio
async def test_a_desktop_endpoint_resolves_to_its_key(
    tmp_path: Path, no_server_endpoints: None
) -> None:
    store, _ = _store(tmp_path)
    created = await store.create_embedding_endpoint(
        EmbeddingEndpointCreate(
            name="Lab GPU",
            base_url="http://localhost:8000/v1",
            api_key=SecretStr(DESKTOP_KEY),
            models={ENGLISH: "minilm"},
        )
    )

    run = await store.resolve_embedding_endpoint(_request(created.id), SINGLE_USER.id)

    assert (run.endpoint, run.served_model, run.api_key, run.user) == (
        "http://localhost:8000/v1",
        "minilm",
        DESKTOP_KEY,
        None,
    )
    assert DESKTOP_KEY not in repr(run)
    with pytest.raises(InvalidInputError, match="isn't set up for the Multilingual model"):
        await store.resolve_embedding_endpoint(
            _request(created.id, embedding_model=MULTILINGUAL.value, max_segment_tokens=128),
            SINGLE_USER.id,
        )
    with pytest.raises(ProviderCredentialMissingError, match="no longer in Settings"):
        await store.resolve_embedding_endpoint(_request(uuid.uuid4()), SINGLE_USER.id)


def test_the_run_endpoint_round_trips_and_other_credentials_are_ignored() -> None:
    run = RemoteEmbeddingRun(endpoint="http://h/v1", served_model="m", api_key="k", user="u")
    assert decode_embedding_run(encode_embedding_run(run)) == run
    assert decode_embedding_run("sk-an-annotation-key") is None
    assert decode_embedding_run(None) is None
    with pytest.raises(InvalidInputError):
        decode_embedding_run("embedding-run:v1:not-base64-json")


def test_saved_requests_name_an_endpoint_only_when_one_is_used() -> None:
    assert "embedding_endpoint_id" not in _request(None).model_dump(mode="json")
    endpoint_id = uuid.uuid4()
    saved = _request(endpoint_id).model_dump(mode="json")
    assert saved["embedding_endpoint_id"] == str(endpoint_id)


# --- the worker -----------------------------------------------------------------


def test_a_desktop_key_reaches_polars_text_only_through_a_private_file() -> None:
    with remote_embedding_options(None) as local:
        assert local == {}

    run = RemoteEmbeddingRun(
        endpoint="http://h/v1", served_model="m", api_key=DESKTOP_KEY, user="u", batch_size=32
    )
    with remote_embedding_options(run) as options:
        path = Path(options.pop("embedding_api_key_file"))
        assert path.read_text() == DESKTOP_KEY
        assert os.name == "nt" or os.stat(path).st_mode & 0o077 == 0
        assert options == {
            "embedding_endpoint": "http://h/v1",
            "embedding_remote_model": "m",
            "embedding_user": "u",
            "embedding_batch_size": 32,
        }
        assert DESKTOP_KEY not in json.dumps(options)
    assert not path.exists()

    server = RemoteEmbeddingRun(endpoint="http://h/v1", served_model="m", api_key_env=KEY_ENV)
    with remote_embedding_options(server) as options:
        assert options["embedding_api_key_env"] == KEY_ENV
        assert "embedding_api_key_file" not in options


class _Embeddings(BaseHTTPRequestHandler):
    """An OpenAI-compatible server: /v1/models and /v1/embeddings."""

    seen: list[dict[str, Any]] = []
    served: tuple[str, ...] = ("minilm",)

    def do_GET(self) -> None:  # noqa: N802
        self._send({"object": "list", "data": [{"id": name, "object": "model"} for name in self.served]})

    def do_POST(self) -> None:  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        type(self).seen.append({"authorization": self.headers.get("Authorization"), "body": body})
        if body["model"] not in self.served:
            self._send({"error": {"message": "model not found"}}, status=404)
            return
        self._send(
            {
                "object": "list",
                "data": [
                    {"object": "embedding", "index": index, "embedding": _vector(text)}
                    for index, text in enumerate(body["input"])
                ],
            }
        )

    def _send(self, payload: dict[str, Any], status: int = 200) -> None:
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        pass


def _vector(text: str) -> list[float]:
    """One direction per first word plus noise seeded by the text."""

    words = text.split()
    group = sum(map(ord, words[0])) % 7 if words else 0
    noise = random.Random(text)
    return [(3.0 if index % 7 == group else 0.0) + noise.uniform(-0.2, 0.2) for index in range(384)]


@pytest.fixture
def embeddings_server() -> Iterator[str]:
    _Embeddings.seen = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Embeddings)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}/v1"
    server.shutdown()


@pytest.mark.anyio
async def test_the_check_lists_models_and_embeds_with_each_one(
    tmp_path: Path, no_server_endpoints: None, embeddings_server: str
) -> None:
    store, _ = _store(tmp_path)
    created = await store.create_embedding_endpoint(
        EmbeddingEndpointCreate(
            name="Lab GPU",
            base_url=embeddings_server,
            api_key=SecretStr(DESKTOP_KEY),
            models={ENGLISH: "minilm", MULTILINGUAL: "multilingual-missing"},
        )
    )

    check = await store.check_embedding_endpoint(created.id)

    assert check.reachable is True
    assert check.served_models == ["minilm"]
    assert check.available == {ENGLISH: True, MULTILINGUAL: False}
    assert check.message is not None and "Multilingual" in check.message
    assert DESKTOP_KEY not in check.model_dump_json()
    assert _Embeddings.seen[0]["authorization"] == f"Bearer {DESKTOP_KEY}"


@pytest.mark.anyio
async def test_an_unreachable_endpoint_is_reported_without_its_key(
    tmp_path: Path, no_server_endpoints: None
) -> None:
    store, _ = _store(tmp_path)
    created = await store.create_embedding_endpoint(
        EmbeddingEndpointCreate(
            name="Lab GPU",
            base_url="http://127.0.0.1:9/v1",
            api_key=SecretStr(DESKTOP_KEY),
            models={ENGLISH: "minilm"},
        )
    )

    check = await store.check_embedding_endpoint(created.id)

    assert check.reachable is False
    assert check.message is not None and "Couldn't reach Lab GPU" in check.message
    assert DESKTOP_KEY not in check.model_dump_json()


@pytest.mark.anyio
async def test_a_sign_in_redirect_is_reported_not_followed(
    tmp_path: Path, no_server_endpoints: None
) -> None:
    class _SignIn(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            self.send_response(302)
            self.send_header("Location", "https://sso.example/auth")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), _SignIn)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        store, _ = _store(tmp_path)
        created = await store.create_embedding_endpoint(
            EmbeddingEndpointCreate(
                name="Pilot",
                base_url=f"http://127.0.0.1:{server.server_port}/v1",
                api_key=SecretStr(DESKTOP_KEY),
                models={ENGLISH: "minilm"},
            )
        )
        check = await store.check_embedding_endpoint(created.id)
    finally:
        server.shutdown()

    assert check.reachable is False
    assert check.message == (
        "Pilot redirected to a sign-in page (HTTP 302): it needs single sign-on, not an API key"
    )


def test_topic_modelling_embeds_on_the_endpoint_with_the_key_and_user(
    embeddings_server: str, tmp_path: Path
) -> None:
    words = ["apple", "river", "stone", "cloud", "piano", "tiger", "maple"]
    documents = [f"{words[index % 7]} story number {index}." for index in range(140)]

    result = topic_pipeline._run_rust_topic_modeling(
        all_docs=documents,
        seed=0,
        min_cluster_size=5,
        vectorizer_model=None,
        embedding_cache=str(tmp_path / "embeddings.duckdb"),
        remote_embedding=RemoteEmbeddingRun(
            endpoint=embeddings_server,
            served_model="minilm",
            api_key=DESKTOP_KEY,
            user="alice@uni.example",
        ),
    )

    assert result["n_segments"] == 140
    assert result["n_topics"] >= 2
    requests = _Embeddings.seen
    assert {request["authorization"] for request in requests} == {f"Bearer {DESKTOP_KEY}"}
    assert {request["body"]["user"] for request in requests} == {"alice@uni.example"}
    assert sum(len(request["body"]["input"]) for request in requests) == 140
    assert not list(Path(os.environ.get("TMPDIR", "/tmp")).glob("wordflow-embedding-key-*"))


def test_a_failed_remote_embedding_fails_the_run(tmp_path: Path) -> None:
    with pytest.raises(Exception, match="could not be reached") as error:
        topic_pipeline._run_rust_topic_modeling(
            all_docs=["apple story one.", "river story two."] * 10,
            seed=0,
            min_cluster_size=2,
            vectorizer_model=None,
            remote_embedding=RemoteEmbeddingRun(
                endpoint="http://127.0.0.1:9/v1",
                served_model="minilm",
                api_key=DESKTOP_KEY,
                batch_size=8,
            ),
        )
    assert DESKTOP_KEY not in str(error.value)


def test_the_route_lists_server_endpoints_without_key_or_address(
    server_endpoint: uuid.UUID, multi_user_test_client: TestClient
) -> None:
    response = multi_user_test_client.get("/api/embedding-endpoints")

    assert response.status_code == 200
    body = response.json()
    assert body["storage"] == "server"
    assert body["endpoints"][0]["id"] == str(server_endpoint)
    assert SERVER_KEY not in response.text
    assert "gateway.research.example.edu" not in response.text
    refused = multi_user_test_client.post(
        "/api/embedding-endpoints",
        json={
            "name": "Mine",
            "base_url": "http://localhost:8000/v1",
            "models": {ENGLISH.value: "minilm"},
        },
    )
    assert refused.status_code == 403


@pytest.mark.anyio
async def test_a_desktop_run_resolves_its_endpoint_on_submit_and_saves_no_key(
    tmp_path: Path, no_server_endpoints: None
) -> None:
    from ldaca_wordflow.domain.workspace import AnalysisExecutionScope, AnalysisKind

    from .test_analysis_service import (
        _analysis_service,
        _ExecutionControl,
        _opened_workspace_with_tab,
        _submit,
    )

    workspaces, workspace_id, node_id, tab_id = await _opened_workspace_with_tab(
        tmp_path, kind=AnalysisKind.TOPIC_MODELING
    )
    execution = _ExecutionControl()
    service = _analysis_service(tmp_path, workspaces, execution)
    store = service._credentials
    created_endpoint = await store.create_embedding_endpoint(
        EmbeddingEndpointCreate(
            name="Lab GPU",
            base_url="http://localhost:8000/v1",
            api_key=SecretStr(DESKTOP_KEY),
            models={ENGLISH: "minilm"},
        )
    )
    request = TopicModelingAnalysisRequest.model_validate(
        {
            "node_ids": [node_id],
            "node_columns": {node_id: "text"},
            "embedding_endpoint_id": created_endpoint.id,
        }
    )

    await _submit(
        service,
        "user",
        workspace_id,
        tab_id,
        request,
        execution_scope=AnalysisExecutionScope.RUN_ALL,
    )

    run = decode_embedding_run(execution.enqueued[0][2])
    assert run is not None
    assert (run.endpoint, run.served_model, run.api_key) == (
        "http://localhost:8000/v1",
        "minilm",
        DESKTOP_KEY,
    )
    for path in (tmp_path / "workspaces").rglob("*"):
        # Lock files are empty, and Windows can't read one the open Project holds.
        if path.is_file() and path.suffix != ".lock":
            assert DESKTOP_KEY.encode() not in path.read_bytes()


@pytest.mark.anyio
async def test_a_run_with_a_missing_endpoint_is_refused_on_submit(
    tmp_path: Path, no_server_endpoints: None
) -> None:
    from ldaca_wordflow.domain.workspace import AnalysisExecutionScope, AnalysisKind

    from .test_analysis_service import (
        _analysis_service,
        _ExecutionControl,
        _opened_workspace_with_tab,
        _submit,
    )

    workspaces, workspace_id, node_id, tab_id = await _opened_workspace_with_tab(
        tmp_path, kind=AnalysisKind.TOPIC_MODELING
    )
    execution = _ExecutionControl()
    service = _analysis_service(tmp_path, workspaces, execution)
    request = TopicModelingAnalysisRequest.model_validate(
        {
            "node_ids": [node_id],
            "node_columns": {node_id: "text"},
            "embedding_endpoint_id": uuid.uuid4(),
        }
    )

    with pytest.raises(ProviderCredentialMissingError, match="no longer in Settings"):
        await _submit(
            service,
            SINGLE_USER.id,
            workspace_id,
            tab_id,
            request,
            execution_scope=AnalysisExecutionScope.RUN_ALL,
        )
    assert execution.enqueued == []


class _Gateway(_Embeddings):
    """A LiteLLM-style gateway: /v1/models marks embedding models by mode."""

    listed: list[dict[str, Any]] = []
    keys: list[str | None] = []

    def do_GET(self) -> None:  # noqa: N802
        type(self).keys.append(self.headers.get("Authorization"))
        if self.headers.get("Authorization") != f"Bearer {DESKTOP_KEY}":
            self._send({"error": {"message": "invalid key"}}, status=401)
            return
        self._send({"object": "list", "data": self.listed})


@pytest.fixture
def gateway() -> Iterator[str]:
    _Gateway.keys = []
    _Gateway.listed = [
        {"id": "ornith-1.5-35b", "object": "model"},
        {"id": "minilm-en", "object": "model", "mode": "embedding"},
        {"id": "minilm-multilingual", "object": "model", "mode": "embedding"},
        {"id": "ocr-model", "object": "model", "mode": "ocr"},
    ]
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Gateway)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}/v1"
    server.shutdown()


@pytest.mark.anyio
async def test_a_servers_embedding_models_are_listed_with_the_typed_key(
    tmp_path: Path, no_server_endpoints: None, gateway: str
) -> None:
    store, _ = _store(tmp_path)

    found = await store.list_embedding_endpoint_models(
        EmbeddingEndpointModelsRequest(base_url=gateway, api_key=SecretStr(DESKTOP_KEY))
    )

    assert found.reachable is True
    assert found.models == ["minilm-en", "minilm-multilingual"]
    assert found.suggested == {ENGLISH: "minilm-en", MULTILINGUAL: "minilm-multilingual"}
    assert _Gateway.keys[0] == f"Bearer {DESKTOP_KEY}"

    refused = await store.list_embedding_endpoint_models(
        EmbeddingEndpointModelsRequest(base_url=gateway, api_key=SecretStr("sk-wrong-key"))
    )
    assert refused.reachable is False
    assert refused.models == []
    assert refused.message is not None and "refused the API key" in refused.message
    assert "sk-wrong-key" not in refused.model_dump_json()


@pytest.mark.anyio
async def test_a_saved_key_is_used_only_for_its_own_address(
    tmp_path: Path, no_server_endpoints: None, gateway: str
) -> None:
    store, _ = _store(tmp_path)
    created = await store.create_embedding_endpoint(
        EmbeddingEndpointCreate(
            name="Gateway",
            base_url=gateway,
            api_key=SecretStr(DESKTOP_KEY),
            models={ENGLISH: "minilm-en"},
        )
    )

    same = await store.list_embedding_endpoint_models(
        EmbeddingEndpointModelsRequest(base_url=gateway, endpoint_id=created.id)
    )
    assert same.reachable is True

    other = gateway.replace("127.0.0.1", "localhost")
    moved = await store.list_embedding_endpoint_models(
        EmbeddingEndpointModelsRequest(base_url=other, endpoint_id=created.id)
    )
    assert moved.reachable is False
    assert _Gateway.keys[-1] != f"Bearer {DESKTOP_KEY}"


def test_without_kinds_every_model_is_offered_and_suggestions_need_one_match() -> None:
    assert embedding_models({"b-model": None, "A-model": None}) == ["A-model", "b-model"]
    assert embedding_models({"chat": None, "minilm": "embedding", "ocr": "ocr"}) == ["minilm"]
    assert suggest_served_models([ENGLISH.value, "minilm-multilingual"]) == {
        ENGLISH: ENGLISH.value,
        MULTILINGUAL: "minilm-multilingual",
    }
    # Two English-looking names: no guess.
    assert suggest_served_models(["minilm-a", "minilm-b"]) == {}


def test_a_shared_server_cannot_list_models_for_new_endpoints(
    multi_user_test_client: TestClient,
) -> None:
    response = multi_user_test_client.post(
        "/api/embedding-endpoints/models", json={"base_url": "http://localhost:8000/v1"}
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("system", "machine", "provider", "expected"),
    [
        ("darwin", "arm64", "", "gpu"),
        ("darwin", "arm64", "cpu", "cpu"),
        ("darwin", "x86_64", "", "cpu"),
        ("linux", "x86_64", "", "cpu"),
        ("win32", "AMD64", "", "cpu"),
    ],
)
def test_the_list_says_where_this_wordflow_reads_text(
    monkeypatch: pytest.MonkeyPatch, system: str, machine: str, provider: str, expected: str
) -> None:
    from ldaca_wordflow.services import embedding_endpoints as service

    monkeypatch.setattr(service.sys, "platform", system)
    monkeypatch.setattr(service.platform, "machine", lambda: machine)
    monkeypatch.setenv("POLARS_TEXT_EMBEDDING_PROVIDER", provider)
    assert service.local_embedding() == expected
