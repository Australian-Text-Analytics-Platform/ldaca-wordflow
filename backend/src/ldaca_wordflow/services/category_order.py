"""Ordered category columns (issue 318).

A category column is a Polars ``Enum`` whose categories are its values in the
order the user chose. Converting to category reads the column's values as text
labels, lists them in a default order for the conversion window, and casts to
an ``Enum`` of the chosen order. Empty values (missing or blank text) are never
a category: they stay missing and sort last.

Used by: the category values endpoint behind the conversion window, the cast
edit (``node_casting``), and Stack, which merges two orders.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Literal

import polars as pl

from ..shared.empty_values import empty_value_expression
from ..shared.errors import InvalidInputError

# The window warns above this many values: the list is long to scroll and
# adjust, but the user decides (Chao, 2026-10-07).
WARN_CATEGORY_VALUES = 150
# A technical ceiling, so a free-text column (every row different) cannot put
# hundreds of thousands of values into the window and the column's type.
MAX_CATEGORY_VALUES = 10_000
# Rows read first, so a column that is clearly not a category (a document
# column, free text) is noticed before the whole column is read.
PROBE_ROWS = 10_000

# Date-and-time values become readable labels rather than Polars' text form
# ("2020-01-01 09:00:00.000000+00:00").
DATETIME_LABEL_FORMAT = "%Y-%m-%d %H:%M:%S"
DATE_LABEL_FORMAT = "%Y-%m-%d"

OrderKind = Literal["text", "value"]


@dataclass(frozen=True)
class CategoryValues:
    """A column's values as category labels, in their default order."""

    kind: OrderKind
    labels: list[str]
    counts: list[int]
    empty_count: int
    is_ordered: bool
    # False when only the first rows were read because they already held more
    # than WARN_CATEGORY_VALUES values; the window asks before reading the rest.
    complete: bool = True
    sample_rows: int = 0
    sample_distinct: int = 0


def is_category_dtype(dtype: pl.DataType) -> bool:
    return isinstance(dtype, (pl.Categorical, pl.Enum))


def order_kind(dtype: pl.DataType) -> OrderKind:
    """Numbers, dates and true/false keep their value order; text sorts A to Z."""

    if dtype.is_numeric() or dtype.is_temporal() or dtype == pl.Boolean:
        return "value"
    return "text"


def _check_convertible(column: str, dtype: pl.DataType) -> None:
    if isinstance(dtype, (pl.List, pl.Array, pl.Struct, pl.Object, pl.Binary)):
        raise InvalidInputError(
            f'"{column}" holds lists or other structured values, so it can\'t become '
            "a category."
        )
    if isinstance(dtype, (pl.Time, pl.Duration)):
        raise InvalidInputError(
            f'"{column}" holds times of day or durations, so it can\'t become a category.'
        )


def category_label_expression(column: str, dtype: pl.DataType) -> pl.Expr:
    """The column's values as category labels; empty values become null."""

    _check_convertible(column, dtype)
    value = pl.col(column)
    if isinstance(dtype, pl.Datetime):
        text = value.dt.strftime(DATETIME_LABEL_FORMAT)
    elif dtype == pl.Date:
        text = value.dt.strftime(DATE_LABEL_FORMAT)
    else:
        text = value.cast(pl.String)
    return pl.when(empty_value_expression(value, dtype)).then(None).otherwise(text)


def natural_key(label: str) -> tuple:
    """A to Z ignoring case, with numbers inside labels compared as numbers.

    "Q9" sorts before "Q10", and "apple" before "Banana". Ties keep a stable
    order by the exact text.
    """

    parts = re.split(r"(\d+)", label)
    key = tuple(
        (0, int(part), "") if part.isdigit() else (1, 0, part.casefold())
        for part in parts
        if part
    )
    return key, label


@dataclass(frozen=True)
class ValueCounts:
    """A column's most common labels, and what falls beyond the limit."""

    labels: list[str]
    counts: list[int]
    empty_count: int
    distinct_count: int
    unlisted_values: int
    unlisted_rows: int


def value_counts(lazyframe: pl.LazyFrame, column: str, *, limit: int) -> ValueCounts:
    """The ``limit`` most common labels with counts, ties A to Z (Map values, issue 368).

    Labels are the category labels, so a mapping made from them matches
    numbers and dates as shown. Unlike ``category_values`` there is no
    ceiling: free text simply lists its most common values.
    """

    schema = lazyframe.collect_schema()
    if column not in schema:
        raise InvalidInputError(f'Column "{column}" was not found.')
    label = category_label_expression(column, schema[column])
    counted = (
        lazyframe.select(label.alias("label"))
        .group_by("label")
        .agg(pl.len().alias("count"))
        .collect()
    )
    empty = counted.filter(pl.col("label").is_null())
    empty_count = int(empty["count"].sum()) if empty.height else 0
    rows = [
        (str(value), int(count))
        for value, count in counted.filter(pl.col("label").is_not_null()).iter_rows()
    ]
    rows.sort(key=lambda row: (-row[1], natural_key(row[0])))
    listed = rows[:limit]
    rest = rows[limit:]
    return ValueCounts(
        labels=[value for value, _ in listed],
        counts=[count for _, count in listed],
        empty_count=empty_count,
        distinct_count=len(rows),
        unlisted_values=len(rest),
        unlisted_rows=sum(count for _, count in rest),
    )


def category_values(
    lazyframe: pl.LazyFrame,
    column: str,
    *,
    read_all: bool = True,
    sample_only: bool = False,
) -> CategoryValues:
    """List a column's labels in default order, refusing more than 10,000 values.

    Without ``read_all``, the first 10,000 rows are read first; when they hold
    more than 150 values the column is probably not a category, so the result
    stops there (``complete`` False) and the window asks before reading on.
    ``sample_only`` always stops there (the Data Block's document column).

    An existing ordered category keeps its order (its categories, including
    any not present in the rows). Text and unordered categories sort A to Z in
    natural order; numbers, dates and true/false by value.
    """

    schema = lazyframe.collect_schema()
    if column not in schema:
        raise InvalidInputError(f'Column "{column}" was not found.')
    dtype = schema[column]
    label = category_label_expression(column, dtype)
    kind = order_kind(dtype)
    if not read_all and not isinstance(dtype, pl.Enum):
        sample = lazyframe.head(PROBE_ROWS).select(label.alias("label")).collect()
        distinct = sample["label"].drop_nulls().n_unique()
        # A column shorter than the sample has been read already: list it.
        whole_column = sample.height < PROBE_ROWS
        if sample_only or (distinct > WARN_CATEGORY_VALUES and not whole_column):
            return CategoryValues(
                kind=kind,
                labels=[],
                counts=[],
                empty_count=0,
                is_ordered=False,
                complete=False,
                sample_rows=sample.height,
                sample_distinct=int(distinct),
            )
    sort_key = pl.col(column) if kind == "value" else label
    frame = (
        lazyframe.select(label.alias("label"), sort_key.alias("key"))
        .group_by("label")
        .agg(pl.len().alias("count"), pl.col("key").min().alias("key"))
        .collect()
    )
    empty_rows = frame.filter(pl.col("label").is_null())
    empty_count = int(empty_rows["count"].sum()) if empty_rows.height else 0
    present = frame.filter(pl.col("label").is_not_null())
    if present.height > MAX_CATEGORY_VALUES:
        raise InvalidInputError(
            f'"{column}" has {present.height:,} different values. A category column can '
            f"have at most {MAX_CATEGORY_VALUES:,}, so it is better kept as text."
        )
    counts = dict(zip(present["label"].to_list(), present["count"].to_list(), strict=True))
    if isinstance(dtype, pl.Enum):
        labels = list(dtype.categories.to_list())
    elif kind == "value":
        labels = present.sort("key")["label"].to_list()
    else:
        labels = sorted(counts, key=natural_key)
    return CategoryValues(
        kind=kind,
        labels=labels,
        counts=[int(counts.get(label, 0)) for label in labels],
        empty_count=empty_count,
        is_ordered=isinstance(dtype, pl.Enum),
    )


def validate_order(categories: list[str]) -> list[str]:
    """Check a chosen order: non-empty, distinct labels, at most 10,000."""

    if not categories:
        raise InvalidInputError("Choose an order with at least one value.")
    if len(categories) > MAX_CATEGORY_VALUES:
        raise InvalidInputError(
            f"A category column can have at most {MAX_CATEGORY_VALUES:,} values."
        )
    if any(not label.strip() for label in categories):
        raise InvalidInputError("Empty values can't be a category; they always come last.")
    if len(set(categories)) != len(categories):
        raise InvalidInputError("Each value can appear only once in the order.")
    return categories


def ordered_category_expression(
    lazyframe: pl.LazyFrame, column: str, categories: list[str]
) -> pl.Expr:
    """Cast ``column`` to an Enum of ``categories``, checking nothing is lost.

    Every non-empty value must be in the order: a value left out would become
    empty without warning.
    """

    validate_order(categories)
    dtype = lazyframe.collect_schema()[column]
    label = category_label_expression(column, dtype)
    present = (
        lazyframe.select(label.alias("label"))
        .unique()
        .drop_nulls()
        .collect()["label"]
        .to_list()
    )
    missing = sorted(set(present) - set(categories), key=natural_key)
    if missing:
        shown = ", ".join(f'"{value}"' for value in missing[:3])
        raise InvalidInputError(
            f"The order leaves out {shown}{' and others' if len(missing) > 3 else ''}. "
            "Open the conversion again so every value is listed."
        )
    return label.cast(pl.Enum(categories)).alias(column)


def default_order_expression(lazyframe: pl.LazyFrame, column: str) -> pl.Expr:
    """Cast to an Enum in the default order (for requests without an order)."""

    labels = category_values(lazyframe, column).labels
    if not labels:
        raise InvalidInputError(f'"{column}" has only empty values, so it can\'t become a category.')
    return ordered_category_expression(lazyframe, column, labels)


def merge_orders(orders: list[list[str]]) -> tuple[list[str], bool]:
    """Combine category orders for Stack; return (order, kept).

    When the orders never disagree about which of two values comes first, the
    result keeps every order (kept is True). Otherwise it falls back to A to Z
    in natural order (kept is False).
    """

    values: list[str] = []
    for order in orders:
        values.extend(value for value in order if value not in values)
    after: dict[str, set[str]] = {value: set() for value in values}
    for order in orders:
        for index, value in enumerate(order):
            after[value].update(order[index + 1 :])
    remaining = list(values)
    merged: list[str] = []
    while remaining:
        ready = [
            value
            for value in remaining
            if not any(value in after[other] for other in remaining if other != value)
        ]
        if not ready:
            return sorted(values, key=natural_key), False
        merged.append(ready[0])
        remaining.remove(ready[0])
    return merged, True


def stacked_category_order(
    ordered: list[list[str]], unordered: set[str]
) -> tuple[list[str], bool]:
    """The order of a category column stacked from several Data Blocks.

    ``ordered`` holds each ordered category's order; ``unordered`` the values of
    unordered ones, which add values but no order. Returns (order, kept): kept
    is False when the orders disagreed and the result fell back to A to Z.
    """

    merged, kept = merge_orders(ordered) if ordered else ([], True)
    extra = sorted(unordered - set(merged), key=natural_key)
    return merged + extra, kept


UNREADABLE_ORDER_REASON = (
    "the file gives it an order Wordflow can't read, so its values are listed A to Z. "
    "Click its type to set the order"
)


def unreadable_order_notes(path: Path, frame: pl.DataFrame) -> list[dict[str, str]]:
    """Load notes for category columns a Parquet file marks as ordered.

    pandas records which categories are ordered, but the order itself sits in
    the file's data pages, which Polars does not read, so the column loads as
    an unordered category. Used by: NodeService when a Parquet file is added.
    """

    if path.suffix.lower() != ".parquet":
        return []
    try:
        metadata = pl.read_parquet_metadata(path)
        pandas = json.loads(metadata.get("pandas", "{}"))
    except Exception:
        return []
    notes = []
    for column in pandas.get("columns", []):
        name = column.get("name")
        ordered = (column.get("metadata") or {}).get("ordered") is True
        if (
            ordered
            and isinstance(name, str)
            and name in frame.columns
            and is_category_dtype(frame.schema[name])
        ):
            notes.append(
                {
                    "column": name,
                    "from_dtype": "ordered category",
                    "to_dtype": "category",
                    "reason": UNREADABLE_ORDER_REASON,
                }
            )
    return notes
