"""AI Code Designer: sampling, prompts and reading the answer (Chao, 15 Nov 2026)."""

from __future__ import annotations

import json

import polars as pl
import pytest

from ldaca_wordflow.infrastructure.providers.codebook_designer import (
    CodebookAnswerError,
    DesignedCode,
    SampledTexts,
    build_designer_system_prompt,
    build_designer_user_prompt,
    codebook_schema,
    parse_codebook_answer,
    sample_texts,
)


def _frame(values: list[str | None]) -> pl.LazyFrame:
    return pl.LazyFrame({"text": values, "other": list(range(len(values)))})


def test_sample_skips_empty_and_repeated_texts_and_cuts_long_ones() -> None:
    long_text = " ".join(f"w{index}" for index in range(400))
    sample = sample_texts(
        _frame(["a b", "a b", None, "   ", "c", long_text]),
        "text",
        size=100,
        seed=0,
    )

    assert sample.available == 3
    assert sorted(sample.texts, key=len)[:2] == ["c", "a b"]
    longest = max(sample.texts, key=len).split()
    assert len(longest) == 150
    assert longest[0] == "w0"


def test_sample_is_seeded_and_capped_at_the_size() -> None:
    frame = _frame([f"text {index}" for index in range(500)])
    first = sample_texts(frame, "text", size=100, seed=7)
    again = sample_texts(frame, "text", size=100, seed=7)
    other_seed = sample_texts(frame, "text", size=100, seed=8)

    assert len(first.texts) == 100
    assert first.available == 500
    assert first.texts == again.texts
    assert first.texts != other_seed.texts


def test_sample_of_an_empty_column_is_empty() -> None:
    assert sample_texts(_frame([None, " "]), "text", size=20, seed=0) == SampledTexts(
        [], 0
    )


def test_system_prompt_ends_with_the_answer_format_and_the_maximum() -> None:
    prompt = build_designer_system_prompt("  Design a codebook.  ", 4)

    assert prompt.startswith("Design a codebook.")
    assert "at most 4 real classes" in prompt
    assert '"Other" as the last class' in prompt
    assert prompt.rstrip().endswith("No prose, no markdown.")


def test_user_prompt_carries_the_brief_context_and_sample() -> None:
    sample = SampledTexts(["first text", "second text"], available=226)
    with_context = build_designer_user_prompt(
        brief="How candidates talk about jobs.",
        task_context="Tweets from 2020.",
        max_classes=3,
        sample=sample,
    )
    without_context = build_designer_user_prompt(
        brief="How candidates talk about jobs.",
        task_context="  ",
        max_classes=3,
        sample=sample,
    )

    assert "Brief:\nHow candidates talk about jobs." in with_context
    assert "Task context:\nTweets from 2020." in with_context
    assert "Task context" not in without_context
    assert "2 of 226 distinct texts" in with_context
    assert json.dumps(["first text", "second text"]) in with_context


def test_schema_allows_the_maximum_plus_other() -> None:
    schema = codebook_schema(3)
    assert schema["properties"]["codes"]["maxItems"] == 4


def test_answer_in_a_code_fence_is_read() -> None:
    answer = (
        '```json\n{"codes": [{"name": "Promise", "definition": "Jobs created."},'
        ' {"name": "Other", "definition": "Anything else."}]}\n```'
    )

    assert parse_codebook_answer(answer, 3) == [
        DesignedCode("Promise", "Jobs created."),
        DesignedCode("Other", "Anything else."),
    ]


def test_other_moves_last_and_extra_classes_are_dropped() -> None:
    answer = json.dumps(
        {
            "codes": [
                {"name": "other", "definition": "Rest."},
                {"name": " Promise ", "definition": "A"},
                {"name": "Cuts", "definition": "B"},
                {"name": "promise", "definition": "repeat"},
                {"name": "__task_context__", "definition": "reserved"},
                {"name": "Praise", "definition": "C"},
            ]
        }
    )

    assert parse_codebook_answer(answer, 2) == [
        DesignedCode("Promise", "A"),
        DesignedCode("Cuts", "B"),
        DesignedCode("Other", "Rest."),
    ]


def test_missing_other_is_added() -> None:
    answer = json.dumps({"codes": [{"name": "Promise", "definition": "A"}]})

    codes = parse_codebook_answer(answer, 3)
    assert codes[-1].name == "Other"
    assert codes[-1].definition


@pytest.mark.parametrize(
    "answer",
    [
        "not json at all",
        '{"labels": []}',
        '{"codes": [{"name": "Other", "definition": "x"}]}',
    ],
)
def test_unreadable_answers_raise(answer: str) -> None:
    with pytest.raises(CodebookAnswerError):
        parse_codebook_answer(answer, 3)
