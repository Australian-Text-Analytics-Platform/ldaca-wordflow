"""Data Editor edits and Data Builder plans must survive Project save and load.

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

from ldaca_wordflow.models.node_resources import NodeDerivationRequest, NodeEditRequest
from ldaca_wordflow.services import node_operations
from ldaca_wordflow.services.node_operations import build_edited_lazyframe

EDIT_ADAPTER: TypeAdapter[Any] = TypeAdapter(NodeEditRequest)
DERIVATION_ADAPTER: TypeAdapter[Any] = TypeAdapter(NodeDerivationRequest)

EDITS: list[dict[str, Any]] = [
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
def test_edit_plan_can_be_read_back(tmp_path: Path, body: dict[str, Any]) -> None:
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


BUILDER_REQUESTS: list[dict[str, Any]] = [
    *[
        {"kind": "segment", "column": "text", "unit": unit}
        for unit in ("sentence", "paragraph", "line")
    ],
    {
        "kind": "segment",
        "column": "text",
        "unit": "pattern",
        "pattern": "^[a-z]+:",
        "lead_column": "who",
    },
    {
        "kind": "segment",
        "column": "text",
        "unit": "pattern",
        "pattern": ",",
        "lead": "drop",
    },
    {
        "kind": "group_summary",
        "group_by": ["id"],
        "summaries": [
            {"column": "text", "summary": summary} for summary in ("join_text",)
        ],
    },
    {
        "kind": "group_summary",
        "group_by": ["text"],
        "summaries": [{"column": "id", "summary": "earliest_latest"}],
    },
    *[
        {
            "kind": "deduplicate",
            "near_text_column": "text",
            "ignore_links_mentions": True,
            "output": output,
        }
        for output in ("kept", "duplicates")
    ],
]


@pytest.mark.parametrize("body", BUILDER_REQUESTS, ids=lambda body: str(body["kind"]))
def test_data_builder_plan_can_be_read_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, body: dict[str, Any]
) -> None:
    source = tmp_path / "source.parquet"
    pl.DataFrame({"id": [1, 2], "text": ["it's a, b. Next", None]}).write_parquet(
        source
    )
    node = SimpleNamespace(id="n", name="n", data=pl.scan_parquet(source))
    monkeypatch.setattr(node_operations, "_node", lambda _workspace, _node_id: node)
    request = DERIVATION_ADAPTER.validate_python(
        {**body, "source_node_id": "00000000-0000-0000-0000-000000000001"}
    )

    derived, *_ = node_operations.build_derived_lazyframe(cast(Any, None), request)
    plan = tmp_path / "plan.plbin"
    plan.write_bytes(derived.serialize(format="binary"))

    assert [Path(path).name for path in list_source_paths(str(plan))] == [
        "source.parquet"
    ]
    derived.collect()
