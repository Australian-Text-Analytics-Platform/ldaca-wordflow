"""Strict, composable provenance for Workspace Data Blocks."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

from ...shared.json_data import JsonData
from ..annotation import AnnotationProvider


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


type FilterScalar = str | int | float | bool | None
type FilterValue = FilterScalar | list[FilterScalar] | dict[str, JsonData]


class FilterCondition(_StrictModel):
    """One typed predicate used by a filter derivation."""

    column: str = Field(min_length=1)
    operator: Literal[
        "eq",
        "ne",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "contains",
        "starts_with",
        "ends_with",
        "is_null",
        "is_not_null",
        "between",
    ]
    value: FilterValue = None
    negate: bool = False
    regex: bool = False
    case_sensitive: bool = False


class ColumnExpression(_StrictModel):
    op: Literal["column"]
    name: str = Field(min_length=1, max_length=200)


class LiteralExpression(_StrictModel):
    op: Literal["literal"]
    value: FilterScalar | list[FilterScalar]


class BinaryExpression(_StrictModel):
    op: Literal[
        "add",
        "subtract",
        "multiply",
        "divide",
        "modulo",
        "eq",
        "ne",
        "gt",
        "gte",
        "lt",
        "lte",
        "and",
        "or",
        "is_in",
        "fill_null",
    ]
    left: ExpressionSpec
    right: ExpressionSpec

    @model_validator(mode="after")
    def validate_membership_values(self) -> BinaryExpression:
        if self.op == "is_in" and not (
            isinstance(self.right, LiteralExpression)
            and isinstance(self.right.value, list)
        ):
            raise ValueError("is_in requires a literal list on the right")
        return self


class UnaryExpression(_StrictModel):
    op: Literal[
        "not",
        "is_null",
        "is_not_null",
        "abs",
        "lowercase",
        "uppercase",
        "year",
        "month",
        "day",
        "sum",
        "mean",
        "min",
        "max",
        "count",
        "n_unique",
    ]
    operand: ExpressionSpec


class StringExpression(_StrictModel):
    op: Literal["contains", "starts_with", "ends_with"]
    operand: ExpressionSpec
    value: str
    literal: bool = True


class CastExpression(_StrictModel):
    op: Literal["cast"]
    operand: ExpressionSpec
    dtype: Literal["string", "integer", "float", "boolean", "datetime", "date"]
    strict: bool = False


class RoundExpression(_StrictModel):
    op: Literal["round"]
    operand: ExpressionSpec
    decimals: int = Field(default=0, ge=0, le=15)


class ConcatStringExpression(_StrictModel):
    op: Literal["concat_string"]
    operands: list[ExpressionSpec] = Field(min_length=2, max_length=100)
    separator: str = Field(default="", max_length=100)


ExpressionSpec = Annotated[
    ColumnExpression
    | LiteralExpression
    | BinaryExpression
    | UnaryExpression
    | StringExpression
    | CastExpression
    | RoundExpression
    | ConcatStringExpression,
    Field(discriminator="op"),
]

for _expression_model in (
    BinaryExpression,
    UnaryExpression,
    StringExpression,
    CastExpression,
    RoundExpression,
    ConcatStringExpression,
):
    _expression_model.model_rebuild()


class ExpressionItem(_StrictModel):
    expression: ExpressionSpec
    alias: str | None = Field(default=None, min_length=1, max_length=200)
    descending: bool = False


class CloneDerivation(_StrictModel):
    kind: Literal["clone"] = "clone"


class SliceDerivation(_StrictModel):
    kind: Literal["slice"] = "slice"
    mode: Literal["slice", "random_sample", "shuffle"] = "slice"
    offset: int = Field(default=0, ge=0)
    length: int | None = Field(default=None, ge=0)
    sample_size: float | None = Field(default=None, gt=0)
    random_seed: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_sampling(self) -> SliceDerivation:
        if self.mode == "random_sample":
            if self.sample_size is None:
                raise ValueError("sample_size is required for random_sample")
            if self.sample_size >= 1 and not self.sample_size.is_integer():
                raise ValueError("sample_size values greater than one must be integers")
        return self


class FilterDerivation(_StrictModel):
    kind: Literal["filter"] = "filter"
    conditions: list[FilterCondition] = Field(min_length=1)
    logic: Literal["and", "or"] = "and"


class ReplaceDerivation(_StrictModel):
    kind: Literal["replace"] = "replace"
    source_column: str = Field(min_length=1, max_length=200)
    pattern: str = Field(min_length=1)
    replacement: str = ""
    output_column: str | None = Field(default=None, max_length=200)
    mode: Literal["replace", "extract"] = "replace"
    count: Literal["all", "first"] = "all"
    match_limit: int | None = Field(default=None, ge=1)
    connector: str = " "
    # Plain-text matching (issue 145): the pattern and replacement are taken
    # as written. Older saved plans have no flag and stay regular expressions.
    literal: bool = False


class ExpressionDerivation(_StrictModel):
    kind: Literal["expression"] = "expression"
    context: Literal["filter", "with_columns", "select", "sort", "group_by_agg"]
    expressions: list[ExpressionItem] = Field(min_length=1)
    group_by: list[ExpressionItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_context(self) -> ExpressionDerivation:
        if self.context == "filter" and len(self.expressions) != 1:
            raise ValueError("filter expressions require exactly one item")
        if self.context == "group_by_agg" and not self.group_by:
            raise ValueError("group_by_agg requires at least one group_by expression")
        return self


class ConcatDerivation(_StrictModel):
    kind: Literal["concat"] = "concat"
    deduplicate: bool = False


class JoinDerivation(_StrictModel):
    kind: Literal["join"] = "join"
    left_on: str | None = None
    right_on: str | None = None
    how: Literal["inner", "left", "right", "full", "semi", "anti", "cross"] = "inner"

    @model_validator(mode="after")
    def validate_keys(self) -> JoinDerivation:
        if self.how != "cross" and (not self.left_on or not self.right_on):
            raise ValueError("left_on and right_on are required for non-cross joins")
        return self


class CastDerivation(_StrictModel):
    kind: Literal["cast"] = "cast"
    column: str = Field(min_length=1)
    target_type: Literal["string", "integer", "float", "datetime", "categorical"]
    datetime_format: str | None = None
    strict: bool = False


class SegmentDerivation(_StrictModel):
    """One row per sentence, paragraph, line, or pattern-led segment (issue 148)."""

    kind: Literal["segment"] = "segment"
    column: str = Field(min_length=1, max_length=200)
    unit: Literal["sentence", "paragraph", "line", "pattern"]
    # A regular expression marking where each segment starts; "^" is a line start.
    pattern: str | None = Field(default=None, min_length=1, max_length=1_000)
    # The matched lead goes into its own column, or is dropped like a delimiter.
    lead: Literal["column", "drop"] = "column"
    lead_column: str | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_pattern(self) -> SegmentDerivation:
        if self.unit == "pattern":
            if not self.pattern:
                raise ValueError("Segmenting by pattern needs a pattern")
            if self.lead == "column" and not self.lead_column:
                raise ValueError("Name the column for the matched text")
        return self


GroupSummaryKind = Literal[
    "join_text",
    "count_distinct",
    "distinct_values",
    "first",
    "last",
    "sum",
    "mean",
    "min",
    "max",
    "earliest",
    "latest",
    "earliest_latest",
]


class ColumnSummary(_StrictModel):
    column: str = Field(min_length=1, max_length=200)
    summary: GroupSummaryKind
    separator: str = Field(default="\n\n", max_length=100)


class GroupSummaryDerivation(_StrictModel):
    """One row per group with a rows count and per-column summaries (issue 150)."""

    kind: Literal["group_summary"] = "group_summary"
    group_by: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(
        min_length=1, max_length=10
    )
    summaries: list[ColumnSummary] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_columns(self) -> GroupSummaryDerivation:
        if len(set(self.group_by)) != len(self.group_by):
            raise ValueError("Group columns must be unique")
        summarised = [item.column for item in self.summaries]
        if len(set(summarised)) != len(summarised):
            raise ValueError("Summarise each column once")
        if set(summarised) & set(self.group_by):
            raise ValueError("Group columns cannot also be summarised")
        return self


class DeduplicateDerivation(_StrictModel):
    """Rows without duplicates, or the duplicate groups themselves (issue 151)."""

    kind: Literal["deduplicate"] = "deduplicate"
    # Columns to compare; empty compares every column.
    columns: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(
        default_factory=list, max_length=200
    )
    # Compared after lowercasing and removing punctuation and extra spaces.
    near_text_column: str | None = Field(default=None, min_length=1, max_length=200)
    ignore_links_mentions: bool = False
    output: Literal["kept", "duplicates"] = "kept"

    @model_validator(mode="after")
    def validate_columns(self) -> DeduplicateDerivation:
        if len(set(self.columns)) != len(self.columns):
            raise ValueError("Columns to compare must be unique")
        return self


class SqlDerivation(_StrictModel):
    """Exact SQL submitted when a Derived Data Block was created."""

    kind: Literal["sql"] = "sql"
    sql: str = Field(min_length=1)


class AnnotationDerivation(_StrictModel):
    kind: Literal["annotation"] = "annotation"
    annotation_column: str = Field(min_length=1, max_length=500)
    provider: AnnotationProvider
    model: str = Field(min_length=1, max_length=500)


class ConcordanceMatchDataBlockCreationDerivation(_StrictModel):
    kind: Literal["concordance_match_data_block_creation"] = "concordance_match_data_block_creation"


class ConcordanceDocumentDataBlockCreationDerivation(_StrictModel):
    kind: Literal["concordance_document_data_block_creation"] = (
        "concordance_document_data_block_creation"
    )


class QuotationResultDataBlockCreationDerivation(_StrictModel):
    kind: Literal["quotation_result_data_block_creation"] = "quotation_result_data_block_creation"


class SequentialDataBlockCreationDerivation(_StrictModel):
    kind: Literal["sequential_data_block_creation"] = "sequential_data_block_creation"


class TopicModelingDataBlockCreationDerivation(_StrictModel):
    kind: Literal["topic_modeling_data_block_creation"] = "topic_modeling_data_block_creation"
    role: Literal["topic_data", "topic_meanings"]
    cluster_count: int = Field(ge=0)
    top_n_topics: int = Field(ge=0)
    row_unit: Literal["documents", "topics"] = "documents"


DerivationOperation = Annotated[
    CloneDerivation
    | SliceDerivation
    | FilterDerivation
    | ReplaceDerivation
    | ExpressionDerivation
    | ConcatDerivation
    | JoinDerivation
    | CastDerivation
    | SqlDerivation
    | SegmentDerivation
    | GroupSummaryDerivation
    | DeduplicateDerivation
    | AnnotationDerivation
    | ConcordanceMatchDataBlockCreationDerivation
    | ConcordanceDocumentDataBlockCreationDerivation
    | QuotationResultDataBlockCreationDerivation
    | SequentialDataBlockCreationDerivation
    | TopicModelingDataBlockCreationDerivation,
    Field(discriminator="kind"),
]
_DERIVATION_OPERATION_ADAPTER = TypeAdapter(DerivationOperation)
_DERIVATION_OPERATION_TYPES: dict[str, type[_StrictModel]] = {
    model.model_fields["kind"].default: model
    for model in (
        CloneDerivation,
        SliceDerivation,
        FilterDerivation,
        ReplaceDerivation,
        ExpressionDerivation,
        ConcatDerivation,
        JoinDerivation,
        CastDerivation,
        SqlDerivation,
        SegmentDerivation,
        GroupSummaryDerivation,
        DeduplicateDerivation,
        AnnotationDerivation,
        ConcordanceMatchDataBlockCreationDerivation,
        ConcordanceDocumentDataBlockCreationDerivation,
        QuotationResultDataBlockCreationDerivation,
        SequentialDataBlockCreationDerivation,
        TopicModelingDataBlockCreationDerivation,
    )
}


class SourceProvenance(_StrictModel):
    """A materialized source snapshot with no live graph dependency."""

    type: Literal["source"] = "source"


class NodeReference(_StrictModel):
    """One live Data Block dependency inside a derivation expression."""

    type: Literal["node"] = "node"
    node_id: uuid.UUID


class DerivationInput(_StrictModel):
    """One ordered, role-bearing derivation input."""

    role: Literal["source", "left", "right", "member", "input"]
    value: Annotated[
        SourceProvenance | NodeReference | DerivationProvenance,
        Field(discriminator="type"),
    ]


class DerivationProvenance(_StrictModel):
    """A typed operation applied to ordered live or composed inputs."""

    type: Literal["derivation"] = "derivation"
    operation: DerivationOperation
    inputs: list[DerivationInput]

    @model_validator(mode="after")
    def validate_input_roles(self) -> DerivationProvenance:
        roles = [item.role for item in self.inputs]
        if isinstance(self.operation, JoinDerivation):
            if roles != ["left", "right"]:
                raise ValueError(
                    "Join provenance requires ordered left and right inputs"
                )
        elif isinstance(self.operation, ConcatDerivation):
            if len(roles) < 2 or any(role != "member" for role in roles):
                raise ValueError(
                    "Concatenation provenance requires two or more members"
                )
        elif isinstance(self.operation, SqlDerivation):
            if not roles or any(role != "input" for role in roles):
                raise ValueError("SQL provenance requires one or more ordered inputs")
        elif roles != ["source"]:
            raise ValueError("Unary provenance requires exactly one source input")
        return self


DerivationInput.model_rebuild()
DerivationProvenance.model_rebuild()

NodeProvenance = Annotated[
    SourceProvenance | DerivationProvenance,
    Field(discriminator="type"),
]
_NODE_PROVENANCE_ADAPTER = TypeAdapter(NodeProvenance)
ProvenanceValue = SourceProvenance | NodeReference | DerivationProvenance


def node_reference(node_id: uuid.UUID) -> NodeReference:
    return NodeReference(node_id=node_id)


def validate_node_provenance(value: object) -> NodeProvenance:
    return _NODE_PROVENANCE_ADAPTER.validate_python(value)


def derivation_operation_from_model(value: BaseModel) -> DerivationOperation:
    """Copy only one registered operation's typed parameters from a command."""

    kind = getattr(value, "kind", None)
    operation_type = _DERIVATION_OPERATION_TYPES.get(kind)
    if operation_type is None:
        raise ValueError("Unsupported Data Block derivation")
    payload = {
        field_name: getattr(value, field_name)
        for field_name in operation_type.model_fields
    }
    return _DERIVATION_OPERATION_ADAPTER.validate_python(payload)


def referenced_node_ids(provenance: NodeProvenance) -> list[uuid.UUID]:
    """Return live Data Block references in stable first-use order."""

    ordered: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()

    def visit(value: ProvenanceValue) -> None:
        if isinstance(value, NodeReference):
            node_id = value.node_id
            if node_id not in seen:
                seen.add(node_id)
                ordered.append(node_id)
            return
        if isinstance(value, DerivationProvenance):
            for item in value.inputs:
                visit(item.value)

    visit(provenance)
    return ordered


def compose_provenance(
    provenance: NodeProvenance,
    *,
    removed_node_id: uuid.UUID,
    replacement: NodeProvenance,
) -> NodeProvenance:
    """Replace every reference to one removed Data Block with its provenance."""

    target = removed_node_id

    def replace_value(value: ProvenanceValue) -> ProvenanceValue:
        if isinstance(value, NodeReference):
            if value.node_id == target:
                return replacement.model_copy(deep=True)
            return value
        if isinstance(value, DerivationProvenance):
            return value.model_copy(
                update={
                    "inputs": [
                        item.model_copy(update={"value": replace_value(item.value)})
                        for item in value.inputs
                    ]
                }
            )
        return value

    composed = replace_value(provenance)
    if isinstance(composed, NodeReference):  # pragma: no cover - top-level invariant
        raise ValueError("A Data Block provenance cannot be a node reference")
    return composed


def describe_provenance(
    provenance: NodeProvenance,
    *,
    resolve_name: Callable[[uuid.UUID], str | None],
) -> str:
    """Generate a human description without storing a second lineage contract."""

    def describe_value(value: ProvenanceValue) -> str:
        if isinstance(value, SourceProvenance):
            return "source snapshot"
        if isinstance(value, NodeReference):
            return resolve_name(value.node_id) or str(value.node_id)
        inputs = [describe_value(item.value) for item in value.inputs]
        operation = value.operation
        if isinstance(operation, JoinDerivation):
            return f"{operation.how} join of {inputs[0]} and {inputs[1]}"
        if isinstance(operation, ConcatDerivation):
            prefix = (
                "deduplicated concatenation"
                if operation.deduplicate
                else "concatenation"
            )
            return f"{prefix} of {', '.join(inputs)}"
        if isinstance(operation, SqlDerivation):
            return f"SQL query of {', '.join(inputs)}"
        if isinstance(operation, SegmentDerivation):
            return f"{operation.unit} segments of {inputs[0]}"
        if isinstance(operation, GroupSummaryDerivation):
            return f"summary of {inputs[0]} by {', '.join(operation.group_by)}"
        if isinstance(operation, DeduplicateDerivation):
            prefix = "duplicates in" if operation.output == "duplicates" else "deduplicated"
            return f"{prefix} {inputs[0]}"
        labels: dict[type[BaseModel], str] = {
            CloneDerivation: "clone",
            SliceDerivation: operation.mode
            if isinstance(operation, SliceDerivation)
            else "slice",
            FilterDerivation: "filter",
            ReplaceDerivation: operation.mode
            if isinstance(operation, ReplaceDerivation)
            else "replace",
            ExpressionDerivation: operation.context
            if isinstance(operation, ExpressionDerivation)
            else "expression",
            CastDerivation: "cast",
            AnnotationDerivation: "annotation",
            ConcordanceMatchDataBlockCreationDerivation: "concordance Match Data Block Creation",
            ConcordanceDocumentDataBlockCreationDerivation: "concordance Document Data Block Creation",
            QuotationResultDataBlockCreationDerivation: "quotation Data Block Creation",
            SequentialDataBlockCreationDerivation: "Trends Data Block Creation",
            TopicModelingDataBlockCreationDerivation: "topic modeling Data Block Creation",
        }
        return f"{labels[type(operation)]} of {inputs[0]}"

    return describe_value(provenance)


__all__ = [
    "AnnotationDerivation",
    "BinaryExpression",
    "CastDerivation",
    "CastExpression",
    "CloneDerivation",
    "ColumnExpression",
    "ConcatDerivation",
    "ColumnSummary",
    "ConcatStringExpression",
    "DeduplicateDerivation",
    "GroupSummaryDerivation",
    "SegmentDerivation",
    "ConcordanceMatchDataBlockCreationDerivation",
    "ConcordanceDocumentDataBlockCreationDerivation",
    "DerivationInput",
    "DerivationOperation",
    "DerivationProvenance",
    "ExpressionDerivation",
    "ExpressionItem",
    "ExpressionSpec",
    "FilterCondition",
    "FilterDerivation",
    "FilterScalar",
    "FilterValue",
    "JoinDerivation",
    "LiteralExpression",
    "NodeProvenance",
    "NodeReference",
    "QuotationResultDataBlockCreationDerivation",
    "SequentialDataBlockCreationDerivation",
    "TopicModelingDataBlockCreationDerivation",
    "ReplaceDerivation",
    "RoundExpression",
    "SliceDerivation",
    "SqlDerivation",
    "SourceProvenance",
    "StringExpression",
    "UnaryExpression",
    "compose_provenance",
    "derivation_operation_from_model",
    "describe_provenance",
    "node_reference",
    "referenced_node_ids",
    "validate_node_provenance",
]
