"""Shared strict lifecycle values for durable background resources."""

from __future__ import annotations

import unicodedata
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)


def _safe_text(value: str) -> str:
    if any(unicodedata.category(character) == "Cc" for character in value):
        raise ValueError("Public text cannot contain control characters")
    return value


SafePublicText = Annotated[
    str,
    StringConstraints(min_length=1, max_length=500),
    AfterValidator(_safe_text),
]

DiagnosticText = Annotated[str, StringConstraints(min_length=1)]


class BackgroundState(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProgressDetail(BaseModel):
    """Step-by-step progress of a slow run, for the Tasks panel (issue 350).

    ``step_label`` names the current step in plain words for the analysis
    page; ``done``/``total``/``unit`` count it when it can be counted, and
    ``eta_seconds`` comes from the rate measured on this computer.
    ``processors_busy`` (CPU time per second of the worker process, all its
    threads) shows the run is working; ``stalled_seconds`` is how long the
    counts have not moved.
    """

    model_config = ConfigDict(extra="forbid", strict=True)

    step: int = Field(ge=1)
    steps: int = Field(ge=1)
    step_label: SafePublicText
    done: int | None = Field(default=None, ge=0)
    total: int | None = Field(default=None, ge=0)
    unit: Annotated[str, StringConstraints(min_length=1, max_length=40)] | None = None
    eta_seconds: int | None = Field(default=None, ge=0)
    processors_busy: float | None = Field(default=None, ge=0.0, allow_inf_nan=False)
    processors: int | None = Field(default=None, ge=1)
    stalled_seconds: int | None = Field(default=None, ge=0)
    # What an idle run is waiting for, when it is not this computer's work:
    # an AI provider answering Annotation batches (issue 370). Left out when
    # unset, like older records.
    waiting_for: Literal["ai_provider"] | None = Field(
        default=None, exclude_if=lambda value: value is None
    )


class Progress(BaseModel):
    """Exact live and durable progress value shared by background resources."""

    model_config = ConfigDict(extra="forbid", strict=True)

    fraction: float | None = Field(ge=0.0, le=1.0, allow_inf_nan=False)
    message: SafePublicText | None
    detail: ProgressDetail | None = None


class Failure(BaseModel):
    """Durable terminal failure: a message for users and, when the failure
    was not written for them, the backend diagnostic for Details (issue 205).
    """

    model_config = ConfigDict(extra="forbid", strict=True)

    code: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=100)
    message: DiagnosticText
    diagnostic: DiagnosticText | None = None


__all__ = ["BackgroundState", "DiagnosticText", "Failure", "Progress", "ProgressDetail"]
