"""Excel and flat-file details of Data Block export (issue 169)."""

from __future__ import annotations

import io

import polars as pl
import pytest

from ldaca_wordflow.services import data_block_exports
from ldaca_wordflow.shared.errors import InvalidInputError


def test_nested_values_are_written_as_json_text() -> None:
    frame = pl.LazyFrame(
        {
            "tokens": [["it’s", "a"], None],
            "span": [{"start": 1, "end": 4}, None],
        }
    )

    flat = data_block_exports._flatten_nested_columns(frame).collect()

    assert flat.schema == {"tokens": pl.String, "span": pl.String}
    assert flat["tokens"].to_list() == ['["it’s","a"]', None]
    assert flat["span"].to_list() == ['{"start":1,"end":4}', None]


def test_excel_workbook_round_trips_text_and_numbers() -> None:
    frame = pl.LazyFrame({"text": ["that’s", "“quoted”"], "count": [1, 2]})

    workbook = data_block_exports._excel_workbook_bytes(frame)

    assert pl.read_excel(io.BytesIO(workbook)).to_dicts() == [
        {"text": "that’s", "count": 1},
        {"text": "“quoted”", "count": 2},
    ]


def test_excel_export_refuses_text_longer_than_a_cell(monkeypatch) -> None:
    monkeypatch.setattr(data_block_exports, "_EXCEL_MAX_CELL_CHARACTERS", 5)

    with pytest.raises(InvalidInputError, match="'document'"):
        data_block_exports._excel_workbook_bytes(
            pl.LazyFrame({"document": ["short", "much longer"]})
        )


def test_excel_export_refuses_more_rows_than_a_worksheet(monkeypatch) -> None:
    monkeypatch.setattr(data_block_exports, "_EXCEL_MAX_ROWS", 3)

    with pytest.raises(InvalidInputError, match="CSV or Parquet"):
        data_block_exports._excel_workbook_bytes(pl.LazyFrame({"n": [1, 2, 3]}))
