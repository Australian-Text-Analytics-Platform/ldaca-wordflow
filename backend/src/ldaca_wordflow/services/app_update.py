"""Whether a newer Wordflow exists, for Binder, pip and server (issue 386).

The page cannot ask GitHub itself (release files send no CORS headers), so
the backend fetches the Latest release's update file for its kind of
deployment. GitHub counts each file's downloads, which is how often each
kind of Wordflow starts; nothing else is sent or kept.
"""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from typing import Literal

import httpx

from ..settings import Settings

DeploymentKind = Literal["binder", "server", "pip", "desktop"]

UPDATE_CHECK_TIMEOUT_SECONDS = 5.0
# Variables BinderHub sets in every user pod.
_BINDER_VARIABLES = ("BINDER_LAUNCH_HOST", "BINDER_REPO_URL", "BINDER_REF_URL", "BINDER_REQUEST")
# Set by the desktop shell for its backend.
_DESKTOP_VARIABLE = "LDACA_PARENT_PID"


def deployment_kind(
    settings: Settings, environ: Mapping[str, str] = os.environ
) -> DeploymentKind:
    """How this Wordflow runs: as set, else detected."""

    if settings.deployment_kind is not None:
        return settings.deployment_kind
    if any(environ.get(name) for name in _BINDER_VARIABLES):
        return "binder"
    if environ.get(_DESKTOP_VARIABLE):
        return "desktop"
    if settings.multi_user:
        return "server"
    return "pip"


def version_key(version: str) -> tuple[int, ...] | None:
    """The numbers of an x.y.z version, or None for anything else."""

    match = re.fullmatch(r"v?(\d+(?:\.\d+)*)", version.strip())
    return tuple(int(part) for part in match.group(1).split(".")) if match else None


def is_newer(latest: str, current: str) -> bool:
    latest_key, current_key = version_key(latest), version_key(current)
    return latest_key is not None and current_key is not None and latest_key > current_key


async def latest_version(url: str) -> str | None:
    """The version in one update file, or None when it can't be read."""

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=UPDATE_CHECK_TIMEOUT_SECONDS
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
            version = response.json().get("version")
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    return version if isinstance(version, str) and version_key(version) else None


__all__ = ["DeploymentKind", "deployment_kind", "is_newer", "latest_version", "version_key"]
