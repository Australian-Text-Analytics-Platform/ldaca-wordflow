"""Excel's 32,767-character cell limit names a remedy that fits (issue 355)."""

from __future__ import annotations

import polars as pl
import pytest

from ldaca_wordflow.services.data_block_exports import _excel_workbook_bytes
from ldaca_wordflow.shared.errors import InvalidInputError


def _long_document() -> pl.LazyFrame:
    return pl.LazyFrame({"document": ["x" * 32_768], "CONC_matched_text": ["test"]})


def test_data_block_export_suggests_csv_or_parquet() -> None:
    with pytest.raises(InvalidInputError, match="Export it as CSV or Parquet") as error:
        _excel_workbook_bytes(_long_document())
    assert "'document'" in str(error.value)


def test_result_download_suggests_leaving_the_column_out() -> None:
    with pytest.raises(InvalidInputError, match="Untick it to download as Excel"):
        _excel_workbook_bytes(_long_document(), columns_chosen=True)


def test_text_at_the_limit_still_writes() -> None:
    frame = pl.LazyFrame({"document": ["x" * 32_767]})
    assert _excel_workbook_bytes(frame)[:2] == b"PK"
