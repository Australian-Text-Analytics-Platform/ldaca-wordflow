"""A Join Data Block has one row order in every Polars engine (issue 319)."""

from __future__ import annotations

import polars as pl
import pytest

from ldaca_wordflow.services.node_operations import ordered_join

ROWS = 60_000


def _sides() -> tuple[pl.LazyFrame, pl.LazyFrame]:
    left = pl.LazyFrame(
        {"doc": list(range(ROWS)), "user": [f"u{i % 997}" for i in range(ROWS)]}
    )
    right = pl.LazyFrame(
        {"user": [f"u{i}" for i in range(0, 1200, 2)], "gender": ["F", "M"] * 300}
    )
    return left, right


@pytest.mark.parametrize("how", ["inner", "left", "right", "full", "semi", "anti"])
def test_every_join_gives_the_same_rows_in_both_engines(how: str) -> None:
    left, right = _sides()
    joined = ordered_join(
        left, right, how=how, left_on="user", right_on="user", suffix="_right"
    )

    in_memory = joined.collect()
    streaming = joined.collect(engine="streaming")

    assert in_memory.equals(streaming)
    assert "__wordflow_join_left_row" not in in_memory.columns


@pytest.mark.parametrize("how", ["inner", "left", "semi", "anti"])
def test_a_join_keeps_the_left_order(how: str) -> None:
    left, right = _sides()
    joined = ordered_join(
        left, right, how=how, left_on="user", right_on="user", suffix="_right"
    ).collect(engine="streaming")

    assert joined["doc"].is_sorted()


def test_a_cross_join_keeps_left_then_right_order() -> None:
    left = pl.LazyFrame({"a": list(range(3000))})
    right = pl.LazyFrame({"b": [0, 1, 2]})

    joined = ordered_join(
        left, right, how="cross", left_on=None, right_on=None, suffix="_right"
    )

    assert joined.collect().equals(joined.collect(engine="streaming"))
    assert joined.collect()["a"].head(4).to_list() == [0, 0, 0, 1]
