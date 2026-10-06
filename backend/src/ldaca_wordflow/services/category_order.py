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
import re
from typing import Literal

import polars as pl

from ..shared.empty_values import empty_value_expression
from ..shared.errors import InvalidInputError

MAX_CATEGORY_VALUES = 50
MAX_CUSTOM_ORDER_VALUES = 12

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


def category_values(lazyframe: pl.LazyFrame, column: str) -> CategoryValues:
    """List a column's labels in default order, refusing more than 50 values.

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
            f"have at most {MAX_CATEGORY_VALUES}. Group or clean the values first."
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
    """Check a chosen order: non-empty, distinct labels, at most 50."""

    if not categories:
        raise InvalidInputError("Choose an order with at least one value.")
    if len(categories) > MAX_CATEGORY_VALUES:
        raise InvalidInputError(
            f"A category column can have at most {MAX_CATEGORY_VALUES} values."
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
