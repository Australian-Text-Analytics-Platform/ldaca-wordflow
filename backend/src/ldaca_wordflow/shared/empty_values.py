"""One meaning of "empty" for filtering and sorting.

Missing values, NaN, and empty or whitespace-only text are all empty: null
and "" differ to data scientists but not to researchers reading texts
(issue 166). Used by: the Filter's is empty / is not empty, the type-change
emptied report, and every table sort, which puts empty values last in both
directions (issue 317).
"""

from __future__ import annotations

import polars as pl


def empty_value_expression(column: pl.Expr, dtype: pl.DataType) -> pl.Expr:
    """True where ``column`` (of type ``dtype``) is empty."""

    missing = column.is_null()
    if dtype == pl.String or isinstance(dtype, (pl.Categorical, pl.Enum)):
        return missing | (column.cast(pl.String).str.strip_chars() == "")
    if dtype.is_float():
        return missing | column.is_nan()
    return missing


def empty_last_key(
    column: str, dtype: pl.DataType, key: pl.Expr | None = None
) -> pl.Expr:
    """Sort key for ``column`` with every empty value turned into null.

    Sort with ``nulls_last=True`` so empty values come last whichever way the
    table is sorted. ``key`` replaces the plain column, for example a
    case-folded copy; emptiness is still judged on the column itself.
    """

    value = pl.col(column)
    return (
        pl.when(empty_value_expression(value, dtype))
        .then(None)
        .otherwise(value if key is None else key)
    )
