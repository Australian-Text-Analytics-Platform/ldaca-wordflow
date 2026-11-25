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
    return [
        (c.kind, c.format, c.epoch_unit, c.swap_format, c.two_digit_year)
        for c in detected.candidates
    ]


def test_detection_reads_single_digit_parts_day_first_and_offers_the_swap() -> None:
    found = _formats(["03/01/2020", "5/6/2021", "12/11/2019"])

    assert found[0] == ("format", "%d/%m/%Y", None, "%m/%d/%Y", False)


def test_detection_knows_twitter_dates_and_names() -> None:
    assert (
        _formats(["Thu Oct 01 23:59:59 +0000 2020"])[0][1] == "%a %b %d %H:%M:%S %z %Y"
    )
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
        "30",
        "/",
        "01",
        "/",
        "2020",
        " ",
        "14",
        ":",
        "05",
        " ",
        "+1000",
    ]


@pytest.mark.parametrize(
    ("start", "expected"),
    [
        (1900, [dt.date(1920, 1, 30), dt.date(1969, 12, 31)]),
        (1950, [dt.date(2020, 1, 30), dt.date(1969, 12, 31)]),
    ],
)
def test_two_digit_years_go_to_the_chosen_century(start: int, expected: list) -> None:
    frame = pl.LazyFrame({"x": ["30/01/20", "31/12/69"]})

    result = cast_lazyframe_column(
        frame,
        column_name="x",
        target_type="date",
        datetime_format="%d/%m/%y",
        options=ConversionOptions(
            datetime_format="%d/%m/%y", two_digit_year_start=start
        ),
    )

    assert result.lazyframe.collect()["x"].to_list() == expected


def test_excel_day_numbers_and_unix_times_become_dates() -> None:
    frame = pl.LazyFrame({"excel": [44105.5], "unix": [1601596799]})

    excel = cast_lazyframe_column(
        frame,
        column_name="excel",
        target_type="datetime",
        options=ConversionOptions(excel_serial=True),
    ).lazyframe.collect()["excel"][0]
    unix = cast_lazyframe_column(
        frame,
        column_name="unix",
        target_type="date",
        options=ConversionOptions(epoch_unit="s"),
    ).lazyframe.collect()["unix"][0]

    assert excel == dt.datetime(2020, 10, 1, 12, tzinfo=dt.UTC)
    assert unix == dt.date(2020, 10, 1)


def test_text_numbers_follow_the_chosen_marks_and_round_halves_away_from_zero() -> None:
    frame = pl.LazyFrame({"x": ["$1.234,5", "-2,5", "45 %"]})
    options = ConversionOptions(
        decimal_mark=",", thousands_separator=".", ignore_symbols=True
    )

    decimals = cast_lazyframe_column(
        frame, column_name="x", target_type="float", options=options
    )
    whole = cast_lazyframe_column(
        frame, column_name="x", target_type="integer", options=options
    )

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

    assert (
        checked["total_rows"],
        checked["non_empty"],
        checked["converted"],
        checked["failed"],
    ) == (4, 3, 2, 1)
    assert checked["failed_distinct"] == 1
    assert checked["failed_values"] == [
        {"value": "bad", "count": 1, "first_row": 2, "shortened": False}
    ]
    samples = checked["samples"]
    assert isinstance(samples, list)
    assert samples[0] == {"row": 1, "value": "30/01/2020", "result": "2020-01-30"}


def test_thousands_separators_must_group_by_three() -> None:
    frame = pl.LazyFrame({"x": ["1,234,567", "3,5", "12,34", "-1,000.5"]})

    result = cast_lazyframe_column(
        frame,
        column_name="x",
        target_type="float",
        options=ConversionOptions(thousands_separator=","),
    )

    # "3,5" is not 35: it does not convert, and the check shows it.
    assert result.lazyframe.collect()["x"].to_list() == [1234567.0, None, None, -1000.5]


def test_dates_inside_longer_text_are_found_and_converted() -> None:
    values = ["2021_01_17_LaurenLancaster", "2021_02_03_JoSmith", "Lauren_2020-12-31"]
    detected = detect_datetime_formats(pl.LazyFrame({"x": values[:2]}), "x")
    assert [(c.format, c.in_text) for c in detected.candidates] == [("%Y_%m_%d", True)]
    # A four-digit year beats "21-01-17" read inside "2021-01-17".
    iso = detect_datetime_formats(pl.LazyFrame({"x": ["Lauren_2021-01-17.txt"]}), "x")
    assert [c.format for c in iso.candidates] == ["%Y-%m-%d"]

    frame = pl.LazyFrame({"x": values})
    options = ConversionOptions(datetime_format="%Y_%m_%d", date_in_text=True)
    dates = cast_lazyframe_column(
        frame,
        column_name="x",
        target_type="date",
        datetime_format="%Y_%m_%d",
        options=options,
    ).lazyframe.collect()["x"]
    assert dates.to_list() == [dt.date(2021, 1, 17), dt.date(2021, 2, 3), None]


def test_whole_numbers_in_text_are_read_digit_by_digit() -> None:
    """Long identifiers stay distinct: a decimal number can't tell them apart."""

    values = [
        "9007199254740992",  # 2**53
        "9007199254740993",  # 2**53 + 1: the nearest decimal number is 2**53
        "-9007199254740993",
        "9223372036854775807",  # the largest whole number a column holds
        "-9223372036854775808",  # the smallest
        "+7",
        "007",
        " 12 ",
    ]

    result = cast_lazyframe_column(
        pl.LazyFrame({"id": values}), column_name="id", target_type="integer"
    )

    converted = result.lazyframe.collect()["id"]
    assert converted.dtype == pl.Int64
    assert converted.to_list() == [int(value) for value in values]


def test_whole_numbers_too_large_for_a_column_become_empty() -> None:
    values = [
        "9223372036854775808",
        "-9223372036854775809",
        # Rounding away from zero would pass the limit.
        "9223372036854775807.5",
        "-9223372036854775808.5",
        "9223372036854775807.4",
        "-9223372036854775808.4",
        "99999999999999999999999999999999999999999",
    ]

    result = cast_lazyframe_column(
        pl.LazyFrame({"x": values}), column_name="x", target_type="integer"
    )

    assert result.lazyframe.collect()["x"].to_list() == [
        None,
        None,
        None,
        None,
        9223372036854775807,
        -9223372036854775808,
        None,
    ]


def test_decimal_text_rounds_from_its_digits_halves_away_from_zero() -> None:
    values: list[str | None] = [
        "2.5",
        "-2.5",
        "2.4",
        "-2.4",
        ".5",
        "-.5",
        "-0.4",
        "5.",
        # Just under a half: as a decimal number this is exactly 0.5.
        "0.49999999999999999",
        "9007199254740993.0",
        "9007199254740992.5",
        # Text with an exponent is read as a decimal number first.
        "1e3",
        "1.5e0",
        "abc",
        "1.2.3",
        "",
        None,
    ]

    result = cast_lazyframe_column(
        pl.LazyFrame({"x": values}), column_name="x", target_type="integer"
    )

    assert result.lazyframe.collect()["x"].to_list() == [
        3,
        -3,
        2,
        -2,
        1,
        -1,
        0,
        5,
        0,
        9007199254740993,
        9007199254740993,
        1000,
        2,
        None,
        None,
        None,
        None,
    ]


def test_long_whole_numbers_keep_their_digits_with_separators_and_symbols() -> None:
    frame = pl.LazyFrame({"x": ["9.007.199.254.740.993", "€ 9.007.199.254.740.993,5", "3.5"]})
    options = ConversionOptions(
        decimal_mark=",", thousands_separator=".", ignore_symbols=True
    )

    result = cast_lazyframe_column(
        frame, column_name="x", target_type="integer", options=options
    )

    # "3.5" is not a group of three, so it still fails rather than reading 35.
    assert result.lazyframe.collect()["x"].to_list() == [
        9007199254740993,
        9007199254740994,
        None,
    ]


def test_the_check_previews_whole_numbers_as_they_will_convert() -> None:
    checked = check_cast(
        pl.LazyFrame({"id": ["9007199254740992", "9007199254740993", "x"]}),
        column_name="id",
        target_type="integer",
        options=ConversionOptions(),
    )

    assert (checked["converted"], checked["failed"]) == (2, 1)
    assert checked["samples"] == [
        {"row": 1, "value": "9007199254740992", "result": "9007199254740992"},
        {"row": 2, "value": "9007199254740993", "result": "9007199254740993"},
        {"row": 3, "value": "x", "result": None},
    ]


def test_the_check_groups_values_that_would_not_convert_most_frequent_first() -> None:
    """Chao, 25 Nov 2026: every value to fix is listed once, with its rows."""

    frame = pl.LazyFrame(
        {"x": ["soon", "30/01/2020", "n/a", "n/a", "x" * 300, "n/a", None, "soon"]}
    )

    checked = check_cast(
        frame,
        column_name="x",
        target_type="date",
        options=ConversionOptions(datetime_format="%d/%m/%Y"),
    )

    assert (checked["failed"], checked["failed_distinct"]) == (6, 3)
    assert checked["failed_values"] == [
        {"value": "n/a", "count": 3, "first_row": 3, "shortened": False},
        {"value": "soon", "count": 2, "first_row": 1, "shortened": False},
        # A long text is cut, and marked so it is not matched as if whole.
        {"value": "x" * 200, "count": 1, "first_row": 5, "shortened": True},
    ]

    limited = check_cast(
        frame,
        column_name="x",
        target_type="date",
        options=ConversionOptions(datetime_format="%d/%m/%Y"),
        failed_values=1,
    )
    listed = limited["failed_values"]
    assert isinstance(listed, list)
    assert [item["value"] for item in listed] == ["n/a"]
    assert limited["failed_distinct"] == 3


def test_a_conversion_into_a_new_column_keeps_the_source_column() -> None:
    frame = pl.LazyFrame({"when": ["30/01/2020", "soon"], "who": ["a", "b"]})

    result = cast_lazyframe_column(
        frame,
        column_name="when",
        target_type="date",
        datetime_format="%d/%m/%Y",
        options=ConversionOptions(datetime_format="%d/%m/%Y"),
        output_column="when_date",
    )

    table = result.lazyframe.collect()
    assert table["when"].to_list() == ["30/01/2020", "soon"]
    assert table["when_date"].to_list() == [dt.date(2020, 1, 30), None]
    assert result.new_type == "Date"
