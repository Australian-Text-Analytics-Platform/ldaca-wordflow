"""Corpus overview statistics (issue 327)."""

import polars as pl
import pytest

from ldaca_wordflow.services.corpus_overview import corpus_overview
from ldaca_wordflow.shared.errors import InvalidInputError


def test_counts_documents_empty_and_duplicates_and_word_lengths() -> None:
    frame = pl.LazyFrame(
        {"text": ["The cat sat.", "The cat sat.", "", None, "  ", "A dog ran far away"]}
    )

    overview = corpus_overview(frame, "text")

    assert overview.documents == 6
    assert overview.empty_documents == 3
    assert overview.duplicate_documents == 1
    assert overview.unit == "words"
    assert overview.total == 3 + 3 + 5
    assert (overview.minimum, overview.median, overview.maximum) == (3, 3.0, 5)
    assert overview.mean == pytest.approx(11 / 3)


def test_counts_characters_for_text_with_few_spaces() -> None:
    frame = pl.LazyFrame({"text": ["今日は良い天気です", "猫が好き"]})

    overview = corpus_overview(frame, "text")

    assert overview.unit == "characters"
    assert overview.total == 9 + 4
    assert (overview.minimum, overview.maximum) == (4, 9)


def test_all_empty_documents_have_no_lengths() -> None:
    overview = corpus_overview(pl.LazyFrame({"text": ["", None]}), "text")

    assert overview.empty_documents == 2
    assert overview.total == 0
    assert overview.minimum is None and overview.mean is None


def test_refuses_columns_that_are_not_text() -> None:
    with pytest.raises(InvalidInputError, match="not a text column"):
        corpus_overview(pl.LazyFrame({"n": [1, 2]}), "n")
    with pytest.raises(InvalidInputError, match="not found"):
        corpus_overview(pl.LazyFrame({"text": ["a"]}), "missing")
