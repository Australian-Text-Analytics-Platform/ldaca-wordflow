"""Topic Coverage columns in analyses and Data Block tools (issue 200).

A Data Block detached from Topic Modelling carries a Topic Coverage column.
Analyses leave it out of the metadata they carry or show; tools that read a
column as text, a group, a key, or an order refuse it with a clear message;
tools that only carry it along keep it unchanged.
"""

from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import polars as pl
import pytest
from polars_source_utils import list_source_paths
from pydantic import TypeAdapter

from ldaca_wordflow.analysis.concordance_core import compute_node_concordance_page
from ldaca_wordflow.analysis.sequential_core import _build_sequential_result_frames
from ldaca_wordflow.domain.workspace import SequentialAnalysisRequest
from ldaca_wordflow.models.node_resources import (
    DataBlockExportFormat,
    NodeDerivationRequest,
    NodeEditRequest,
)
from ldaca_wordflow.models.quotation import LocalResolvedQuotationEngine
from ldaca_wordflow.services import node_operations
from ldaca_wordflow.services.analysis_preparation_registry import _prepare_sequential
from ldaca_wordflow.services.analysis_results import _topic_color_frame
from ldaca_wordflow.services.data_block_exports import (
    _BudgetedBinaryWriter,
    _write_lazyframe,
    _WriteBudget,
)
from ldaca_wordflow.shared.errors import InvalidInputError
from ldaca_wordflow.shared.topic_types import (
    is_topic_coverage_dtype,
    topic_coverage_dtype,
)
from ldaca_wordflow.shared.unsupported_columns import (
    is_unsupported_metadata_dtype,
    supported_metadata_columns,
)
from ldaca_wordflow.workers.concordance import run_concordance_run_all
from ldaca_wordflow.workers.quotation import run_quotation_run_all

COVERAGE = "TOPIC_coverage"
NODE_ID = "11111111-1111-4111-8111-111111111111"
OTHER_ID = "22222222-2222-4222-8222-222222222222"
EDIT: TypeAdapter[Any] = TypeAdapter(NodeEditRequest)
DERIVATION: TypeAdapter[Any] = TypeAdapter(NodeDerivationRequest)


def _coverage(*values: float) -> list[dict[str, float | int]]:
    return [
        {"topic_id": topic_id, "coverage": value}
        for topic_id, value in zip(range(-1, len(values) - 1), values, strict=True)
    ]


def _columns() -> dict[str, Any]:
    return {
        "document": ["alpha beta. Gamma", "beta gamma", "alpha beta. Gamma"],
        "party": ["a", "b", "a"],
        "id": [1, 2, 3],
        COVERAGE: pl.Series(
            COVERAGE,
            [
                _coverage(0.0, 0.6, 0.4),
                _coverage(0.1, 0.2, 0.7),
                _coverage(0.0, 0.6, 0.4),
            ],
            dtype=topic_coverage_dtype(2),
        ),
    }


@pytest.fixture
def source(tmp_path: Path) -> pl.LazyFrame:
    path = tmp_path / "topic-data.parquet"
    pl.DataFrame(_columns()).write_parquet(path)
    return pl.scan_parquet(path)


def test_topic_coverage_is_the_unsupported_metadata_type(source: pl.LazyFrame) -> None:
    schema = source.collect_schema()
    assert is_topic_coverage_dtype(schema[COVERAGE])
    assert is_unsupported_metadata_dtype(schema[COVERAGE])
    assert not is_unsupported_metadata_dtype(pl.List(pl.String))
    assert supported_metadata_columns(schema, exclude=("document",)) == ["party", "id"]


def test_concordance_run_all_leaves_topic_coverage_out(
    tmp_path, worker_snapshot
) -> None:
    result = run_concordance_run_all(
        artifact_dir=str(tmp_path),
        input_snapshot_dir=str(worker_snapshot(node_id=NODE_ID, columns=_columns())),
        parent_node_id=uuid.UUID(NODE_ID),
        document_column="document",
        search_word="alpha",
        num_left_tokens=1,
        num_right_tokens=1,
        regex=False,
        whole_word=False,
        case_sensitive=False,
        progress_callback=lambda _progress, _message: None,
    )

    source = result["source"]
    assert source["metadata_columns"] == ["party", "id"]
    table = pl.read_parquet(tmp_path / source["table"]["artifact"])
    assert COVERAGE not in table.columns
    assert table["party"].to_list() == ["a", "a"]


def test_concordance_preview_leaves_topic_coverage_out(source: pl.LazyFrame) -> None:
    page = compute_node_concordance_page(
        {"lf": source, "column": "document", "label": "Topics"},
        {
            "search_word": "alpha",
            "num_left_tokens": 1,
            "num_right_tokens": 1,
            "regex": False,
            "case_sensitive": False,
        },
        page=1,
        page_size=10,
        sort_by=None,
        descending=False,
    )

    assert COVERAGE not in page["metadata"]["metadata_columns"]
    assert "party" in page["metadata"]["metadata_columns"]


def test_quotation_run_all_leaves_topic_coverage_out(
    tmp_path, monkeypatch, worker_snapshot
) -> None:
    def fake_groups(input_df: pl.DataFrame, _source_column: str) -> pl.DataFrame:
        quote = {
            "speaker": "Ada",
            "speaker_start_idx": 0,
            "speaker_end_idx": 3,
            "quote": "alpha",
            "quote_start_idx": 0,
            "quote_end_idx": 5,
            "verb": "said",
            "verb_start_idx": 6,
            "verb_end_idx": 10,
            "quote_type": "direct",
            "quote_token_count": 1,
            "is_floating_quote": False,
            "quote_row_idx": 0,
        }
        return input_df.with_columns(
            pl.Series("quotation", [[quote]] + [[]] * (input_df.height - 1))
        )

    monkeypatch.setattr(
        "ldaca_wordflow.analysis.quotation_core.quotation_groups_via_quote_extractor",
        fake_groups,
    )
    result = run_quotation_run_all(
        artifact_dir=str(tmp_path),
        input_snapshot_dir=str(worker_snapshot(node_id=NODE_ID, columns=_columns())),
        parent_node_id=uuid.UUID(NODE_ID),
        document_column="document",
        engine=LocalResolvedQuotationEngine(),
        quotation_service_max_batch_size=100,
        quotation_service_timeout=30,
        progress_callback=lambda _progress, _message: None,
    )

    source = result["source"]
    assert source["metadata_columns"] == ["party", "id"]
    table = pl.read_parquet(tmp_path / source["table"]["artifact"])
    assert COVERAGE not in table.columns


def _dated(source: pl.LazyFrame) -> pl.LazyFrame:
    return source.with_columns(
        pl.Series(
            "when",
            [datetime(2026, month, 1, tzinfo=UTC) for month in (1, 2, 3)],
        )
    )


def test_trends_results_leave_topic_coverage_out(source: pl.LazyFrame) -> None:
    _result, publication = _build_sequential_result_frames(
        _dated(source), time_column="when", group_by_columns=["party"]
    )

    assert COVERAGE not in publication.columns
    assert "party" in publication.columns


def test_trends_refuses_topic_coverage_as_a_group(tmp_path: Path, source) -> None:
    node_id = uuid.UUID(NODE_ID)
    context = SimpleNamespace(
        workspace=SimpleNamespace(
            nodes={node_id: SimpleNamespace(data=_dated(source))}
        ),
        snapshot_dir=tmp_path,
        artifact_dir=tmp_path,
    )

    with pytest.raises(InvalidInputError, match="topic coverage values"):
        _prepare_sequential(
            SequentialAnalysisRequest(
                node_id=node_id, time_column="when", group_by_columns=[COVERAGE]
            ),
            cast(Any, context),
        )
    _prepare_sequential(
        SequentialAnalysisRequest(
            node_id=node_id, time_column="when", group_by_columns=["party"]
        ),
        cast(Any, context),
    )


def test_topic_colours_leave_topic_coverage_out(source: pl.LazyFrame) -> None:
    frame = _topic_color_frame(source, "document", [0, 1, 2])

    assert frame.columns == ["party", "id"]


def _workspace(source: pl.LazyFrame) -> Any:
    nodes = {
        uuid.UUID(node_id): SimpleNamespace(
            id=uuid.UUID(node_id), name=name, data=source, document="document"
        )
        for node_id, name in ((NODE_ID, "Topics"), (OTHER_ID, "Topics again"))
    }
    return SimpleNamespace(nodes=nodes)


CARRIED: list[dict[str, Any]] = [
    {
        "kind": "filter",
        "source_node_id": NODE_ID,
        "conditions": [{"column": "party", "operator": "eq", "value": "a"}],
    },
    {
        "kind": "filter",
        "source_node_id": NODE_ID,
        "conditions": [
            {
                "column": COVERAGE,
                "operator": "gte",
                "value": {"topic_id": 0, "threshold": 0.5},
            }
        ],
    },
    {
        "kind": "slice",
        "source_node_id": NODE_ID,
        "mode": "random_sample",
        "sample_size": 2,
    },
    {"kind": "slice", "source_node_id": NODE_ID, "mode": "shuffle", "random_seed": 1},
    {"kind": "concat", "source_node_ids": [NODE_ID, OTHER_ID]},
    {
        "kind": "join",
        "left_node_id": NODE_ID,
        "right_node_id": OTHER_ID,
        "left_on": "id",
        "right_on": "id",
        "how": "inner",
    },
    {
        "kind": "segment",
        "source_node_id": NODE_ID,
        "column": "document",
        "unit": "sentence",
    },
    {"kind": "deduplicate", "source_node_id": NODE_ID, "output": "kept"},
    {
        "kind": "group_summary",
        "source_node_id": NODE_ID,
        "group_by": ["party"],
        "summaries": [{"column": COVERAGE, "summary": "first"}],
    },
]


@pytest.mark.parametrize(
    "body", CARRIED, ids=lambda body: f"{body['kind']}-{body.get('mode', '')}"
)
def test_data_builder_carries_topic_coverage(
    tmp_path: Path, source: pl.LazyFrame, body: dict[str, Any]
) -> None:
    derived, *_ = node_operations.build_derived_lazyframe(
        _workspace(source), DERIVATION.validate_python(body)
    )
    plan = tmp_path / "plan.plbin"
    plan.write_bytes(derived.serialize(format="binary"))
    assert {Path(path).name for path in list_source_paths(str(plan))} == {
        "topic-data.parquet"
    }

    reopened = pl.LazyFrame.deserialize(plan, format="binary").collect()
    name = f"{COVERAGE}_first" if body["kind"] == "group_summary" else COVERAGE
    assert is_topic_coverage_dtype(reopened.schema[name])


def test_topic_coverage_filter_keeps_rows_above_the_threshold(
    source: pl.LazyFrame,
) -> None:
    derived, *_ = node_operations.build_derived_lazyframe(
        _workspace(source), DERIVATION.validate_python(CARRIED[1])
    )

    assert derived.collect()["id"].to_list() == [1, 3]


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "duplicate_column", "column": COVERAGE},
        {"kind": "rename_column", "column": COVERAGE, "new_name": "coverage"},
        {"kind": "delete_columns", "columns": [COVERAGE]},
        {"kind": "clean_text", "column": "document", "operation": "lowercase"},
    ],
    ids=lambda body: str(body["kind"]),
)
def test_data_editor_carries_topic_coverage(
    source: pl.LazyFrame, body: dict[str, Any]
) -> None:
    edited, _ = node_operations.build_edited_lazyframe(
        cast(Any, SimpleNamespace(data=source)), EDIT.validate_python(body)
    )

    edited.collect()


REFUSED_DERIVATIONS: list[dict[str, Any]] = [
    {
        "kind": "join",
        "left_node_id": NODE_ID,
        "right_node_id": OTHER_ID,
        "left_on": COVERAGE,
        "right_on": COVERAGE,
        "how": "inner",
    },
    {
        "kind": "segment",
        "source_node_id": NODE_ID,
        "column": COVERAGE,
        "unit": "sentence",
    },
    {"kind": "group_summary", "source_node_id": NODE_ID, "group_by": [COVERAGE]},
    *[
        {
            "kind": "group_summary",
            "source_node_id": NODE_ID,
            "group_by": ["party"],
            "summaries": [{"column": COVERAGE, "summary": summary}],
        }
        for summary in ("join_text", "distinct_values", "min", "earliest_latest")
    ],
    {
        "kind": "deduplicate",
        "source_node_id": NODE_ID,
        "near_text_column": COVERAGE,
        "output": "kept",
    },
    {
        "kind": "replace",
        "source_node_id": NODE_ID,
        "source_column": COVERAGE,
        "pattern": "a",
    },
]


@pytest.mark.parametrize(
    "body", REFUSED_DERIVATIONS, ids=lambda body: str(body["kind"])
)
def test_data_builder_refuses_topic_coverage_clearly(
    source: pl.LazyFrame, body: dict[str, Any]
) -> None:
    with pytest.raises(InvalidInputError, match="holds topic coverage values"):
        node_operations.build_derived_lazyframe(
            _workspace(source), DERIVATION.validate_python(body)
        )


REFUSED_EDITS: list[dict[str, Any]] = [
    {"kind": "clean_text", "column": COVERAGE, "operation": "lowercase"},
    {"kind": "split_column", "column": COVERAGE, "delimiters": [","], "parts": 2},
    {"kind": "count", "column": COVERAGE, "measure": "words", "output_column": "n"},
    {
        "kind": "combine_columns",
        "parts": [{"kind": "column", "column": COVERAGE}],
        "output_column": "combined",
    },
    {"kind": "replace", "source_column": COVERAGE, "pattern": "a"},
    {
        "kind": "replace",
        "source_column": COVERAGE,
        "pattern": "0",
        "mode": "extract",
        "output_column": "found",
    },
    *[
        {"kind": "cast", "column": COVERAGE, "target_type": target}
        for target in ("string", "integer", "float", "categorical", "date", "datetime")
    ],
]


@pytest.mark.parametrize(
    "body", REFUSED_EDITS, ids=lambda body: str(body.get("target_type", body["kind"]))
)
def test_data_editor_refuses_topic_coverage_clearly(
    source: pl.LazyFrame, body: dict[str, Any]
) -> None:
    with pytest.raises(InvalidInputError, match="holds topic coverage values"):
        node_operations.build_edited_lazyframe(
            cast(Any, SimpleNamespace(data=source)), EDIT.validate_python(body)
        )


def _export(frame: pl.LazyFrame, export_format: DataBlockExportFormat) -> bytes:
    buffer = io.BytesIO()
    _write_lazyframe(
        frame, export_format, _BudgetedBinaryWriter(buffer, _WriteBudget(10**8))
    )
    return buffer.getvalue()


def test_exports_write_topic_coverage_readably(source: pl.LazyFrame) -> None:
    expected = (
        '[{"topic_id":-1,"coverage":0.0},{"topic_id":0,"coverage":0.6},'
        '{"topic_id":1,"coverage":0.4}]'
    )

    csv = pl.read_csv(io.BytesIO(_export(source, DataBlockExportFormat.CSV)))
    assert csv[COVERAGE][0] == expected
    workbook = pl.read_excel(io.BytesIO(_export(source, DataBlockExportFormat.XLSX)))
    assert workbook[COVERAGE][0] == expected
    parquet = pl.read_parquet(
        io.BytesIO(_export(source, DataBlockExportFormat.PARQUET))
    )
    assert is_topic_coverage_dtype(parquet.schema[COVERAGE])
    assert b'"topic_id":0' in _export(source, DataBlockExportFormat.JSON)
