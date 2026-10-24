"""Strict resources for the server notice (issue 438)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ServerNoticeContent(BaseModel):
    """The notice's Markdown text and an id that changes with the text."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    text: str


class ServerNoticeResource(BaseModel):
    """The operator's notice to everyone signed in, and whether this person acknowledged it."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    notice: ServerNoticeContent | None
    acknowledged: bool
