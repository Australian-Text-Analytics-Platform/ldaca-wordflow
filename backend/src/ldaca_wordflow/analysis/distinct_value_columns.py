"""Columns with few enough different values to group or colour results by.

One rule for every tool that offers such columns: Topic Modelling's Colour by
(2 to 8 values, issue 153) and the Trends group columns (up to 16). A column
counts its distinct values without the missing ones.
"""

from __future__ import annotations

from collections.abc import Callable, Collection

import polars as pl

# Rows read first to rule columns out. A column with more distinct values than
# the limit in these rows has more in the whole table too, so a long text or
# identifier column is dropped without reading all of it.
SAMPLE_ROWS = 10_000


def is_groupable_dtype(dtype: pl.DataType) -> bool:
    """Numbers, text, true/false and categories: values a legend can list."""

    return (
        dtype.is_numeric()
        or dtype == pl.String
        or dtype == pl.Boolean
        or dtype == pl.Categorical
        or isinstance(dtype, pl.Enum)
    )


def is_groupable_or_temporal_dtype(dtype: pl.DataType) -> bool:
    """The above, and dates, times and elapsed time, which Trends also groups by."""

    return is_groupable_dtype(dtype) or dtype.is_temporal()


def columns_by_distinct_values(
    data: pl.DataFrame | pl.LazyFrame,
    *,
    minimum: int,
    maximum: int,
    exclude: Collection[str] = (),
    accepts: Callable[[pl.DataType], bool] = is_groupable_dtype,
) -> dict[str, int]:
    """Map each column holding ``minimum`` to ``maximum`` distinct non-missing
    values to that number, in column order.

    ``accepts`` says which column types qualify; ``exclude`` names columns to
    leave out, such as the text column.
    """

    lazy = data.lazy()
    candidates = [
        name
        for name, dtype in lazy.collect_schema().items()
        if name not in exclude and accepts(dtype)
    ]

    def distinct_counts(frame: pl.LazyFrame, names: list[str]) -> dict[str, int]:
        row = (
            frame.select(pl.col(name).drop_nulls().n_unique().alias(name) for name in names)
            .collect()
            .row(0, named=True)
        )
        return {name: int(row[name]) for name in names}

    if candidates:
        sampled = distinct_counts(lazy.head(SAMPLE_ROWS), candidates)
        candidates = [name for name in candidates if sampled[name] <= maximum]
    if not candidates:
        return {}
    distinct = distinct_counts(lazy, candidates)
    return {
        name: distinct[name]
        for name in candidates
        if minimum <= distinct[name] <= maximum
    }


__all__ = [
    "SAMPLE_ROWS",
    "columns_by_distinct_values",
    "is_groupable_dtype",
    "is_groupable_or_temporal_dtype",
]
