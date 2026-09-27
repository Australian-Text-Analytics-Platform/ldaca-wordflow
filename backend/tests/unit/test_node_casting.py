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

    assert "can't convert columns to boolean yet" in exc_info.value.message


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


def test_failed_cast_explains_in_plain_words_and_keeps_the_diagnostic() -> None:
    """Issue 205: the reason and what to do; Polars' text is for Details."""

    lazyframe = pl.DataFrame({"when": ["2020-01-30", "not a date"]}).lazy()

    with pytest.raises(InvalidInputError) as exc_info:
        cast_lazyframe_column(
            lazyframe,
            column_name="when",
            target_type="datetime",
            datetime_format="%d/%m/%Y",
            strict=True,
        )

    message = exc_info.value.message
    assert message.startswith('Some values in "when"')
    assert "%d/%m/%Y" in message
    assert message.endswith("Nothing was changed.")
    assert "notebook" not in message
    assert exc_info.value.details and "diagnostic" in exc_info.value.details
