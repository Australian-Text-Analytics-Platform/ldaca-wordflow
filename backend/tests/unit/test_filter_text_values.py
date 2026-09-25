"""Filter values on text columns stay text (found while building issue 149)."""

from __future__ import annotations

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
