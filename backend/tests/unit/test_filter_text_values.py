"""Filter values on text columns stay text (found while building issue 149)."""

from __future__ import annotations

from datetime import date

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
