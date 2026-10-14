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


def test_excel_writes_zoned_datetimes_as_utc() -> None:
    """Issue 169: xlsxwriter refused time-zone-aware datetimes."""

    import datetime as dt

    frame = pl.LazyFrame(
        {
            "created_at": [dt.datetime(2020, 10, 16, 15, 0, tzinfo=dt.UTC)],
            "local": [dt.datetime(2020, 10, 17, 2, 0)],
        }
    ).with_columns(
        pl.col("local").dt.replace_time_zone("Australia/Brisbane"),
    )

    workbook = pl.read_excel(io.BytesIO(data_block_exports._excel_workbook_bytes(frame)))

    assert workbook["created_at"].to_list() == [dt.datetime(2020, 10, 16, 15, 0)]
    # 02:00 in Brisbane (UTC+10) is 16:00 the previous day in UTC.
    assert workbook["local"].to_list() == [dt.datetime(2020, 10, 16, 16, 0)]


def test_zip_entries_are_dated_when_downloaded(tmp_path) -> None:
    """Not 1 January 1980, ZipInfo's default for a bare name (issue 394)."""

    import struct
    import time
    import zipfile

    from ldaca_wordflow.models.node_resources import DataBlockExportFormat

    frames = (
        ("first", "a", pl.LazyFrame({"text": ["one"]})),
        ("second", "b", pl.LazyFrame({"text": ["two"]})),
    )
    target = tmp_path / "export.zip"
    before = int(time.time())
    data_block_exports._write_export(frames, DataBlockExportFormat.CSV, target, 1_000_000)
    after = int(time.time())

    with zipfile.ZipFile(target) as archive:
        members = archive.infolist()
        assert len(members) == 2
        for member in members:
            assert member.date_time[:3] == time.localtime(before)[:3]
            assert member.compress_type == zipfile.ZIP_DEFLATED
            tag, size, flags, stamp = struct.unpack("<HHBl", member.extra[:9])
            assert (tag, size, flags) == (0x5455, 5, 1)
            assert before <= stamp <= after
        assert archive.read(members[0]).decode("utf-8-sig").splitlines() == ["text", "one"]
