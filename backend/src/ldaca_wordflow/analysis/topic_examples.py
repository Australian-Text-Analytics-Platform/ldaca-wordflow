"""Choose and rank a Topic's example segments (issue 353).

Pure helpers for the Topic Modelling examples pane: which segments of one
Topic to show, in which order, and how typical each is. The service reads the
run's projection context and the source documents; these functions only
order, filter and rank.
"""

from __future__ import annotations

import bisect
import random
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class TopicSegment:
    """One segment of a Topic, as polars-text reports it."""

    segment_index: int
    document_index: int
    start: int
    end: int
    similarity: float | None


def typicality_percentiles(segments: Sequence[TopicSegment]) -> dict[int, int | None]:
    """Each segment's share (0-100) of the Topic's segments less similar to its centre.

    ``None`` for every segment when the run kept no compact embeddings. A
    Topic of one segment ranks it 100.
    """

    similarities = sorted(
        segment.similarity for segment in segments if segment.similarity is not None
    )
    if len(similarities) != len(segments):
        return {segment.segment_index: None for segment in segments}
    below_max = max(1, len(similarities) - 1)
    return {
        segment.segment_index: (
            100
            if len(similarities) == 1
            else round(
                100 * bisect.bisect_left(similarities, segment.similarity or 0.0) / below_max
            )
        )
        for segment in segments
    }


def corpus_position(document_index: int, corpus_sizes: Sequence[int]) -> tuple[int, int]:
    """The corpus of a document in model order, and its position in that corpus."""

    offset = 0
    for corpus, size in enumerate(corpus_sizes):
        if document_index < offset + size:
            return corpus, document_index - offset
        offset += size
    raise ValueError("Document index is outside the run's corpora")


def order_topic_segments(
    segments: Sequence[TopicSegment],
    *,
    order: Literal["typical", "random"],
    seed: int,
    one_per_document: bool,
    allowed_documents: set[int] | None = None,
) -> list[TopicSegment]:
    """A Topic's segments in display order.

    ``typical`` sorts by similarity to the Topic's centre, most typical first
    (segment order when the run has no similarities); ``random`` shuffles with
    exactly the run's seed, so the same run lists the same examples.
    ``one_per_document`` keeps each document's first segment in that order:
    its most typical one, or its first in the random order.
    """

    kept = [
        segment
        for segment in segments
        if allowed_documents is None or segment.document_index in allowed_documents
    ]
    if order == "random":
        ordered = sorted(kept, key=lambda segment: segment.segment_index)
        random.Random(seed).shuffle(ordered)
    else:
        ordered = sorted(
            kept,
            key=lambda segment: (
                -(segment.similarity if segment.similarity is not None else 0.0),
                segment.segment_index,
            ),
        )
    if not one_per_document:
        return ordered
    seen: set[int] = set()
    unique: list[TopicSegment] = []
    for segment in ordered:
        if segment.document_index in seen:
            continue
        seen.add(segment.document_index)
        unique.append(segment)
    return unique


def shared_columns(column_lists: Sequence[Sequence[str]]) -> list[str]:
    """Columns every Data Block of the run has, in the first one's order.

    The examples' Label menu offers only these, so a label never silently
    applies to one Data Block of a comparison run (Chao, 2026-10-08).
    """

    if not column_lists:
        return []
    rest = [set(columns) for columns in column_lists[1:]]
    return [column for column in column_lists[0] if all(column in other for other in rest)]


__all__ = [
    "TopicSegment",
    "corpus_position",
    "order_topic_segments",
    "shared_columns",
    "typicality_percentiles",
]
