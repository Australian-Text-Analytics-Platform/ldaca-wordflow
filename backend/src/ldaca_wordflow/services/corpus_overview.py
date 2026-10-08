"""Cheap statistics for one text column of a Data Block (issue 327).

The overview is computed on demand, when someone opens it, never for every
Data Block when the graph draws. It needs no tokeniser: words are runs of
non-space characters, and a corpus with few spaces (such as Chinese, Japanese
or Thai) is measured in characters instead.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import polars as pl

from ..shared.errors import InvalidInputError

# Spaces per character below which a corpus is measured in characters.
# English and German run at about 0.15; Chinese and Japanese near 0.
WORD_SPACE_SHARE = 0.05


@dataclass(frozen=True)
class CorpusOverview:
    documents: int
    empty_documents: int
    duplicate_documents: int
    unit: Literal["words", "characters"]
    total: int
    minimum: int | None
    median: float | None
    mean: float | None
    maximum: int | None


def corpus_overview(lazyframe: pl.LazyFrame, column: str) -> CorpusOverview:
    """Documents, empty and duplicate documents, and document lengths.

    Empty documents (missing, or only spaces) are counted but left out of the
    lengths. Duplicates are non-empty documents identical to an earlier one.
    """

    schema = lazyframe.collect_schema()
    if column not in schema:
        raise InvalidInputError(f'Column "{column}" was not found.')
    if schema[column] != pl.String:
        raise InvalidInputError(f'"{column}" is not a text column.')

    text = pl.col(column)
    present = text.is_not_null() & (text.str.strip_chars().str.len_chars() > 0)
    words = text.str.count_matches(r"\S+").cast(pl.Int64)
    spaces = text.str.count_matches(r"\s").cast(pl.Int64)
    characters = text.str.len_chars().cast(pl.Int64) - spaces

    def lengths(expr: pl.Expr, name: str) -> list[pl.Expr]:
        kept = expr.filter(present)
        return [
            kept.sum().alias(f"{name}_total"),
            kept.min().alias(f"{name}_min"),
            kept.median().alias(f"{name}_median"),
            kept.mean().alias(f"{name}_mean"),
            kept.max().alias(f"{name}_max"),
        ]

    row = (
        lazyframe.select(
            pl.len().alias("documents"),
            present.sum().alias("present"),
            text.filter(present).n_unique().alias("distinct"),
            spaces.filter(present).sum().alias("spaces"),
            *lengths(words, "words"),
            *lengths(characters, "characters"),
        )
        .collect()
        .row(0, named=True)
    )
    present_count = int(row["present"] or 0)
    space_count = int(row["spaces"] or 0)
    character_count = int(row["characters_total"] or 0)
    unit: Literal["words", "characters"] = (
        "characters"
        if character_count > 0
        and space_count / (character_count + space_count) < WORD_SPACE_SHARE
        else "words"
    )
    if present_count == 0:
        return CorpusOverview(
            documents=int(row["documents"]),
            empty_documents=int(row["documents"]),
            duplicate_documents=0,
            unit=unit,
            total=0,
            minimum=None,
            median=None,
            mean=None,
            maximum=None,
        )
    return CorpusOverview(
        documents=int(row["documents"]),
        empty_documents=int(row["documents"]) - present_count,
        duplicate_documents=present_count - int(row["distinct"]),
        unit=unit,
        total=int(row[f"{unit}_total"]),
        minimum=int(row[f"{unit}_min"]),
        median=float(row[f"{unit}_median"]),
        mean=float(row[f"{unit}_mean"]),
        maximum=int(row[f"{unit}_max"]),
    )
