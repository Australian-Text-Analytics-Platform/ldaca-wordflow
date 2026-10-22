"""Remote embedding endpoints for Topic Modelling (issue 412 follow-up).

A server lists its own endpoints from its providers file; on a desktop people
add, change, remove and check their own. Keys are write-only.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from ..models.embedding_endpoints import (
    EmbeddingEndpointCheck,
    EmbeddingEndpointCreate,
    EmbeddingEndpointList,
    EmbeddingEndpointModels,
    EmbeddingEndpointModelsRequest,
    EmbeddingEndpointResource,
    EmbeddingEndpointUpdate,
)
from .dependencies import RuntimeDep
from .responses import api_errors
from .security import CurrentSessionSecurityDep

router = APIRouter(
    prefix="/embedding-endpoints",
    tags=["embedding-endpoints"],
    responses=api_errors(401),
)


@router.get("", response_model=EmbeddingEndpointList, responses=api_errors(500))
async def list_embedding_endpoints(
    _principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> EmbeddingEndpointList:
    return await runtime.provider_credential_store.list_embedding_endpoints()


@router.post(
    "",
    response_model=EmbeddingEndpointResource,
    status_code=status.HTTP_201_CREATED,
    responses=api_errors(400, 403, 409, 422, 500),
)
async def create_embedding_endpoint(
    command: EmbeddingEndpointCreate,
    _principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> EmbeddingEndpointResource:
    return await runtime.provider_credential_store.create_embedding_endpoint(command)


@router.patch(
    "/{endpoint_id}",
    response_model=EmbeddingEndpointResource,
    responses=api_errors(400, 403, 404, 409, 422, 500),
)
async def update_embedding_endpoint(
    endpoint_id: uuid.UUID,
    command: EmbeddingEndpointUpdate,
    _principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> EmbeddingEndpointResource:
    return await runtime.provider_credential_store.update_embedding_endpoint(endpoint_id, command)


@router.delete(
    "/{endpoint_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=api_errors(403, 404, 422, 500),
)
async def delete_embedding_endpoint(
    endpoint_id: uuid.UUID,
    _principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> Response:
    await runtime.provider_credential_store.delete_embedding_endpoint(endpoint_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/models",
    response_model=EmbeddingEndpointModels,
    responses=api_errors(403, 404, 422, 500),
)
async def list_embedding_endpoint_models(
    request: EmbeddingEndpointModelsRequest,
    _principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> EmbeddingEndpointModels:
    """List a server's models before it is saved, with the typed (or saved) key."""

    return await runtime.provider_credential_store.list_embedding_endpoint_models(request)


@router.post(
    "/{endpoint_id}/check",
    response_model=EmbeddingEndpointCheck,
    responses=api_errors(404, 422, 500),
)
async def check_embedding_endpoint(
    endpoint_id: uuid.UUID,
    _principal: CurrentSessionSecurityDep,
    runtime: RuntimeDep,
) -> EmbeddingEndpointCheck:
    """List the endpoint's models and embed one sentence with each model it is set up for."""

    return await runtime.provider_credential_store.check_embedding_endpoint(endpoint_id)


__all__ = ["router"]
