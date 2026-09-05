from __future__ import annotations
from tests.support.topic_terms import _terms
from typing import Any
import polars_text
import pytest
from tests.support.topic_pipeline import _fake_topic_modeling_expr_factory

from ldaca_wordflow.workers import topic_pipeline, topic_result
from ldaca_wordflow.workers.topic_pipeline import _sample_corpus



@pytest.mark.parametrize(
    "entries",
    [
        [{"topic_id": 0, "coverage": 0.5}, {"topic_id": 0, "coverage": 0.5}],
        [{"topic_id": 9, "coverage": 1.0}],
        [{"topic_id": "bad", "coverage": 1.0}],
    ],
)
def test_topic_coverage_rejects_noncanonical_entries(entries) -> None:
    with pytest.raises(ValueError, match="Topic Coverage"):
        topic_result._coverage_by_doc_index(
            [{"doc_index": 0, "topic_coverage": entries}],
            1,
            [0],
        )


def test_projected_topic_coverage_rejects_non_unit_total(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        polars_text,
        "project_topics",
        lambda _context, _count: {
            "topics": [
                {
                    "id": 0,
                    "representative_words": [],
                    "x": 0.0,
                    "y": 0.0,
                }
            ],
            "documents": [
                {
                    "doc_index": 0,
                    "dominant_topic": 0,
                    "topic_coverage": [(0, 0.5)],
                }
            ],
            "n_segments": 1,
        },
    )

    with pytest.raises(ValueError, match="sum to one"):
        topic_pipeline._project_rust_topic_modeling(
            projection_context=b"context",
            cluster_count=1,
            document_count=1,
        )


def test_sample_corpus_reduces_length_and_is_reproducible():
    docs = [f"doc {i}" for i in range(100)]
    sampled_docs, sampled_idx = _sample_corpus(docs, 0.5, seed=0)
    assert len(sampled_docs) == 50
    assert len(sampled_idx) == 50
    # Same seed reproduces the exact sample.
    docs2, idx2 = _sample_corpus(docs, 0.5, seed=0)
    assert docs2 == sampled_docs
    assert idx2 == sampled_idx
    # A different seed selects a different sample.
    docs3, _ = _sample_corpus(docs, 0.5, seed=99)
    assert docs3 != sampled_docs


def test_sample_corpus_indices_are_original_sorted_positions():
    docs = [f"doc {i}" for i in range(20)]
    sampled_docs, sampled_idx = _sample_corpus(docs, 0.5, seed=7)
    for doc, idx in zip(sampled_docs, sampled_idx, strict=True):
        assert doc == docs[idx]
    assert sampled_idx == sorted(sampled_idx)


def test_sample_corpus_fraction_at_or_above_one_returns_original():
    docs = ["a", "b", "c"]
    result_docs, result_idx = _sample_corpus(docs, 1.0, seed=0)
    assert result_docs == docs
    assert result_idx == [0, 1, 2]
    result_docs2, _ = _sample_corpus(docs, 2.0, seed=0)
    assert result_docs2 == docs


def test_sample_corpus_min_k_is_one():
    docs = ["only"]
    result_docs, result_idx = _sample_corpus(docs, 0.01, seed=0)
    assert len(result_docs) == 1
    assert len(result_idx) == 1


def test_run_rust_topic_modeling_reconstructs_result_dict(monkeypatch):
    from polars_text.namespace import TextNamespace

    monkeypatch.setattr(
        TextNamespace,
        "topic_modeling",
        _fake_topic_modeling_expr_factory(
            documents=[
                {"doc_index": 0, "dominant_topic": 0},
                {"doc_index": 1, "dominant_topic": 0},
                {"doc_index": 2, "dominant_topic": 0},
                {"doc_index": 3, "dominant_topic": -1},
            ],
            topics=[
                {
                    "id": 0,
                    "representative_words": _terms("alpha", "beta"),
                    "x": 1.0,
                    "y": 3.0,
                },
                {
                    "id": 1,
                    "representative_words": _terms("gamma"),
                    "x": 2.0,
                    "y": 4.0,
                },
            ],
            n_segments=5,
            coverage=[
                [
                    {"topic_id": 0, "coverage": 0.9},
                    {"topic_id": 1, "coverage": 0.1},
                ],
                [{"topic_id": 0, "coverage": 1.0}],
                [
                    {"topic_id": 0, "coverage": 0.2},
                    {"topic_id": 1, "coverage": 0.8},
                ],
                [],
            ],
        ),
    )

    result = topic_pipeline._run_rust_topic_modeling(
        all_docs=["d0", "d1", "d2", "d3"],
        seed=0,
        min_cluster_size=10,
        vectorizer_model="native:plain_words_en",
        embedder_model="fake-model",
    )

    # Documents carry both the dominant Topic and source-character coverage.
    # Coverage always starts with outlier -1 and then every real Topic id.
    # appears in every document, with 0.0 where the doc has no presence; this
    # powers the Topic Coverage filter and data-view bars. The outlier
    # document (-1) has no non-negative dominant topics of its own but still
    # gets the full padded key set.
    assert result["documents"] == [
        {
            "doc_index": 0,
            "dominant_topic": 0,
            "topic_coverage": [
                {"topic_id": -1, "coverage": pytest.approx(0.0)},
                {"topic_id": 0, "coverage": pytest.approx(0.9)},
                {"topic_id": 1, "coverage": pytest.approx(0.1)},
            ],
        },
        {
            "doc_index": 1,
            "dominant_topic": 0,
            "topic_coverage": [
                {"topic_id": -1, "coverage": pytest.approx(0.0)},
                {"topic_id": 0, "coverage": pytest.approx(1.0)},
                {"topic_id": 1, "coverage": pytest.approx(0.0)},
            ],
        },
        {
            "doc_index": 2,
            "dominant_topic": 0,
            "topic_coverage": [
                {"topic_id": -1, "coverage": pytest.approx(0.0)},
                {"topic_id": 0, "coverage": pytest.approx(0.2)},
                {"topic_id": 1, "coverage": pytest.approx(0.8)},
            ],
        },
        {
            "doc_index": 3,
            "dominant_topic": -1,
            "topic_coverage": [
                {"topic_id": -1, "coverage": pytest.approx(0.0)},
                {"topic_id": 0, "coverage": pytest.approx(0.0)},
                {"topic_id": 1, "coverage": pytest.approx(0.0)},
            ],
        },
    ]
    # Topic 1 is preserved even though it never dominates a document.
    assert result["topics"] == [
        {"id": 0, "representative_words": _terms("alpha", "beta"), "x": 1.0, "y": 3.0},
        {"id": 1, "representative_words": _terms("gamma"), "x": 2.0, "y": 4.0},
    ]
    assert result["n_topics"] == 2
    assert result["n_segments"] == 5


@pytest.mark.parametrize("segmentation_method", ["automatic", "line", "sentence"])
def test_run_rust_topic_modeling_forwards_each_segmentation_mode_to_shared_pipeline(
    monkeypatch, segmentation_method: str
) -> None:
    from polars_text.namespace import TextNamespace

    seen_kwargs: dict[str, Any] = {}
    monkeypatch.setattr(
        TextNamespace,
        "topic_modeling",
        _fake_topic_modeling_expr_factory(
            documents=[{"doc_index": 0, "dominant_topic": 0}],
            topics=[
                {
                    "id": 0,
                    "representative_words": _terms("alpha"),
                    "x": 0.0,
                    "y": 0.0,
                }
            ],
            n_segments=3,
            seen_kwargs=seen_kwargs,
        ),
    )

    result = topic_pipeline._run_rust_topic_modeling(
        all_docs=["one document"],
        seed=0,
        min_cluster_size=2,
        vectorizer_model="native:plain_words_en",
        segmentation_method=segmentation_method,
        max_segment_tokens=64,
    )

    assert (seen_kwargs["segmentation"], seen_kwargs["max_tokens"]) == (
        segmentation_method,
        64,
    )
    assert result["n_segments"] == 3


@pytest.mark.parametrize(
    ("documents", "topics", "message"),
    [
        (
            [
                {
                    "doc_index": 0,
                    "dominant_topic": 1,
                    "topic_coverage": [{"topic_id": 1, "coverage": 1.0}],
                }
            ],
            [
                {
                    "id": 1,
                    "representative_words": [],
                    "x": 0.0,
                    "y": 0.0,
                }
            ],
            "topic ids must be contiguous",
        ),
        (
            [
                {
                    "doc_index": 3,
                    "dominant_topic": 0,
                    "topic_coverage": [{"topic_id": 0, "coverage": 1.0}],
                }
            ],
            [
                {
                    "id": 0,
                    "representative_words": [],
                    "x": 0.0,
                    "y": 0.0,
                }
            ],
            "document indices are invalid",
        ),
        (
            [
                {
                    "doc_index": 0,
                    "dominant_topic": 0,
                    "topic_coverage": [
                        {"topic_id": 0, "coverage": 0.5},
                        {"topic_id": 0, "coverage": 0.5},
                    ],
                }
            ],
            [
                {
                    "id": 0,
                    "representative_words": [],
                    "x": 0.0,
                    "y": 0.0,
                }
            ],
            "duplicate Topic id",
        ),
    ],
)
def test_run_rust_topic_modeling_rejects_invalid_native_identity_contracts(
    monkeypatch,
    documents: list[dict[str, Any]],
    topics: list[dict[str, Any]],
    message: str,
) -> None:
    from polars_text.namespace import TextNamespace

    monkeypatch.setattr(
        TextNamespace,
        "topic_modeling",
        _fake_topic_modeling_expr_factory(
            documents=documents,
            topics=topics,
            n_segments=1,
        ),
    )

    with pytest.raises(ValueError, match=message):
        topic_pipeline._run_rust_topic_modeling(
            all_docs=["one document"],
            seed=0,
            min_cluster_size=2,
            vectorizer_model="native:plain_words_en",
        )
