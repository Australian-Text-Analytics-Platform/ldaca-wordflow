"""Data Block Edits never change the number or order of rows.

Row-changing work (filtering, sorting, selecting, grouping) must create a
derived Data Block, because Analyses map their Results back to source rows by
position.
"""

from __future__ import annotations

import pytest
from pydantic import TypeAdapter, ValidationError

from ldaca_wordflow.models.node_resources import (
    ExpressionNodeEditRequest,
    NodeEditRequest,
)

EDIT_ADAPTER: TypeAdapter[object] = TypeAdapter(NodeEditRequest)
UPPERCASE_TEXT = {
    "alias": "upper_text",
    "expression": {"op": "uppercase", "operand": {"op": "column", "name": "text"}},
}


def test_in_place_filter_edits_are_rejected() -> None:
    with pytest.raises(
        ValidationError, match="does not match any of the expected tags"
    ):
        EDIT_ADAPTER.validate_python(
            {
                "kind": "filter",
                "conditions": [
                    {"column": "text", "operator": "contains", "value": "a"}
                ],
            }
        )


@pytest.mark.parametrize("context", ["filter", "select", "sort", "group_by_agg"])
def test_in_place_expressions_that_can_change_rows_are_rejected(context: str) -> None:
    payload: dict[str, object] = {
        "kind": "expression",
        "context": context,
        "expressions": [UPPERCASE_TEXT],
    }
    if context == "group_by_agg":
        payload["group_by"] = [{"expression": {"op": "column", "name": "text"}}]
    with pytest.raises(ValidationError):
        EDIT_ADAPTER.validate_python(payload)


def test_in_place_column_expressions_are_allowed() -> None:
    edit = EDIT_ADAPTER.validate_python(
        {
            "kind": "expression",
            "context": "with_columns",
            "expressions": [UPPERCASE_TEXT],
        }
    )
    assert isinstance(edit, ExpressionNodeEditRequest)
    assert edit.context == "with_columns"
