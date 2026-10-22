"""Token counts of a text column's segmentation units (issue 414)."""

from __future__ import annotations

import polars as pl
import pytest

from ldaca_wordflow.domain.workspace import TopicEmbeddingModel, TopicSegmentationMethod
from ldaca_wordflow.services import topic_segment_lengths as module
from ldaca_wordflow.services.topic_segment_lengths import (
    SAMPLE_DOCUMENTS,
    topic_segment_lengths,
)
from ldaca_wordflow.shared.errors import InvalidInputError


def _fake_counts(
    monkeypatch: pytest.MonkeyPatch, counts: dict[str, list[list[int]]]
) -> list[tuple[str, int]]:
    """Replace the polars-text call with canned per-document unit counts."""

    calls: list[tuple[str, int]] = []

    def fake(texts: pl.LazyFrame, column: str, unit: str, model: object) -> list[list[int]]:
        calls.append((unit, texts.collect().height))
        return counts[unit]

    monkeypatch.setattr(module, "_unit_counts", fake)
    return calls


def test_sentence_mode_measures_sentences_with_nearest_rank_percentiles(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _fake_counts(
        monkeypatch, {"sentence": [[10, 20, 30], [], [40, 50, 60, 70, 80, 90, 100]]}
    )
    frame = pl.LazyFrame({"text": ["a. b. c.", "x", None, "  ", "d. e."]})

    lengths = topic_segment_lengths(
        frame,
        "text",
        TopicSegmentationMethod.SENTENCE,
        TopicEmbeddingModel.ENGLISH,
    )

    # Empty documents are never sampled.
    assert calls == [("sentence", 3)]
    assert lengths.unit == "sentence"
    assert (lengths.sampled_documents, lengths.units) == (3, 10)
    assert (lengths.p50, lengths.p85, lengths.p90, lengths.p95) == (50, 90, 90, 100)
    assert lengths.token_limit == 256
    assert lengths.long_document_share is None


def test_automatic_mode_measures_whole_texts_when_most_fit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _fake_counts(monkeypatch, {"automatic": [[40], [300], [60]]})
    frame = pl.LazyFrame({"text": ["one", "two", "three"]})

    lengths = topic_segment_lengths(
        frame, "text", TopicSegmentationMethod.AUTOMATIC, TopicEmbeddingModel.ENGLISH
    )

    assert [unit for unit, _ in calls] == ["automatic"]
    assert lengths.unit == "document"
    assert lengths.long_document_share == pytest.approx(1 / 3)
    assert (lengths.p50, lengths.p95) == (60, 300)


def test_automatic_mode_measures_paragraphs_when_nearly_every_text_is_long(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _fake_counts(
        monkeypatch,
        {
            # Over the multilingual model's 128 tokens, so split in practice.
            "automatic": [[200], [150], [129]],
            "paragraph": [[30, 40], [50], [60, 70]],
        },
    )
    frame = pl.LazyFrame({"text": ["one", "two", "three"]})

    lengths = topic_segment_lengths(
        frame,
        "text",
        TopicSegmentationMethod.AUTOMATIC,
        TopicEmbeddingModel.MULTILINGUAL,
    )

    assert [unit for unit, _ in calls] == ["automatic", "paragraph"]
    assert lengths.unit == "paragraph"
    assert lengths.token_limit == 128
    assert lengths.long_document_share == 1.0
    assert (lengths.units, lengths.p50, lengths.p95) == (5, 50, 70)


def test_only_the_first_documents_are_sampled(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_counts(monkeypatch, {"line": []})
    frame = pl.LazyFrame({"text": [f"line {index}" for index in range(SAMPLE_DOCUMENTS + 50)]})

    lengths = topic_segment_lengths(
        frame, "text", TopicSegmentationMethod.LINE, TopicEmbeddingModel.ENGLISH
    )

    assert calls == [("line", SAMPLE_DOCUMENTS)]
    assert lengths.units == 0
    assert lengths.p50 is None


def test_rejects_missing_and_non_text_columns() -> None:
    frame = pl.LazyFrame({"number": [1, 2]})
    with pytest.raises(InvalidInputError, match="was not found"):
        topic_segment_lengths(
            frame, "text", TopicSegmentationMethod.LINE, TopicEmbeddingModel.ENGLISH
        )
    with pytest.raises(InvalidInputError, match="not a text column"):
        topic_segment_lengths(
            frame, "number", TopicSegmentationMethod.LINE, TopicEmbeddingModel.ENGLISH
        )


def test_counts_real_units_with_the_model_tokenizer() -> None:
    """polars-text counts tokens with the model's tokenizer, special tokens included."""

    frame = pl.LazyFrame({"text": ["Hello world.\n\nSecond paragraph here."]})

    lengths = topic_segment_lengths(
        frame, "text", TopicSegmentationMethod.LINE, TopicEmbeddingModel.ENGLISH
    )

    assert (lengths.unit, lengths.units, lengths.p50, lengths.p95) == ("line", 2, 5, 6)
