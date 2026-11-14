"""Token counts of a text column's segmentation units (issue 414).

Topic Modelling sizes passages from how long the units a segmentation mode
keeps whole are, in the embedding model's tokens. Units are counted with
polars-text without splitting anything (only the model's tokenizer loads,
never the model), so the counts do not depend on the passage size later
chosen: there is nothing to re-measure after choosing. No text leaves the
backend.

Two callers: the segment-length endpoint reads the first documents of a
column for the suggestion and the estimate shown before a run; a Topic
Modelling run whose Max tokens is Auto reads every text it is about to
segment and takes ``segment_token_cap`` of the result (Chao, 2026-11-11).

What is measured follows the mode: Sentence measures sentences, Line measures
lines, and Automatic measures whole texts, unless nearly every text is longer
than the model reads, in which case Automatic splits them by paragraph in
practice and paragraphs are measured instead.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal, cast

import polars as pl

from ..domain.workspace import (
    TOPIC_EMBEDDING_MODEL_TOKEN_LIMITS,
    TopicEmbeddingModel,
    TopicSegmentationMethod,
)
from ..shared.errors import InvalidInputError

# Documents read: the first ones, like the tokeniser language guess.
SAMPLE_DOCUMENTS = 200
# Passage sizes Max tokens offers: the lengths the embedder pads to and
# compiles for (issue 412).
SEGMENT_TOKEN_SIZES = (32, 64, 128, 256)
# Share of units a passage size must hold whole (Chao, issue 414: 85 to 90%).
UNITS_KEPT_WHOLE = 0.9
# Share of texts over the model's limit at which Automatic measures paragraphs.
LONG_TEXT_SHARE = 0.9

MeasuredUnit = Literal["document", "paragraph", "line", "sentence"]


@dataclass(frozen=True)
class TopicSegmentLengths:
    sampled_documents: int
    unit: MeasuredUnit
    units: int
    token_limit: int
    long_document_share: float | None
    p50: int | None
    p85: int | None
    p90: int | None
    p95: int | None


def _percentile(sorted_values: list[int], share: float) -> int | None:
    """Nearest-rank percentile: at least ``share`` of the values are <= it."""

    if not sorted_values:
        return None
    rank = max(1, math.ceil(share * len(sorted_values)))
    return sorted_values[rank - 1]


def _unit_counts(
    texts: pl.LazyFrame, column: str, unit: str, model: TopicEmbeddingModel
) -> list[list[int]]:
    import polars_text  # noqa: F401  (registers the ``.text`` expr namespace)

    frame = texts.select(
        cast(Any, pl.col(column))
        .text.segment_token_counts(unit, model=model.value)
        .alias("counts")
    ).collect()
    return [list(row or []) for row in frame["counts"].to_list()]


def segment_token_cap(p90: int | None, token_limit: int) -> int:
    """The passage size Auto chooses: the smallest offered size within the
    model's limit that holds at least 9 in 10 units whole, or the limit when
    none does or nothing was measured. The client's suggestion uses the same
    rule (``suggestedSegmentTokenCap``)."""

    if p90 is None:
        return token_limit
    for size in SEGMENT_TOKEN_SIZES:
        if size <= token_limit and size >= p90:
            return size
    return token_limit


def topic_segment_lengths(
    lazyframe: pl.LazyFrame,
    column: str,
    segmentation_method: TopicSegmentationMethod,
    embedding_model: TopicEmbeddingModel,
    *,
    sample_documents: int | None = SAMPLE_DOCUMENTS,
) -> TopicSegmentLengths:
    """Token-count percentiles of the units ``segmentation_method`` keeps whole.

    Reads the first ``sample_documents`` non-empty texts, or every one when
    None.
    """

    schema = lazyframe.collect_schema()
    if column not in schema:
        raise InvalidInputError(f'Column "{column}" was not found.')
    if schema[column] != pl.String:
        raise InvalidInputError(f'"{column}" is not a text column.')

    text = pl.col(column)
    texts = lazyframe.select(text).filter(
        text.is_not_null() & (text.str.strip_chars().str.len_chars() > 0)
    )
    if sample_documents is not None:
        texts = texts.head(sample_documents)
    token_limit = TOPIC_EMBEDDING_MODEL_TOKEN_LIMITS[embedding_model]
    long_document_share: float | None = None
    unit: MeasuredUnit
    if segmentation_method is TopicSegmentationMethod.AUTOMATIC:
        per_document = _unit_counts(texts, column, "automatic", embedding_model)
        whole = [counts[0] for counts in per_document if counts]
        long_document_share = (
            sum(count > token_limit for count in whole) / len(whole) if whole else None
        )
        if long_document_share is not None and long_document_share >= LONG_TEXT_SHARE:
            unit = "paragraph"
            per_document = _unit_counts(texts, column, "paragraph", embedding_model)
        else:
            unit = "document"
    else:
        unit = (
            "line" if segmentation_method is TopicSegmentationMethod.LINE else "sentence"
        )
        per_document = _unit_counts(texts, column, unit, embedding_model)

    values = sorted(count for counts in per_document for count in counts)
    return TopicSegmentLengths(
        sampled_documents=len(per_document),
        unit=unit,
        units=len(values),
        token_limit=token_limit,
        long_document_share=long_document_share,
        p50=_percentile(values, 0.5),
        p85=_percentile(values, 0.85),
        p90=_percentile(values, UNITS_KEPT_WHOLE),
        p95=_percentile(values, 0.95),
    )
