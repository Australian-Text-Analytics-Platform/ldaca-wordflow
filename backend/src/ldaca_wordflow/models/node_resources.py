"""Canonical Data Block creation, edit, metadata, and row-query resources."""

from __future__ import annotations

import uuid
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from ..domain.workspace.provenance import (
    CastDerivation,
    CloneDerivation,
    ConcatDerivation,
    ExpressionDerivation,
    FilterDerivation,
    JoinDerivation,
    ReplaceDerivation,
    SliceDerivation,
)
from .names import NodeName


class _StrictRequest(BaseModel):
    """Reject misspelled or obsolete fields at the public API boundary."""

    model_config = ConfigDict(extra="forbid")


class DataBlockExportFormat(StrEnum):
    """Portable file formats supported by Data Block export."""

    CSV = "csv"
    JSON = "json"
    NDJSON = "ndjson"
    PARQUET = "parquet"
    IPC = "ipc"


class DataBlockExportRequest(_StrictRequest):
    """Export one or more ordered Data Blocks in one shared format."""

    node_ids: list[uuid.UUID] = Field(min_length=1)
    format: DataBlockExportFormat = DataBlockExportFormat.CSV

    @model_validator(mode="after")
    def validate_node_ids(self) -> DataBlockExportRequest:
        if len(self.node_ids) != len(set(self.node_ids)):
            raise ValueError("Data Block export IDs must be unique")
        return self


class FileNodeCreateRequest(_StrictRequest):
    """Create one source node from a safe user-file path."""

    kind: Literal["file"] = "file"
    file_path: str = Field(min_length=1)
    sheet_name: str | None = None
    name: NodeName | None = None
    # A table file inside the ZIP at ``file_path``, loaded as its own Data Block.
    zip_member: str | None = Field(default=None, min_length=1, max_length=4_000)


class CloneNodeCreateRequest(CloneDerivation):
    """Create an independent lazy-plan child from one source node."""

    source_node_id: uuid.UUID
    name: NodeName | None = None


class SliceNodeCreateRequest(SliceDerivation):
    """Create a slice, random sample, or shuffled child node."""

    source_node_id: uuid.UUID
    name: NodeName | None = None


class FilterNodeCreateRequest(FilterDerivation):
    """Create a child node whose rows satisfy typed filter predicates."""

    source_node_id: uuid.UUID
    name: NodeName | None = None


class ReplaceNodeCreateRequest(ReplaceDerivation):
    """Create a child with one regex-replaced or extracted text column."""

    source_node_id: uuid.UUID
    name: NodeName | None = None


class ExpressionNodeCreateRequest(ExpressionDerivation):
    """Create a child from a typed expression tree compiled by the server."""

    source_node_id: uuid.UUID
    name: NodeName | None = None


class ConcatNodeCreateRequest(ConcatDerivation):
    """Create a vertically concatenated child from schema-compatible nodes."""

    source_node_ids: list[uuid.UUID] = Field(min_length=2)
    name: NodeName | None = None


class JoinNodeCreateRequest(JoinDerivation):
    """Create a relational join child from two source nodes."""

    left_node_id: uuid.UUID
    right_node_id: uuid.UUID
    name: NodeName | None = None


NodeCreateRequest = Annotated[
    FileNodeCreateRequest
    | CloneNodeCreateRequest
    | SliceNodeCreateRequest
    | FilterNodeCreateRequest
    | ReplaceNodeCreateRequest
    | ExpressionNodeCreateRequest
    | ConcatNodeCreateRequest
    | JoinNodeCreateRequest,
    Field(discriminator="kind"),
]

NodeDerivationRequest = Annotated[
    CloneNodeCreateRequest
    | SliceNodeCreateRequest
    | FilterNodeCreateRequest
    | ReplaceNodeCreateRequest
    | ExpressionNodeCreateRequest
    | ConcatNodeCreateRequest
    | JoinNodeCreateRequest,
    Field(discriminator="kind"),
]


class CastNodeEditRequest(CastDerivation):
    """Cast one column on the target Data Block."""


class RenameColumnNodeEditRequest(_StrictRequest):
    """Rename one column on the target Data Block."""

    kind: Literal["rename_column"] = "rename_column"
    column: str = Field(min_length=1, max_length=200)
    new_name: str = Field(min_length=1, max_length=200)


class DeleteColumnNodeEditRequest(_StrictRequest):
    """Delete one column from the target Data Block."""

    kind: Literal["delete_column"] = "delete_column"
    column: str = Field(min_length=1, max_length=200)


class DeleteColumnsNodeEditRequest(_StrictRequest):
    """Delete several columns in one edit, so one Undo restores them (issue 141)."""

    kind: Literal["delete_columns"] = "delete_columns"
    columns: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(
        min_length=1, max_length=10_000
    )

    @model_validator(mode="after")
    def validate_unique(self) -> DeleteColumnsNodeEditRequest:
        if len(set(self.columns)) != len(self.columns):
            raise ValueError("Columns to delete must be unique")
        return self


class DuplicateColumnNodeEditRequest(_StrictRequest):
    """Copy one column; the copy sits right of it as ``<name> copy`` (issue 143)."""

    kind: Literal["duplicate_column"] = "duplicate_column"
    column: str = Field(min_length=1, max_length=200)


CleanTextOperation = Literal[
    "trim",
    "collapse_whitespace",
    "lowercase",
    "uppercase",
    "title_case",
    "remove_punctuation",
    "remove_digits",
    "remove_urls",
    "remove_html_tags",
]


class CleanTextNodeEditRequest(_StrictRequest):
    """Clean one text column in place, or into a new column right of it."""

    kind: Literal["clean_text"] = "clean_text"
    column: str = Field(min_length=1, max_length=200)
    operation: CleanTextOperation
    output_column: str | None = Field(default=None, min_length=1, max_length=200)


class SplitColumnNodeEditRequest(_StrictRequest):
    """Split one text column on a delimiter into ``parts`` new columns.

    The new columns (``<name>_1`` ... ``<name>_n``) sit right of the source;
    the last holds any remainder, and missing parts are empty (null).
    """

    kind: Literal["split_column"] = "split_column"
    column: str = Field(min_length=1, max_length=200)
    delimiter: str = Field(min_length=1, max_length=100)
    parts: int = Field(ge=2, le=50)


class CombineTextPart(_StrictRequest):
    """Literal text inside a Combine columns template."""

    kind: Literal["text"] = "text"
    text: str = Field(min_length=1, max_length=1_000)


class CombineColumnPart(_StrictRequest):
    """A column reference inside a Combine columns template."""

    kind: Literal["column"] = "column"
    column: str = Field(min_length=1, max_length=200)


CombinePart = Annotated[
    CombineTextPart | CombineColumnPart, Field(discriminator="kind")
]


class CombineColumnsNodeEditRequest(_StrictRequest):
    """Build a new text column from a template of columns and text (issue 143).

    Columns of any type are converted to text. ``empty_values`` decides what a
    missing value does: ``blank`` treats it as empty text, ``empty_result``
    leaves the whole combined value empty (null).
    """

    kind: Literal["combine_columns"] = "combine_columns"
    parts: list[CombinePart] = Field(min_length=1, max_length=200)
    output_column: str = Field(min_length=1, max_length=200)
    empty_values: Literal["blank", "empty_result"] = "blank"

    @model_validator(mode="after")
    def validate_parts(self) -> CombineColumnsNodeEditRequest:
        if not any(isinstance(part, CombineColumnPart) for part in self.parts):
            raise ValueError("Combine columns needs at least one column")
        return self


class ReplaceNodeEditRequest(ReplaceDerivation):
    """Replace or extract text on the target Data Block."""


class ExpressionNodeEditRequest(ExpressionDerivation):
    """Add or change columns on the target Data Block with a typed expression.

    Data Block Edits never change the number or order of rows, so in-place
    expressions are limited to ``with_columns``. Filtering, sorting, selecting
    and grouping create a derived Data Block instead.
    """

    context: Literal["with_columns"]


NonEmptyColumnName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
]


class SetCellNodeEditRequest(_StrictRequest):
    """Replace one string cell at an absolute Data Block row index."""

    kind: Literal["set_cell"] = "set_cell"
    column: NonEmptyColumnName
    row_index: int = Field(ge=0)
    value: str | None = None


class AnnotationClassRow(_StrictRequest):
    """One validated manual Annotation class-description row."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    class_name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ] = Field(alias="class")
    description: str = Field(default="", max_length=2_000)


class AnnotationClassesNodeEditRequest(_StrictRequest):
    """Replace class-description rows while preserving other columns."""

    kind: Literal["annotation_classes"] = "annotation_classes"
    class_column: NonEmptyColumnName
    description_column: NonEmptyColumnName
    rows: list[AnnotationClassRow] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_columns_and_rows(self) -> AnnotationClassesNodeEditRequest:
        if self.class_column == self.description_column:
            raise ValueError("Class and description columns must be different")
        normalized = [row.class_name.casefold() for row in self.rows]
        if len(normalized) != len(set(normalized)):
            raise ValueError("Annotation class names must be unique")
        return self


NodeEditRequest = Annotated[
    CastNodeEditRequest
    | RenameColumnNodeEditRequest
    | DeleteColumnNodeEditRequest
    | DeleteColumnsNodeEditRequest
    | DuplicateColumnNodeEditRequest
    | CleanTextNodeEditRequest
    | SplitColumnNodeEditRequest
    | CombineColumnsNodeEditRequest
    | ReplaceNodeEditRequest
    | ExpressionNodeEditRequest
    | SetCellNodeEditRequest
    | AnnotationClassesNodeEditRequest,
    Field(discriminator="kind"),
]


class NodeUpdateRequest(_StrictRequest):
    """Partial public metadata update for one existing node."""

    name: NodeName | None = None
    document: str | None = None
    color: str | None = None
    tokenizer_model: str | None = Field(default=None, max_length=500)

    @field_validator("tokenizer_model", mode="before")
    @classmethod
    def normalize_tokenizer_model(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return value.strip() or None

    @model_validator(mode="after")
    def validate_patch(self) -> NodeUpdateRequest:
        if not self.model_fields_set:
            raise ValueError("Node patch must contain at least one field")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Node name cannot be null")
        return self
