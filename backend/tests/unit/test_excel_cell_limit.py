"""Excel's 32,767-character cell limit names the columns and a remedy that fits (issues 355, 397)."""

from __future__ import annotations

import polars as pl
import pytest

from ldaca_wordflow.services.data_block_exports import _excel_workbook_bytes
from ldaca_wordflow.shared.errors import ExcelCellLimitError, InvalidInputError


def _long_document() -> pl.LazyFrame:
    return pl.LazyFrame({"document": ["x" * 32_768], "CONC_matched_text": ["test"]})


def test_data_block_export_suggests_csv_or_parquet() -> None:
    with pytest.raises(ExcelCellLimitError, match="Export it as CSV or Parquet") as error:
        _excel_workbook_bytes(_long_document())
    message = str(error.value)
    assert "'document' is longer, so this Data Block can't be exported as Excel" in message
    assert "LibreOffice Calc or Numbers" in message
    assert "Excel's cell limit" in message
    assert error.value.code == "excel_cell_too_long"
    assert error.value.details == {"columns": ["document"], "limit": 32_767}
    assert isinstance(error.value, InvalidInputError)


def test_result_download_suggests_leaving_the_column_out() -> None:
    with pytest.raises(ExcelCellLimitError, match="Untick it to download the other columns as Excel") as error:
        _excel_workbook_bytes(_long_document(), columns_chosen=True)
    assert "so that column can't go in an Excel file" in str(error.value)


def test_several_long_columns_are_all_named() -> None:
    frame = pl.LazyFrame({"document": ["x" * 32_768], "notes": ["y" * 40_000], "id": ["1"]})
    with pytest.raises(ExcelCellLimitError) as error:
        _excel_workbook_bytes(frame, columns_chosen=True)
    assert "'document' and 'notes' are longer, so those columns can't go in an Excel file" in str(error.value)
    assert "Untick them" in str(error.value)
    assert error.value.details == {"columns": ["document", "notes"], "limit": 32_767}


def test_text_at_the_limit_still_writes() -> None:
    frame = pl.LazyFrame({"document": ["x" * 32_767]})
    assert _excel_workbook_bytes(frame)[:2] == b"PK"
