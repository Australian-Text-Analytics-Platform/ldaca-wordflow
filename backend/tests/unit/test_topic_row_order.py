"""Topic results are put back on rows only if the documents still match (issue 319)."""

from __future__ import annotations

from pathlib import Path
import uuid

import polars as pl
import pytest

from ldaca_wordflow.domain.workspace import Node, SourceProvenance, Workspace
from ldaca_wordflow.infrastructure.storage.input_snapshots import (
    create_worker_input_snapshot,
)
from ldaca_wordflow.services.analysis_results import _topic_color_frame
from ldaca_wordflow.shared.document_fingerprint import (
    ROW_ORDER_CHANGED_MESSAGE,
    document_fingerprint,
)
from ldaca_wordflow.shared.errors import InvalidInputError
from ldaca_wordflow.workers.topic_modeling import run_topic_modeling_data_block_creation

TEXTS = ["zero", "one", "two"]


def _create(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fingerprint: str) -> pl.DataFrame:
    node_id = uuid.uuid4()
    workspace = Workspace(name="topics")
    workspace.add_node(
        Node(
            id=node_id,
            name="Tweets",
            data=pl.DataFrame({"text": TEXTS, "gender": ["F", "M", "F"]}).lazy(),
            provenance=SourceProvenance(),
            document="text",
            color="#123456",
        )
    )
    (tmp_path / "data").mkdir()
    create_worker_input_snapshot(
        workspace_id=workspace.id,
        node_ids=[node_id],
        workspace=workspace,
        workspace_data_dir=tmp_path / "data",
        snapshot_dir=tmp_path / "input",
        max_snapshot_bytes=10_000_000,
    )
    monkeypatch.setattr(
        "ldaca_wordflow.workers.topic_pipeline._project_rust_topic_modeling",
        lambda **_kwargs: {
            "documents": [
                {
                    "doc_index": index,
                    "dominant_topic": index,
                    "topic_coverage": [{"topic_id": index, "coverage": 1.0}],
                }
                for index in range(3)
            ],
            "topics": [
                {"id": index, "representative_words": [{"word": TEXTS[index]}]}
                for index in range(3)
            ],
        },
    )
    context_path = tmp_path / "context.msgpack.zst"
    context_path.write_bytes(b"context")
    result = run_topic_modeling_data_block_creation(
        input_snapshot_dir=str(tmp_path / "input"),
        output_dir=str(tmp_path / "output"),
        request_payload={
            "kind": "topic_modeling_data_block_creation",
            "node_ids": [str(node_id)],
            "selected_columns": {str(node_id): ["text"]},
            "new_node_names": {str(node_id): "Tweets topics"},
            "topic_ids": [],
            "cluster_count": 3,
            "top_n_topics": 1,
            "topic_meanings_override": [],
        },
        projection_context_path=str(context_path),
        source_projection={
            node_id: {
                "row_indices": [0, 1, 2],
                "offset": 0,
                "size": 3,
                "text_column": "text",
                "fingerprint": fingerprint,
            }
        },
        progress_callback=lambda _progress, _message, _detail=None: None,
    )
    return pl.read_parquet(result["outputs"][0]["topic_data"]["parquet_path"])


def test_rows_get_their_own_documents_topics(tmp_path, monkeypatch) -> None:
    frame = _create(tmp_path, monkeypatch, document_fingerprint(TEXTS))

    assert frame.select("text", "TOPIC_top1").rows() == [("zero", 0), ("one", 1), ("two", 2)]


def test_add_to_project_refuses_when_the_documents_moved(tmp_path, monkeypatch) -> None:
    with pytest.raises(InvalidInputError, match="have changed, or are in a different order"):
        _create(tmp_path, monkeypatch, document_fingerprint(list(reversed(TEXTS))))


def test_topic_map_colours_refuse_when_the_documents_moved() -> None:
    data = pl.LazyFrame({"text": TEXTS, "gender": ["F", "M", "F"]})

    assert _topic_color_frame(data, "text", [0, 1, 2], document_fingerprint(TEXTS))[
        "gender"
    ].to_list() == ["F", "M", "F"]
    with pytest.raises(InvalidInputError) as raised:
        _topic_color_frame(data, "text", [0, 1, 2], document_fingerprint(TEXTS[::-1]))
    assert str(raised.value) == ROW_ORDER_CHANGED_MESSAGE
