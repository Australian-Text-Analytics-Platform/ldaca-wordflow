"""Current-user tool cache sizes and manual clearing (issue 334)."""

from __future__ import annotations

from anyio.to_thread import run_sync as run_sync_in_worker_thread
from fastapi import APIRouter, Request, Response

from ..infrastructure.storage.layout import user_cache_root
from ..models.tool_caches import (
    ToolCacheClearedResource,
    ToolCacheResource,
    ToolCachesResource,
)
from ..runtime import get_runtime
from ..services.tool_caches import (
    TOOL_CACHE_FILENAMES,
    ToolCacheKind,
    clear_tool_cache,
    tool_cache_size,
)
from .responses import api_errors
from .security import CurrentSessionSecurityDep

router = APIRouter(
    tags=["tool-caches"],
    responses=api_errors(401),
)


@router.get("/tool-caches", response_model=ToolCachesResource)
async def list_tool_caches(
    request: Request,
    response: Response,
    principal: CurrentSessionSecurityDep,
) -> ToolCachesResource:
    """Return the size of each of the current user's tool caches."""

    response.headers["Cache-Control"] = "no-store"
    cache_root = user_cache_root(get_runtime(request).settings, principal.user.id)

    def sizes() -> list[ToolCacheResource]:
        return [
            ToolCacheResource(kind=kind, size_bytes=tool_cache_size(cache_root, kind))
            for kind in TOOL_CACHE_FILENAMES
        ]

    return ToolCachesResource(caches=await run_sync_in_worker_thread(sizes))


@router.delete(
    "/tool-caches/{kind}",
    response_model=ToolCacheClearedResource,
    responses=api_errors(409, 422),
)
async def clear_user_tool_cache(
    kind: ToolCacheKind,
    request: Request,
    principal: CurrentSessionSecurityDep,
) -> ToolCacheClearedResource:
    """Delete one of the current user's tool caches; 409 while an analysis uses it."""

    cache_root = user_cache_root(get_runtime(request).settings, principal.user.id)
    freed = await run_sync_in_worker_thread(clear_tool_cache, cache_root, kind)
    return ToolCacheClearedResource(kind=kind, freed_bytes=freed)


__all__ = ["router"]
