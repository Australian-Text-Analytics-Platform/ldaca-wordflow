"""Column types that analyses and Data Block tools do not support yet.

Topic Coverage (issue 200) is the only such type. A Data Block detached from
Topic Modelling carries it, and the Data View shows it, but analyses leave it
out of the metadata they carry, show, or group by, and tools that read a
column as text, a group, a key, or an order refuse it with a clear message.

Used by the Concordance, Quotation, Trends, and Topic Modelling metadata
paths and by the Data Builder and Data Editor plan builders.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

import polars as pl

from .errors import InvalidInputError
from .topic_types import is_topic_coverage_storage_dtype


def is_unsupported_metadata_dtype(dtype: pl.DataType) -> bool:
    """Whether analyses and column tools cannot use a column of ``dtype`` yet.

    Matches the Topic Coverage extension and its physical storage, so a block
    read without the extension identity is treated the same way.
    """

    return is_topic_coverage_storage_dtype(dtype)


def supported_metadata_columns(
    schema: Mapping[str, pl.DataType],
    *,
    exclude: Iterable[str | None] = (),
) -> list[str]:
    """Column names, in order, that analyses may carry as metadata."""

    excluded = {name for name in exclude if name is not None}
    return [
        name
        for name, dtype in schema.items()
        if name not in excluded and not is_unsupported_metadata_dtype(dtype)
    ]


def without_unsupported_columns(
    data: pl.LazyFrame,
    *,
    keep: Iterable[str | None] = (),
) -> pl.LazyFrame:
    """Drop unsupported columns from a lazy plan, except those in ``keep``."""

    kept = {name for name in keep if name is not None}
    dropped = [
        name
        for name, dtype in data.collect_schema().items()
        if name not in kept and is_unsupported_metadata_dtype(dtype)
    ]
    return data.drop(dropped) if dropped else data


def unsupported_column_error(column: str, use: str) -> InvalidInputError:
    """The message shown when a request names an unsupported column."""

    return InvalidInputError(
        f'"{column}" holds topic coverage values, which cannot be used {use} yet. '
        "Choose another column."
    )


def require_supported_columns(
    schema: Mapping[str, pl.DataType],
    columns: Iterable[str | None],
    *,
    use: str,
) -> None:
    """Refuse the first named column whose type is unsupported.

    ``use`` completes the sentence "which cannot be used ... yet", for example
    "as a join key". Missing columns are left to the caller's own check.
    """

    for column in columns:
        if column is None:
            continue
        dtype = schema.get(column)
        if dtype is not None and is_unsupported_metadata_dtype(dtype):
            raise unsupported_column_error(column, use)


__all__ = [
    "is_unsupported_metadata_dtype",
    "require_supported_columns",
    "supported_metadata_columns",
    "unsupported_column_error",
    "without_unsupported_columns",
]
