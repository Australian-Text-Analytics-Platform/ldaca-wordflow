"""AI Code Designer: a first-draft codebook from a brief and a sample of texts.

The designer is a kick-off assistant (Chao, 15 Nov 2026). It sends one request
and returns the model's codes for the person to review; it does not evaluate
or retry. The system prompt comes from the client (its default lives in the
frontend, like the annotation prompt); the answer format below is appended
here so an edited prompt cannot break reading the answer.

Two kinds of codebook (Chao, 16 Nov 2026): categories end with "Other"; an
ordered scale is a list of levels from the lowest to the highest, with no
"Other", since texts the scale doesn't fit are left uncoded.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import polars as pl

from ...domain.annotation import RESERVED_CODEBOOK_CODES
from .annotation_ai import _parse_answer

OTHER_CODE = "Other"
#: Each sampled text is cut to its first words, so long documents don't
#: crowd out the rest of the sample.
SAMPLE_TEXT_MAX_WORDS = 150


class CodebookAnswerError(ValueError):
    """The model's answer could not be read as a codebook."""


@dataclass(frozen=True, slots=True)
class DesignedCode:
    name: str
    definition: str


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
    cut = [
        " ".join(text.split()[:max_words])
        for text in chosen.get_column("text").to_list()
    ]
    return SampledTexts(texts=cut, available=available)


def build_designer_system_prompt(
    prompt: str, max_classes: int, *, scale: bool = False
) -> str:
    """The person's (or the default) prompt, then the fixed answer format."""

    count_rule = (
        f"Propose between 2 and {max_classes} levels of one ordered scale, listed "
        "from the lowest to the highest. Do not add an Other or Not applicable "
        "level: texts the scale does not fit are left uncoded."
        if scale
        else f"Propose at most {max_classes} real classes, then one class named exactly "
        f'"{OTHER_CODE}" as the last class.'
    )
    return "\n".join(
        [
            prompt.strip(),
            "",
            "The answer format below takes precedence over any conflicting wording above.",
            count_rule,
            "Answer with ONLY a JSON object of the form "
            '{"codes": [{"name": "...", "definition": "..."}]}. No prose, no markdown.',
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
        f"Maximum levels: {max_classes}"
        if scale
        else f'Maximum classes: {max_classes} (not counting "{OTHER_CODE}")',
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
                "maxItems": max_classes if scale else max_classes + 1,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "definition"],
                    "properties": {
                        "name": {"type": "string"},
                        "definition": {"type": "string"},
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
    names are dropped. An "other" in any case or position becomes the last
    code, named "Other". If the model left Other out, one is added with a
    plain definition, so the draft always ends with it.

    With ``scale``, the levels keep the model's order (lowest first), at most
    ``max_classes`` of them, and no Other is moved or added.
    """

    try:
        answer = _parse_answer(content)
    except ValueError as exc:
        raise CodebookAnswerError("The answer is not JSON.") from exc
    raw_codes = answer.get("codes") if isinstance(answer, dict) else None
    if not isinstance(raw_codes, list):
        raise CodebookAnswerError('The answer has no "codes" list.')

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
        if key == OTHER_CODE.casefold() and not scale:
            other = DesignedCode(OTHER_CODE, definition)
        else:
            real.append(DesignedCode(name, definition))
    if not real:
        raise CodebookAnswerError("The answer has no classes.")
    if scale:
        if len(real) < 2:
            raise CodebookAnswerError("The answer has fewer than two levels.")
        return real[:max_classes]
    if other is None:
        other = DesignedCode(OTHER_CODE, "Texts that fit none of the classes above.")
    return [*real[:max_classes], other]


__all__ = [
    "OTHER_CODE",
    "SAMPLE_TEXT_MAX_WORDS",
    "CodebookAnswerError",
    "DesignedCode",
    "SampledTexts",
    "build_designer_system_prompt",
    "build_designer_user_prompt",
    "codebook_schema",
    "parse_codebook_answer",
    "sample_texts",
]
