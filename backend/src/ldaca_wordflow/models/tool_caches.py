"""Strict resources for the per-user tool caches shown in Settings."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..services.tool_caches import ToolCacheKind


class _ToolCacheModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ToolCacheResource(_ToolCacheModel):
    """One tool cache and the bytes it uses on disk."""

    kind: ToolCacheKind
    size_bytes: int = Field(ge=0)


class ToolCachesResource(_ToolCacheModel):
    """Every tool cache of the current user."""

    caches: list[ToolCacheResource]


class ToolCacheClearedResource(_ToolCacheModel):
    """The result of clearing one tool cache."""

    kind: ToolCacheKind
    freed_bytes: int = Field(ge=0)


__all__ = ["ToolCacheClearedResource", "ToolCacheResource", "ToolCachesResource"]
