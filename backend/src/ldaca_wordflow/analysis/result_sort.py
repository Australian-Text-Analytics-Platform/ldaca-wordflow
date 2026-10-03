"""One row order for Concordance and Quotation Result match rows.

Used by: the Review table page (``services/analysis_results.py``) and Add to
Project (``workers/result_data_block_creation.py``), so a Data Block made from
a sorted table has its rows in the order the table showed (issue 275).
"""

from __future__ import annotations

import polars as pl

from .generated_columns import (
    CONC_L1_COLUMN,
    CONC_MATCHED_TEXT_COLUMN,
    CONC_R1_COLUMN,
    CONC_START_IDX_COLUMN,
    QUOTE_ROW_IDX_COLUMN,
)

SOURCE_ROW_COLUMN = "__wordflow_source_row_id"

# With Case sensitive off, these sort ignoring case (issues 267 and 274).
CASE_FOLDED_SORT_COLUMNS = frozenset(
    {CONC_L1_COLUMN, CONC_R1_COLUMN, CONC_MATCHED_TEXT_COLUMN}
)


def sort_result_rows(
    frame: pl.LazyFrame,
    schema: pl.Schema,
    *,
    concordance: bool,
    matches: bool,
    sort_by: str | None,
    descending: bool,
    case_sensitive: bool,
) -> pl.LazyFrame:
    """Sort Result rows by ``sort_by``, then in Data Block order.

    Ties break by source document, then match position (issue 266), always
    ascending, so rows sharing a value stay in reading order in either
    direction. Without ``sort_by`` the rows are in Data Block order. The
    caller checks that ``sort_by`` is a column its table can sort.
    """

    ties = [SOURCE_ROW_COLUMN]
    if matches:
        ties.append(CONC_START_IDX_COLUMN if concordance else QUOTE_ROW_IDX_COLUMN)
    ties = [column for column in ties if column in schema]
    if sort_by is None:
        return frame.sort(ties) if ties else frame
    key = pl.col(sort_by)
    if (
        concordance
        and matches
        and not case_sensitive
        and sort_by in CASE_FOLDED_SORT_COLUMNS
    ):
        key = key.str.to_lowercase()
    return frame.sort(
        [key, *ties],
        descending=[descending, *([False] * len(ties))],
    )
