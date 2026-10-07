"""Reading dates and numbers written as text or numbers (issue 322).

The conversion window detects how a column's values are written, lets the user
correct it, and checks the whole column before converting. Detection, the
check and the cast all build their expressions here, so they always agree.

Used by: ``node_casting`` (the cast edit), the date format detection endpoint
and the conversion check endpoint.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import datetime as dt
import re
from typing import Literal

import polars as pl

from ..shared.empty_values import empty_value_expression
from ..shared.errors import InvalidInputError

EpochUnit = Literal["s", "ms", "us", "ns"]
DecimalMark = Literal[".", ","]
ThousandsSeparator = Literal["", ",", ".", " ", "'"]

SAMPLE_VALUES = 1_000
_QUICK_VALUES = 20
_EXCEL_EPOCH = dt.datetime(1899, 12, 30)
# Excel day numbers between 1 Jan 1900 and 31 Dec 2099.
EXCEL_MIN, EXCEL_MAX = 1.0, 73_050.0
_MICROSECONDS = {"s": 1_000_000, "ms": 1_000, "us": 1, "ns": 0.001}
# Plausible Unix times, as microseconds: 1 Jan 1900 to 31 Dec 2099.
_PLAUSIBLE_MICROSECONDS = (-2_208_988_800_000_000, 4_102_444_800_000_000)


@dataclass(frozen=True)
class ConversionOptions:
    """How to read the values; defaults read them as before (issue 322)."""

    datetime_format: str | None = None
    epoch_unit: EpochUnit | None = None
    excel_serial: bool = False
    two_digit_year_start: int | None = None
    decimal_mark: DecimalMark = "."
    thousands_separator: ThousandsSeparator = ""
    ignore_symbols: bool = False


# --- numbers ---------------------------------------------------------------


def number_from_text(column: pl.Expr, options: ConversionOptions) -> pl.Expr:
    """Text such as "1,234.5", "3,5" or "$12" as a decimal number.

    Thousands separators are removed and a decimal comma becomes a point; with
    ``ignore_symbols`` everything but digits, signs, the marks and an exponent
    is dropped first, so "$12" reads 12 and "45%" reads 45.
    """

    text = column.cast(pl.String).str.strip_chars()
    if options.ignore_symbols:
        text = text.str.replace_all(r"[^0-9+\-.,eE' ]", "")
        text = text.str.strip_chars()
    if options.thousands_separator:
        # Only proper groups of three count as thousands, so "3,5" with a
        # comma separator does not quietly become 35: it fails and shows in
        # the check instead.
        separator = re.escape(options.thousands_separator)
        mark = re.escape(options.decimal_mark)
        grouped = (
            rf"^[+-]?(?:\d{{1,3}}(?:{separator}\d{{3}})+|\d+)"
            rf"(?:{mark}\d+)?(?:[eE][+-]?\d+)?$"
        )
        text = (
            pl.when(text.str.contains(grouped))
            .then(text.str.replace_all(options.thousands_separator, "", literal=True))
            .otherwise(None)
        )
    if options.decimal_mark == ",":
        text = text.str.replace_all(",", ".", literal=True)
    return text.cast(pl.Float64, strict=False)


def round_to_whole(values: pl.Expr) -> pl.Expr:
    """Nearest whole number, halves away from zero (2.5 is 3, -2.5 is -3)."""

    return values.round(0, mode="half_away_from_zero").cast(pl.Int64, strict=False)


# --- dates -----------------------------------------------------------------


def _numbers_of(column: pl.Expr, dtype: pl.DataType) -> pl.Expr:
    return (
        column.cast(pl.Float64, strict=False)
        if dtype.is_numeric()
        else column.cast(pl.String).str.strip_chars().cast(pl.Float64, strict=False)
    )


def datetime_from_numbers(
    column: pl.Expr, dtype: pl.DataType, options: ConversionOptions
) -> pl.Expr:
    """Unix times or Excel day numbers as naive date-and-time values."""

    numbers = _numbers_of(column, dtype)
    if options.excel_serial:
        valid = numbers.is_between(EXCEL_MIN, EXCEL_MAX)
        days = pl.when(valid).then(numbers)
        return pl.lit(_EXCEL_EPOCH) + pl.duration(
            microseconds=(days * 86_400_000_000).round(0).cast(pl.Int64)
        )
    unit = options.epoch_unit or "s"
    micros = (numbers * _MICROSECONDS[unit]).round(0)
    low, high = _PLAUSIBLE_MICROSECONDS
    in_range = pl.when(micros.is_between(low, high)).then(micros).cast(pl.Int64)
    return pl.from_epoch(in_range, time_unit="us")


def _shift_two_digit_years(parsed: pl.Expr, start: int) -> pl.Expr:
    """Move every year into the 100 years from ``start``.

    Polars reads a two-digit year as 20xx; the user chooses the century
    instead (1900, 2000, or a split such as 1950 for 1950 to 2049).
    """

    year = parsed.dt.year()
    shift = (((year - start) % 100) + start) - year
    return parsed.dt.offset_by(pl.format("{}y", shift))


def datetime_from_text(
    column: pl.Expr, options: ConversionOptions, *, strict: bool = False
) -> pl.Expr:
    """Text dates in ``options.datetime_format`` (or Polars' guess without one)."""

    text = column.cast(pl.String).str.strip_chars()
    fmt = options.datetime_format
    parsed = (
        text.str.to_datetime(format=fmt, strict=strict)
        if fmt
        else text.str.to_datetime(strict=strict)
    )
    if fmt and "%y" in fmt and options.two_digit_year_start is not None:
        parsed = _shift_two_digit_years(parsed, options.two_digit_year_start)
    return parsed


def uses_numbers(options: ConversionOptions) -> bool:
    return options.excel_serial or options.epoch_unit is not None


# --- detection -------------------------------------------------------------

_DATE_PARTS = [
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%Y/%m/%d",
    "%d-%m-%Y",
    "%m-%d-%Y",
    "%d.%m.%Y",
    "%Y.%m.%d",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d, %Y",
    "%B %d, %Y",
    "%b %d %Y",
    "%B %d %Y",
    "%d-%b-%Y",
    "%a %d %b %Y",
    "%A %d %B %Y",
    "%a, %d %b %Y",
    "%A, %d %B %Y",
    "%Y%m%d",
    "%d/%m/%y",
    "%m/%d/%y",
    "%d-%m-%y",
    "%d.%m.%y",
    "%d %b %y",
    "%d-%b-%y",
]
_TIME_PARTS = [
    "",
    " %H:%M",
    " %H:%M:%S",
    " %H:%M:%S%.f",
    " %I:%M %p",
    " %I:%M:%S %p",
    "T%H:%M",
    "T%H:%M:%S",
    "T%H:%M:%S%.f",
]
_ZONE_PARTS = ["", "%z", "%:z", " %z", " %:z", "Z"]
_WHOLE_FORMATS = [
    "%a %b %d %H:%M:%S %z %Y",  # Twitter
    "%a, %d %b %Y %H:%M:%S %z",  # email (RFC 2822)
]
DAY_FIRST_PAIRS = {
    "%d/%m": "%m/%d",
    "%d-%m": "%m-%d",
    "%d.%m": "%m.%d",
}


def candidate_formats() -> list[str]:
    formats = []
    for date in _DATE_PARTS:
        for time in _TIME_PARTS:
            zones = _ZONE_PARTS if time else [""]
            for zone in zones:
                formats.append(date + time + zone)
    return formats + _WHOLE_FORMATS


@dataclass(frozen=True)
class FormatCandidate:
    kind: Literal["format", "unix", "excel"]
    format: str | None
    epoch_unit: EpochUnit | None
    parsed: int
    sample_size: int
    examples: list[tuple[str, str]]
    two_digit_year: bool = False
    swap_format: str | None = None


@dataclass
class DetectionResult:
    candidates: list[FormatCandidate] = field(default_factory=list)
    sample_size: int = 0
    sample_value: str | None = None


def _label(value: dt.datetime | None) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value is not None else ""


def _swap(fmt: str) -> str | None:
    for day_first, month_first in DAY_FIRST_PAIRS.items():
        if fmt.startswith(day_first):
            return month_first + fmt[len(day_first) :]
        if fmt.startswith(month_first):
            return day_first + fmt[len(month_first) :]
    return None


def detect_datetime_formats(lazyframe: pl.LazyFrame, column: str) -> DetectionResult:
    """Formats that read the column's first values, best first."""

    schema = lazyframe.collect_schema()
    if column not in schema:
        raise InvalidInputError(f'Column "{column}" was not found.')
    dtype = schema[column]
    value = pl.col(column)
    sample = (
        lazyframe.select(value)
        .filter(~empty_value_expression(value, dtype))
        .head(SAMPLE_VALUES)
        .collect()
    )
    result = DetectionResult(sample_size=sample.height)
    if sample.height == 0:
        return result
    texts = sample.select(value.cast(pl.String).str.strip_chars())[column]
    result.sample_value = str(texts[0])
    numbers = sample.select(_numbers_of(value, dtype))[column]
    if numbers.null_count() == 0:
        result.candidates.extend(_number_candidates(sample, column, dtype))
    if not dtype.is_numeric():
        result.candidates.extend(_text_candidates(texts))
    result.candidates.sort(key=lambda candidate: -candidate.parsed)
    return result


def _number_candidates(
    sample: pl.DataFrame, column: str, dtype: pl.DataType
) -> list[FormatCandidate]:
    """Unix time in the coarsest unit that gives real dates, then Excel days.

    Every unit turns 1601596799 into some date, but only seconds give one away
    from 1970 (milliseconds give 19 Jan 1970), so a unit is kept only when its
    dates are not bunched at the start of 1970.
    """

    found: list[FormatCandidate] = []
    for unit in ("s", "ms", "us", "ns"):
        converted = sample.select(
            datetime_from_numbers(
                pl.col(column), dtype, ConversionOptions(epoch_unit=unit)
            ).alias("v")
        )["v"]
        if converted.null_count() > 0:
            continue
        years = converted.dt.year()
        bunched = ((years >= 1969) & (years <= 1970)).sum() * 2 > years.len()
        if bunched:
            continue
        found.append(_candidate("unix", None, unit, sample, column, converted))
        break
    excel = sample.select(
        datetime_from_numbers(
            pl.col(column), dtype, ConversionOptions(excel_serial=True)
        ).alias("v")
    )["v"]
    if excel.null_count() == 0:
        found.append(_candidate("excel", None, None, sample, column, excel))
    return found


def _candidate(
    kind: Literal["format", "unix", "excel"],
    fmt: str | None,
    unit: EpochUnit | None,
    sample: pl.DataFrame,
    column: str,
    converted: pl.Series,
) -> FormatCandidate:
    originals = sample[column].cast(pl.String).to_list()
    pairs = [
        (str(original), _label(result))
        for original, result in zip(originals, converted.to_list(), strict=True)
        if result is not None
    ][:3]
    return FormatCandidate(
        kind=kind,
        format=fmt,
        epoch_unit=unit,
        parsed=converted.len() - converted.null_count(),
        sample_size=sample.height,
        examples=pairs,
    )


def _text_candidates(texts: pl.Series) -> list[FormatCandidate]:
    quick = texts.head(_QUICK_VALUES)
    frame = pl.DataFrame({"v": texts})
    found: list[FormatCandidate] = []
    seen_results: list[pl.Series] = []
    for fmt in candidate_formats():
        if quick.str.to_datetime(format=fmt, strict=False).null_count() == quick.len():
            continue
        converted = texts.str.to_datetime(format=fmt, strict=False)
        parsed = converted.len() - converted.null_count()
        if parsed == 0:
            continue
        # %Y also reads "20" as the year 20; leave two-digit years to %y.
        if "%Y" in fmt and (converted.dt.year() < 100).sum() * 2 > parsed:
            continue
        # Formats that read every value the same way (%z and %:z) are one choice.
        naive = (
            converted.dt.replace_time_zone(None)
            if isinstance(converted.dtype, pl.Datetime) and converted.dtype.time_zone
            else converted
        )
        if any(naive.equals(earlier) for earlier in seen_results):
            continue
        seen_results.append(naive)
        candidate = _candidate("format", fmt, None, frame, "v", converted)
        found.append(
            FormatCandidate(
                kind="format",
                format=fmt,
                epoch_unit=None,
                parsed=parsed,
                sample_size=texts.len(),
                examples=candidate.examples,
                two_digit_year="%y" in fmt,
            )
        )
    by_format = {candidate.format: candidate for candidate in found}
    marked = []
    for candidate in found:
        swap = _swap(candidate.format or "")
        other = by_format.get(swap) if swap else None
        ambiguous = other is not None and other.parsed == candidate.parsed
        marked.append(replace(candidate, swap_format=swap if ambiguous else None))
    # Day first wins a tie with month first (Chao, 2026-10-07).
    marked.sort(
        key=lambda c: (-c.parsed, 0 if (c.format or "").startswith("%d") else 1)
    )
    best = marked[0].parsed if marked else 0
    return [
        candidate
        for candidate in marked
        if candidate.parsed == best or candidate.parsed >= 0.5 * candidate.sample_size
    ][:6]


def format_tokens(sample: str) -> list[str]:
    """A value split into its parts, for the format builder: digit runs,
    letter runs, and everything else one character at a time."""

    return re.findall(r"[+-]\d{2}:?\d{2}|\d+|[A-Za-z]+|.", sample)
