"""Each column's first value, as an example in the Delete columns window (issue 354).

One pass over the Data Block. Missing values, NaN and text that is only spaces
are skipped; a column with none of its own values gives ``None``.
"""

from __future__ import annotations

from typing import Any

import polars as pl

# Longer examples are cut here; the window shows one line of it anyway.
MAX_EXAMPLE_CHARS = 200


def _example_text(value: Any) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    if len(text) > MAX_EXAMPLE_CHARS:
        text = text[: MAX_EXAMPLE_CHARS - 1].rstrip() + "…"
    return text


def column_examples(lazyframe: pl.LazyFrame) -> dict[str, str | None]:
    """Each column's first non-empty value as short text, in column order."""

    schema = lazyframe.collect_schema()
    expressions: list[pl.Expr] = []
    for name, dtype in schema.items():
        values = pl.col(name)
        if dtype == pl.Object:
            expressions.append(pl.lit(None, dtype=pl.String).alias(name))
            continue
        if dtype == pl.String:
            values = values.filter(values.str.strip_chars().str.len_chars() > 0)
        elif dtype.is_float():
            values = values.filter(values.is_not_nan())
        expressions.append(values.drop_nulls().first().alias(name))
    if not expressions:
        return {}
    row = lazyframe.select(expressions).collect().row(0, named=True)
    return {name: _example_text(row[name]) for name in schema}


__all__ = ["MAX_EXAMPLE_CHARS", "column_examples"]
