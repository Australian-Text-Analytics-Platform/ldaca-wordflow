"""Group single-corpus Topic counts by a low-cardinality metadata column."""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

import polars as pl

from .topic_inclusion import topic_activation_thresholds

# More values than this cannot be told apart as blended bubble colours.
MAX_TOPIC_COLOR_GROUPS = 8
MISSING_GROUP_LABEL = "(missing)"


def _is_groupable_dtype(dtype: pl.DataType) -> bool:
    return (
        dtype.is_numeric()
        or dtype == pl.String
        or dtype == pl.Boolean
        or dtype == pl.Categorical
        or isinstance(dtype, pl.Enum)
    )


def eligible_color_columns(frame: pl.DataFrame, text_column: str) -> list[str]:
    """Return columns whose model rows hold 1 to 8 distinct non-missing values."""

    candidates = [
        name
        for name, dtype in frame.schema.items()
        if name != text_column and _is_groupable_dtype(dtype)
    ]
    if not candidates or frame.height == 0:
        return []
    distinct = frame.select(
        pl.col(name).drop_nulls().n_unique().alias(name) for name in candidates
    ).row(0, named=True)
    return [
        name
        for name in candidates
        if 1 <= int(distinct[name]) <= MAX_TOPIC_COLOR_GROUPS
    ]


def _group_label(value: Any) -> str:
    if value is None:
        return MISSING_GROUP_LABEL
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _json_value(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def group_topic_counts(
    values: Sequence[Any],
    documents: Sequence[dict[str, Any]],
    *,
    topic_count: int,
    top_n_topics: int,
) -> dict[str, Any]:
    """Count, per value, the documents whose Top-N Topics include each Topic.

    ``values[i]`` is the colour column value of model document ``i``. Groups
    are ordered by document count (largest first) with missing values last.
    ``topic_counts[topic_id][group_index]`` uses the same Top-N-with-ties rule
    as the corpus counts on each bubble.
    """

    if len(values) != len(documents):
        raise ValueError("Colour values do not align with Topic documents")
    keys = [None if value is None else _json_value(value) for value in values]
    document_counts: dict[Any, int] = {}
    for key in keys:
        document_counts[key] = document_counts.get(key, 0) + 1
    if len([key for key in document_counts if key is not None]) > (
        MAX_TOPIC_COLOR_GROUPS
    ):
        raise ValueError("Colour column has too many distinct values")
    ordered = sorted(
        document_counts,
        key=lambda key: (key is None, -document_counts[key], _group_label(key)),
    )
    group_index = {key: index for index, key in enumerate(ordered)}
    topic_counts = [[0] * len(ordered) for _ in range(topic_count)]
    for document in documents:
        index = int(document["doc_index"])
        group = group_index[keys[index]]
        for topic_id, minimum_n in topic_activation_thresholds(
            document.get("topic_coverage") or [], topic_count
        ):
            if minimum_n <= top_n_topics:
                topic_counts[topic_id][group] += 1
    return {
        "groups": [
            {
                "value": key,
                "label": _group_label(key),
                "document_count": document_counts[key],
                "missing": key is None,
            }
            for key in ordered
        ],
        "topic_counts": topic_counts,
    }


__all__ = [
    "MAX_TOPIC_COLOR_GROUPS",
    "MISSING_GROUP_LABEL",
    "eligible_color_columns",
    "group_topic_counts",
]
