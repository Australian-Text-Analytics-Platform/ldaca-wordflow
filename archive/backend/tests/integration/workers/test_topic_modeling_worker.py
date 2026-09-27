"""Deterministic unit tests for the Rust-backed topic-modeling worker.

The heavy lifting (segmentation, ORT embeddings, PaCMAP, HDBSCAN, c-TF-IDF) lives
in the ``polars-text`` Rust extension and is exercised by that package's native
tests. These tests cover only the deterministic Python glue:

- corpus sampling and the c-TF-IDF vectorizer/stopword heuristics
  (``workers.topic_pipeline``),
- the reconstruction of the result dict from the ``.text.topic_modeling``
  expression (``_run_rust_topic_modeling``), with the expression itself faked,
- the payload/parquet assembly in the orchestrator
  (``_compute_topic_modeling``) and the exact-count re-aggregation path, with
  ``_run_rust_topic_modeling`` faked to a canned result.
"""

from __future__ import annotations
from tests.support.topic_terms import _terms




import uuid
from typing import Any

import pytest
from ldaca_wordflow.analysis.topic_projection import TopicNodeInfo
from ldaca_wordflow.workers import topic_modeling








# ---------------------------------------------------------------------------
# Sampling helpers (pure, deterministic)
# ---------------------------------------------------------------------------










# ---------------------------------------------------------------------------
# _run_rust_topic_modeling: reconstruct the result dict from the expression
# ---------------------------------------------------------------------------










# ---------------------------------------------------------------------------
# Orchestrator + payload assembly (with _run_rust_topic_modeling faked)
# ---------------------------------------------------------------------------


def _canned_rust_result(
    *,
    documents: list[dict[str, Any]],
    topics: list[dict[str, Any]],
    n_segments: int = 7,
) -> dict[str, Any]:
    return {
        "documents": documents,
        "topics": topics,
        "n_topics": len(topics),
        "n_segments": n_segments,
        "projection_context": b"context" if topics else None,
    }


def _node_info(node_id: str = "node-1") -> TopicNodeInfo:
    return TopicNodeInfo(
        node_id=uuid.uuid5(uuid.NAMESPACE_URL, f"topic-modeling:{node_id}"),
        node_name=f"Node {node_id}",
        text_column="document",
        original_columns=("document",),
    )


def test_compute_topic_modeling_persists_context_and_assembles_results(
    tmp_path, monkeypatch
):
    messages: list[str] = []
    monkeypatch.setattr(
        topic_modeling.logger,
        "info",
        lambda message, *args: messages.append(message % args),
    )
    progress: list[tuple[float, str]] = []

    seen_run_kwargs: dict[str, Any] = {}

    def fake_run(**kwargs):
        seen_run_kwargs.update(kwargs)
        return _canned_rust_result(
            documents=[
                {
                    "doc_index": 0,
                    "dominant_topic": 0,
                    "topic_coverage": [{"topic_id": 0, "coverage": 1.0}],
                },
                {
                    "doc_index": 1,
                    "dominant_topic": 0,
                    "topic_coverage": [
                        {"topic_id": 0, "coverage": 0.7},
                        {"topic_id": 1, "coverage": 0.3},
                    ],
                },
            ],
            topics=[
                {
                    "id": 0,
                    "representative_words": _terms("alpha", "beta", "gamma"),
                    "x": 1.5,
                    "y": -2.0,
                },
                {
                    "id": 1,
                    "representative_words": _terms("delta"),
                    "x": 2.5,
                    "y": 3.0,
                },
            ],
        )

    monkeypatch.setattr(topic_modeling, "_run_rust_topic_modeling", fake_run)
    embedding_cache_path = tmp_path / "embeddings.duckdb"

    result = topic_modeling._compute_topic_modeling(
        corpora=[["doc one", "doc two"]],
        node_infos=[_node_info()],
        artifact_dir=str(tmp_path),
        artifact_prefix="tm_test",
        segmentation_method="line",
        max_segment_tokens=64,
        embedding_cache_path=str(embedding_cache_path),
        progress_callback=lambda p, m: progress.append((p, m)),
    )

    context_path = tmp_path / "tm_test_topic_projection_context.msgpack.zst"
    assert context_path.read_bytes() == b"context"

    topic = result["topics"][0]
    assert topic["representative_words"] == _terms("alpha", "beta", "gamma")
    assert topic["x"] == pytest.approx(1.5)
    assert topic["y"] == pytest.approx(-2.0)
    assert topic["size"] == [2]

    assert seen_run_kwargs["embedding_cache"] == str(embedding_cache_path)
    assert seen_run_kwargs["segmentation_method"] == "line"
    assert seen_run_kwargs["max_segment_tokens"] == 64
    assert result["segment_count"] == 7
    assert progress[0][1].startswith("Loading topic modelling")
    assert progress[-1] == (0.9, "Writing topic-modelling results...")
    assert all(0.0 <= fraction < 1.0 for fraction, _message in progress)


def test__compute_topic_modeling_payload_keeps_all_ranked_candidates(
    tmp_path, monkeypatch
):
    """The payload and meaning artifact keep all ranked candidates."""

    many_words = [f"w{i}" for i in range(60)]

    def fake_run(**_kwargs):
        return _canned_rust_result(
            documents=[{"doc_index": 0, "dominant_topic": 0}],
            topics=[
                {
                    "id": 0,
                    "representative_words": _terms(*many_words),
                    "x": 0.0,
                    "y": 0.0,
                }
            ],
        )

    monkeypatch.setattr(topic_modeling, "_run_rust_topic_modeling", fake_run)

    result = topic_modeling._compute_topic_modeling(
        corpora=[["only doc"]],
        node_infos=[_node_info()],
        artifact_dir=str(tmp_path),
        artifact_prefix="tm_cap",
        embedding_cache_path=str(tmp_path / "embeddings.duckdb"),
    )

    assert result["topics"][0]["representative_words"] == _terms(*many_words)
    assert result["clustering"]["cluster_count"] == 1


def test__compute_topic_modeling_sampling_records_before_after_sizes(
    tmp_path, monkeypatch
):
    messages: list[str] = []
    monkeypatch.setattr(
        topic_modeling.logger,
        "info",
        lambda message, *args: messages.append(message % args),
    )
    seen_docs: dict[str, int] = {}

    def fake_run(*, all_docs, **_kwargs):
        seen_docs["count"] = len(all_docs)
        documents = [
            {"doc_index": i, "dominant_topic": 0} for i in range(len(all_docs))
        ]
        return _canned_rust_result(
            documents=documents,
            topics=[{"id": 0, "representative_words": _terms("x"), "x": 0.0, "y": 0.0}],
        )

    monkeypatch.setattr(topic_modeling, "_run_rust_topic_modeling", fake_run)

    corpus = [f"doc {i}" for i in range(20)]
    result = topic_modeling._compute_topic_modeling(
        corpora=[corpus],
        node_infos=[_node_info("n1")],
        artifact_dir=str(tmp_path),
        artifact_prefix="tm_sample",
        embedding_cache_path=str(tmp_path / "embeddings.duckdb"),
        sample_fractions=[0.5],
    )

    assert seen_docs["count"] == 10
    assert result["corpus_sizes"] == [10]
    assert any(
        "corpus_sizes_before=[20] corpus_sizes_after=[10]" in message
        for message in messages
    )


def test__compute_topic_modeling_forwards_requested_minimum_cluster_size(
    tmp_path, monkeypatch
):
    captured_kwargs: dict[str, Any] = {}

    def fake_run(**kwargs):
        captured_kwargs.update(kwargs)
        return _canned_rust_result(
            documents=[
                {"doc_index": 0, "dominant_topic": 0},
                {"doc_index": 1, "dominant_topic": 1},
            ],
            topics=[
                {"id": 0, "representative_words": _terms("a"), "x": 0.0, "y": 0.0},
                {"id": 1, "representative_words": _terms("b"), "x": 1.0, "y": 1.0},
            ],
        )

    monkeypatch.setattr(topic_modeling, "_run_rust_topic_modeling", fake_run)

    result = topic_modeling._compute_topic_modeling(
        corpora=[["doc one", "doc two"]],
        node_infos=[_node_info("n1")],
        artifact_dir=str(tmp_path),
        artifact_prefix="tm_min",
        embedding_cache_path=str(tmp_path / "embeddings.duckdb"),
        min_cluster_size=4,
    )

    assert captured_kwargs["min_cluster_size"] == 4
    assert result["clustering"]["max_cluster_count"] == 2
