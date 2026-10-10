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
    TOPIC_NAME_COLUMN,
    TOPIC_SHARE_COLUMN,
    TOPIC_TOP1_COLUMN,
    TOPIC_TOP1_NAME_COLUMN,
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
        progress_callback=lambda progress, message, _detail=None: progress_updates.append(
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
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    segments: object,
    extra_columns: dict[str, list[object]] | None = None,
    documents: list[dict[str, object]] | None = None,
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
                    **(extra_columns or {}),
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
            "documents": documents or [{"doc_index": 0}, {"doc_index": 1}],
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


# Columns an earlier Topic Modelling added, with values the new run must replace.
_PREVIOUS_TOPIC_COLUMNS: dict[str, list[object]] = {
    TOPIC_COLUMN: [9, 9],
    TOPIC_TOP1_COLUMN: [9, 9],
    TOPIC_SHARE_COLUMN: [0.5, 0.5],
    TOPIC_SEGMENT_COUNT_COLUMN: [7, 7],
}


def test_per_topic_rows_replace_the_topic_columns_of_a_previous_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Topic Modelling on a Data Block made from a Topic Modelling Result (issue 246)."""
    node_id, snapshot_dir, context_path = _topic_segments_fixture(
        tmp_path,
        monkeypatch,
        [(0, 0, 13, 0), (0, 14, 26, 0), (0, 27, 38, 1), (1, 0, 10, -1)],
        extra_columns=_PREVIOUS_TOPIC_COLUMNS,
    )
    request = _topic_request(node_id)
    # The old columns are ticked too, as the Add to Project dialog allowed.
    request["selected_columns"] = {
        str(node_id): ["text", "year", TOPIC_COLUMN, TOPIC_SHARE_COLUMN]
    }

    result = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "output"),
        request_payload=request,
        projection_context_path=str(context_path),
        source_projection={
            node_id: {"row_indices": [0, 1], "offset": 0, "size": 2, "text_column": "text"}
        },
    )

    data = pl.read_parquet(result["outputs"][0]["topic_data"]["parquet_path"])
    assert data.columns == [
        "text",
        "year",
        TOPIC_COLUMN,
        TOPIC_SHARE_COLUMN,
        TOPIC_SEGMENT_COUNT_COLUMN,
    ]
    assert data[TOPIC_COLUMN].to_list() == [0, 1]
    assert data[TOPIC_SEGMENT_COUNT_COLUMN].to_list() == [2, 1]


def test_document_rows_replace_the_topic_columns_of_a_previous_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The old TOPIC_topic must not shadow the new assignment in the join (issue 246)."""
    node_id, snapshot_dir, context_path = _topic_segments_fixture(
        tmp_path,
        monkeypatch,
        [],
        extra_columns=_PREVIOUS_TOPIC_COLUMNS,
        documents=[
            {
                "doc_index": 0,
                "dominant_topic": 1,
                "topic_coverage": [
                    {"topic_id": -1, "coverage": 0.0},
                    {"topic_id": 0, "coverage": 0.0},
                    {"topic_id": 1, "coverage": 1.0},
                ],
            },
            {
                "doc_index": 1,
                "dominant_topic": 0,
                "topic_coverage": [
                    {"topic_id": -1, "coverage": 0.0},
                    {"topic_id": 0, "coverage": 1.0},
                    {"topic_id": 1, "coverage": 0.0},
                ],
            },
        ],
    )
    request = _topic_request(node_id)
    request["row_unit"] = "documents"
    request["selected_columns"] = {str(node_id): ["text", "year", TOPIC_TOP1_COLUMN]}

    result = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "output"),
        request_payload=request,
        projection_context_path=str(context_path),
        source_projection={node_id: {"row_indices": [0, 1], "offset": 0, "size": 2}},
    )

    data = pl.read_parquet(result["outputs"][0]["topic_data"]["parquet_path"])
    assert data.columns == ["text", "year", TOPIC_TOP1_COLUMN, TOPIC_COVERAGE_OUTPUT_COLUMN]
    assert data[TOPIC_TOP1_COLUMN].to_list() == [1, 0]


def test_per_topic_detach_of_ungrouped_keeps_ungrouped_segments(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ungrouped (-1) is chosen like a Topic in one row per topic (issue 362)."""
    node_id, snapshot_dir, context_path = _topic_segments_fixture(
        tmp_path,
        monkeypatch,
        [(0, 0, 13, 0), (0, 14, 26, -1), (0, 27, 38, 1), (1, 0, 10, -1)],
    )

    result = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "output"),
        request_payload=_topic_request(node_id, topic_ids=[-1]),
        projection_context_path=str(context_path),
        source_projection={
            node_id: {"row_indices": [0, 1], "offset": 0, "size": 2, "text_column": "text"}
        },
    )

    data = pl.read_parquet(result["outputs"][0]["topic_data"]["parquet_path"])
    # Every document with ungrouped text, also one that has Topics.
    assert data["text"].to_list() == ["Noël arrive.", "Solo line."]
    assert data[TOPIC_COLUMN].to_list() == [-1, -1]


def test_document_rows_of_ungrouped_keep_documents_with_no_topic(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One row per document: Ungrouped is the documents with no real Topic (issue 362)."""
    node_id, snapshot_dir, context_path = _topic_segments_fixture(
        tmp_path,
        monkeypatch,
        [],
        documents=[
            {
                "doc_index": 0,
                "dominant_topic": -1,
                "topic_coverage": [
                    {"topic_id": -1, "coverage": 0.6},
                    {"topic_id": 0, "coverage": 0.4},
                    {"topic_id": 1, "coverage": 0.0},
                ],
            },
            {
                "doc_index": 1,
                "dominant_topic": -1,
                "topic_coverage": [
                    {"topic_id": -1, "coverage": 1.0},
                    {"topic_id": 0, "coverage": 0.0},
                    {"topic_id": 1, "coverage": 0.0},
                ],
            },
        ],
    )
    request = _topic_request(node_id, topic_ids=[-1])
    request["row_unit"] = "documents"

    result = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "output"),
        request_payload=request,
        projection_context_path=str(context_path),
        source_projection={node_id: {"row_indices": [0, 1], "offset": 0, "size": 2}},
    )

    data = pl.read_parquet(result["outputs"][0]["topic_data"]["parquet_path"])
    # Document 0 is mostly ungrouped but has Topic 0, so it is in Topic 0's bubble.
    assert data["text"].to_list() == ["Solo line."]
    meanings = pl.read_parquet(result["outputs"][0]["topic_meanings"]["parquet_path"])
    assert meanings[TOPIC_COLUMN].to_list() == [-1]


def test_ungrouped_document_counts_per_source() -> None:
    from ldaca_wordflow.analysis.topic_projection import ungrouped_document_counts

    def document(index: int, real: float) -> dict[str, object]:
        return {
            "doc_index": index,
            "topic_coverage": [
                {"topic_id": -1, "coverage": 1.0 - real},
                {"topic_id": 0, "coverage": real},
            ],
        }

    documents = [document(0, 0.0), document(1, 0.3), document(2, 0.0), document(3, 0.0)]
    # Two sources of two documents: a partly grouped document is not Ungrouped.
    assert ungrouped_document_counts(documents, [2, 2]) == [1, 2]


def test_topic_names_are_written_beside_the_topic_numbers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Names given to Topics reach the new Data Blocks."""
    node_id, snapshot_dir, context_path = _topic_segments_fixture(
        tmp_path,
        monkeypatch,
        [(0, 0, 13, 0), (0, 14, 26, 0), (0, 27, 38, 1), (1, 0, 10, -1)],
        documents=[
            {
                "doc_index": 0,
                "dominant_topic": 0,
                "topic_coverage": [
                    {"topic_id": -1, "coverage": 0.0},
                    {"topic_id": 0, "coverage": 0.7},
                    {"topic_id": 1, "coverage": 0.3},
                ],
            },
            {
                "doc_index": 1,
                "dominant_topic": 1,
                "topic_coverage": [
                    {"topic_id": -1, "coverage": 0.0},
                    {"topic_id": 0, "coverage": 0.0},
                    {"topic_id": 1, "coverage": 1.0},
                ],
            },
        ],
    )
    request = _topic_request(node_id)
    request["topic_names_override"] = [{"topic_id": 0, "name": "Coffee"}]
    projection = {node_id: {"row_indices": [0, 1], "offset": 0, "size": 2, "text_column": "text"}}

    per_topic = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "topics"),
        request_payload=request,
        projection_context_path=str(context_path),
        source_projection=projection,
    )
    data = pl.read_parquet(per_topic["outputs"][0]["topic_data"]["parquet_path"])
    assert data[TOPIC_NAME_COLUMN].to_list() == ["Coffee", "Topic 1"]
    meanings = pl.read_parquet(per_topic["outputs"][0]["topic_meanings"]["parquet_path"])
    assert meanings[TOPIC_NAME_COLUMN].to_list() == ["Coffee", "Topic 1"]

    request["row_unit"] = "documents"
    per_document = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "documents"),
        request_payload=request,
        projection_context_path=str(context_path),
        source_projection=projection,
    )
    data = pl.read_parquet(per_document["outputs"][0]["topic_data"]["parquet_path"])
    assert data[TOPIC_TOP1_COLUMN].to_list() == [0, 1]
    assert data[TOPIC_TOP1_NAME_COLUMN].to_list() == ["Coffee", "Topic 1"]

    # No names, no name columns.
    request["topic_names_override"] = []
    unnamed = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(snapshot_dir),
        output_dir=str(tmp_path / "unnamed"),
        request_payload=request,
        projection_context_path=str(context_path),
        source_projection=projection,
    )
    data = pl.read_parquet(unnamed["outputs"][0]["topic_data"]["parquet_path"])
    assert TOPIC_TOP1_NAME_COLUMN not in data.columns


def test_unnamed_topics_read_as_the_app_labels_them() -> None:
    """No empty name cells; "Topic 5" and "Ungrouped" as shown in the app."""
    from ldaca_wordflow.workers.topic_modeling import _topic_name, _topic_name_expression

    frame = pl.DataFrame({TOPIC_COLUMN: [0, 1, -1]})
    names = {0: "Coffee"}
    assert frame.select(_topic_name_expression(names).alias("name"))["name"].to_list() == [
        "Coffee",
        "Topic 1",
        "Ungrouped",
    ]
    assert [_topic_name(topic_id, names) for topic_id in (0, 1, -1)] == [
        "Coffee",
        "Topic 1",
        "Ungrouped",
    ]
