"""Elapsed time for transcript timestamps (issue 324)."""

from __future__ import annotations

import datetime as dt
import io

import polars as pl
import pytest

from ldaca_wordflow.infrastructure.storage.data_loading import normalize_dtypes
from ldaca_wordflow.services.conversion import ConversionOptions
from ldaca_wordflow.services.node_casting import cast_lazyframe_column, check_cast
from ldaca_wordflow.shared.elapsed_time import (
    elapsed_from_text,
    elapsed_to_text,
    is_excel_day_zero,
)

TIMES = ["7:58", "07:58.5", "1:23:20", "00:07:58,542", "-0:05", "bad", "12:60", None]


def _cast(frame: pl.LazyFrame, target: str, **options) -> pl.Series:
    result = cast_lazyframe_column(
        frame,
        column_name="x",
        target_type=target,
        options=ConversionOptions(**options),
    )
    # The saved plan reads back the same (v0.7 Polars-only rule).
    plan = pl.LazyFrame.deserialize(io.BytesIO(result.lazyframe.serialize()))
    return plan.collect()["x"]


def test_text_reads_as_minutes_seconds_or_hours_minutes() -> None:
    frame = pl.LazyFrame({"x": TIMES})

    minutes = _cast(frame, "duration")
    assert minutes.dtype == pl.Duration("us")
    assert minutes.to_list() == [
        dt.timedelta(minutes=7, seconds=58),
        dt.timedelta(minutes=7, seconds=58.5),
        dt.timedelta(hours=1, minutes=23, seconds=20),
        dt.timedelta(minutes=7, seconds=58.542),
        -dt.timedelta(seconds=5),
        None,
        None,
        None,
    ]
    hours = _cast(frame, "duration", two_part_times="hours")
    assert hours[0] == dt.timedelta(hours=7, minutes=58)
    assert hours[2] == dt.timedelta(hours=1, minutes=23, seconds=20)


def test_shown_as_minutes_under_an_hour_with_the_fraction_only_when_set() -> None:
    frame = pl.DataFrame({"x": TIMES}).select(elapsed_from_text(pl.col("x")).alias("x"))
    shown = frame.select(elapsed_to_text(pl.col("x")))["x"].to_list()
    assert shown == ["7:58", "7:58.5", "1:23:20", "7:58.542", "-0:05", None, None, None]


@pytest.mark.parametrize(
    ("unit", "value", "expected"),
    [
        ("s", 478.5, dt.timedelta(minutes=7, seconds=58.5)),
        ("min", 7.975, dt.timedelta(minutes=7, seconds=58.5)),
        ("h", 1.5, dt.timedelta(hours=1, minutes=30)),
        ("ms", 1500, dt.timedelta(seconds=1.5)),
        # Excel's fraction of a day, rounded to the millisecond.
        ("d", 478.5 / 86400, dt.timedelta(minutes=7, seconds=58.5)),
    ],
)
def test_numbers_read_in_the_chosen_unit(unit, value, expected) -> None:
    frame = pl.LazyFrame({"x": [value]})
    assert _cast(frame, "duration", elapsed_unit=unit).to_list() == [expected]


def test_elapsed_time_becomes_text_or_numbers_of_a_unit() -> None:
    frame = pl.LazyFrame({"x": ["1:23:20.25", "7:58.5"]}).with_columns(
        elapsed_from_text(pl.col("x"))
    )
    assert _cast(frame, "string").to_list() == ["1:23:20.25", "7:58.5"]
    assert _cast(frame, "string", elapsed_text="h:mm:ss").to_list() == [
        "1:23:20",
        "0:07:58",
    ]
    assert _cast(frame, "string", elapsed_text="mm:ss.fff").to_list() == [
        "83:20.250",
        "07:58.500",
    ]
    assert _cast(frame, "float").to_list() == [5000.25, 478.5]
    assert _cast(frame, "float", elapsed_unit="min").to_list() == pytest.approx(
        [83.3375, 7.975]
    )
    assert _cast(frame, "integer", elapsed_unit="min").to_list() == [83, 8]


def test_a_date_and_time_gives_its_time_of_day() -> None:
    frame = pl.LazyFrame(
        {"x": [dt.datetime(1899, 12, 31, 0, 7, 58, 542000)]}
    ).with_columns(pl.col("x").dt.replace_time_zone("UTC"))
    assert _cast(frame, "duration").to_list() == [
        dt.timedelta(minutes=7, seconds=58.542)
    ]


def test_elapsed_time_cannot_become_a_date() -> None:
    frame = pl.LazyFrame({"x": [dt.timedelta(seconds=1)]})
    with pytest.raises(Exception, match="Elapsed time can become text"):
        _cast(frame, "date")


def test_the_check_shows_both_sides_readably() -> None:
    frame = pl.LazyFrame({"x": ["07:58.5", "soon", None]})
    checked = check_cast(
        frame, column_name="x", target_type="duration", options=ConversionOptions()
    )
    assert (checked["converted"], checked["failed"]) == (1, 1)
    assert checked["samples"] == [
        {"row": 1, "value": "07:58.5", "result": "7:58.5"},
        {"row": 2, "value": "soon", "result": None},
    ]


def test_excel_times_without_a_date_load_as_elapsed_time() -> None:
    excel = pl.DataFrame(
        {
            "StartTime": [
                dt.datetime(1899, 12, 31, 0, 7, 58, 542000),
                dt.datetime(1899, 12, 31, 0, 8, 2, 260000),
                None,
            ],
            "Published": [
                dt.datetime(2020, 1, 30),
                dt.datetime(1899, 12, 31),
                None,
            ],
            "Elapsed": pl.Series(
                [dt.timedelta(seconds=1), None, None], dtype=pl.Duration("ms")
            ),
        }
    )
    assert is_excel_day_zero(excel["StartTime"])
    assert not is_excel_day_zero(excel["Published"])

    normalized, changes = normalize_dtypes(excel)
    assert normalized.schema["StartTime"] == pl.Duration("us")
    assert normalized["StartTime"][0] == dt.timedelta(minutes=7, seconds=58.542)
    assert isinstance(normalized.schema["Published"], pl.Datetime)
    assert normalized.schema["Elapsed"] == pl.Duration("us")
    reasons = {change["column"]: change["reason"] for change in changes}
    assert "elapsed time" in reasons["StartTime"]


def _transcript() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "start": [dt.timedelta(seconds=s) for s in (5, 61, 478.5, 3700)],
            "speaker": ["John", "Camila", "John", "Camila"],
        }
    ).with_columns(pl.col("start").cast(pl.Duration("us")))


def test_trends_bins_elapsed_time_from_zero() -> None:
    from ldaca_wordflow.analysis.sequential_core import (
        _build_sequential_result_frames,
    )

    result, _ = _build_sequential_result_frames(
        _transcript().lazy(),
        time_column="start",
        frequency="custom",
        custom_interval_value=5,
        custom_interval_unit="minutes",
        column_type="elapsed",
    )
    assert result.select(
        "time_period", "time_period_formatted", "sequential_count", "period_start"
    ).rows() == [
        (0.0, "0:00", 2, 5.0),
        (300.0, "5:00", 1, 478.5),
        (3600.0, "1:00:00", 1, 3700.0),
    ]


def test_filter_reads_typed_elapsed_times() -> None:
    from ldaca_wordflow.domain.workspace.provenance import FilterCondition
    from ldaca_wordflow.services.node_operations import _condition_expression

    frame = _transcript()
    schema = dict(frame.schema)
    between = FilterCondition(
        column="start", operator="between", value={"start": "1:00", "end": "7:58.5"}
    )
    assert frame.filter(_condition_expression(between, schema))[
        "speaker"
    ].to_list() == [
        "Camila",
        "John",
    ]
    with pytest.raises(Exception, match="is not an elapsed time"):
        _condition_expression(
            FilterCondition(column="start", operator="gte", value="soon"), schema
        )


def test_exports_write_elapsed_time_readably() -> None:
    from ldaca_wordflow.services.data_block_exports import (
        _elapsed_as_text,
        _excel_workbook_bytes,
    )

    text = _elapsed_as_text(_transcript().lazy()).collect()["start"].to_list()
    assert text == ["0:05", "1:01", "7:58.5", "1:01:40"]
    excel = pl.read_excel(io.BytesIO(_excel_workbook_bytes(_transcript().lazy())))
    assert isinstance(excel.schema["start"], pl.Duration)
    assert excel["start"][2] == dt.timedelta(seconds=478.5)
