"""Unit tests for the cast operation used by immutable node derivations."""

from __future__ import annotations

import polars as pl
import pytest

from ldaca_wordflow.shared.errors import InvalidInputError
from ldaca_wordflow.services.node_casting import cast_lazyframe_column


def test_cast_lazyframe_column_converts_integer_strings() -> None:
    """Integer casts return a new lazy frame plus response metadata."""

    lazyframe = pl.DataFrame({"value": ["1", "2", "bad"]}).lazy()

    result = cast_lazyframe_column(
        lazyframe,
        column_name="value",
        target_type="integer",
    )

    collected = result.lazyframe.collect()
    assert str(collected.schema["value"]) == "Int64"
    assert collected["value"].to_list() == [1, 2, None]
    assert result.original_type == "String"
    assert result.new_type == "Int64"
    assert result.strict_used is None


def test_cast_lazyframe_column_rejects_unsupported_target() -> None:
    """Unsupported target names fail with the shared input-error type."""

    lazyframe = pl.DataFrame({"value": [1, 2, 3]}).lazy()

    with pytest.raises(InvalidInputError) as exc_info:
        cast_lazyframe_column(
            lazyframe,
            column_name="value",
            target_type="boolean",
        )

    assert "not yet supported" in exc_info.value.message


def test_date_columns_convert_to_datetime_without_text_parsing() -> None:
    """A real Date column (such as one read from Excel) converts (issue 165)."""

    import datetime as dt

    frame = pl.LazyFrame({"Date adopted": [dt.date(2020, 1, 31), None]})
    result = cast_lazyframe_column(
        frame, column_name="Date adopted", target_type="datetime"
    )
    assert result.original_type == "Date"
    values = result.lazyframe.collect()["Date adopted"].to_list()
    assert values[0] == dt.datetime(2020, 1, 31, tzinfo=dt.UTC)
    assert values[1] is None

    as_text = cast_lazyframe_column(
        frame,
        column_name="Date adopted",
        target_type="string",
        datetime_format="%d/%m/%Y",
    )
    assert as_text.lazyframe.collect()["Date adopted"].to_list() == ["31/01/2020", None]
