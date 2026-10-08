"""Each column's first value for the Delete columns window (issue 354)."""

from __future__ import annotations

import datetime as dt

import polars as pl

from ldaca_wordflow.services.column_examples import MAX_EXAMPLE_CHARS, column_examples


def test_first_non_empty_value_of_each_column() -> None:
    frame = pl.LazyFrame(
        {
            "text": [None, "  ", "First\nline  here", "later"],
            "score": [None, float("nan"), 2.5, 3.0],
            "count": [None, None, None, 7],
            "empty": pl.Series([None, None, None, None], dtype=pl.String),
            "when": [None, dt.date(2020, 1, 30), None, None],
            "tags": [None, ["a", "b"], None, None],
        }
    )

    assert column_examples(frame) == {
        "text": "First line here",
        "score": "2.5",
        "count": "7",
        "empty": None,
        "when": "2020-01-30",
        "tags": "['a', 'b']",
    }


def test_long_values_are_cut_and_empty_blocks_give_none() -> None:
    long = "word " * 100
    examples = column_examples(pl.LazyFrame({"long": [long]}))
    assert len(examples["long"] or "") == MAX_EXAMPLE_CHARS
    assert (examples["long"] or "").endswith("…")
    assert column_examples(pl.LazyFrame({"a": pl.Series([], dtype=pl.Int64)})) == {"a": None}
