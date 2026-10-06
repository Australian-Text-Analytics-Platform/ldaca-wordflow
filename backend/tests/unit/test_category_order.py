"""Ordered category columns (issue 318)."""

from __future__ import annotations

import datetime as dt
import json
from types import SimpleNamespace
from typing import Any, cast

import polars as pl
import pytest

from ldaca_wordflow.analysis.sequential_core import _build_sequential_result_frames
from ldaca_wordflow.services.category_order import (
    category_values,
    merge_orders,
    natural_key,
    stacked_category_order,
    unreadable_order_notes,
)
from ldaca_wordflow.services.node_casting import cast_lazyframe_column
from ldaca_wordflow.services.node_operations import _aligned_concat_frames
from ldaca_wordflow.shared.errors import InvalidInputError

ORDER = pl.Enum(["Low", "Mid", "High"])


def test_text_lists_a_to_z_with_numbers_compared_as_numbers() -> None:
    frame = pl.LazyFrame({"q": ["Q10", "q9", " ", None, "agree", "Q10"]})

    values = category_values(frame, "q")

    assert values.kind == "text"
    assert values.labels == ["agree", "q9", "Q10"]
    assert values.counts == [1, 1, 2]
    # Blank text and missing values are empty, never a category.
    assert values.empty_count == 2


def test_numbers_and_dates_list_by_value() -> None:
    frame = pl.LazyFrame(
        {
            "n": [10, 9, None, 1],
            "d": [dt.datetime(2020, 1, 2, 9), dt.datetime(2020, 1, 1), None, None],
        }
    )

    assert category_values(frame, "n").labels == ["1", "9", "10"]
    assert category_values(frame, "d").labels == [
        "2020-01-01 00:00:00",
        "2020-01-02 09:00:00",
    ]


def test_an_ordered_category_lists_its_own_order() -> None:
    frame = pl.LazyFrame({"x": ["High", "Low"]}).with_columns(pl.col("x").cast(ORDER))

    values = category_values(frame, "x")

    assert values.labels == ["Low", "Mid", "High"]
    assert values.counts == [1, 0, 1]
    assert values.is_ordered


def test_more_than_fifty_values_is_refused() -> None:
    frame = pl.LazyFrame({"x": [f"v{i}" for i in range(51)]})

    with pytest.raises(InvalidInputError, match="at most 50"):
        category_values(frame, "x")


def test_conversion_uses_the_chosen_order_and_empties_blank_text() -> None:
    frame = pl.LazyFrame({"x": ["High", " ", "Low", None, "Mid"]})

    result = cast_lazyframe_column(
        frame, column_name="x", target_type="categorical", categories=["Low", "Mid", "High"]
    )

    assert result.lazyframe.collect_schema()["x"] == ORDER
    assert result.lazyframe.sort("x", nulls_last=True).collect()["x"].to_list() == [
        "Low",
        "Mid",
        "High",
        None,
        None,
    ]


def test_an_order_that_leaves_out_a_value_is_refused() -> None:
    frame = pl.LazyFrame({"x": ["High", "Low"]})

    with pytest.raises(InvalidInputError, match="leaves out"):
        cast_lazyframe_column(
            frame, column_name="x", target_type="categorical", categories=["Low"]
        )


def test_a_category_column_converts_to_date_and_time() -> None:
    frame = pl.LazyFrame({"x": ["2020-01-02", None]}).with_columns(
        pl.col("x").cast(pl.Categorical)
    )

    result = cast_lazyframe_column(frame, column_name="x", target_type="datetime")

    assert result.lazyframe.collect()["x"][0] == dt.datetime(2020, 1, 2, tzinfo=dt.UTC)


def test_orders_merge_when_they_agree_and_fall_back_to_a_to_z_otherwise() -> None:
    assert merge_orders([["Low", "Mid", "High"], ["Low", "High"]]) == (
        ["Low", "Mid", "High"],
        True,
    )
    assert merge_orders([["b", "a"], ["a", "b"]]) == (["a", "b"], False)
    assert stacked_category_order([["Low", "High"]], {"Extra", "Low"}) == (
        ["Low", "High", "Extra"],
        True,
    )
    assert sorted(["Q10", "Q9", "q1"], key=natural_key) == ["q1", "Q9", "Q10"]


def test_stack_combines_category_orders() -> None:
    first = SimpleNamespace(
        id=1, data=pl.LazyFrame({"x": ["Low"]}).with_columns(pl.col("x").cast(ORDER))
    )
    second = SimpleNamespace(
        id=2,
        data=pl.LazyFrame({"x": ["High", "Extra"]}).with_columns(
            pl.col("x").cast(pl.Categorical)
        ),
    )

    stacked = pl.concat(_aligned_concat_frames(cast(Any, [first, second])))

    assert stacked.collect_schema()["x"] == pl.Enum(["Low", "Mid", "High", "Extra"])


def test_stack_still_refuses_a_category_against_text() -> None:
    first = SimpleNamespace(
        id=1, data=pl.LazyFrame({"x": ["Low"]}).with_columns(pl.col("x").cast(ORDER))
    )
    second = SimpleNamespace(id=2, data=pl.LazyFrame({"x": ["High"]}))

    with pytest.raises(InvalidInputError, match="identical columns"):
        _aligned_concat_frames(cast(Any, [first, second]))


def test_trends_category_axis_follows_the_order_with_empty_last() -> None:
    frame = pl.LazyFrame(
        {"x": ["High", None, "Low", "Mid", "Low"], "g": ["b", "a", None, "a", "b"]}
    ).with_columns(pl.col("x").cast(ORDER))

    result, publication = _build_sequential_result_frames(
        frame, time_column="x", group_by_columns=["g"], column_type="category"
    )

    periods = result.unique("period_index").sort("period_index")
    assert periods["time_period_formatted"].to_list() == ["Low", "Mid", "High", "(empty)"]
    # The missing group comes last (issue 317).
    groups = result.unique("group_index").sort("group_index")["g"].to_list()
    assert groups == ["a", "b", None]
    assert publication.height == 5


def test_a_parquet_order_that_cannot_be_read_is_noted(tmp_path) -> None:
    path = tmp_path / "survey.parquet"
    frame = pl.DataFrame({"o": ["Low", "High"], "a": ["x", "y"]}).with_columns(
        pl.all().cast(pl.Categorical)
    )
    pandas = {
        "columns": [
            {"name": "o", "metadata": {"num_categories": 3, "ordered": True}},
            {"name": "a", "metadata": {"num_categories": 2, "ordered": False}},
        ]
    }
    frame.write_parquet(path, metadata={"pandas": json.dumps(pandas)})

    notes = unreadable_order_notes(path, pl.read_parquet(path))

    assert [note["column"] for note in notes] == ["o"]
    assert "Click its type to set the order" in notes[0]["reason"]
