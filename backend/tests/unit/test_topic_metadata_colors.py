from __future__ import annotations

import uuid
from pathlib import Path

import polars as pl
import pytest

from ldaca_wordflow.analysis.topic_metadata_colors import (
    eligible_color_columns,
    group_topic_counts,
)
from ldaca_wordflow.models.analysis_results import (
    TopicColorGroupsQuery,
    TopicModelingStoredResult,
)
from ldaca_wordflow.services.analysis_results import (
    _topic_color_frame,
    _topic_color_groups,
)
from ldaca_wordflow.shared.errors import InvalidInputError


def _coverage(*pairs: tuple[int, float]) -> list[dict[str, float | int]]:
    return [{"topic_id": topic_id, "coverage": value} for topic_id, value in pairs]


# Document 0: Topic 0 then 1; 1: Topic 1; 2: Topic 0; 3: Topic 1 then 0.
_DOCUMENTS = [
    {"doc_index": 0, "topic_coverage": _coverage((0, 0.7), (1, 0.3))},
    {"doc_index": 1, "topic_coverage": _coverage((1, 1.0))},
    {"doc_index": 2, "topic_coverage": _coverage((0, 1.0))},
    {"doc_index": 3, "topic_coverage": _coverage((0, 0.2), (1, 0.8))},
]


def test_eligible_columns_have_two_to_eight_distinct_non_missing_values() -> None:
    frame = pl.DataFrame(
        {
            "text": ["a", "b", "c", "d"],
            "party": ["Labor", "Liberal", None, "Labor"],
            "year": [2020, 2021, 2022, 2023],
            "many": [str(index) for index in range(4)],
            "flag": [True, False, True, True],
            "empty": pl.Series([None, None, None, None], dtype=pl.String),
            "constant": ["same", "same", None, "same"],
            "tags": [["x"], ["y"], [], ["x"]],
        }
    )
    wide = pl.concat([frame] * 3, how="vertical").with_columns(
        many=pl.int_range(0, 12).cast(pl.String)
    )

    # "constant" has one value, so every bubble would get the same colour.
    assert eligible_color_columns(frame, "text") == {
        "party": 2,
        "year": 4,
        "many": 4,
        "flag": 2,
    }
    assert list(eligible_color_columns(wide, "text")) == ["party", "year", "flag"]


def test_groups_count_top_n_documents_per_value_with_missing_last() -> None:
    grouped = group_topic_counts(
        ["Labor", None, "Liberal", "Labor"],
        _DOCUMENTS,
        topic_count=2,
        top_n_topics=1,
    )

    assert grouped["groups"] == [
        {"value": "Labor", "label": "Labor", "document_count": 2, "missing": False},
        {"value": "Liberal", "label": "Liberal", "document_count": 1, "missing": False},
        {"value": None, "label": "(missing)", "document_count": 1, "missing": True},
    ]
    # Top 1: Topic 0 has documents 0 (Labor) and 2 (Liberal); Topic 1 has
    # documents 1 (missing) and 3 (Labor).
    assert grouped["topic_counts"] == [[1, 1, 0], [1, 0, 1]]

    top_two = group_topic_counts(
        ["Labor", None, "Liberal", "Labor"],
        _DOCUMENTS,
        topic_count=2,
        top_n_topics=2,
    )
    assert top_two["topic_counts"] == [[2, 1, 0], [2, 0, 1]]


def test_boolean_and_whole_float_labels() -> None:
    grouped = group_topic_counts(
        [True, False, 2.0, float("nan")],
        _DOCUMENTS,
        topic_count=2,
        top_n_topics=1,
    )

    assert [group["label"] for group in grouped["groups"]] == [
        "2",
        "false",
        "true",
        "(missing)",
    ]


def _stored(cluster_count: int = 2) -> TopicModelingStoredResult:
    node_id = uuid.uuid4()
    return TopicModelingStoredResult.model_validate(
        {
            "topics": [],
            "corpus_sizes": [4],
            "sources": [
                {
                    "node_id": str(node_id),
                    "node_name": "Speeches",
                    "text_column": "text",
                    "original_columns": ["text", "party"],
                }
            ],
            "clustering": {
                "cluster_count": cluster_count,
                "min_cluster_count": 1,
                "max_cluster_count": 3,
                "default_cluster_count": 2,
                "adjustable": True,
            },
            "topic_inclusion": {
                "top_n_topics": 1,
                "min_top_n_topics": 1,
                "max_top_n_topics": 2,
                "default_top_n_topics": 1,
                "adjustable": True,
            },
            "segment_count": 4,
            "projection_context": {
                "version": 2,
                "artifact": {"name": "context"},
                "source_row_indices": [[3, 0, 1, 2]],
            },
        }
    )


def test_color_frame_reads_live_rows_in_model_order() -> None:
    data = pl.LazyFrame({"text": ["a", "b", "c", "d"], "party": ["w", "x", "y", "z"]})

    frame = _topic_color_frame(data, "text", [3, 0, 1, 2])

    assert frame.columns == ["party"]
    assert frame["party"].to_list() == ["z", "w", "x", "y"]
    with pytest.raises(InvalidInputError, match="no longer has the rows"):
        _topic_color_frame(data, "text", [4])


def test_color_groups_project_the_requested_cluster_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    context_path = tmp_path / "context.msgpack.zst"
    context_path.write_bytes(b"context")
    calls: list[tuple[int, int]] = []

    def fake_project(
        *, projection_context: bytes, cluster_count: int, document_count: int
    ) -> dict:
        assert projection_context == b"context"
        calls.append((cluster_count, document_count))
        return {"documents": _DOCUMENTS}

    monkeypatch.setattr(
        "ldaca_wordflow.services.analysis_results._project_rust_topic_modeling",
        fake_project,
    )
    frame = pl.DataFrame({"party": ["Labor", None, "Liberal", "Labor"]})

    listing = _topic_color_groups(
        _stored(),
        TopicColorGroupsQuery(cluster_count=2, top_n_topics=1),
        frame,
        "text",
        context_path,
    )
    assert listing.columns == ["party"]
    assert listing.column_value_counts == [2]
    assert listing.groups == []
    assert calls == []

    grouped = _topic_color_groups(
        _stored(),
        TopicColorGroupsQuery(cluster_count=2, top_n_topics=1, column="party"),
        frame,
        "text",
        context_path,
    )
    assert calls == [(2, 4)]
    assert [group.label for group in grouped.groups] == [
        "Labor",
        "Liberal",
        "(missing)",
    ]
    assert grouped.topic_counts == [[1, 1, 0], [1, 0, 1]]

    with pytest.raises(InvalidInputError, match="2 to 8 distinct"):
        _topic_color_groups(
            _stored(),
            TopicColorGroupsQuery(cluster_count=2, top_n_topics=1, column="text"),
            frame,
            "text",
            context_path,
        )
