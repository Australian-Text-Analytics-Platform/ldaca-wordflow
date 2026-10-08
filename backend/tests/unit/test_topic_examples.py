"""Choosing and ranking a Topic's example segments (issue 353)."""

from ldaca_wordflow.analysis.topic_examples import (
    TopicSegment,
    corpus_position,
    order_topic_segments,
    typicality_percentiles,
)

SEGMENTS = [
    TopicSegment(0, 0, 0, 10, 0.2),
    TopicSegment(1, 0, 10, 20, 0.9),
    TopicSegment(2, 1, 0, 10, 0.5),
    TopicSegment(3, 2, 0, 10, 0.7),
]


def test_typical_order_puts_the_most_similar_first() -> None:
    ordered = order_topic_segments(SEGMENTS, order="typical", seed=0, one_per_document=False)
    assert [segment.segment_index for segment in ordered] == [1, 3, 2, 0]


def test_one_per_document_keeps_each_documents_most_typical_segment() -> None:
    ordered = order_topic_segments(SEGMENTS, order="typical", seed=0, one_per_document=True)
    assert [segment.segment_index for segment in ordered] == [1, 3, 2]


def test_random_order_uses_exactly_the_seed() -> None:
    first = order_topic_segments(SEGMENTS, order="random", seed=7, one_per_document=False)
    second = order_topic_segments(SEGMENTS, order="random", seed=7, one_per_document=False)
    other = order_topic_segments(SEGMENTS, order="random", seed=8, one_per_document=False)
    assert first == second
    assert sorted(s.segment_index for s in first) == [0, 1, 2, 3]
    assert first != other or len(SEGMENTS) < 3


def test_documents_can_be_filtered() -> None:
    ordered = order_topic_segments(
        SEGMENTS, order="typical", seed=0, one_per_document=True, allowed_documents={1, 2}
    )
    assert [segment.document_index for segment in ordered] == [2, 1]


def test_typicality_is_the_share_of_less_similar_segments() -> None:
    assert typicality_percentiles(SEGMENTS) == {0: 0, 1: 100, 2: 33, 3: 67}
    assert typicality_percentiles([TopicSegment(0, 0, 0, 1, 0.4)]) == {0: 100}
    no_embeddings = [TopicSegment(0, 0, 0, 1, None), TopicSegment(1, 0, 1, 2, None)]
    assert typicality_percentiles(no_embeddings) == {0: None, 1: None}


def test_corpus_position_follows_corpus_sizes() -> None:
    assert corpus_position(0, [3, 2]) == (0, 0)
    assert corpus_position(4, [3, 2]) == (1, 1)


def test_group_label_matches_the_colour_legend() -> None:
    from ldaca_wordflow.analysis.topic_metadata_colors import (
        MISSING_GROUP_LABEL,
        group_label,
    )

    assert group_label(None) == MISSING_GROUP_LABEL
    assert group_label(float("nan")) == MISSING_GROUP_LABEL
    assert group_label(2.0) == "2"
    assert group_label(True) == "true"
    assert group_label("Senate") == "Senate"
