"""Quotations a Run has found so far, kept as it goes.

The worker writes each finished chunk of distinct texts to its own Parquet
file in the run's scratch folder, written through to disk. While the run goes,
the Quotation tab shows the rows found so far from them; when it stops, fails
or is interrupted, the backend keeps them in the Project as a temporary Data
Block, and the next Run with the same settings starts from there.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import polars as pl

from .quotation_core import QUOTATION_GROUP_COLUMN, QUOTATION_GROUP_DTYPE

QUOTATION_PARTS_DIR = "quotation-parts"
QUOTATION_RESUME_FILE = "quotation-resume.parquet"
# Written in the scratch folder when Stop asks a Run to keep its result.
QUOTATION_STOP_FILE = "stop-requested"
# The text each part's quotations belong to.
PART_TEXT_COLUMN = "text"
# Fixed namespace: a run's temporary Data Block has an id derived from the
# run's, so a crash recovery finds and updates the same block.
_PROGRESS_NODE_NAMESPACE = uuid.UUID("0c6a1d2e-5b7f-4e39-8f1a-381000000381")

PARTS_SCHEMA = {PART_TEXT_COLUMN: pl.String, QUOTATION_GROUP_COLUMN: QUOTATION_GROUP_DTYPE}


def quotation_parts_dir(scratch_dir: Path) -> Path:
    return Path(scratch_dir) / QUOTATION_PARTS_DIR


def quotation_stop_path(scratch_dir: Path) -> Path:
    return Path(scratch_dir) / QUOTATION_STOP_FILE


def quotation_progress_node_id(analysis_id: uuid.UUID) -> uuid.UUID:
    """The temporary Data Block's id for one Quotation Run."""

    return uuid.uuid5(_PROGRESS_NODE_NAMESPACE, str(analysis_id))


def write_part(
    parts_dir: Path,
    texts: Sequence[str],
    quotations: Sequence[list[dict[str, Any]]],
) -> Path:
    """Write one finished chunk and force it to disk before it counts."""

    frame = pl.DataFrame(
        {PART_TEXT_COLUMN: list(texts), QUOTATION_GROUP_COLUMN: list(quotations)},
        schema=PARTS_SCHEMA,
    )
    parts_dir.mkdir(parents=True, exist_ok=True)
    path = parts_dir / f"part-{uuid.uuid4().hex}.parquet"
    temporary = parts_dir / f".{path.name}.tmp"
    frame.write_parquet(temporary)
    with open(temporary, "rb") as handle:
        os.fsync(handle.fileno())
    temporary.replace(path)
    return path


def read_parts(parts_dir: Path) -> pl.DataFrame:
    """Every text found so far, once; a part cut short by a crash is skipped."""

    frames: list[pl.DataFrame] = []
    try:
        paths = sorted(parts_dir.glob("part-*.parquet"))
    except OSError:
        paths = []
    for path in paths:
        try:
            frames.append(pl.read_parquet(path).select(list(PARTS_SCHEMA)))
        except Exception:  # noqa: BLE001 - a torn file is skipped, not fatal
            continue
    if not frames:
        return pl.DataFrame(schema=PARTS_SCHEMA)
    return pl.concat(frames, how="vertical_relaxed").unique(
        subset=PART_TEXT_COLUMN, keep="last", maintain_order=True
    )


def quotation_progress_page(
    source: pl.LazyFrame,
    column: str,
    found: pl.DataFrame,
    *,
    page: int,
    page_size: int,
) -> tuple[pl.DataFrame, bool, int]:
    """One page of a running Run's rows so far, as a Preview page holds them.

    Only the documents before the first one not done yet are shown, so new
    rows only ever add to the end while chunks finish in a slightly different
    order (issue 381). Returns the page, whether more checked rows follow, and
    how many documents in a row are checked.
    """

    from ..shared.unsupported_columns import without_unsupported_columns
    from .generated_columns import without_previous_quotation_columns

    lazy = without_unsupported_columns(source, keep=(column,))
    lazy, column = without_previous_quotation_columns(lazy, column)
    texts = lazy.select(pl.col(column).cast(pl.String)).collect().to_series().to_list()
    done = set(found.get_column(PART_TEXT_COLUMN).to_list())
    checked = len(texts)
    for index, text in enumerate(texts):
        if text is not None and text.strip() and text not in done:
            checked = index
            break
    start = (page - 1) * page_size
    length = max(0, min(page_size, checked - start))
    rows = lazy.slice(start, length).collect()
    page_texts = rows.get_column(column).cast(pl.String).to_list()
    wanted = found.filter(pl.col(PART_TEXT_COLUMN).is_in(page_texts))
    by_text = dict(
        zip(
            wanted.get_column(PART_TEXT_COLUMN).to_list(),
            wanted.get_column(QUOTATION_GROUP_COLUMN).to_list(),
            strict=True,
        )
    )
    # Built afresh for the page: a slice of the found quotations would carry
    # their whole buffers into the Arrow page (12 MB for 20 rows).
    frame = rows.with_columns(
        pl.Series(
            QUOTATION_GROUP_COLUMN,
            [by_text.get(text) for text in page_texts],
            dtype=QUOTATION_GROUP_DTYPE,
        )
    ).filter(pl.col(QUOTATION_GROUP_COLUMN).list.len().fill_null(0) > 0)
    return frame, start + length < checked, checked


__all__ = [
    "PART_TEXT_COLUMN",
    "PARTS_SCHEMA",
    "QUOTATION_PARTS_DIR",
    "QUOTATION_RESUME_FILE",
    "QUOTATION_STOP_FILE",
    "quotation_parts_dir",
    "quotation_progress_page",
    "quotation_progress_node_id",
    "quotation_stop_path",
    "read_parts",
    "write_part",
]
