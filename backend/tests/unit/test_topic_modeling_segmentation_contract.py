from __future__ import annotations

import uuid

import pytest
from ldaca_wordflow.domain.workspace import (
    TopicModelingAnalysisRequest,
    TopicSegmentationMethod,
)
from pydantic import ValidationError


def _request(**overrides: object) -> TopicModelingAnalysisRequest:
    node_id = uuid.uuid4()
    return TopicModelingAnalysisRequest.model_validate(
        {
            "node_ids": [node_id],
            "node_columns": {node_id: "document"},
            **overrides,
        }
    )


def test_legacy_topic_modeling_request_defaults_to_automatic_segments() -> None:
    request = _request()

    assert (request.segmentation_method, request.max_segment_tokens) == (
        TopicSegmentationMethod.AUTOMATIC,
        256,
    )
    assert request.min_cluster_size == 10


def test_topic_modeling_request_accepts_custom_minimum_cluster_size() -> None:
    assert _request(min_cluster_size=25).min_cluster_size == 25


def test_topic_modeling_request_rejects_minimum_cluster_size_below_two() -> None:
    with pytest.raises(ValidationError):
        _request(min_cluster_size=1)


def test_topic_modeling_request_defaults_max_topic_size_to_auto() -> None:
    assert _request().max_cluster_size is None


def test_topic_modeling_request_accepts_a_fixed_max_topic_size() -> None:
    assert _request(min_cluster_size=5, max_cluster_size=300).max_cluster_size == 300


@pytest.mark.parametrize("max_cluster_size", [5, 4])
def test_topic_modeling_request_rejects_max_topic_size_not_above_minimum(
    max_cluster_size: int,
) -> None:
    with pytest.raises(ValidationError, match="Max topic size must be larger"):
        _request(min_cluster_size=5, max_cluster_size=max_cluster_size)


@pytest.mark.parametrize("max_segment_tokens", [31, 257])
def test_topic_modeling_request_rejects_segment_caps_outside_model_window(
    max_segment_tokens: int,
) -> None:
    with pytest.raises(ValidationError):
        _request(max_segment_tokens=max_segment_tokens)


def test_topic_modeling_request_rejects_unknown_segmentation_method() -> None:
    with pytest.raises(ValidationError):
        _request(segmentation_method="fixed_length")
