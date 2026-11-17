"""AI Code Designer: a first-draft codebook from a brief and a sample of texts.

The designer is a kick-off assistant (Chao, 15 Nov 2026). It sends one request
and returns the model's codes for the person to review; it does not evaluate
or retry. The system prompt comes from the client (its default lives in the
frontend, like the annotation prompt); the answer format below is appended
here so an edited prompt cannot break reading the answer.

Two kinds of codebook (Chao, 16 Nov 2026): categories end with "Other"; an
ordered scale is a list of levels from the lowest to the highest, then
"Not applicable", a code outside the scale. Both end with a catch-all code,
so no text is left empty: an empty label means "not coded".

Any language (Chao, 17 Nov 2026): the catch-all is named in the language of
the brief and marked in the answer (``catch_all``), so 其他 is recognised as
Other; and Chinese and Japanese characters count as half a word each when a
sampled text is cut, since those scripts don't put spaces between words.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import polars as pl

from ...domain.annotation import RESERVED_CODEBOOK_CODES
from .annotation_ai import _parse_answer

OTHER_CODE = "Other"
NOT_APPLICABLE_CODE = "Not applicable"
#: Each sampled text is cut to its first words, so long documents don't
#: crowd out the rest of the sample.
SAMPLE_TEXT_MAX_WORDS = 150
#: Chinese and Japanese characters (and their punctuation): a word is about
#: two of them, as these scripts put no spaces between words.
_CJK = (
    "\u3000-\u303f"  # CJK punctuation
    "\u3040-\u30ff"  # Hiragana, Katakana
    "\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"  # Han
    "\uff00-\uffef"  # full-width forms
)
_TOKEN = re.compile(f"(?P<cjk>[{_CJK}])|[^\\s{_CJK}]+")


def cut_to_words(text: str, max_words: int) -> str:
    """The text's first ``max_words`` words, a Chinese or Japanese character
    counting as half a word; spaces are tidied to single ones."""

    tidy = " ".join(text.split())
    weight = 0.0
    for match in _TOKEN.finditer(tidy):
        weight += 0.5 if match.group("cjk") else 1
        if weight > max_words:
            return tidy[: match.start()].rstrip()
    return tidy


class CodebookAnswerError(ValueError):
    """The model's answer could not be read as a codebook."""


@dataclass(frozen=True, slots=True)
class DesignedCode:
    name: str
    definition: str
    #: On a scale, a code that is not a level (Not applicable).
    outside_scale: bool = False


@dataclass(frozen=True, slots=True)
class SampledTexts:
    texts: list[str]
    #: Distinct non-empty texts the sample was drawn from.
    available: int


def sample_texts(
    lazyframe: pl.LazyFrame,
    column: str,
    *,
    size: int,
    seed: int,
    max_words: int = SAMPLE_TEXT_MAX_WORDS,
) -> SampledTexts:
    """A seeded random sample of distinct, non-empty texts, each cut to ``max_words``."""

    texts = (
        lazyframe.select(pl.col(column).cast(pl.String).alias("text"))
        .drop_nulls()
        .with_columns(pl.col("text").str.strip_chars())
        .filter(pl.col("text").str.len_chars() > 0)
        .unique(maintain_order=True)
        .collect()
    )
    available = texts.height
    if available == 0:
        return SampledTexts(texts=[], available=0)
    chosen = texts.sample(n=min(size, available), seed=seed, shuffle=True)
    cut = [cut_to_words(text, max_words) for text in chosen.get_column("text").to_list()]
    return SampledTexts(texts=cut, available=available)


def build_designer_system_prompt(
    prompt: str, max_classes: int, *, scale: bool = False
) -> str:
    """The person's (or the default) prompt, then the fixed answer format."""

    count_rule = (
        f"Propose between 2 and {max_classes} levels of one ordered scale, listed "
        "from the lowest to the highest, then one last code for texts the scale "
        f'does not fit ("{NOT_APPLICABLE_CODE}" in English). It is not a level.'
        if scale
        else f"Propose at most {max_classes} real classes, then one last class for "
        f'texts that fit none of them ("{OTHER_CODE}" in English).'
    )
    return "\n".join(
        [
            prompt.strip(),
            "",
            "The answer format below takes precedence over any conflicting wording above.",
            count_rule,
            "Name every code, the last one too, in the language of the brief. Mark "
            'the last one with "catch_all": true and every other code with '
            '"catch_all": false.',
            "Answer with ONLY a JSON object of the form "
            '{"codes": [{"name": "...", "definition": "...", "catch_all": false}]}. '
            "No prose, no markdown.",
        ]
    )


def build_designer_user_prompt(
    *,
    brief: str,
    task_context: str,
    max_classes: int,
    sample: SampledTexts,
    scale: bool = False,
) -> str:
    parts = ["Brief:", brief.strip(), ""]
    if task_context.strip():
        parts += ["Task context:", task_context.strip(), ""]
    parts += [
        f"Maximum levels: {max_classes} (not counting the last code, for texts the "
        "scale does not fit)"
        if scale
        else f"Maximum classes: {max_classes} (not counting the last class, for texts "
        "that fit none of them)",
        "",
        f"Sample texts ({len(sample.texts)} of {sample.available} distinct texts, "
        f"each cut to its first {SAMPLE_TEXT_MAX_WORDS} words), as a JSON array:",
        json.dumps(sample.texts, ensure_ascii=False),
    ]
    return "\n".join(parts)


def codebook_schema(max_classes: int, *, scale: bool = False) -> dict[str, Any]:
    """The answer as a strict JSON schema, for providers that enforce one."""

    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["codes"],
        "properties": {
            "codes": {
                "type": "array",
                "minItems": 2,
                "maxItems": max_classes + 1,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "definition", "catch_all"],
                    "properties": {
                        "name": {"type": "string"},
                        "definition": {"type": "string"},
                        "catch_all": {"type": "boolean"},
                    },
                },
            }
        },
    }


def parse_codebook_answer(
    content: str, max_classes: int, *, scale: bool = False
) -> list[DesignedCode]:
    """The model's codes, tidied: real classes first (at most ``max_classes``), Other last.

    Names are trimmed and kept once (ignoring case); the reserved codebook
    names are dropped. The catch-all is the code marked ``"catch_all": true``,
    whatever its language (其他, Autre), or else one named "Other" in any case;
    it moves last and keeps its name. If the model left it out, an "Other" is
    added with a plain definition, so the draft always ends with one.

    With ``scale``, the levels keep the model's order (lowest first), at most
    ``max_classes`` of them, and "Not applicable" takes Other's place: found
    the same way, moved last or added, and marked as outside the scale.
    """

    try:
        answer = _parse_answer(content)
    except ValueError as exc:
        raise CodebookAnswerError("The answer is not JSON.") from exc
    raw_codes = answer.get("codes") if isinstance(answer, dict) else None
    if not isinstance(raw_codes, list):
        raise CodebookAnswerError('The answer has no "codes" list.')

    catch_all = NOT_APPLICABLE_CODE if scale else OTHER_CODE
    real: list[DesignedCode] = []
    other: DesignedCode | None = None
    seen: set[str] = set()
    for item in raw_codes:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        definition = str(item.get("definition") or "").strip()
        key = name.casefold()
        if not name or key in seen or key in RESERVED_CODEBOOK_CODES:
            continue
        seen.add(key)
        marked = item.get("catch_all") is True
        if other is None and (marked or key == catch_all.casefold()):
            # Its own name: 其他 stays 其他; an English one is written as asked.
            named = catch_all if key == catch_all.casefold() else name
            other = DesignedCode(named, definition, outside_scale=scale)
        else:
            real.append(DesignedCode(name, definition))
    if not real:
        raise CodebookAnswerError("The answer has no classes.")
    if scale and len(real) < 2:
        raise CodebookAnswerError("The answer has fewer than two levels.")
    if other is None:
        other = (
            DesignedCode(
                NOT_APPLICABLE_CODE,
                "Texts the scale does not fit.",
                outside_scale=True,
            )
            if scale
            else DesignedCode(OTHER_CODE, "Texts that fit none of the classes above.")
        )
    return [*real[:max_classes], other]


__all__ = [
    "NOT_APPLICABLE_CODE",
    "OTHER_CODE",
    "SAMPLE_TEXT_MAX_WORDS",
    "CodebookAnswerError",
    "DesignedCode",
    "SampledTexts",
    "build_designer_system_prompt",
    "build_designer_user_prompt",
    "codebook_schema",
    "cut_to_words",
    "parse_codebook_answer",
    "sample_texts",
]
