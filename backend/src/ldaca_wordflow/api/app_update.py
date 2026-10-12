"""Whether a newer Wordflow exists, for the page's new-version notice (issue 386)."""

from __future__ import annotations

import time
from importlib.metadata import version

from fastapi import APIRouter, Request, Response

from ..models.app_update import AppUpdateResource
from ..runtime import get_runtime
from ..services.app_update import deployment_kind, is_newer, latest_version
from .responses import api_errors
from .security import CurrentSessionSecurityDep

router = APIRouter(tags=["app-update"], responses=api_errors(401))

# Binder and pip ask once per start (then at most once a day), so GitHub's
# count of each update file reads as starts, not page reloads. A server asks
# on every page load, which is close to a count of sign-ins.
_REUSE_SECONDS = 24 * 60 * 60


async def _latest(request: Request, url: str, kind: str) -> str | None:
    if kind == "server":
        return await latest_version(url)
    checked = getattr(request.app.state, "app_update_checked", None)
    now = time.monotonic()
    if checked is not None and checked[0] == url and now - checked[1] < _REUSE_SECONDS:
        return checked[2]
    latest = await latest_version(url)
    request.app.state.app_update_checked = (url, now, latest)
    return latest


@router.get("/app-update", response_model=AppUpdateResource)
async def get_app_update(
    request: Request,
    response: Response,
    _principal: CurrentSessionSecurityDep,
) -> AppUpdateResource:
    """Ask the Latest GitHub release for the newest version.

    The desktop app checks by itself, so its backend does not ask; neither
    does a backend with the check turned off. The page shows a notice when a
    newer version exists.
    """

    response.headers["Cache-Control"] = "no-store"
    settings = get_runtime(request).settings
    kind = deployment_kind(settings)
    current = version("ldaca-wordflow")
    latest = None
    if settings.update_check_enabled and kind != "desktop":
        latest = await _latest(request, settings.update_check_url.format(kind=kind), kind)
    return AppUpdateResource(
        deployment=kind,
        current_version=current,
        latest_version=latest,
        update_available=latest is not None and is_newer(latest, current),
    )
