"""The operator's notice to everyone signed in to a server (issue 438)."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from ..models.server_notice import ServerNoticeContent, ServerNoticeResource
from ..runtime import get_runtime
from ..services.server_notice import (
    ServerNotice,
    acknowledge_notice,
    archive_notice,
    is_acknowledged,
    read_server_notice,
)
from ..shared.errors import ServerNoticeChangedError
from .responses import api_errors
from .security import CurrentSessionSecurityDep

router = APIRouter(tags=["server-notice"], responses=api_errors(401))


def _current_notice(request: Request) -> ServerNotice | None:
    """The notice, on a multi-user server only: single-user Wordflow shows none."""

    settings = get_runtime(request).settings
    if not settings.multi_user:
        return None
    return read_server_notice(settings.server_notice_file)


def _resource(request: Request, email: str, *, archive: bool) -> ServerNoticeResource:
    settings = get_runtime(request).settings
    notice = _current_notice(request)
    if notice is None:
        return ServerNoticeResource(notice=None, acknowledged=False)
    data_root = settings.get_data_root()
    if archive:
        archive_notice(data_root, notice)
    return ServerNoticeResource(
        notice=ServerNoticeContent(id=notice.id, text=notice.text),
        acknowledged=is_acknowledged(data_root, notice.id, email),
    )


@router.get("/server-notice", response_model=ServerNoticeResource)
async def get_server_notice(
    request: Request,
    response: Response,
    principal: CurrentSessionSecurityDep,
) -> ServerNoticeResource:
    """Return the notice in ``SERVER_NOTICE_FILE`` and whether this person acknowledged it."""

    response.headers["Cache-Control"] = "no-store"
    return _resource(request, principal.user.email, archive=True)


@router.post(
    "/server-notice/{notice_id}/acknowledgement",
    response_model=ServerNoticeResource,
    responses=api_errors(409, 422),
)
async def acknowledge_server_notice(
    notice_id: str,
    request: Request,
    principal: CurrentSessionSecurityDep,
) -> ServerNoticeResource:
    """Record this person's Got it (name, email, time) for the current notice."""

    notice = _current_notice(request)
    if notice is None or notice.id != notice_id:
        raise ServerNoticeChangedError()
    acknowledge_notice(
        get_runtime(request).settings.get_data_root(),
        notice,
        email=principal.user.email,
        name=principal.user.name or "",
    )
    return _resource(request, principal.user.email, archive=False)
