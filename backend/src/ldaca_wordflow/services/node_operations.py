"""Pure builders for Data Block creation and identity-preserving edits.

Used by ``NodeService`` while it holds a function-scoped workspace lease. The
module contains no FastAPI or persistence code: it resolves source nodes,
builds and validates one lazy Polars plan, and returns a materialized ``Node``
only for committed creation calls. Preview calls reuse the same plan builder
without mutating the workspace graph; edit calls return an unattached
replacement plan.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, UTC
from typing import Any, cast

import polars as pl
from ..domain.workspace import Node, Workspace
from ..domain.workspace.provenance import (
    BinaryExpression,
    CastExpression,
    ColumnExpression,
    ConcatStringExpression,
    DerivationInput,
    DerivationOperation,
    DerivationProvenance,
    ExpressionDerivation,
    ExpressionItem,
    ExpressionSpec,
    FilterCondition,
    FilterDerivation,
    LiteralExpression,
    ReplaceDerivation,
    RoundExpression,
    StringExpression,
    UnaryExpression,
    derivation_operation_from_model,
    node_reference,
)

from ..shared.topic_types import is_topic_coverage_storage_dtype
from ..shared.errors import InvalidInputError, NodeNotFoundError
from ..shared.json_data import JsonData
from .node_casting import cast_lazyframe_column
from ..models.node_resources import (
    AnnotationClassesNodeEditRequest,
    CastNodeEditRequest,
    CloneNodeCreateRequest,
    ConcatNodeCreateRequest,
    DeleteColumnNodeEditRequest,
    CleanTextNodeEditRequest,
    DeleteColumnsNodeEditRequest,
    DuplicateColumnNodeEditRequest,
    SplitColumnNodeEditRequest,
    SegmentNodeCreateRequest,
    GroupSummaryNodeCreateRequest,
    DeduplicateNodeCreateRequest,
    CountNodeEditRequest,
    CombineColumnPart,
    CombineColumnsNodeEditRequest,
    ExpressionNodeEditRequest,
    ExpressionNodeCreateRequest,
    FilterNodeCreateRequest,
    JoinNodeCreateRequest,
    NodeDerivationRequest,
    NodeEditRequest,
    RenameColumnNodeEditRequest,
    ReplaceNodeEditRequest,
    ReplaceNodeCreateRequest,
    SetCellNodeEditRequest,
    SliceNodeCreateRequest,
)
from ..infrastructure.storage.layout import validate_display_name

_ISO_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+\-]\d{2}:?\d{2})$"
)


def build_derived_node(
    workspace: Workspace,
    request: NodeDerivationRequest,
) -> Node:
    """Build, validate, and attach one immutable child node.

    Called by ``NodeService.create_derived`` inside the workspace mutation
    gate. The node is inserted only after the lazy plan and output name have
    passed validation, so failed requests cannot alter graph topology.
    """

    lazyframe, default_name, operation, parents = build_derived_lazyframe(
        workspace,
        request,
    )
    name = (request.name or default_name).strip()
    valid, reason = validate_display_name(name)
    if not valid:
        raise InvalidInputError(f"Invalid node name: {reason}")

    # Schema resolution catches invalid columns, join keys, expressions, and
    # most dtype errors before the graph is changed or persisted.
    try:
        lazyframe.collect_schema()
    except Exception as exc:
        raise InvalidInputError(
            "The node operation does not produce a valid schema"
        ) from exc

    node = Node(
        data=lazyframe,
        name=name,
        parents=parents,
        provenance=DerivationProvenance(
            operation=operation,
            inputs=_provenance_inputs(request, parents),
        ),
        document=_propagated_document(parents, lazyframe),
    )
    workspace.add_node(node)
    workspace.place_node_after_parent(node)
    return node


def build_derived_lazyframe(
    workspace: Workspace,
    request: NodeDerivationRequest,
) -> tuple[pl.LazyFrame, str, DerivationOperation, list[Node]]:
    """Return the lazy result, default name, typed operation, and parents."""

    operation = derivation_operation_from_model(request)

    if isinstance(request, CloneNodeCreateRequest):
        source = _node(workspace, request.source_node_id)
        return (
            source.data.clone(),
            f"{source.name}_clone",  # issue 182
            operation,
            [source],
        )

    if isinstance(request, SliceNodeCreateRequest):
        source = _node(workspace, request.source_node_id)
        result, suffix = _slice(source, request)
        return result, f"{source.name}_{suffix}", operation, [source]

    if isinstance(request, FilterNodeCreateRequest):
        source = _node(workspace, request.source_node_id)
        schema = dict(source.data.collect_schema().items())
        predicate = _filter_expression(request, schema)
        return (
            source.data.filter(predicate),
            f"{source.name}_filtered",
            operation,
            [source],
        )

    if isinstance(request, ReplaceNodeCreateRequest):
        source = _node(workspace, request.source_node_id)
        output_column, expression = _replace_expression(source, request)
        return (
            source.data.with_columns(expression),
            f"{source.name}_{output_column}",
            operation,
            [source],
        )

    if isinstance(request, ExpressionNodeCreateRequest):
        source = _node(workspace, request.source_node_id)
        return (
            _apply_expression(source.data, request),
            f"{source.name}_{request.context}",
            operation,
            [source],
        )

    if isinstance(request, ConcatNodeCreateRequest):
        parents = [_node(workspace, node_id) for node_id in request.source_node_ids]
        if len({node.id for node in parents}) != len(parents):
            raise InvalidInputError("Concatenation source nodes must be distinct")
        frames = _aligned_concat_frames(parents)
        result = pl.concat(frames, how="vertical")
        if request.deduplicate:
            result = result.unique(maintain_order=True)
        labels = ", ".join(node.name for node in parents)
        return result, f"Stack({labels})", operation, parents

    if isinstance(request, JoinNodeCreateRequest):
        left = _node(workspace, request.left_node_id)
        right = _node(workspace, request.right_node_id)
        if left.id == right.id:
            raise InvalidInputError("Join source nodes must be distinct")
        if request.how == "cross":
            result = left.data.join(right.data, how="cross")
        else:
            left_on = cast(str, request.left_on)
            right_on = cast(str, request.right_on)
            _validate_join_keys(left, right, left_on, right_on)
            result = left.data.join(
                right.data,
                left_on=left_on,
                right_on=right_on,
                how=request.how,
            )
        return (
            result,
            f"{left.name}_join_{right.name}",
            operation,
            [left, right],
        )

    if isinstance(request, SegmentNodeCreateRequest):
        source = _node(workspace, request.source_node_id)
        return (
            _segment(source.data, request),
            f"{source.name}_{request.unit}s",
            operation,
            [source],
        )

    if isinstance(request, GroupSummaryNodeCreateRequest):
        source = _node(workspace, request.source_node_id)
        return (
            _group_summary(source.data, request),
            f"{source.name}_by_{'_'.join(request.group_by)}",
            operation,
            [source],
        )

    if isinstance(request, DeduplicateNodeCreateRequest):
        source = _node(workspace, request.source_node_id)
        suffix = "duplicates" if request.output == "duplicates" else "deduplicated"
        return (
            _deduplicate(source.data, request),
            f"{source.name}_{suffix}",
            operation,
            [source],
        )

    raise InvalidInputError("Unsupported node operation")


def build_edited_lazyframe(
    node: Node,
    request: NodeEditRequest,
) -> tuple[pl.LazyFrame, tuple[str, str] | None]:
    """Build a replacement plan without mutating the target Data Block."""

    if isinstance(request, CastNodeEditRequest):
        source_type = node.data.collect_schema().get(request.column)
        if source_type is None:
            raise InvalidInputError("Cast column is not present on the Data Block")
        if _cast_is_no_op(
            source_type,
            request.target_type,
            datetime_format=request.datetime_format,
        ):
            return node.data, None
        result = cast_lazyframe_column(
            node.data,
            column_name=request.column,
            target_type=request.target_type,
            datetime_format=request.datetime_format,
            strict=request.strict,
        )
        return result.lazyframe, None

    if isinstance(request, RenameColumnNodeEditRequest):
        schema_names = node.data.collect_schema().names()
        if request.column not in schema_names:
            raise InvalidInputError("Rename column is not present on the Data Block")
        new_name = request.new_name.strip()
        if not new_name:
            raise InvalidInputError("New column name cannot be blank")
        if new_name == request.column:
            return node.data, None
        if new_name in schema_names:
            raise InvalidInputError("New column name already exists on the Data Block")
        return node.data.rename({request.column: new_name}), (
            request.column,
            new_name,
        )

    if isinstance(request, DeleteColumnNodeEditRequest):
        if request.column not in node.data.collect_schema().names():
            raise InvalidInputError("Delete column is not present on the Data Block")
        return node.data.drop(request.column), None

    if isinstance(request, DeleteColumnsNodeEditRequest):
        names = node.data.collect_schema().names()
        missing = [column for column in request.columns if column not in names]
        if missing:
            raise InvalidInputError(
                f"Columns to delete are not present on the Data Block: {', '.join(missing)}"
            )
        if len(request.columns) >= len(names):
            # A block with no columns cannot keep its rows (Data Block Edits
            # never change rows).
            raise InvalidInputError("Keep at least one column on the Data Block")
        return node.data.drop(request.columns), None

    if isinstance(request, DuplicateColumnNodeEditRequest):
        names = node.data.collect_schema().names()
        if request.column not in names:
            raise InvalidInputError("Duplicate column is not present on the Data Block")
        copy_name = duplicate_column_name(request.column, names)
        edited = node.data.with_columns(pl.col(request.column).alias(copy_name))
        return _place_right_of(edited, request.column, [copy_name]), None

    if isinstance(request, CleanTextNodeEditRequest):
        names = node.data.collect_schema().names()
        if request.column not in names:
            raise InvalidInputError("Clean column is not present on the Data Block")
        output = (request.output_column or request.column).strip()
        if not output:
            raise InvalidInputError("Output column name cannot be blank")
        if output != request.column and output in names:
            raise InvalidInputError("Output column name already exists on the Data Block")
        expression = _clean_text_expression(pl.col(request.column), request.operation)
        edited = node.data.with_columns(expression.alias(output))
        if output == request.column:
            return edited, None
        return _place_right_of(edited, request.column, [output]), None

    if isinstance(request, SplitColumnNodeEditRequest):
        names = node.data.collect_schema().names()
        if request.column not in names:
            raise InvalidInputError("Split column is not present on the Data Block")
        outputs = [f"{request.column}_{index}" for index in range(1, request.parts + 1)]
        clashes = [name for name in outputs if name in names]
        if clashes:
            raise InvalidInputError(
                f"Split would overwrite existing columns: {', '.join(clashes)}"
            )
        pieces = _split_pieces(pl.col(request.column).cast(pl.String), request.delimiters)
        edited = node.data.with_columns(
            expression.alias(output)
            for expression, output in zip(
                _split_parts(pieces, request.delimiters, request.parts, request.direction),
                outputs,
                strict=True,
            )
        )
        return _place_right_of(edited, request.column, outputs), None

    if isinstance(request, CountNodeEditRequest):
        names = node.data.collect_schema().names()
        if request.column not in names:
            raise InvalidInputError("Count column is not present on the Data Block")
        output = request.output_column.strip()
        if not output:
            raise InvalidInputError("New column name cannot be blank")
        if output in names:
            raise InvalidInputError("New column name already exists on the Data Block")
        expression = _count_expression(pl.col(request.column).cast(pl.String), request)
        edited = node.data.with_columns(expression.alias(output))
        return _place_right_of(edited, request.column, [output]), None

    if isinstance(request, CombineColumnsNodeEditRequest):
        names = node.data.collect_schema().names()
        referenced = [
            part.column for part in request.parts if isinstance(part, CombineColumnPart)
        ]
        missing = sorted({column for column in referenced if column not in names})
        if missing:
            raise InvalidInputError(
                "Columns in the template are not present on the Data Block: "
                + ", ".join(missing)
            )
        output = request.output_column.strip()
        if not output:
            raise InvalidInputError("New column name cannot be blank")
        if output in names:
            raise InvalidInputError("New column name already exists on the Data Block")
        pieces = [
            pl.col(part.column).cast(pl.String)
            if isinstance(part, CombineColumnPart)
            else pl.lit(part.text, dtype=pl.String)
            for part in request.parts
        ]
        if request.empty_values == "blank":
            pieces = [piece.fill_null("") for piece in pieces]
        return node.data.with_columns(pl.concat_str(pieces).alias(output)), None

    if isinstance(request, ReplaceNodeEditRequest):
        output_column, expression = _replace_expression(node, request)
        edited = node.data.with_columns(expression)
        if output_column != request.source_column and output_column not in (
            node.data.collect_schema().names()
        ):
            # A new Find output (such as Extract) sits right of its source.
            return _place_right_of(edited, request.source_column, [output_column]), None
        return edited, None

    if isinstance(request, ExpressionNodeEditRequest):
        return _apply_expression(node.data, request), None

    if isinstance(request, SetCellNodeEditRequest):
        return _set_string_cell(node, request), None

    if isinstance(request, AnnotationClassesNodeEditRequest):
        return _replace_annotation_classes(node, request), None

    raise InvalidInputError("Unsupported Data Block Edit")


def _set_string_cell(
    node: Node,
    request: SetCellNodeEditRequest,
) -> pl.LazyFrame:
    schema = node.data.collect_schema()
    if request.column not in schema:
        raise InvalidInputError("Cell column is not present on the Data Block")
    if schema[request.column] != pl.String:
        raise InvalidInputError("Cell edits require a string column")
    current = node.data.select(request.column).slice(request.row_index, 1).collect()
    if current.height != 1:
        raise InvalidInputError("Cell row index is outside the Data Block")
    if current.item() == request.value:
        return node.data
    return node.data.with_columns(
        pl.when(pl.int_range(pl.len()) == request.row_index)
        .then(pl.lit(request.value, dtype=pl.String))
        .otherwise(pl.col(request.column))
        .alias(request.column)
    )


def _replace_annotation_classes(
    node: Node,
    request: AnnotationClassesNodeEditRequest,
) -> pl.LazyFrame:
    schema = dict(node.data.collect_schema().items())
    missing = [
        column
        for column in (request.class_column, request.description_column)
        if column not in schema
    ]
    if missing:
        raise InvalidInputError(
            f"Annotation class column is not present: {', '.join(missing)}"
        )

    row_count = len(request.rows)
    existing = node.data.slice(0, row_count).collect()
    total_rows = int(node.data.select(pl.len()).collect().item())
    values: dict[str, list[object]] = {}
    for column in schema:
        if column == request.class_column:
            values[column] = [row.class_name for row in request.rows]
        elif column == request.description_column:
            values[column] = [row.description for row in request.rows]
        else:
            existing_values = existing[column].to_list()
            values[column] = [
                existing_values[index] if index < len(existing_values) else None
                for index in range(row_count)
            ]

    output_schema = dict(schema)
    output_schema[request.class_column] = cast(pl.DataType, pl.String)
    output_schema[request.description_column] = cast(pl.DataType, pl.String)
    updated = pl.DataFrame(values, schema=output_schema)
    if total_rows == row_count and existing.equals(updated, null_equal=True):
        return node.data

    row_index = "__wordflow_annotation_row_index"
    while row_index in schema:
        row_index = f"_{row_index}"
    extra_columns = [
        column
        for column in schema
        if column not in {request.class_column, request.description_column}
    ]
    source_marker = "__wordflow_annotation_source"
    while source_marker in schema or source_marker == row_index:
        source_marker = f"_{source_marker}"
    source_expressions: list[pl.Expr] = [pl.col(row_index)]
    source_expressions.extend(pl.col(column) for column in extra_columns)
    source_expressions.append(pl.lit(True).alias(source_marker))
    source_rows = (
        node.data.with_row_index(row_index)
        .slice(0, row_count)
        .select(source_expressions)
    )
    payload = updated.select(
        request.class_column,
        request.description_column,
    ).with_columns(
        pl.Series(row_index, range(row_count), dtype=pl.UInt32)
    )
    return (
        payload.lazy()
        .join(source_rows, on=row_index, how="left")
        .drop(row_index, source_marker)
        .select(list(schema))
    )


def _cast_is_no_op(
    source_type: pl.DataType,
    target_type: str,
    *,
    datetime_format: str | None,
) -> bool:
    """Return whether the requested canonical cast preserves the current dtype."""

    if target_type == "string":
        return source_type == pl.String
    if target_type == "integer":
        return source_type == pl.Int64
    if target_type == "float":
        return source_type == pl.Float64
    if target_type == "categorical":
        return source_type == pl.Categorical
    return (
        target_type == "datetime"
        and isinstance(source_type, pl.Datetime)
        and datetime_format is None
    )


def _node(workspace: Workspace, node_id: uuid.UUID) -> Node:
    node = workspace.nodes.get(node_id)
    if node is None:
        raise NodeNotFoundError("Node not found")
    return node


def _validate_join_keys(
    left: Node,
    right: Node,
    left_on: str,
    right_on: str,
) -> None:
    """Reject missing or incompatible join keys before Polars builds the plan."""

    left_schema = left.data.collect_schema()
    right_schema = right.data.collect_schema()
    if left_on not in left_schema:
        raise InvalidInputError(f'Join left column "{left_on}" was not found')
    if right_on not in right_schema:
        raise InvalidInputError(f'Join right column "{right_on}" was not found')

    left_dtype = left_schema[left_on]
    right_dtype = right_schema[right_on]
    if left_dtype != right_dtype:
        raise InvalidInputError(
            "Join columns have incompatible data types: "
            f'"{left_on}" is {_join_dtype_label(left_dtype)}, '
            f'but "{right_on}" is {_join_dtype_label(right_dtype)}. '
            "Choose columns with the same data type or cast one column first."
        )


def _join_dtype_label(dtype: pl.DataType) -> str:
    """Format one join-key dtype in concise user-facing language."""

    if dtype == pl.String:
        return "string"
    if dtype.is_integer():
        return f"integer ({dtype})"
    if dtype.is_float():
        return f"floating-point number ({dtype})"
    if dtype == pl.Boolean:
        return "boolean"
    if dtype.is_temporal():
        return f"date/time ({dtype})"
    return str(dtype)


def _slice(
    source: Node,
    request: SliceNodeCreateRequest,
) -> tuple[pl.LazyFrame, str]:
    if request.mode == "shuffle":
        indices = pl.int_range(pl.len()).sample(
            fraction=1.0,
            shuffle=True,
            seed=request.random_seed,
        )
        return source.data.select(pl.all().gather(indices)), "shuffled"
    if request.mode == "random_sample":
        sample_size = cast(float, request.sample_size)
        indices = (
            pl.int_range(pl.len()).sample(
                fraction=sample_size, seed=request.random_seed
            )
            if sample_size < 1
            else pl.int_range(pl.len()).sample(
                n=int(sample_size), seed=request.random_seed
            )
        )
        return source.data.select(pl.all().gather(indices)), "sampled"
    return source.data.slice(request.offset, request.length), "sliced"


def _provenance_inputs(
    request: NodeDerivationRequest,
    parents: list[Node],
) -> list[DerivationInput]:
    if isinstance(request, JoinNodeCreateRequest):
        return [
            DerivationInput(role="left", value=node_reference(parents[0].id)),
            DerivationInput(role="right", value=node_reference(parents[1].id)),
        ]
    if isinstance(request, ConcatNodeCreateRequest):
        return [
            DerivationInput(role="member", value=node_reference(parent.id))
            for parent in parents
        ]
    return [DerivationInput(role="source", value=node_reference(parents[0].id))]


def _filter_expression(
    request: FilterDerivation,
    schema: dict[str, pl.DataType],
) -> pl.Expr:
    expressions = [
        _condition_expression(condition, schema) for condition in request.conditions
    ]
    result = expressions[0]
    for expression in expressions[1:]:
        result = result | expression if request.logic == "or" else result & expression
    return result


def _empty_value_expression(column: pl.Expr, dtype: pl.DataType) -> pl.Expr:
    """Missing values, NaN, and empty or whitespace-only text count as empty.

    Null and "" differ to data scientists but not to researchers reading texts,
    so the Filter's is empty / is not empty treat them alike (issue 166).
    """

    missing = column.is_null()
    if dtype == pl.String or isinstance(dtype, (pl.Categorical, pl.Enum)):
        return missing | (column.cast(pl.String).str.strip_chars() == "")
    if dtype.is_float():
        return missing | column.is_nan()
    return missing


def _condition_expression(
    condition: FilterCondition,
    schema: dict[str, pl.DataType],
) -> pl.Expr:
    if condition.column not in schema:
        raise InvalidInputError("Filter column is not present on the node")
    column = pl.col(condition.column)
    dtype = schema[condition.column]
    value = condition.value
    operator = condition.operator

    # Text columns compare as text: "2020" or a postcode must not become a number.
    text_column = dtype == pl.String or isinstance(dtype, (pl.Categorical, pl.Enum))

    def coerce(item: object) -> object:
        if text_column and isinstance(item, (str, int, float)) and not isinstance(item, bool):
            return str(item)
        return _coerce_scalar(_parse_temporal(item))

    if is_topic_coverage_storage_dtype(dtype):
        expression = _topic_coverage_expression(condition)
    elif operator in {"eq", "ne", "gt", "gte", "lt", "lte"}:
        scalar = coerce(value)
        literal = cast(
            Any,
            _temporal_literal(scalar, dtype)
            if isinstance(scalar, datetime)
            else scalar,
        )
        if operator == "eq":
            expression: pl.Expr = column == literal
        elif operator == "ne":
            expression = column != literal
        elif operator == "gt":
            expression = column > literal
        elif operator == "gte":
            expression = column >= literal
        elif operator == "lt":
            expression = column < literal
        else:
            expression = column <= literal
    elif operator == "in":
        values = value if isinstance(value, list) else [value]
        include_null = any(item is None for item in values)
        normalized = [coerce(item) for item in values if item is not None]
        if dtype == pl.List(pl.String):
            expression = column.list.eval(
                pl.element().cast(pl.String).is_in([str(item) for item in normalized]),
                parallel=False,
            ).list.any()
        elif normalized:
            expression = column.is_in(normalized)
            if include_null:
                expression = expression | column.is_null()
        else:
            expression = column.is_null() if include_null else pl.lit(False)
    elif operator == "contains":
        pattern = str(value or "")
        if condition.regex:
            expression = column.cast(pl.String).str.contains(
                pattern if condition.case_sensitive else f"(?i){pattern}"
            )
        elif condition.case_sensitive:
            expression = column.cast(pl.String).str.contains(pattern, literal=True)
        else:
            expression = (
                column.cast(pl.String)
                .str.to_lowercase()
                .str.contains(pattern.lower(), literal=True)
            )
    elif operator == "starts_with":
        expression = column.cast(pl.String).str.starts_with(str(value or ""))
    elif operator == "ends_with":
        expression = column.cast(pl.String).str.ends_with(str(value or ""))
    elif operator in ("is_null", "is_not_null"):
        empty = _empty_value_expression(column, dtype)
        expression = empty if operator == "is_null" else ~empty
    elif operator == "between":
        if not isinstance(value, dict):
            raise InvalidInputError("Between filters require start and end values")
        start = _coerce_scalar(_parse_temporal(value.get("start")))
        end = _coerce_scalar(_parse_temporal(value.get("end")))
        if start is None and end is None:
            raise InvalidInputError("Between filters require a start or end value")
        if isinstance(start, datetime):
            start = _temporal_literal(start, dtype)
        if isinstance(end, datetime):
            end = _temporal_literal(end, dtype)
        if start is None:
            expression = column <= cast(Any, end)
        elif end is None:
            expression = column >= cast(Any, start)
        else:
            expression = column.is_between(
                cast(Any, start),
                cast(Any, end),
                closed="both",
            )
    else:  # pragma: no cover - the request literal already constrains this
        raise InvalidInputError("Unsupported filter operator")
    return ~expression if condition.negate else expression


def _topic_coverage_expression(condition: FilterCondition) -> pl.Expr:
    if not isinstance(condition.value, dict):
        raise InvalidInputError(
            "Topic Coverage filters require topic_id and threshold"
        )
    try:
        topic_id = int(cast(Any, condition.value.get("topic_id")))
        threshold = float(cast(Any, condition.value.get("threshold")))
    except (TypeError, ValueError) as exc:
        raise InvalidInputError(
            "Topic Coverage filters require numeric topic_id and threshold"
        ) from exc
    coverage = (
        pl.col(condition.column)
        .arr.eval(
            pl.when(pl.element().struct.field("topic_id") == topic_id)
            .then(pl.element().struct.field("coverage"))
            .otherwise(0.0)
        )
        .arr.max()
        .fill_null(0.0)
    )
    operators = {
        "eq": coverage == threshold,
        "ne": coverage != threshold,
        "gt": coverage > threshold,
        "gte": coverage >= threshold,
        "lt": coverage < threshold,
        "lte": coverage <= threshold,
    }
    expression = operators.get(condition.operator)
    if expression is None:
        raise InvalidInputError("Unsupported Topic Coverage filter operator")
    return expression


def duplicate_column_name(column: str, existing: list[str]) -> str:
    """Finder-style copy name: ``text copy``, then ``text copy 2``, ``text copy 3``."""

    taken = set(existing)
    candidate = f"{column} copy"
    number = 2
    while candidate in taken:
        candidate = f"{column} copy {number}"
        number += 1
    return candidate


def _place_right_of(lazyframe: pl.LazyFrame, anchor: str, new_columns: list[str]) -> pl.LazyFrame:
    """Reorder so ``new_columns`` follow ``anchor``; a pure reorder keeps rows."""

    names = [name for name in lazyframe.collect_schema().names() if name not in new_columns]
    position = names.index(anchor) + 1
    return lazyframe.select([*names[:position], *new_columns, *names[position:]])


_URL_PATTERN = r"(?i)\b(?:https?://|www\.)\S+"
_HTML_TAG_PATTERN = r"<[^>]+>"
# XML markup (issue 155): declarations and processing instructions, comments,
# a DOCTYPE with or without an internal subset, and element tags whose quoted
# attributes may contain ">". CDATA wrappers go but their text is kept.
_XML_MARKUP_PATTERN = (
    r"<\?[\s\S]*?\?>"
    r"|<!--[\s\S]*?-->"
    r"|<!DOCTYPE[^>\[]*(?:\[[\s\S]*?\])?\s*>"
    r"|<!\[CDATA\[|\]\]>"
    r"|</?[A-Za-z_][\w.:-]*(?:\s+(?:\"[^\"]*\"|'[^']*'|[^'\"<>])*)?/?>"
)
# The five predefined XML entities; "&amp;" last so "&amp;lt;" stays "&lt;".
_XML_ENTITIES = (
    ("&lt;", "<"),
    ("&gt;", ">"),
    ("&quot;", '"'),
    ("&apos;", "'"),
    ("&amp;", "&"),
)


# Marks the end of each delimiter so a split keeps which delimiter it used.
_SPLIT_MARK = "\x1f"


def _delimiter_pattern(delimiters: list[str]) -> str:
    # Longest first, so ", " wins over "," at the same position.
    ordered = sorted(delimiters, key=len, reverse=True)
    return "(?:" + "|".join(pl.escape_regex(delimiter) for delimiter in ordered) + ")"


def _split_pieces(column: pl.Expr, delimiters: list[str]) -> pl.Expr:
    """A list of pieces, each ending with its delimiter except the last."""

    return column.str.replace_all(
        _delimiter_pattern(delimiters), "${0}" + _SPLIT_MARK
    ).str.split(_SPLIT_MARK)


def _split_parts(
    pieces: pl.Expr, delimiters: list[str], parts: int, direction: str
) -> list[pl.Expr]:
    trailing = _delimiter_pattern(delimiters) + "$"

    def strip(piece: pl.Expr) -> pl.Expr:
        return piece.str.replace(trailing, "")

    count = pieces.list.len().cast(pl.Int64)
    if direction == "left":
        leading = [
            strip(pieces.list.get(index, null_on_oob=True)) for index in range(parts - 1)
        ]
        rest = pl.when(count >= parts).then(pieces.list.slice(parts - 1).list.join(""))
        return [*leading, rest]
    # From the right, the first column keeps the remainder; a short row fills
    # from the left, as Python rsplit does.
    head = pl.max_horizontal(count - (parts - 1), pl.lit(1, dtype=pl.Int64))
    remainder = strip(pieces.list.slice(0, head).list.join(""))
    trailing_parts = [
        strip(pieces.list.get(head + offset, null_on_oob=True))
        for offset in range(parts - 1)
    ]
    return [remainder, *trailing_parts]


def _count_expression(column: pl.Expr, request: CountNodeEditRequest) -> pl.Expr:
    if request.measure == "words":
        return column.str.count_matches(r"\S+")
    if request.measure == "characters":
        return column.str.len_chars()
    if request.measure == "characters_no_spaces":
        return column.str.replace_all(r"\s", "").str.len_chars()
    return column.str.count_matches(request.pattern or "", literal=not request.regex)


_SENTENCE_END = r"""([.!?\u2026]+["'\u201d\u2019)\]]*)\s+"""
_PARAGRAPH_BREAK = r"\n[ \t]*\n\s*"
_URL_OR_MENTION = r"https?://\S+|www\.\S+|@\w+"


def _segment(data: pl.LazyFrame, request: SegmentNodeCreateRequest) -> pl.LazyFrame:
    """One row per segment; the other columns repeat and "segment" counts from 1."""

    names = data.collect_schema().names()
    column = request.column
    if column not in names:
        raise InvalidInputError("Segment column is not present on the Data Block")
    text = pl.col(column).cast(pl.String).str.replace_all("\r\n", "\n")
    lead_name: str | None = None
    if request.unit == "pattern":
        pieces = text.str.replace_all(f"(?m)({request.pattern})", _SPLIT_MARK + "${1}")
        if request.lead == "column":
            lead_name = (request.lead_column or "").strip()
            if not lead_name:
                raise InvalidInputError("Name the column for the matched text")
            if lead_name in names:
                raise InvalidInputError("The matched-text column name is already in use")
    elif request.unit == "sentence":
        pieces = text.str.replace_all(_SENTENCE_END, "${1}" + _SPLIT_MARK)
    elif request.unit == "paragraph":
        pieces = text.str.replace_all(_PARAGRAPH_BREAK, _SPLIT_MARK)
    else:
        pieces = text.str.replace_all("\n", _SPLIT_MARK)
    if "segment" in names:
        raise InvalidInputError('The Data Block already has a "segment" column')

    row = "__segment_row"
    exploded = data.with_row_index(row).with_columns(pieces.str.split(_SPLIT_MARK)).explode(
        column
    )
    segment = pl.col(column)
    keep = segment.str.strip_chars() != ""
    if request.unit == "pattern":
        anchored = f"^(?m:{request.pattern})"
        lead = segment.str.extract(f"^((?m:{request.pattern}))", 1)
        body = segment.str.replace(anchored, "").str.strip_chars()
        exploded = exploded.with_columns(
            body.alias(column),
            lead.str.strip_chars().str.strip_chars_end(":").str.strip_chars().alias(
                "__segment_lead"
            ),
        )
        keep = pl.col(column) != ""
        if request.lead == "column":
            keep = keep | pl.col("__segment_lead").is_not_null()
    else:
        exploded = exploded.with_columns(segment.str.strip_chars())
    result = exploded.filter(keep).with_columns(
        pl.int_range(1, pl.len() + 1, dtype=pl.UInt32).over(row).alias("segment")
    )
    new_columns = ["segment"]
    if request.unit == "pattern" and lead_name:
        result = result.rename({"__segment_lead": lead_name})
        new_columns.append(lead_name)
    elif request.unit == "pattern":
        result = result.drop("__segment_lead")
    ordered: list[str] = []
    for name in names:
        if name == column:
            ordered.extend(new_columns)
        ordered.append(name)
    return result.select(ordered)


_NUMERIC_SUMMARIES = {"sum", "mean"}
_ORDERED_SUMMARIES = {"min", "max", "earliest", "latest", "earliest_latest"}


def _group_summary(
    data: pl.LazyFrame, request: GroupSummaryNodeCreateRequest
) -> pl.LazyFrame:
    schema = data.collect_schema()
    missing = [
        name
        for name in [*request.group_by, *(item.column for item in request.summaries)]
        if name not in schema
    ]
    if missing:
        raise InvalidInputError(
            f"Columns are not present on the Data Block: {', '.join(missing)}"
        )
    rows_name = "rows" if "rows" not in request.group_by else "row_count"
    aggregations: list[pl.Expr] = [pl.len().alias(rows_name)]
    for item in request.summaries:
        dtype = schema[item.column]
        column = pl.col(item.column)
        if item.summary in _NUMERIC_SUMMARIES and not dtype.is_numeric():
            raise InvalidInputError(f"{item.column} is not numeric, so it cannot be summed or averaged")
        if item.summary in _ORDERED_SUMMARIES and dtype.is_nested():
            raise InvalidInputError(f"{item.column} has no order to take a minimum or maximum")
        if item.summary == "join_text":
            aggregations.append(column.cast(pl.String).str.join(item.separator).alias(item.column))
        elif item.summary == "count_distinct":
            aggregations.append(column.n_unique().alias(f"{item.column}_count_distinct"))
        elif item.summary == "distinct_values":
            aggregations.append(
                column.cast(pl.String)
                .drop_nulls()
                .unique(maintain_order=True)
                .str.join(item.separator)
                .alias(f"{item.column}_distinct_values")
            )
        elif item.summary == "earliest_latest":
            aggregations.append(column.min().alias(f"{item.column}_earliest"))
            aggregations.append(column.max().alias(f"{item.column}_latest"))
        else:
            expression = {
                "first": column.first(),
                "last": column.last(),
                "sum": column.sum(),
                "mean": column.mean(),
                "min": column.min(),
                "max": column.max(),
                "earliest": column.min(),
                "latest": column.max(),
            }[item.summary]
            aggregations.append(expression.alias(f"{item.column}_{item.summary}"))
    return data.group_by(request.group_by, maintain_order=True).agg(aggregations)


def _near_text_key(column: pl.Expr, ignore_links_mentions: bool) -> pl.Expr:
    text = column.cast(pl.String).str.to_lowercase()
    if ignore_links_mentions:
        # "RT @user: text" re-posts match the original text.
        text = text.str.replace_all(_URL_OR_MENTION, " ").str.replace(r"^\s*rt\b", "")
    return (
        text.str.replace_all(r"[\p{P}\p{S}]", "")
        .str.replace_all(r"\s+", " ")
        .str.strip_chars()
    )


def _deduplicate(
    data: pl.LazyFrame, request: DeduplicateNodeCreateRequest
) -> pl.LazyFrame:
    names = data.collect_schema().names()
    compared = list(request.columns) or list(names)
    near = request.near_text_column
    missing = [name for name in [*compared, *([near] if near else [])] if name not in names]
    if missing:
        raise InvalidInputError(
            f"Columns are not present on the Data Block: {', '.join(missing)}"
        )
    keys = [name for name in compared if name != near]
    prepared = data
    if near:
        prepared = prepared.with_columns(
            _near_text_key(pl.col(near), request.ignore_links_mentions).alias("__dedupe_text")
        )
        keys.append("__dedupe_text")
    if request.output == "kept":
        kept = prepared.unique(subset=keys, keep="first", maintain_order=True)
        return kept.drop("__dedupe_text") if near else kept
    for name in ("duplicate_group", "kept"):
        if name in names:
            raise InvalidInputError(f'The Data Block already has a "{name}" column')
    row = "__dedupe_row"
    first = "__dedupe_first"
    groups = (
        prepared.with_row_index(row)
        .with_columns(
            pl.len().over(keys).alias("__dedupe_size"),
            pl.col(row).min().over(keys).alias(first),
        )
        .filter(pl.col("__dedupe_size") > 1)
        .with_columns(
            pl.col(first).rank("dense").cast(pl.UInt32).alias("duplicate_group"),
            (pl.col(row) == pl.col(first)).alias("kept"),
        )
        .sort(["duplicate_group", row])
    )
    return groups.select(["duplicate_group", "kept", *names])


def _title_case(text: pl.Expr) -> pl.Expr:
    """Capitalise each word, keeping apostrophes inside words ("It's").

    ``str.to_titlecase`` is not used: polars-source-utils cannot read it back
    from a saved plan, which would break Project save and load.
    """

    return (
        text.str.replace_all(r"(\w+(?:['’]\w+)*)", _SPLIT_MARK + "${1}")
        .str.split(_SPLIT_MARK)
        .list.eval(
            pl.element().str.slice(0, 1).str.to_uppercase()
            + pl.element().str.slice(1).str.to_lowercase()
        )
        .list.join("")
    )


def _clean_text_expression(column: pl.Expr, operation: str) -> pl.Expr:
    text = column.cast(pl.String)
    if operation == "trim":
        return text.str.strip_chars()
    if operation == "collapse_whitespace":
        return text.str.replace_all(r"\s+", " ").str.strip_chars()
    if operation == "lowercase":
        return text.str.to_lowercase()
    if operation == "uppercase":
        return text.str.to_uppercase()
    if operation == "title_case":
        return _title_case(text)
    if operation == "remove_punctuation":
        return text.str.replace_all(r"[\p{P}\p{S}]", "")
    if operation == "remove_digits":
        return text.str.replace_all(r"\d", "")
    if operation == "remove_urls":
        return text.str.replace_all(_URL_PATTERN, "")
    if operation == "remove_html_tags":
        return text.str.replace_all(_HTML_TAG_PATTERN, "")
    if operation == "remove_xml_tags":
        cleaned = text.str.replace_all(_XML_MARKUP_PATTERN, "")
        for entity, character in _XML_ENTITIES:
            cleaned = cleaned.str.replace_all(entity, character, literal=True)
        return cleaned
    raise InvalidInputError("Unsupported text cleaning operation")


def _replace_expression(
    source: Node,
    request: ReplaceDerivation,
) -> tuple[str, pl.Expr]:
    if request.source_column not in source.data.collect_schema().names():
        raise InvalidInputError("Replace source column is not present on the node")
    output = re.sub(r"\s+", " ", request.output_column or request.source_column).strip()
    if not output:
        raise InvalidInputError("Output column name cannot be blank")
    column = pl.col(request.source_column).cast(pl.String)
    if request.mode == "extract":
        pattern = pl.escape_regex(request.pattern) if request.literal else request.pattern
        extracted = column.str.extract_all(pattern)
        if request.count == "first":
            extracted = extracted.list.head(request.match_limit or 1)
        expression = (
            pl.when(extracted.list.len() > 0)
            .then(extracted.list.join(request.connector))
            .otherwise(pl.lit(None))
        )
    elif request.count == "all":
        expression = column.str.replace_all(
            request.pattern, request.replacement, literal=request.literal
        )
    else:
        expression = column.str.replace(
            request.pattern,
            request.replacement,
            literal=request.literal,
            n=request.match_limit or 1,
        )
    return output[:120], expression.alias(output[:120])


def _compile_expression(
    specification: ExpressionSpec,
    columns: set[str],
) -> pl.Expr:
    """Compile the closed expression DSL without evaluating client code."""

    if isinstance(specification, ColumnExpression):
        if specification.name not in columns:
            raise InvalidInputError("Expression column is not present on the node")
        return pl.col(specification.name)
    if isinstance(specification, LiteralExpression):
        return pl.lit(specification.value)
    if isinstance(specification, BinaryExpression):
        left = _compile_expression(specification.left, columns)
        right = _compile_expression(specification.right, columns)
        operation = specification.op
        if operation == "add":
            return left + right
        if operation == "subtract":
            return left - right
        if operation == "multiply":
            return left * right
        if operation == "divide":
            return left / right
        if operation == "modulo":
            return left % right
        if operation == "eq":
            return left == right
        if operation == "ne":
            return left != right
        if operation == "gt":
            return left > right
        if operation == "gte":
            return left >= right
        if operation == "lt":
            return left < right
        if operation == "lte":
            return left <= right
        if operation == "and":
            return left & right
        if operation == "or":
            return left | right
        if operation == "is_in":
            return left.is_in(
                cast(list[object], specification.right.value)
                if isinstance(specification.right, LiteralExpression)
                and isinstance(specification.right.value, list)
                else right
            )
        return left.fill_null(right)
    if isinstance(specification, UnaryExpression):
        operand = _compile_expression(specification.operand, columns)
        operations = {
            "not": lambda: ~operand,
            "is_null": operand.is_null,
            "is_not_null": operand.is_not_null,
            "abs": operand.abs,
            "lowercase": operand.str.to_lowercase,
            "uppercase": operand.str.to_uppercase,
            "year": operand.dt.year,
            "month": operand.dt.month,
            "day": operand.dt.day,
            "sum": operand.sum,
            "mean": operand.mean,
            "min": operand.min,
            "max": operand.max,
            "count": operand.count,
            "n_unique": operand.n_unique,
        }
        return operations[specification.op]()
    if isinstance(specification, StringExpression):
        operand = _compile_expression(specification.operand, columns).cast(pl.String)
        if specification.op == "contains":
            return operand.str.contains(
                specification.value,
                literal=specification.literal,
            )
        if specification.op == "starts_with":
            return operand.str.starts_with(specification.value)
        return operand.str.ends_with(specification.value)
    if isinstance(specification, CastExpression):
        data_type = {
            "string": pl.String,
            "integer": pl.Int64,
            "float": pl.Float64,
            "boolean": pl.Boolean,
            "datetime": pl.Datetime,
            "date": pl.Date,
        }[specification.dtype]
        return _compile_expression(specification.operand, columns).cast(
            data_type,
            strict=specification.strict,
        )
    if isinstance(specification, RoundExpression):
        return _compile_expression(specification.operand, columns).round(
            specification.decimals
        )
    if isinstance(specification, ConcatStringExpression):
        return pl.concat_str(
            [
                _compile_expression(operand, columns)
                for operand in specification.operands
            ],
            separator=specification.separator,
        )
    raise InvalidInputError("Unsupported expression operation")


def _compile_item(item: ExpressionItem, columns: set[str]) -> pl.Expr:
    expression = _compile_expression(item.expression, columns)
    return expression.alias(item.alias) if item.alias is not None else expression


def _apply_expression(
    lazyframe: pl.LazyFrame,
    request: ExpressionDerivation,
) -> pl.LazyFrame:
    columns = set(lazyframe.collect_schema().names())
    if request.context == "filter":
        return lazyframe.filter(_compile_item(request.expressions[0], columns))
    if request.context == "with_columns":
        return lazyframe.with_columns(
            _compile_item(item, columns) for item in request.expressions
        )
    if request.context == "select":
        return lazyframe.select(
            _compile_item(item, columns) for item in request.expressions
        )
    if request.context == "sort":
        pairs = [
            (_compile_item(item, columns), item.descending)
            for item in request.expressions
        ]
        return lazyframe.sort(
            [expression for expression, _ in pairs],
            descending=[descending for _, descending in pairs],
        )
    keys = [_compile_item(item, columns) for item in request.group_by]
    aggregations = [_compile_item(item, columns) for item in request.expressions]
    return lazyframe.group_by(keys).agg(aggregations)


def _aligned_concat_frames(nodes: list[Node]) -> list[pl.LazyFrame]:
    base_schema = nodes[0].data.collect_schema()
    base_names = base_schema.names()
    frames = [nodes[0].data.select(base_names)]
    for node in nodes[1:]:
        schema = node.data.collect_schema()
        missing = sorted(set(base_names) - set(schema.names()))
        extra = sorted(set(schema.names()) - set(base_names))
        mismatched = sorted(
            name
            for name in base_names
            if name in schema and schema[name] != base_schema[name]
        )
        if missing or extra or mismatched:
            raise InvalidInputError(
                "Concatenation sources must have identical columns and data types",
                details=cast(
                    dict[str, JsonData],
                    {
                        "node_id": node.id,
                        "missing": missing,
                        "extra": extra,
                        "mismatched": mismatched,
                    },
                ),
            )
        frames.append(node.data.select(base_names))
    return frames


def _parse_temporal(value: object) -> object:
    if not isinstance(value, str) or _ISO_PATTERN.fullmatch(value) is None:
        return value
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    if re.search(r"([+\-]\d{2})(\d{2})$", normalized):
        normalized = re.sub(r"([+\-]\d{2})(\d{2})$", r"\1:\2", normalized)
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return value


def _coerce_scalar(value: object) -> object:
    if not isinstance(value, str):
        return value
    lowered = value.casefold()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        return float(value) if "." in value else int(value)
    except ValueError:
        return value


def _temporal_literal(value: datetime, dtype: pl.DataType) -> pl.Expr:
    if isinstance(dtype, pl.Datetime):
        timezone_name = dtype.time_zone
        if timezone_name is None and value.tzinfo is not None:
            value = value.replace(tzinfo=None)
        elif timezone_name is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return pl.lit(value).cast(dtype)
    if dtype == pl.Date:
        return pl.lit(value.date()).cast(dtype)
    return pl.lit(value)


def count_non_empty_values(lazyframe: pl.LazyFrame, column: str) -> tuple[int, int]:
    """Rows in the block and values in ``column`` that are not empty.

    Used to tell users when a type change emptied values (issue 183).
    """

    dtype = lazyframe.collect_schema()[column]
    counts = lazyframe.select(
        pl.len().alias("rows"),
        (~_empty_value_expression(pl.col(column), dtype)).sum().alias("present"),
    ).collect()
    return int(counts["rows"][0]), int(counts["present"][0] or 0)


def _propagated_document(parents: list[Node], lazyframe: pl.LazyFrame) -> str | None:
    columns = set(lazyframe.collect_schema().names())
    values = {parent.document for parent in parents if parent.document in columns}
    return next(iter(values)) if len(values) == 1 else None


__all__ = [
    "count_non_empty_values",
    "build_derived_lazyframe",
    "build_derived_node",
    "build_edited_lazyframe",
]
