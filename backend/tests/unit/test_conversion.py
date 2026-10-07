"""Reading dates and numbers written as text or numbers (issue 322)."""

from __future__ import annotations

import datetime as dt

import polars as pl
import pytest

from ldaca_wordflow.services.conversion import (
    ConversionOptions,
    detect_datetime_formats,
    format_tokens,
)
from ldaca_wordflow.services.node_casting import cast_lazyframe_column, check_cast


def _formats(values: list) -> list[tuple]:
    detected = detect_datetime_formats(pl.LazyFrame({"x": values}), "x")
    return [(c.kind, c.format, c.epoch_unit, c.swap_format, c.two_digit_year) for c in detected.candidates]


def test_detection_reads_single_digit_parts_day_first_and_offers_the_swap() -> None:
    found = _formats(["03/01/2020", "5/6/2021", "12/11/2019"])

    assert found[0] == ("format", "%d/%m/%Y", None, "%m/%d/%Y", False)


def test_detection_knows_twitter_dates_and_names() -> None:
    assert _formats(["Thu Oct 01 23:59:59 +0000 2020"])[0][1] == "%a %b %d %H:%M:%S %z %Y"
    assert _formats(["30 Jan 2020", "1 February 2021"])[0][1] == "%d %B %Y"


def test_two_digit_years_are_never_read_as_four_digit_years() -> None:
    found = _formats(["30/01/20", "31/12/69"])

    assert found == [("format", "%d/%m/%y", None, None, True)]


def test_numbers_are_unix_time_in_the_unit_that_gives_real_dates() -> None:
    assert _formats([1601596799, 1601600000])[0][:3] == ("unix", None, "s")
    assert _formats([1601596799000, 1601600000000])[0][:3] == ("unix", None, "ms")
    assert ("excel", None, None, None, False) in _formats([44105.0, 44105.5])


def test_format_tokens_split_a_value_into_parts() -> None:
    assert format_tokens("30/01/2020 14:05 +1000") == [
        "30", "/", "01", "/", "2020", " ", "14", ":", "05", " ", "+1000",
    ]


@pytest.mark.parametrize(
    ("start", "expected"),
    [(1900, [dt.date(1920, 1, 30), dt.date(1969, 12, 31)]), (1950, [dt.date(2020, 1, 30), dt.date(1969, 12, 31)])],
)
def test_two_digit_years_go_to_the_chosen_century(start: int, expected: list) -> None:
    frame = pl.LazyFrame({"x": ["30/01/20", "31/12/69"]})

    result = cast_lazyframe_column(
        frame,
        column_name="x",
        target_type="date",
        datetime_format="%d/%m/%y",
        options=ConversionOptions(datetime_format="%d/%m/%y", two_digit_year_start=start),
    )

    assert result.lazyframe.collect()["x"].to_list() == expected


def test_excel_day_numbers_and_unix_times_become_dates() -> None:
    frame = pl.LazyFrame({"excel": [44105.5], "unix": [1601596799]})

    excel = cast_lazyframe_column(
        frame, column_name="excel", target_type="datetime", options=ConversionOptions(excel_serial=True)
    ).lazyframe.collect()["excel"][0]
    unix = cast_lazyframe_column(
        frame, column_name="unix", target_type="date", options=ConversionOptions(epoch_unit="s")
    ).lazyframe.collect()["unix"][0]

    assert excel == dt.datetime(2020, 10, 1, 12, tzinfo=dt.UTC)
    assert unix == dt.date(2020, 10, 1)


def test_text_numbers_follow_the_chosen_marks_and_round_halves_away_from_zero() -> None:
    frame = pl.LazyFrame({"x": ["$1.234,5", "-2,5", "45 %"]})
    options = ConversionOptions(decimal_mark=",", thousands_separator=".", ignore_symbols=True)

    decimals = cast_lazyframe_column(frame, column_name="x", target_type="float", options=options)
    whole = cast_lazyframe_column(frame, column_name="x", target_type="integer", options=options)

    assert decimals.lazyframe.collect()["x"].to_list() == [1234.5, -2.5, 45.0]
    assert whole.lazyframe.collect()["x"].to_list() == [1235, -3, 45]


def test_decimals_round_to_the_nearest_whole_number() -> None:
    frame = pl.LazyFrame({"x": [2.5, 2.4, -2.5]})

    result = cast_lazyframe_column(frame, column_name="x", target_type="integer")

    assert result.lazyframe.collect()["x"].to_list() == [3, 2, -3]


def test_the_check_counts_and_lists_values_that_would_not_convert() -> None:
    frame = pl.LazyFrame({"x": ["30/01/2020", "bad", None, "31/12/2021"]})

    checked = check_cast(
        frame,
        column_name="x",
        target_type="date",
        options=ConversionOptions(datetime_format="%d/%m/%Y"),
    )

    assert (checked["total_rows"], checked["non_empty"], checked["converted"], checked["failed"]) == (4, 3, 2, 1)
    assert checked["failures"] == [{"row": 2, "value": "bad"}]
    samples = checked["samples"]
    assert isinstance(samples, list)
    assert samples[0] == {"row": 1, "value": "30/01/2020", "result": "2020-01-30"}
