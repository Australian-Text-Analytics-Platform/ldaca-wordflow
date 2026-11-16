"""Strict contracts for Annotation provider discovery."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    StringConstraints,
)

from ..domain.annotation import (
    TASK_CONTEXT_MAX_CHARS,
    AnnotationProvider,
    AnnotationProviderSnapshot,
)

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class AnnotationModelsRequest(AnnotationProviderSnapshot):
    """Optional request-only credential for provider model discovery."""

    api_key: SecretStr | None = Field(
        default=None,
        min_length=1,
        max_length=4_000,
        json_schema_extra={"writeOnly": True},
    )


class AnnotationModelsResource(AnnotationProviderSnapshot):
    """Sorted model identifiers returned by one configured provider."""

    models: list[str]
    # One plain-text line (at most 200 characters) for the models the provider
    # describes, keyed by model id (issue 407). Models without one are absent.
    model_descriptions: dict[str, str] = Field(default_factory=dict)


CodebookDesignerEffort = Literal["none", "low", "medium", "high"]


class CodebookDraftRequest(AnnotationProviderSnapshot):
    """One AI Code Designer request (Chao, 15 Nov 2026).

    The sample is drawn from the Data Block in the route and ``text_column``.
    ``system_prompt`` is the designer prompt shown under Advanced; its default
    lives in the frontend, like the annotation prompt. The answer format is
    appended on the server.
    """

    api_key: SecretStr | None = Field(
        default=None,
        min_length=1,
        max_length=4_000,
        json_schema_extra={"writeOnly": True},
    )
    model: NonEmptyText = Field(max_length=500)
    text_column: NonEmptyText = Field(max_length=500)
    # About 250 words; the frontend counts words, this bounds the characters.
    brief: NonEmptyText = Field(max_length=4_000)
    task_context: str = Field(default="", max_length=TASK_CONTEXT_MAX_CHARS)
    max_classes: int = Field(default=3, ge=2, le=10)
    # Design an ordered scale (levels from the lowest to the highest, then
    # Not applicable) instead of categories; max_classes is then the most levels.
    scale: bool = False
    sample_size: int = Field(default=100, ge=20, le=300)
    sample_seed: int = Field(default=0, ge=0, le=2**31 - 1)
    reasoning_effort: CodebookDesignerEffort = "high"
    system_prompt: NonEmptyText = Field(max_length=20_000)


class CodebookDraftCode(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    definition: str
    # On a scale, a code that is not a level (Not applicable).
    outside_scale: bool = False


class CodebookDraftStageEvent(BaseModel):
    """Progress: sampling, waiting for the model, or reading its answer."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: Literal["stage"] = "stage"
    stage: Literal["sampling", "waiting", "reading"]
    sampled: int | None = None
    available: int | None = None


class CodebookDraftResultEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: Literal["draft"] = "draft"
    codes: list[CodebookDraftCode]
    sampled: int
    model: str


class CodebookDraftErrorEvent(BaseModel):
    """A plain sentence for people; the provider's own text under Details."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: Literal["error"] = "error"
    message: str
    detail: str | None = None


CodebookDraftEvent = Annotated[
    CodebookDraftStageEvent | CodebookDraftResultEvent | CodebookDraftErrorEvent,
    Field(discriminator="type"),
]


__all__ = [
    "CodebookDesignerEffort",
    "CodebookDraftCode",
    "CodebookDraftErrorEvent",
    "CodebookDraftEvent",
    "CodebookDraftRequest",
    "CodebookDraftResultEvent",
    "CodebookDraftStageEvent",
    "AnnotationModelsRequest",
    "AnnotationModelsResource",
    "AnnotationProvider",
]
