"""Filter values on text columns stay text (found while building issue 149)."""

from __future__ import annotations

from datetime import date, datetime

import polars as pl
import pytest

from ldaca_wordflow.domain.workspace.provenance import FilterCondition
from ldaca_wordflow.services.node_operations import _condition_expression

FRAME = pl.LazyFrame({"code": ["2020", "x", None], "year": [2020, 1999, None]})


@pytest.mark.parametrize(
    ("column", "operator", "value"),
    [
        ("code", "eq", "2020"),
        ("code", "in", ["2020"]),
        ("year", "eq", "2020"),
        ("year", "in", [2020]),
    ],
)
def test_numeric_looking_values_match_by_column_type(
    column: str, operator: str, value: object
) -> None:
    condition = FilterCondition.model_validate(
        {"column": column, "operator": operator, "value": value}
    )
    matched = FRAME.filter(
        _condition_expression(condition, dict(FRAME.collect_schema()))
    ).collect()
    assert matched["code"].to_list() == ["2020"]


EMPTY_FRAME = pl.LazyFrame(
    {
        "text": ["", None, "hello", "  "],
        "score": [1.0, float("nan"), None, 2.0],
        "count": [1, None, 3, 4],
    }
)


@pytest.mark.parametrize(
    ("column", "empty_rows"),
    [("text", [0, 1, 3]), ("score", [1, 2]), ("count", [1])],
)
def test_is_empty_treats_blank_text_and_nan_as_missing(
    column: str, empty_rows: list[int]
) -> None:
    """Issue 166: null, NaN, and blank text are all "empty" to HASS users."""

    schema = dict(EMPTY_FRAME.collect_schema())
    indexed = EMPTY_FRAME.with_row_index()
    empty = _condition_expression(
        FilterCondition(column=column, operator="is_null"), schema
    )
    not_empty = _condition_expression(
        FilterCondition(column=column, operator="is_not_null"), schema
    )
    assert indexed.filter(empty).collect()["index"].to_list() == empty_rows
    assert sorted(
        indexed.filter(not_empty).collect()["index"].to_list() + empty_rows
    ) == [0, 1, 2, 3]


DATE_FRAME = pl.LazyFrame({"published": [date(2020, 1, 31), date(2021, 3, 1), None]})


@pytest.mark.parametrize(
    ("operator", "value", "expected"),
    [
        ("gt", "2020-06-01T00:00:00.000Z", [1]),
        ("lt", "2020-06-01", [0]),
        ("eq", "2020-01-31T00:00:00.000Z", [0]),
        ("between", {"start": "2020-01-01", "end": "2020-12-31"}, [0]),
        ("is_null", None, [2]),
    ],
)
def test_filter_compares_date_columns(
    operator: str, value: object, expected: list[int]
) -> None:
    """Issue 187: Date columns filter with the date pickers' ISO values."""

    schema = dict(DATE_FRAME.collect_schema())
    condition = FilterCondition.model_validate(
        {"column": "published", "operator": operator, "value": value}
    )
    matched = (
        DATE_FRAME.with_row_index()
        .filter(_condition_expression(condition, schema))
        .collect()["index"]
        .to_list()
    )
    assert matched == expected


NUMBER_FRAME = pl.LazyFrame(
    {"age": [18, 26, 30, 31, None], "score": [0.0, 2.5, 30.5, -1.0, None]}
)


@pytest.mark.parametrize(
    ("column", "value", "expected"),
    [
        ("age", {"start": "26", "end": "30"}, [1, 2]),
        ("age", {"start": "26", "end": None}, [1, 2, 3]),
        ("age", {"start": None, "end": "26"}, [0, 1]),
        ("score", {"start": "0", "end": "30.5"}, [0, 1, 2]),
        ("score", {"start": "-1", "end": "0"}, [0, 3]),
    ],
)
def test_filter_between_on_number_columns(
    column: str, value: dict[str, str | None], expected: list[int]
) -> None:
    """Issue 277: numeric between, both ends included, either end optional;
    the Filter sends the edges as text."""

    schema = dict(NUMBER_FRAME.collect_schema())
    condition = FilterCondition.model_validate(
        {"column": column, "operator": "between", "value": value}
    )
    matched = (
        NUMBER_FRAME.with_row_index()
        .filter(_condition_expression(condition, schema))
        .collect()["index"]
        .to_list()
    )
    assert matched == expected


@pytest.mark.parametrize(
    ("column", "value", "message"),
    [
        ("age", {"start": "abc", "end": "5"}, "is not a number"),
        ("age", {"start": "2020-01-01", "end": None}, "is not a number"),
        ("score", {"start": "", "end": ""}, "require a start or end"),
    ],
)
def test_filter_between_refuses_edges_it_cannot_read(
    column: str, value: dict[str, str | None], message: str
) -> None:
    """Issue 289: an unparsable edge was looked up as a column name."""

    from ldaca_wordflow.shared.errors import InvalidInputError

    schema = dict(NUMBER_FRAME.collect_schema())
    condition = FilterCondition.model_validate(
        {"column": column, "operator": "between", "value": value}
    )
    with pytest.raises(InvalidInputError, match=message):
        _condition_expression(condition, schema)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ({"start": " 30 ", "end": ""}, [2, 3]),
        # Exponent notation, which a number box accepts, is a number too.
        ({"start": "1e1", "end": "3E1"}, [0, 1, 2]),
    ],
)
def test_filter_between_on_number_columns_reads_edges_as_numbers(
    value: dict[str, str], expected: list[int]
) -> None:
    schema = dict(NUMBER_FRAME.collect_schema())
    condition = FilterCondition.model_validate(
        {"column": "age", "operator": "between", "value": value}
    )
    matched = (
        NUMBER_FRAME.with_row_index()
        .filter(_condition_expression(condition, schema))
        .collect()["index"]
        .to_list()
    )
    assert matched == expected


DATETIME_FRAME = pl.LazyFrame(
    {
        "posted": [
            datetime(2020, 12, 30, 9, 0),
            datetime(2020, 12, 31, 0, 0),
            datetime(2020, 12, 31, 15, 30),
            datetime(2021, 1, 1, 0, 0),
            None,
        ]
    }
)


@pytest.mark.parametrize(
    ("operator", "value", "expected"),
    [
        # A calendar date as the upper end covers that whole day.
        ("between", {"start": "2020-12-30", "end": "2020-12-31"}, [0, 1, 2]),
        ("between", {"start": None, "end": "2020-12-31"}, [0, 1, 2]),
        ("lte", "2020-12-31", [0, 1, 2]),
        # The lower end starts at midnight, so it already includes the day.
        ("between", {"start": "2020-12-31", "end": None}, [1, 2, 3]),
        ("gte", "2020-12-31", [1, 2, 3]),
        # An exact date-time is compared as typed, both ends included.
        (
            "between",
            {"start": "2020-12-30T09:00:00Z", "end": "2020-12-31T15:30:00Z"},
            [0, 1, 2],
        ),
        ("lte", "2020-12-31T00:00:00Z", [0, 1]),
    ],
)
def test_date_ranges_include_the_whole_last_day(
    operator: str, value: object, expected: list[int]
) -> None:
    """Issue 311: ranges include both ends; on a date-and-time column an end
    given as a calendar date includes all of that day, not just midnight."""

    schema = dict(DATETIME_FRAME.collect_schema())
    condition = FilterCondition.model_validate(
        {"column": "posted", "operator": operator, "value": value}
    )
    matched = (
        DATETIME_FRAME.with_row_index()
        .filter(_condition_expression(condition, schema))
        .collect()["index"]
        .to_list()
    )
    assert matched == expected

