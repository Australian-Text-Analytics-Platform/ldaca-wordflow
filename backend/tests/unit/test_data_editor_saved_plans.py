"""Every Data Editor edit must survive Project save and load (issue 143).

Saved plans are read back by polars-source-utils, which only knows the Polars
operations its build enables. An edit that uses anything else (such as
``str.to_titlecase``) saves but cannot be reopened.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import polars as pl
import pytest
from polars_source_utils import list_source_paths
from pydantic import TypeAdapter

from ldaca_wordflow.models.node_resources import NodeEditRequest
from ldaca_wordflow.services.node_operations import build_edited_lazyframe

EDIT_ADAPTER: TypeAdapter[Any] = TypeAdapter(NodeEditRequest)

EDITS: list[dict[str, object]] = [
    {"kind": "duplicate_column", "column": "text"},
    *[
        {"kind": "clean_text", "column": "text", "operation": operation}
        for operation in (
            "trim",
            "collapse_whitespace",
            "lowercase",
            "uppercase",
            "title_case",
            "remove_punctuation",
            "remove_digits",
            "remove_urls",
            "remove_html_tags",
        )
    ],
    *[
        {
            "kind": "split_column",
            "column": "text",
            "delimiters": [",", " "],
            "direction": direction,
            "parts": 3,
        }
        for direction in ("left", "right")
    ],
    {
        "kind": "combine_columns",
        "parts": [
            {"kind": "column", "column": "text"},
            {"kind": "text", "text": " #"},
            {"kind": "column", "column": "id"},
        ],
        "output_column": "label",
    },
    *[
        {
            "kind": "count",
            "column": "text",
            "measure": measure,
            "pattern": "a",
            "output_column": "n",
        }
        for measure in ("words", "characters", "characters_no_spaces", "matches")
    ],
    {"kind": "replace", "source_column": "text", "pattern": ".", "literal": True},
    {
        "kind": "replace",
        "source_column": "text",
        "pattern": ".",
        "mode": "extract",
        "output_column": "dots",
        "literal": True,
    },
]


@pytest.mark.parametrize(
    "body", EDITS, ids=lambda body: str(body.get("operation", body["kind"]))
)
def test_edit_plan_can_be_read_back(tmp_path: Path, body: dict[str, object]) -> None:
    source = tmp_path / "source.parquet"
    pl.DataFrame({"id": [1, 2], "text": ["it's a, b", None]}).write_parquet(source)
    node = SimpleNamespace(data=pl.scan_parquet(source))

    edited, _ = build_edited_lazyframe(
        cast(Any, node), EDIT_ADAPTER.validate_python(body)
    )
    plan = tmp_path / "plan.plbin"
    plan.write_bytes(edited.serialize(format="binary"))

    assert [Path(path).name for path in list_source_paths(str(plan))] == [
        "source.parquet"
    ]
    edited.collect()


def test_title_case_keeps_apostrophes_inside_words(tmp_path: Path) -> None:
    source = tmp_path / "source.parquet"
    pl.DataFrame({"text": ["it's o'NEIL-smith  élan", None]}).write_parquet(source)
    node = SimpleNamespace(data=pl.scan_parquet(source))
    edited, _ = build_edited_lazyframe(
        cast(Any, node),
        EDIT_ADAPTER.validate_python(
            {"kind": "clean_text", "column": "text", "operation": "title_case"}
        ),
    )
    assert edited.collect()["text"].to_list() == ["It's O'neil-Smith  Élan", None]
