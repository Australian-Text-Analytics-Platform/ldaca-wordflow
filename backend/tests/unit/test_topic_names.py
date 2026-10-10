"""Topic names kept per group of natural Topics (issue 366)."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from pydantic import ValidationError

from ldaca_wordflow.domain.workspace import TopicModelingTopicNames
from ldaca_wordflow.services import analysis_results


def test_leaves_pair_each_segment_natural_topic_with_its_merged_topic(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    context = tmp_path / "context.msgpack.zst"
    context.write_bytes(b"context")
    # Natural Topics 0-3; at 2 Topics, 0+2 merged (renumbered 0) and 1+3 (1).
    tables = {
        4: ((0, 0, 1, 0), (0, 1, 2, 2), (1, 0, 1, 1), (1, 1, 2, 3), (2, 0, 1, -1)),
        2: ((0, 0, 1, 0), (0, 1, 2, 0), (1, 0, 1, 1), (1, 1, 2, 1), (2, 0, 1, -1)),
    }
    monkeypatch.setattr(
        analysis_results, "_cached_segment_topics", lambda _identity, count: tables[count]
    )

    assert analysis_results._topic_leaves(context, 2, 4) == {0: [0, 2], 1: [1, 3]}
    assert analysis_results._topic_leaves(context, 4, 4) == {0: [0], 1: [1], 2: [2], 3: [3]}
    # Without the run's segment table, names cannot be placed: unknown, not guessed.
    assert analysis_results._topic_leaves(tmp_path / "missing", 2, 4) is None


def test_topic_names_are_trimmed_and_keyed_by_sorted_natural_topics() -> None:
    names = TopicModelingTopicNames(
        analysis_id=uuid.uuid4(), names={"3,7": "  Sleep ", "5": "", "1": "Diet"}
    )
    # An empty name removes it.
    assert names.names == {"3,7": "Sleep", "1": "Diet"}
    with pytest.raises(ValidationError):
        TopicModelingTopicNames(analysis_id=uuid.uuid4(), names={"7,3": "Sleep"})
    with pytest.raises(ValidationError):
        TopicModelingTopicNames(analysis_id=uuid.uuid4(), names={"a": "Sleep"})
    with pytest.raises(ValidationError):
        TopicModelingTopicNames(analysis_id=uuid.uuid4(), names={"1": "x" * 121})


def test_empty_topic_name_fields_are_left_out_of_saved_records() -> None:
    """0.7.11 refuses keys it does not know, so empty name fields are not written (issue 366)."""
    from ldaca_wordflow.domain.workspace.analysis import TopicNameOverride
    from ldaca_wordflow.domain.workspace.tab import TopicModelingTabSettings

    settings = TopicModelingTabSettings.model_validate(
        {
            "kind": "topic_modeling",
            "stop_words": {"words": []},
            "words_per_topic": 15,
            "projection_selection": None,
        }
    )
    assert "topic_names" not in settings.model_dump(mode="json")

    from ldaca_wordflow.domain.workspace.analysis import (
        TopicModelingDataBlockCreationAnalysisRequest,
    )

    node = "00000000-0000-0000-0000-000000000001"
    request = TopicModelingDataBlockCreationAnalysisRequest.model_validate(
        {
            "node_ids": [node],
            "selected_columns": {node: ["text"]},
            "new_node_names": {node: "Topics"},
            "cluster_count": 3,
            "top_n_topics": 1,
        }
    )
    assert "topic_names_override" not in request.model_dump(mode="json")
    assert TopicNameOverride(topic_id=0, name=" Sleep ").name == "Sleep"
