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


_VERSION = re.compile(
    r"v?(\d+(?:\.\d+)*)(?:[-.]?(a|alpha|b|beta|c|rc|pre|preview)[-.]?(\d*))?",
    re.IGNORECASE,
)
# A prerelease sorts below its final release (issue 410):
# 0.7.14 < 0.7.15-pre (0.7.15rc0) < 0.7.15.
_STAGES = {"a": 0, "alpha": 0, "b": 1, "beta": 1, "c": 2, "rc": 2, "pre": 2, "preview": 2}
_FINAL = 3


def _parts(version: str) -> tuple[tuple[int, ...], int, int] | None:
    match = _VERSION.fullmatch(version.strip())
    if match is None:
        return None
    numbers = tuple(int(part) for part in match.group(1).split("."))
    if match.group(2) is None:
        return numbers, _FINAL, 0
    return numbers, _STAGES[match.group(2).lower()], int(match.group(3) or 0)


def version_key(version: str) -> tuple[int, ...] | None:
    """The release numbers of an x.y.z version, also for a prerelease such as
    0.7.15-pre or 0.7.15rc0; None for anything else."""

    parts = _parts(version)
    return parts[0] if parts else None


def is_newer(latest: str, current: str) -> bool:
    latest_parts, current_parts = _parts(latest), _parts(current)
    if latest_parts is None or current_parts is None:
        return False
    # Pad so 0.8 and 0.8.0 compare equal.
    width = max(len(latest_parts[0]), len(current_parts[0]))

    def key(parts: tuple[tuple[int, ...], int, int]) -> tuple[tuple[int, ...], int, int]:
        numbers, stage, number = parts
        return numbers + (0,) * (width - len(numbers)), stage, number

    return key(latest_parts) > key(current_parts)


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
