"""Elapsed time: time into a recording, such as a transcript's 07:58.5 (issue 324).

Stored as a Polars Duration in microseconds. Clock times (time of day) are a
different idea and are not handled here.

Used by: ``node_casting`` (conversions), ``data_loading`` (Excel day-zero
columns), the conversion check, Trends (binning) and table transport.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Literal

import polars as pl

ELAPSED_DTYPE = pl.Duration("us")

ElapsedUnit = Literal["ms", "s", "min", "h", "d"]
TwoPartTimes = Literal["minutes", "hours"]
ElapsedText = Literal["auto", "h:mm:ss", "h:mm:ss.fff", "mm:ss", "mm:ss.fff"]

MICROSECONDS: dict[str, int] = {
    "ms": 1_000,
    "s": 1_000_000,
    "min": 60_000_000,
    "h": 3_600_000_000,
    "d": 86_400_000_000,
}

# Excel stores a time without a date as a fraction of day zero, which readers
# give as a date and time on 30 or 31 December 1899 (issue 324).
EXCEL_DAY_ZERO = (dt.date(1899, 12, 30), dt.date(1899, 12, 31))

_THREE_PARTS = r"^(-?)(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$"
_TWO_PARTS = r"^(-?)(\d+):([0-5]?\d(?:\.\d+)?)$"


def is_elapsed(dtype: pl.DataType) -> bool:
    return isinstance(dtype, pl.Duration)


def _from_microseconds(micros: pl.Expr) -> pl.Expr:
    return pl.duration(microseconds=micros.round(0).cast(pl.Int64))


def elapsed_from_text(column: pl.Expr, two_part: TwoPartTimes = "minutes") -> pl.Expr:
    """Text such as "7:58", "07:58.5", "1:23:20" or "00:07:58,542".

    Three parts are hours:minutes:seconds. Two parts are minutes:seconds, or
    hours:minutes with ``two_part="hours"``. A comma before the fraction (as
    in subtitle files) counts as a decimal point. Anything else is empty.
    """

    text = (
        column.cast(pl.String)
        .str.strip_chars()
        .str.replace(r"^(-?[\d:]+),(\d+)$", "${1}.${2}")
    )
    three = text.str.extract_groups(_THREE_PARTS)
    two = text.str.extract_groups(_TWO_PARTS)
    hours = three.struct.field("2").cast(pl.Float64)
    minutes = three.struct.field("3").cast(pl.Float64)
    seconds = three.struct.field("4").cast(pl.Float64)
    first = two.struct.field("2").cast(pl.Float64)
    second = two.struct.field("3").cast(pl.Float64)
    if two_part == "hours":
        two_micros = first * MICROSECONDS["h"] + second * MICROSECONDS["min"]
    else:
        two_micros = first * MICROSECONDS["min"] + second * MICROSECONDS["s"]
    three_micros = (
        hours * MICROSECONDS["h"]
        + minutes * MICROSECONDS["min"]
        + seconds * MICROSECONDS["s"]
    )
    sign = (
        pl.when(pl.coalesce(three.struct.field("1"), two.struct.field("1")) == "-")
        .then(-1.0)
        .otherwise(1.0)
    )
    micros = pl.coalesce(three_micros, two_micros) * sign
    return _from_microseconds(micros).name.keep()


def elapsed_from_numbers(column: pl.Expr, unit: ElapsedUnit) -> pl.Expr:
    """Numbers of milliseconds, seconds, minutes, hours or days (Excel's fraction)."""

    numbers = column.cast(pl.Float64, strict=False)
    micros = numbers * MICROSECONDS[unit]
    if unit == "d":
        # Excel keeps times as fractions of a day; its float error is below a
        # millisecond, so 07:58.5 comes back as 7:58.5, not 7:58.499616.
        micros = (micros / 1_000).round(0) * 1_000
    return _from_microseconds(micros).name.keep()


def elapsed_from_datetime(column: pl.Expr) -> pl.Expr:
    """A date and time's time of day as elapsed time (Excel day-zero values)."""

    naive = column.dt.replace_time_zone(None)
    return (naive - naive.dt.truncate("1d")).cast(ELAPSED_DTYPE).name.keep()


def elapsed_to_number(column: pl.Expr, unit: ElapsedUnit) -> pl.Expr:
    """Elapsed time as a decimal number of the unit (7:58.5 is 478.5 seconds)."""

    return (
        column.dt.total_microseconds().cast(pl.Float64) / MICROSECONDS[unit]
    ).name.keep()


def _padded(value: pl.Expr, width: int) -> pl.Expr:
    return value.cast(pl.String).str.zfill(width)


def elapsed_to_text(column: pl.Expr, style: ElapsedText = "auto") -> pl.Expr:
    """Elapsed time written as text.

    ``auto`` is how Wordflow shows it: "7:58.542" under an hour, "1:23:20.25"
    from an hour, the fraction only when it is not zero. The others always
    use their parts: "0:07:58", "0:07:58.542", "07:58" or "07:58.542" (minutes
    then count past 59).
    """

    micros = column.dt.total_microseconds()
    negative = micros < 0
    total = micros.abs()
    millis = (total // 1_000) % 1_000
    whole_seconds = total // 1_000_000
    hours = whole_seconds // 3_600
    minutes = (whole_seconds // 60) % 60
    seconds = whole_seconds % 60
    all_minutes = whole_seconds // 60
    fraction = _padded(millis, 3)
    if style == "h:mm:ss":
        text = pl.format("{}:{}:{}", hours, _padded(minutes, 2), _padded(seconds, 2))
    elif style == "h:mm:ss.fff":
        text = pl.format(
            "{}:{}:{}.{}", hours, _padded(minutes, 2), _padded(seconds, 2), fraction
        )
    elif style == "mm:ss":
        text = pl.format("{}:{}", _padded(all_minutes, 2), _padded(seconds, 2))
    elif style == "mm:ss.fff":
        text = pl.format(
            "{}:{}.{}", _padded(all_minutes, 2), _padded(seconds, 2), fraction
        )
    else:
        trimmed = (
            pl.when(millis > 0)
            .then(pl.lit(".") + fraction.str.strip_chars_end("0"))
            .otherwise(pl.lit(""))
        )
        text = (
            pl.when(hours > 0)
            .then(
                pl.format("{}:{}:{}", hours, _padded(minutes, 2), _padded(seconds, 2))
            )
            .otherwise(pl.format("{}:{}", minutes, _padded(seconds, 2)))
            + trimmed
        )
    result = (
        pl.when(column.is_null())
        .then(None)
        .otherwise(pl.when(negative).then(pl.lit("-") + text).otherwise(text))
    )
    return result.name.keep()


def parse_elapsed(
    value: object, two_part: TwoPartTimes = "minutes"
) -> dt.timedelta | None:
    """One typed value, such as a Filter's "7:58" or "1:23:20", as a timedelta.

    Reads like ``elapsed_from_text``; a timedelta is returned as it is, and
    anything else is None.
    """

    if isinstance(value, dt.timedelta):
        return value
    if not isinstance(value, str):
        return None
    text = re.sub(r"^(-?[\d:]+),(\d+)$", r"\1.\2", value.strip())
    three = re.match(_THREE_PARTS, text)
    two = re.match(_TWO_PARTS, text)
    if three:
        sign, hours, minutes, seconds = three.groups()
        delta = dt.timedelta(
            hours=int(hours), minutes=int(minutes), seconds=float(seconds)
        )
    elif two:
        sign, first, second = two.groups()
        delta = (
            dt.timedelta(hours=int(first), minutes=float(second))
            if two_part == "hours"
            else dt.timedelta(minutes=int(first), seconds=float(second))
        )
    else:
        return None
    return -delta if sign == "-" else delta


def as_text(column: pl.Expr, dtype: pl.DataType) -> pl.Expr:
    """Any column as text, for tools that work on text. Polars cannot cast
    elapsed time to text, so it is written as Wordflow shows it (7:58.5)."""

    if isinstance(dtype, pl.Duration):
        return elapsed_to_text(column)
    return column.cast(pl.String)


def is_excel_day_zero(values: pl.Series) -> bool:
    """Whether a date-and-time column holds only times on Excel's day zero."""

    if not isinstance(values.dtype, pl.Datetime):
        return False
    present = values.drop_nulls()
    if present.is_empty():
        return False
    return bool(present.dt.date().is_in(list(EXCEL_DAY_ZERO)).all())


__all__ = [
    "ELAPSED_DTYPE",
    "as_text",
    "ElapsedText",
    "ElapsedUnit",
    "TwoPartTimes",
    "elapsed_from_datetime",
    "elapsed_from_numbers",
    "elapsed_from_text",
    "elapsed_to_number",
    "elapsed_to_text",
    "is_elapsed",
    "is_excel_day_zero",
    "parse_elapsed",
]
