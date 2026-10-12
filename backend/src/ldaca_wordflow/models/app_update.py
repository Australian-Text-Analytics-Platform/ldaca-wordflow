"""Strict resource for the new-version notice (issue 386)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from ..services.app_update import DeploymentKind


class AppUpdateResource(BaseModel):
    """This Wordflow's version and the newest release, when it could be read."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    deployment: DeploymentKind
    current_version: str
    latest_version: str | None
    update_available: bool
