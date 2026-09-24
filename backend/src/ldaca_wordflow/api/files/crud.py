"""Thin direct-resource adapters for runtime-owned user file storage."""

from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from ...models.files import (
    BatchDeleteFilesRequest,
    BatchDeleteFilesResource,
    FileArchiveRequest,
    FileArchiveResource,
    CreateFolderRequest,
    FileResource,
    MoveFileRequest,
)
from ...shared.errors import UnsupportedMediaTypeError
from ..request_stream import RequestByteStream
from ..responses import api_errors, route_path_with_query
from ..security import CurrentSessionSecurityDep
from .dependencies import UserFileStoreDep

router = APIRouter()


@router.get(
    "",
    response_model=list[FileResource],
    responses=api_errors(403, 413, 422),
)
async def list_user_files(
    principal: CurrentSessionSecurityDep,
    file_store: UserFileStoreDep,
) -> list[FileResource]:
    """Return the complete deterministic User File tree."""

    return [
        FileResource.model_validate(resource)
        for resource in await file_store.list_tree(principal.user.id)
    ]


@router.get(
    "/resource",
    response_model=FileResource,
    responses=api_errors(400, 403, 404, 422),
)
async def get_user_file_resource(
    principal: CurrentSessionSecurityDep,
    path: Annotated[str, Query(min_length=1)],
    file_store: UserFileStoreDep,
) -> FileResource:
    """Return one direct file-or-directory resource."""

    return FileResource.model_validate(
        await file_store.resource(principal.user.id, path)
    )


@router.post(
    "/folders",
    response_model=FileResource,
    status_code=status.HTTP_201_CREATED,
    responses=api_errors(400, 403, 404, 409, 422, 507),
)
async def create_folder(
    request: CreateFolderRequest,
    http_request: Request,
    response: Response,
    principal: CurrentSessionSecurityDep,
    file_store: UserFileStoreDep,
) -> FileResource:
    """Create one addressable directory and return its direct resource."""

    resource = FileResource.model_validate(
        await file_store.create_folder(
            principal.user.id,
            name=request.name,
            parent_path=request.parent_path,
        )
    )
    response.headers["Location"] = route_path_with_query(
        http_request,
        "get_user_file_resource",
        path=resource.path,
    )
    return resource


@router.patch(
    "",
    response_model=FileResource,
    responses=api_errors(400, 403, 404, 409, 422),
)
async def move_file(
    request: MoveFileRequest,
    http_request: Request,
    response: Response,
    principal: CurrentSessionSecurityDep,
    file_store: UserFileStoreDep,
) -> FileResource:
    """Move one existing file without replacement."""

    resource = FileResource.model_validate(
        await file_store.move(
            principal.user.id,
            source_path=request.source_path,
            target_directory_path=request.target_directory_path,
        )
    )
    response.headers["Location"] = route_path_with_query(
        http_request,
        "get_user_file_resource",
        path=resource.path,
    )
    return resource


@router.post(
    "/uploads",
    response_model=FileResource,
    status_code=status.HTTP_201_CREATED,
    responses=api_errors(400, 403, 409, 413, 415, 422, 507),
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/octet-stream": {
                    "schema": {"type": "string", "format": "binary"}
                }
            },
        }
    },
)
async def upload_file(
    request: Request,
    response: Response,
    principal: CurrentSessionSecurityDep,
    path: Annotated[str, Query(min_length=1)],
    file_store: UserFileStoreDep,
) -> FileResource:
    """Admit and stream one raw body before any framework multipart spooling."""

    if (
        request.headers.get("content-type", "").split(";", 1)[0].strip().casefold()
        != "application/octet-stream"
    ):
        raise UnsupportedMediaTypeError("File uploads require application/octet-stream")
    stored = await file_store.upload(
        principal.user.id,
        path,
        RequestByteStream(request),
    )
    resource = FileResource.model_validate(stored)
    response.headers["Location"] = route_path_with_query(
        request,
        "get_user_file_resource",
        path=resource.path,
    )
    return resource


@router.post(
    "/archives",
    response_model=FileArchiveResource,
    status_code=status.HTTP_201_CREATED,
    responses=api_errors(400, 403, 404, 413, 422),
)
async def prepare_file_archive(
    request: FileArchiveRequest,
    principal: CurrentSessionSecurityDep,
    file_store: UserFileStoreDep,
) -> FileArchiveResource:
    """Register a selection for one ZIP download; fetch it with the returned id."""

    return FileArchiveResource.model_validate(
        await file_store.prepare_archive(principal.user.id, request.paths)
    )


@router.get(
    "/archives/{archive_id}",
    response_class=FileResponse,
    responses={
        **api_errors(403, 404, 413, 422, 507),
        200: {
            "description": "The selection as one ZIP, folder structure kept.",
            "content": {
                "application/zip": {"schema": {"type": "string", "format": "binary"}}
            },
        },
    },
)
async def download_file_archive(
    archive_id: str,
    principal: CurrentSessionSecurityDep,
    file_store: UserFileStoreDep,
) -> FileResponse:
    """Build and stream a registered selection's ZIP (single use)."""

    snapshot, filename = await file_store.archive_snapshot(
        principal.user.id, archive_id
    )
    return FileResponse(
        snapshot.path,
        media_type="application/zip",
        filename=filename,
        background=BackgroundTask(snapshot.cleanup),
    )


@router.post(
    "/batch-delete",
    response_model=BatchDeleteFilesResource,
    responses=api_errors(400, 403, 422),
)
async def delete_files(
    request: BatchDeleteFilesRequest,
    principal: CurrentSessionSecurityDep,
    file_store: UserFileStoreDep,
) -> BatchDeleteFilesResource:
    """Delete several files and folders in one request."""

    deleted = await file_store.delete_many(principal.user.id, request.paths)
    return BatchDeleteFilesResource(deleted=deleted)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=api_errors(400, 403, 404, 422),
)
async def delete_file(
    principal: CurrentSessionSecurityDep,
    file_store: UserFileStoreDep,
    path: str = Query(..., description="Path relative to the user's data directory"),
) -> Response:
    """Delete one file/directory and return an empty body."""

    await file_store.delete(principal.user.id, path)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
