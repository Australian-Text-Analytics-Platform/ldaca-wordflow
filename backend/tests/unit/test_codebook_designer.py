"""AI Code Designer: sampling, prompts and reading the answer (Chao, 15 Nov 2026)."""

from __future__ import annotations

import json

import polars as pl
import pytest

from ldaca_wordflow.infrastructure.providers.codebook_designer import (
    cut_to_words,
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
    assert 'then one last class for texts that fit none of them ("Other" in English)' in prompt
    assert "in the language of the brief" in prompt
    assert '"catch_all": true' in prompt
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


# Any language (Chao, 17 Nov 2026) ---------------------------------------------------


def _marked(*codes: tuple[str, bool]) -> str:
    return json.dumps(
        {
            "codes": [
                {"name": name, "definition": f"{name}的定义", "catch_all": catch_all}
                for name, catch_all in codes
            ]
        }
    )


def test_a_catch_all_in_the_brief_language_is_recognised_by_its_mark() -> None:
    # Chao's People's Daily test: Chinese codes, a Chinese catch-all.
    codes = parse_codebook_answer(
        _marked(("其他", True), ("民生", False), ("经济", False)), 7
    )
    assert [code.name for code in codes] == ["民生", "经济", "其他"]
    # Nothing English is added beside it.
    assert "Other" not in [code.name for code in codes]


def test_on_a_scale_the_marked_catch_all_stays_outside_the_scale() -> None:
    codes = parse_codebook_answer(
        _marked(("低", False), ("中", False), ("高", False), ("不适用", True)), 5, scale=True
    )
    assert [(code.name, code.outside_scale) for code in codes] == [
        ("低", False),
        ("中", False),
        ("高", False),
        ("不适用", True),
    ]


def test_answers_without_the_mark_still_work_and_only_one_catch_all_is_kept() -> None:
    unmarked = json.dumps(
        {"codes": [{"name": "Jobs", "definition": "j"}, {"name": "other", "definition": "o"}]}
    )
    assert [code.name for code in parse_codebook_answer(unmarked, 3)] == ["Jobs", "Other"]
    # A second marked code is an ordinary class, not a second catch-all.
    two = parse_codebook_answer(_marked(("甲", True), ("乙", True), ("丙", False)), 3)
    assert [code.name for code in two] == ["乙", "丙", "甲"]


def test_the_schema_asks_for_the_mark() -> None:
    item = codebook_schema(3)["properties"]["codes"]["items"]
    assert item["required"] == ["name", "definition", "catch_all"]
    assert item["properties"]["catch_all"] == {"type": "boolean"}


def test_chinese_and_japanese_texts_are_cut_by_characters() -> None:
    article = "这是人民日报2021年的新闻报道文本。" * 40
    cut = cut_to_words(article, 150)
    # 150 words: about 300 characters, where splitting on spaces kept the whole text.
    assert 280 <= len(cut) <= 340
    assert article.startswith(cut)
    assert cut_to_words("one  two three four", 2) == "one two"
    assert cut_to_words("東京 は Tokyo です", 2) == "東京 は"


def test_a_sample_of_long_chinese_texts_is_cut() -> None:
    texts: list[str | None] = [f"第{index}篇。" + "新闻报道的正文内容" * 100 for index in range(5)]
    sample = sample_texts(_frame(texts), "text", size=5, seed=1)
    assert all(len(text) <= 340 for text in sample.texts)
