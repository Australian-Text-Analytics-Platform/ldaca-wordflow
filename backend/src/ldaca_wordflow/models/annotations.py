"""Strict contracts for Annotation provider discovery."""

from __future__ import annotations

from typing import Annotated

from pydantic import (
    Field,
    SecretStr,
    StringConstraints,
)

from ..domain.annotation import AnnotationProvider, AnnotationProviderSnapshot

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


__all__ = [
    "AnnotationModelsRequest",
    "AnnotationModelsResource",
    "AnnotationProvider",
]
