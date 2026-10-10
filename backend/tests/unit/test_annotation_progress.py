"""The temporary label Data Block of an AI annotation run (issue 371)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest

from ldaca_wordflow.domain import AnnotationClass
from ldaca_wordflow.domain.workspace import (
    AnalysisExecutionScope,
    AnalysisRecord,
    AnnotationAnalysisRequest,
    AnnotationRunAllAnalysisRequest,
    Node,
    Workspace,
)
from ldaca_wordflow.services.annotation_progress import (
    apply_annotation_progress,
    discard_annotation_progress,
    is_annotation_progress_node,
    save_annotation_progress,
)
from ldaca_wordflow.shared.annotation_labels import (
    annotation_progress_node_id,
    append_labels,
    read_labels,
)
from ldaca_wordflow.shared.errors import InvalidInputError


def _setup() -> tuple[Workspace, AnalysisRecord, uuid.UUID]:
    source_id = uuid.uuid4()
    workspace = Workspace(name="Annotation")
    workspace.add_node(
        Node(
            id=source_id,
            name="tweets",
            data=pl.DataFrame(
                {
                    "text": ["not really", "RT hi", "not really", "yes"],
                    "label": ["old", None, "old", "kept"],
                }
            ).lazy(),
            document="text",
        )
    )
    request = AnnotationRunAllAnalysisRequest(
        source=AnnotationAnalysisRequest(
            node_id=source_id,
            text_column="text",
            annotation_column="label",
            class_node_id=uuid.uuid4(),
            class_column="class",
            description_column="description",
            classes=[AnnotationClass(name="negative")],
            provider_configuration_id=uuid.uuid4(),
            provider="openai",
            model="some-model",
            instruction="Classify",
        )
    )
    record = AnalysisRecord.create(
        request,
        tab_id=uuid.uuid4(),
        execution_scope=AnalysisExecutionScope.RUN_ALL,
        timestamp=datetime.now(UTC),
    )
    return workspace, record, source_id


def test_labels_file_keeps_each_batch_and_skips_a_cut_line(tmp_path: Path) -> None:
    path = tmp_path / "labels.jsonl"
    append_labels(path, ["a", "b"], ["x", None])
    append_labels(path, ["a"], ["y"])
    with open(path, "a", encoding="utf-8") as handle:
        handle.write('{"text": "c", "lab')  # a crash mid-line
    assert read_labels(path) == {"a": "y", "b": None}
    assert read_labels(tmp_path / "missing.jsonl") == {}


def test_save_creates_then_refreshes_a_joinable_label_block(tmp_path: Path) -> None:
    workspace, record, source_id = _setup()
    first = save_annotation_progress(workspace, tmp_path, record, {"not really": "negative"})
    assert first is not None
    node = workspace.nodes[annotation_progress_node_id(record.id)]
    assert node.name == "tweets · annotation in progress"
    assert is_annotation_progress_node(node)
    assert [parent.id for parent in node.parents] == [source_id]
    save_annotation_progress(
        workspace, tmp_path, record, {"not really": "negative", "RT hi": "retweet"}
    )
    assert node.data.collect().to_dicts() == [
        {"text": "not really", "label": "negative"},
        {"text": "RT hi", "label": "retweet"},
    ]
    # Nothing saved yet: no block.
    other_workspace, other_record, _ = _setup()
    assert save_annotation_progress(other_workspace, tmp_path, other_record, {}) is None


def test_apply_writes_saved_labels_and_keeps_other_rows(tmp_path: Path) -> None:
    workspace, record, source_id = _setup()
    save_annotation_progress(
        workspace, tmp_path, record, {"not really": "negative", "RT hi": "retweet"}
    )
    source, column, written, _path = apply_annotation_progress(
        workspace, tmp_path, annotation_progress_node_id(record.id)
    )
    assert (source.id, column, written) == (source_id, "label", 3)
    assert workspace.nodes[source_id].data.collect()["label"].to_list() == [
        "negative",
        "retweet",
        "negative",
        "kept",
    ]
    with pytest.raises(InvalidInputError):
        apply_annotation_progress(workspace, tmp_path, source_id)


def test_a_finished_run_removes_its_label_block(tmp_path: Path) -> None:
    workspace, record, _source_id = _setup()
    save_annotation_progress(workspace, tmp_path, record, {"yes": "positive"})
    assert discard_annotation_progress(workspace, record.id)
    assert annotation_progress_node_id(record.id) not in workspace.nodes
    assert not discard_annotation_progress(workspace, record.id)
