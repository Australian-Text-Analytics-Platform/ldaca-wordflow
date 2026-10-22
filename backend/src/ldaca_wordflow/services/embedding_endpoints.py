"""Remote embedding endpoints for Topic Modelling (issue 412 follow-up).

Two kinds of endpoint:

- a server's own, from its providers file (``server_ai``): the key stays in the
  server's environment, and the signed-in person is sent as the OpenAI
  ``user`` field when the endpoint asks for it (accounting, as for server LLMs);
- on a desktop (single-user), endpoints people add in Settings, with an
  optional API key kept in ``embedding-endpoints.toml`` (private, 0600) and
  never returned to the browser. A shared server keeps no personal keys, so
  people can't add their own there.

They are separate from Annotation's AI providers: a gateway can serve both,
but an embedding server need not run an LLM. Without an endpoint, or with
Remote GPU unticked, Topic Modelling embeds on this computer as before.

A run's endpoint travels from submit to the worker as an in-memory
credential string, like an Annotation key; it is never saved.
"""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from pydantic import ValidationError

from .. import server_ai
from ..domain.workspace import TopicEmbeddingModel
from ..infrastructure.storage.private_toml import PrivateTomlError
from ..models.embedding_endpoints import (
    EmbeddingEndpointCheck,
    EmbeddingEndpointCreate,
    EmbeddingEndpointList,
    EmbeddingEndpointResource,
    EmbeddingEndpointUpdate,
    StoredEmbeddingEndpoint,
    StoredEmbeddingEndpoints,
    default_served_models,
)
from ..shared.remote_embedding import RemoteEmbeddingRun
from ..shared.errors import (
    AccessDeniedError,
    InvalidInputError,
    NotFoundError,
    ProviderCredentialMissingError,
    ProviderCredentialsCorruptError,
)
from .sessions import SINGLE_USER

if TYPE_CHECKING:
    import anyio

    from ..domain.workspace import TopicModelingAnalysisRequest
    from ..infrastructure.storage.private_toml import PrivateTomlPersistence
    from ..settings import Settings

logger = logging.getLogger(__name__)

_ENDPOINTS_FILENAME = "embedding-endpoints.toml"
CHECK_TIMEOUT_SECONDS = 20.0
# Both Topic Modelling models (MiniLM) give 384-dimensional vectors.
_EXPECTED_DIMENSIONS = {model: 384 for model in TopicEmbeddingModel}
_MODEL_LABELS = {
    TopicEmbeddingModel.ENGLISH: "English",
    TopicEmbeddingModel.MULTILINGUAL: "Multilingual",
}


class EmbeddingEndpointMethods:
    """Embedding endpoint storage and resolution, mixed into ProviderCredentialStore.

    Uses the store's settings, private TOML persistence and lock, with its
    own file, so Annotation's credentials file and schema are untouched.
    """

    _settings: Settings
    _persistence: PrivateTomlPersistence
    _lock: anyio.Lock

    async def list_embedding_endpoints(self) -> EmbeddingEndpointList:
        endpoints = [_server_resource(endpoint) for endpoint in _server_endpoints()]
        if self._settings.multi_user:
            return EmbeddingEndpointList(storage="server", endpoints=endpoints)
        async with self._lock:
            stored = await self._load_endpoints()
        endpoints.extend(_user_resource(endpoint) for endpoint in stored.endpoints)
        return EmbeddingEndpointList(storage="backend", endpoints=endpoints)

    async def create_embedding_endpoint(
        self, command: EmbeddingEndpointCreate
    ) -> EmbeddingEndpointResource:
        self._require_endpoint_storage()
        endpoint = StoredEmbeddingEndpoint(
            id=uuid.uuid4(),
            name=command.name,
            base_url=command.base_url,
            api_key=command.api_key,
            models=command.models if command.models is not None else default_served_models(),
        )
        async with self._lock:
            stored = await self._load_endpoints()
            await self._write_endpoints(
                stored.model_copy(update={"endpoints": [*stored.endpoints, endpoint]})
            )
        return _user_resource(endpoint)

    async def update_embedding_endpoint(
        self, endpoint_id: uuid.UUID, command: EmbeddingEndpointUpdate
    ) -> EmbeddingEndpointResource:
        self._require_endpoint_storage()
        changes = command.model_fields_set
        async with self._lock:
            stored = await self._load_endpoints()
            endpoints = list(stored.endpoints)
            for index, endpoint in enumerate(endpoints):
                if endpoint.id != endpoint_id:
                    continue
                updated = StoredEmbeddingEndpoint(
                    id=endpoint.id,
                    name=command.name if "name" in changes and command.name else endpoint.name,
                    base_url=(
                        command.base_url
                        if "base_url" in changes and command.base_url
                        else endpoint.base_url
                    ),
                    api_key=command.api_key if "api_key" in changes else endpoint.api_key,
                    models=(
                        command.models
                        if "models" in changes and command.models is not None
                        else endpoint.models
                    ),
                )
                endpoints[index] = updated
                await self._write_endpoints(stored.model_copy(update={"endpoints": endpoints}))
                return _user_resource(updated)
        raise NotFoundError("Embedding endpoint not found")

    async def delete_embedding_endpoint(self, endpoint_id: uuid.UUID) -> None:
        self._require_endpoint_storage()
        async with self._lock:
            stored = await self._load_endpoints()
            endpoints = [item for item in stored.endpoints if item.id != endpoint_id]
            if len(endpoints) == len(stored.endpoints):
                raise NotFoundError("Embedding endpoint not found")
            await self._write_endpoints(stored.model_copy(update={"endpoints": endpoints}))

    async def resolve_embedding_endpoint(
        self, request: TopicModelingAnalysisRequest, user_id: str
    ) -> RemoteEmbeddingRun:
        """Where this run embeds; errors when the endpoint or its model is gone."""

        model = request.embedding_model
        label = _MODEL_LABELS[model]
        server = server_ai.server_ai_providers().embedding_endpoint(request.embedding_endpoint_id)
        if server is not None:
            served = server.models.get(model.value)
            if served is None:
                raise InvalidInputError(
                    f"{server.name} doesn't embed with the {label} model. "
                    "Choose another model, or untick Remote GPU."
                )
            return RemoteEmbeddingRun(
                endpoint=server.base_url,
                served_model=served,
                api_key_env=server.api_key_env,
                user=await server_ai.embedding_end_user(server, user_id),
                batch_size=server.batch_size,
                concurrency=server.concurrency,
            )
        if self._settings.multi_user:
            raise ProviderCredentialMissingError(
                "This server doesn't offer the embedding endpoint this run used. "
                "Untick Remote GPU, or choose another endpoint."
            )
        async with self._lock:
            stored = await self._load_endpoints()
        endpoint = next(
            (item for item in stored.endpoints if item.id == request.embedding_endpoint_id),
            None,
        )
        if endpoint is None:
            raise ProviderCredentialMissingError(
                "The embedding endpoint this run used is no longer in Settings. "
                "Untick Remote GPU, or choose another endpoint."
            )
        served = endpoint.models.get(model)
        if served is None:
            raise InvalidInputError(
                f"{endpoint.name} isn't set up for the {label} model. "
                "Add its name on the endpoint in Settings, or untick Remote GPU."
            )
        return RemoteEmbeddingRun(
            endpoint=endpoint.base_url,
            served_model=served,
            api_key=endpoint.api_key.get_secret_value() if endpoint.api_key else None,
        )

    async def check_embedding_endpoint(self, endpoint_id: uuid.UUID) -> EmbeddingEndpointCheck:
        """List the endpoint's models and embed one sentence with each Topic
        Modelling model it is set up for. Messages never contain the key."""

        base_url, api_key, models, name = await self._embedding_target(endpoint_id)
        from openai import AsyncOpenAI

        available = {model: False for model in TopicEmbeddingModel}
        async with AsyncOpenAI(
            base_url=base_url,
            api_key=api_key or "no-key-required",
            timeout=CHECK_TIMEOUT_SECONDS,
            max_retries=0,
        ) as client:
            try:
                served = sorted({model.id async for model in client.models.list()})
            except Exception as exc:  # noqa: BLE001 (reported, never raised)
                return EmbeddingEndpointCheck(
                    reachable=False,
                    served_models=[],
                    available=available,
                    message=_describe_failure(exc, name),
                )
            failures = []
            for model, served_name in models.items():
                try:
                    response = await client.embeddings.create(
                        model=served_name,
                        input=["Wordflow checks this endpoint."],
                        encoding_format="float",
                    )
                    width = len(response.data[0].embedding) if response.data else 0
                    available[model] = width == _EXPECTED_DIMENSIONS[model]
                    if not available[model]:
                        failures.append(
                            f"{_MODEL_LABELS[model]}: {served_name} gave {width}-dimensional "
                            f"vectors, not {_EXPECTED_DIMENSIONS[model]}"
                        )
                except Exception as exc:  # noqa: BLE001 (reported, never raised)
                    failures.append(
                        f"{_MODEL_LABELS[model]}: {served_name}: {_describe_failure(exc, name)}"
                    )
        return EmbeddingEndpointCheck(
            reachable=True,
            served_models=served,
            available=available,
            message="; ".join(failures) or None,
        )

    async def _embedding_target(
        self, endpoint_id: uuid.UUID
    ) -> tuple[str, str | None, dict[TopicEmbeddingModel, str], str]:
        server = server_ai.server_ai_providers().embedding_endpoint(endpoint_id)
        if server is not None:
            return (
                server.base_url,
                server.api_key(),
                {TopicEmbeddingModel(model): name for model, name in server.models.items()},
                server.name,
            )
        if self._settings.multi_user:
            raise NotFoundError("Embedding endpoint not found")
        async with self._lock:
            stored = await self._load_endpoints()
        for endpoint in stored.endpoints:
            if endpoint.id == endpoint_id:
                key = endpoint.api_key.get_secret_value() if endpoint.api_key else None
                return endpoint.base_url, key, dict(endpoint.models), endpoint.name
        raise NotFoundError("Embedding endpoint not found")

    def _require_endpoint_storage(self) -> None:
        if self._settings.multi_user:
            raise AccessDeniedError(
                "On a shared server, embedding endpoints come from the server's configuration"
            )

    async def _load_endpoints(self) -> StoredEmbeddingEndpoints:
        try:
            raw = await self._persistence.read(SINGLE_USER.id, _ENDPOINTS_FILENAME)
        except PrivateTomlError as exc:
            logger.warning("Invalid embedding endpoints for single-user root")
            raise ProviderCredentialsCorruptError() from exc
        if raw is None:
            return StoredEmbeddingEndpoints()
        try:
            return StoredEmbeddingEndpoints.model_validate(raw)
        except ValidationError as exc:
            logger.warning("Invalid embedding endpoints for single-user root")
            raise ProviderCredentialsCorruptError() from exc

    async def _write_endpoints(self, stored: StoredEmbeddingEndpoints) -> None:
        payload: dict[str, object] = {
            "schema_version": stored.schema_version,
            "endpoints": [
                {
                    "id": str(endpoint.id),
                    "name": endpoint.name,
                    "base_url": endpoint.base_url,
                    **(
                        {"api_key": endpoint.api_key.get_secret_value()}
                        if endpoint.api_key is not None
                        else {}
                    ),
                    "models": {model.value: name for model, name in endpoint.models.items()},
                }
                for endpoint in stored.endpoints
            ],
        }
        try:
            await self._persistence.write(SINGLE_USER.id, _ENDPOINTS_FILENAME, payload)
        except PrivateTomlError as exc:
            raise ProviderCredentialsCorruptError() from exc


def _server_endpoints() -> tuple[server_ai.ServerEmbeddingEndpoint, ...]:
    return server_ai.server_ai_providers().embedding_endpoints


def _server_resource(endpoint: server_ai.ServerEmbeddingEndpoint) -> EmbeddingEndpointResource:
    return EmbeddingEndpointResource(
        id=endpoint.id,
        name=endpoint.name,
        base_url=endpoint.placeholder_base_url,
        source="server",
        has_api_key=True,
        models={TopicEmbeddingModel(model): name for model, name in endpoint.models.items()},
        default=endpoint.default,
    )


def _user_resource(endpoint: StoredEmbeddingEndpoint) -> EmbeddingEndpointResource:
    return EmbeddingEndpointResource(
        id=endpoint.id,
        name=endpoint.name,
        base_url=endpoint.base_url,
        source="user",
        has_api_key=endpoint.api_key is not None,
        models=dict(endpoint.models),
        default=False,
    )


def _describe_failure(error: Exception, name: str) -> str:
    """A plain account of a failed request, without the key or the server's text."""

    from openai import (
        APIConnectionError,
        APIStatusError,
        APITimeoutError,
        AuthenticationError,
        NotFoundError as OpenAINotFoundError,
        PermissionDeniedError,
    )

    if isinstance(error, APITimeoutError):
        return f"{name} didn't answer within {CHECK_TIMEOUT_SECONDS:.0f} seconds"
    if isinstance(error, APIConnectionError):
        return f"Couldn't reach {name}; check the address and your network"
    if isinstance(error, AuthenticationError | PermissionDeniedError):
        return f"{name} refused the API key"
    if isinstance(error, OpenAINotFoundError):
        return f"{name} doesn't have this model (HTTP 404)"
    if isinstance(error, APIStatusError):
        return f"{name} answered HTTP {error.status_code}"
    return f"{name} gave an unexpected answer ({type(error).__name__})"


__all__ = ["EmbeddingEndpointMethods"]
