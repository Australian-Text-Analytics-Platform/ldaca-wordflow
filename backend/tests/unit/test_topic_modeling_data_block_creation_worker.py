from __future__ import annotations

import uuid
from pathlib import Path

import polars as pl
import pytest

from ldaca_wordflow.analysis.generated_columns import (
    TOPIC_COLUMN,
    TOPIC_COVERAGE_OUTPUT_COLUMN,
    TOPIC_MEANING_COLUMN,
    TOPIC_SEGMENT_COUNT_COLUMN,
    TOPIC_SHARE_COLUMN,
    TOPIC_TOP1_COLUMN,
)
from ldaca_wordflow.domain.workspace import Node, SourceProvenance, Workspace
from ldaca_wordflow.infrastructure.storage.input_snapshots import (
    create_worker_input_snapshot,
)
from ldaca_wordflow.workers.topic_modeling import run_topic_modeling_data_block_creation


def test_topic_modeling_data_block_creation_publishes_ordered_data_and_meanings(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_id = uuid.uuid4()
    second_id = uuid.uuid4()
    workspace = Workspace(name="topics")
    for node_id, name in ((first_id, "First"), (second_id, "Second")):
        workspace.add_node(
            Node(
                id=node_id,
                name=name,
                data=pl.DataFrame(
                    {"text": ["zero", "one", "two"], "ignored": [0, 1, 2]}
                ).lazy(),
                provenance=SourceProvenance(),
                document="text",
                color="#123456",
            )
        )
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    snapshot_dir = tmp_path / "input"
    create_worker_input_snapshot(
        workspace_id=workspace.id,
        node_ids=[first_id, second_id],
        workspace=workspace,
        workspace_data_dir=data_dir,
        snapshot_dir=snapshot_dir,
        max_snapshot_bytes=10_000_000,
    )
    coverage = [
        [
            {"topic_id": -1, "coverage": 0.0},
            {"topic_id": 0, "coverage": 0.0},
            {"topic_id": 1, "coverage": 1.0},
        ],
        [
            {"topic_id": -1, "coverage": 0.0},
            {"topic_id": 0, "coverage": 0.6},
            {"topic_id": 1, "coverage": 0.4},
        ],
        [
            {"topic_id": -1, "coverage": 0.0},
            {"topic_id": 0, "coverage": 0.0},
            {"topic_id": 1, "coverage": 1.0},
        ],
    ]
    projected_documents = [
        {
            "doc_index": index,
            "dominant_topic": [1, 0, 1][index % 3],
            "topic_coverage": coverage[index % 3],
        }
        for index in range(6)
    ]
    monkeypatch.setattr(
        "ldaca_wordflow.workers.topic_pipeline._project_rust_topic_modeling",
        lambda **_kwargs: {
            "documents": projected_documents,
            "topics": [
                {"id": 0, "representative_words": [{"word": "old"}]},
                {"id": 1, "representative_words": [{"word": "other"}]},
            ],
        },
    )
    context_path = tmp_path / "context.msgpack.zst"
    context_path.write_bytes(b"context")
    progress_updates: list[tuple[float, str]] = []

    result = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "output"),
        request_payload={
            "kind": "topic_modeling_data_block_creation",
            "node_ids": [str(first_id), str(second_id)],
            "selected_columns": {
                str(first_id): ["text"],
                str(second_id): [],
            },
            "new_node_names": {
                str(first_id): "First topics",
                str(second_id): "Second topics",
            },
            "topic_ids": [1],
            "cluster_count": 2,
            "top_n_topics": 2,
            "topic_meanings_override": [{"topic_id": 1, "words": ["new"]}],
        },
        projection_context_path=str(context_path),
        source_projection={
            first_id: {"row_indices": [0, 1, 2], "offset": 0, "size": 3},
            second_id: {"row_indices": [0, 1, 2], "offset": 3, "size": 3},
        },
        progress_callback=lambda progress, message: progress_updates.append(
            (progress, message)
        ),
    )

    assert [item["source_node_id"] for item in result["outputs"]] == [
        first_id,
        second_id,
    ]
    first = result["outputs"][0]
    data = pl.read_parquet(first["topic_data"]["parquet_path"])
    assert data.columns == [
        "text",
        TOPIC_TOP1_COLUMN,
        TOPIC_COVERAGE_OUTPUT_COLUMN,
    ]
    assert data["text"].to_list() == ["zero", "one", "two"]
    assert data[TOPIC_TOP1_COLUMN].to_list() == [1, 0, 1]
    output_dtype = data.schema[TOPIC_COVERAGE_OUTPUT_COLUMN]
    assert isinstance(output_dtype, pl.Extension)
    assert output_dtype.ext_name() == "org.ldaca.wordflow.topic_coverage.v1"
    second_data = pl.read_parquet(result["outputs"][1]["topic_data"]["parquet_path"])
    assert second_data.columns == [
        TOPIC_TOP1_COLUMN,
        TOPIC_COVERAGE_OUTPUT_COLUMN,
    ]
    assert [progress for progress, _message in progress_updates] == [
        pytest.approx(0.475),
        pytest.approx(0.95),
    ]
    assert all(progress < 1.0 for progress, _message in progress_updates)
    meanings = pl.read_parquet(first["topic_meanings"]["parquet_path"])
    assert meanings.to_dicts() == [
        {TOPIC_COLUMN: 0, TOPIC_MEANING_COLUMN: ["old"]},
        {TOPIC_COLUMN: 1, TOPIC_MEANING_COLUMN: ["new"]},
    ]
    assert first["topic_data"]["data_block"]["provenance"]["operation"] == {
        "kind": "topic_modeling_data_block_creation",
        "role": "topic_data",
        "cluster_count": 2,
        "top_n_topics": 2,
        "row_unit": "documents",
    }
    assert first["topic_data"]["data_block"]["color"] is None
    assert first["topic_meanings"]["data_block"]["color"] is None


def _topic_segments_fixture(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, segments: object
) -> tuple[uuid.UUID, Path, Path]:
    node_id = uuid.uuid4()
    workspace = Workspace(name="topics")
    workspace.add_node(
        Node(
            id=node_id,
            name="Source",
            data=pl.DataFrame(
                {
                    # Non-ASCII text proves spans are character offsets.
                    "text": ["Café au lait. Noël arrive. Rain again.", "Solo line."],
                    "year": [2021, 2022],
                }
            ).lazy(),
            provenance=SourceProvenance(),
            document="text",
            color=None,
        )
    )
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    snapshot_dir = tmp_path / "input"
    create_worker_input_snapshot(
        workspace_id=workspace.id,
        node_ids=[node_id],
        workspace=workspace,
        workspace_data_dir=data_dir,
        snapshot_dir=snapshot_dir,
        max_snapshot_bytes=10_000_000,
    )
    monkeypatch.setattr(
        "ldaca_wordflow.workers.topic_pipeline._project_rust_topic_modeling",
        lambda **_kwargs: {
            "documents": [{"doc_index": 0}, {"doc_index": 1}],
            "topics": [
                {"id": 0, "representative_words": [{"word": "coffee"}]},
                {"id": 1, "representative_words": [{"word": "weather"}]},
            ],
        },
    )

    def fake_segments(_context: bytes, topic_count: int):
        assert topic_count == 2
        if isinstance(segments, Exception):
            raise segments
        return segments

    # raising=False: installed polars-text builds may predate this function.
    monkeypatch.setattr(
        "polars_text.project_topic_segments", fake_segments, raising=False
    )
    context_path = tmp_path / "context.msgpack.zst"
    context_path.write_bytes(b"context")
    return node_id, snapshot_dir, context_path


def _topic_request(node_id: uuid.UUID, topic_ids: list[int] | None = None) -> dict:
    return {
        "kind": "topic_modeling_data_block_creation",
        "node_ids": [str(node_id)],
        "selected_columns": {str(node_id): ["text", "year"]},
        "new_node_names": {str(node_id): "Topic rows"},
        "topic_ids": topic_ids,
        "cluster_count": 2,
        "top_n_topics": 1,
        "row_unit": "topics",
    }


def test_per_topic_detach_joins_only_each_topics_segments(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Document 0: "Café au lait." (0-13) and "Rain again." (27-38) are Topic 0 and
    # 1, "Noël arrive." (14-26) is also Topic 0; document 1 is one outlier.
    node_id, snapshot_dir, context_path = _topic_segments_fixture(
        tmp_path,
        monkeypatch,
        [(0, 0, 13, 0), (0, 14, 26, 0), (0, 27, 38, 1), (1, 0, 10, -1)],
    )

    result = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "output"),
        request_payload=_topic_request(node_id),
        projection_context_path=str(context_path),
        source_projection={
            node_id: {
                "row_indices": [0, 1],
                "offset": 0,
                "size": 2,
                "text_column": "text",
            }
        },
    )

    output = result["outputs"][0]["topic_data"]
    data = pl.read_parquet(output["parquet_path"])
    assert data.columns == [
        "text",
        "year",
        TOPIC_COLUMN,
        TOPIC_SHARE_COLUMN,
        TOPIC_SEGMENT_COUNT_COLUMN,
    ]
    assert data["text"].to_list() == ["Café au lait.\nNoël arrive.", "Rain again."]
    assert data["year"].to_list() == [2021, 2021]
    assert data[TOPIC_COLUMN].to_list() == [0, 1]
    assert data[TOPIC_SEGMENT_COUNT_COLUMN].to_list() == [2, 1]
    assert data[TOPIC_SHARE_COLUMN].to_list() == pytest.approx([25 / 36, 11 / 36])
    assert output["data_block"]["document"] == "text"
    assert output["data_block"]["provenance"]["operation"]["row_unit"] == "topics"
    meanings = pl.read_parquet(result["outputs"][0]["topic_meanings"]["parquet_path"])
    assert meanings[TOPIC_COLUMN].to_list() == [0, 1]


def test_per_topic_detach_keeps_only_selected_topics(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    node_id, snapshot_dir, context_path = _topic_segments_fixture(
        tmp_path,
        monkeypatch,
        [(0, 0, 13, 0), (0, 14, 26, 0), (0, 27, 38, 1), (1, 0, 10, -1)],
    )

    result = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "output"),
        request_payload=_topic_request(node_id, topic_ids=[1]),
        projection_context_path=str(context_path),
        source_projection={
            node_id: {
                "row_indices": [0, 1],
                "offset": 0,
                "size": 2,
                "text_column": "text",
            }
        },
    )

    data = pl.read_parquet(result["outputs"][0]["topic_data"]["parquet_path"])
    assert data["text"].to_list() == ["Rain again."]
    assert data[TOPIC_COLUMN].to_list() == [1]


def test_per_topic_detach_asks_for_a_rerun_without_segment_spans(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    node_id, snapshot_dir, context_path = _topic_segments_fixture(
        tmp_path, monkeypatch, ValueError("no segment spans")
    )

    with pytest.raises(ValueError, match="Re-run the analysis"):
        run_topic_modeling_data_block_creation(
            input_snapshot_dir=str(snapshot_dir),
            output_dir=str(tmp_path / "output"),
            request_payload=_topic_request(node_id),
            projection_context_path=str(context_path),
            source_projection={
                node_id: {
                    "row_indices": [0, 1],
                    "offset": 0,
                    "size": 2,
                    "text_column": "text",
                }
            },
        )
