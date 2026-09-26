"""Date columns (issue 187) work in Trends, Filter, and export."""

from __future__ import annotations

import datetime as dt
import io

import polars as pl
import pytest

from ldaca_wordflow.analysis.sequential_core import _run_sequential_analysis
from ldaca_wordflow.services.data_block_exports import _excel_workbook_bytes

DATES = pl.LazyFrame(
    {
        "published": [dt.date(2020, 1, 31), dt.date(2020, 2, 15), dt.date(2021, 3, 1)],
        "party": ["a", "b", "a"],
    }
)


@pytest.mark.parametrize(
    "frequency",
    ["second", "minute", "hourly", "daily", "weekly", "monthly", "quarterly", "yearly"],
)
def test_trends_accepts_a_date_time_column(frequency: str) -> None:
    result = _run_sequential_analysis(
        DATES, time_column="published", frequency=frequency
    )
    assert int(result["sequential_count"].sum()) == 3


@pytest.mark.parametrize("unit", ["days", "weeks", "hours"])
def test_trends_custom_interval_accepts_a_date_column(unit: str) -> None:
    result = _run_sequential_analysis(
        DATES,
        time_column="published",
        frequency="custom",
        custom_interval_value=2,
        custom_interval_unit=unit,
    )
    assert int(result["sequential_count"].sum()) == 3


def test_date_columns_export_as_dates() -> None:
    buffer = io.BytesIO()
    DATES.sink_csv(buffer, include_bom=True)
    assert b"2020-01-31" in buffer.getvalue()
    assert '"2020-01-31"' in DATES.collect().write_json()
    workbook = pl.read_excel(io.BytesIO(_excel_workbook_bytes(DATES)))
    assert workbook["published"].to_list()[0] in (
        dt.date(2020, 1, 31),
        dt.datetime(2020, 1, 31),
    )
