"""Trends refuses more groups than it can draw (issue 326).

A group column with about 245,000 values froze the page, and the saved result
froze it again every time the Project opened.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

import polars as pl
import pytest

from ldaca_wordflow.services.analysis_preparation_registry import (
    MAX_TRENDS_GROUPS,
    _require_drawable_groups,
)

ROWS = MAX_TRENDS_GROUPS + 1
DATA = pl.LazyFrame(
    {
        "unit": [f"u{index}" for index in range(ROWS)],
        "speaker": ["John", "Camila"] * (ROWS // 2) + ["John"] * (ROWS % 2),
        "line": [index % 40 for index in range(ROWS)],
        "part": [(index // 40) % 30 for index in range(ROWS)],
    }
)


def _check(columns: list[str]) -> None:
    request = cast(Any, SimpleNamespace(group_by_columns=columns))
    _require_drawable_groups(DATA, DATA.collect_schema(), request)


def test_a_column_with_too_many_values_is_refused_in_plain_words() -> None:
    with pytest.raises(
        Exception, match="gives 1,001 groups, more than Trends can draw"
    ):
        _check(["unit"])


def test_combined_columns_count_their_combinations() -> None:
    # 40 x 30 combinations: each column alone is fine, together they are not.
    with pytest.raises(Exception, match="Grouping by 'line', 'part' gives"):
        _check(["line", "part"])


def test_a_missing_group_column_is_refused_before_running() -> None:
    with pytest.raises(Exception, match="has no such column"):
        _check(["group"])


def test_ordinary_groups_pass() -> None:
    _check(["speaker"])
    _check([])
