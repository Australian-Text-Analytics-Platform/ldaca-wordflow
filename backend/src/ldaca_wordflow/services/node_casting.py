"""Polars column-casting builder for identity-preserving Data Block Edits.

Used by ``node_operations`` while it builds a replacement lazy plan. This module
owns the cast expression and validation details; ``NodeService`` owns workspace
mutation and persistence.

Flow:
- Inspect the source LazyFrame schema to capture the original dtype.
- Build the target Polars expression for the requested cast.
- Validate the expression against a small sample before mutating the full lazy
  plan.
- Return the new LazyFrame plus response metadata for the route.
"""

from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from ..shared.empty_values import empty_value_expression
from ..shared.errors import AppError, InvalidInputError, format_exception_diagnostic
from .category_order import default_order_expression, ordered_category_expression
from .conversion import (
    ConversionOptions,
    datetime_from_numbers,
    datetime_from_text,
    number_from_text,
    round_to_whole,
    uses_numbers,
)


SUPPORTED_CAST_TARGETS = "string, integer, float, datetime, date, categorical"

# The Data Editor's names for each cast target (issue 205).
_TARGET_LABELS = {
    "string": "text",
    "categorical": "category",
    "integer": "whole number",
    "float": "decimal",
    "datetime": "date and time",
    "date": "date",
}

_NOTHING_CHANGED = "Nothing was changed."


def _target_label(target_type: str) -> str:
    return _TARGET_LABELS.get(target_type.lower(), target_type)


def _cast_failure(message: str, exc: BaseException) -> InvalidInputError:
    """A plain reason, with the library's text kept for Details (issue 205)."""

    return InvalidInputError(
        f"{message} {_NOTHING_CHANGED}",
        details={"diagnostic": format_exception_diagnostic(exc)},
    )
TIMEZONE_FORMAT_TOKENS = ("%z", "%:z", "%#z")


@dataclass(frozen=True)
class CastLazyFrameColumnResult:
    """Result metadata for a successful lazy-frame column cast.

    Used by ``cast_lazyframe_column`` and the edit builder, which needs the new
    lazy frame plus before/after dtype metadata for validation.
    """

    lazyframe: pl.LazyFrame
    original_type: str
    new_type: str
    target_type: str
    format_used: str | None
    strict_used: bool | None
    # The column's converted values, for the conversion check (issue 322).
    expression: pl.Expr | None = None


def _datetime_cast_expr(
    column_name: str,
    *,
    original_type: str,
    datetime_format: str | None,
    strict_flag: bool,
    dtype: pl.DataType | None = None,
    options: ConversionOptions | None = None,
) -> pl.Expr:
    """Build a timezone-aware UTC datetime cast expression.

    Called by:
    - ``_cast_expr`` for the datetime branch because string parsing and
      timezone application have several guards that should stay out of the HTTP
      route.
    """

    orig_lower = original_type.lower()
    options = options or ConversionOptions(datetime_format=datetime_format)
    try:
        if orig_lower.startswith("datetime"):
            parsed = pl.col(column_name)
        elif orig_lower == "date":
            # A real Date column (such as one read from Excel) is converted,
            # not parsed as text (issue 165).
            parsed = pl.col(column_name).cast(pl.Datetime("us"))
        elif uses_numbers(options):
            # Unix times or Excel day numbers, in UTC (issue 322).
            parsed = datetime_from_numbers(
                pl.col(column_name), dtype or pl.Float64(), options
            )
        else:
            # Cast first so category columns parse too (issue 318); two-digit
            # years go to the chosen century (issue 322).
            parsed = datetime_from_text(
                pl.col(column_name), options, strict=bool(strict_flag)
            )

        format_has_tz = datetime_format and any(
            token in datetime_format for token in TIMEZONE_FORMAT_TOKENS
        )
        source_has_tz = orig_lower.startswith("datetime") and "," in orig_lower
        if format_has_tz or source_has_tz:
            return parsed.dt.convert_time_zone("UTC").alias(column_name)
        return parsed.dt.replace_time_zone("UTC").alias(column_name)
    except Exception as exc:
        format_phrase = (
            f"the date format {datetime_format}"
            if datetime_format
            else "a date format Wordflow recognises"
        )
        raise _cast_failure(
            f'Some values in "{column_name}" don\'t match {format_phrase}. '
            "Check the format, or clean those values first.",
            exc,
        ) from exc


def _date_cast_expr(
    column_name: str,
    *,
    original_type: str,
    datetime_format: str | None,
    strict_flag: bool,
    dtype: pl.DataType | None = None,
    options: ConversionOptions | None = None,
) -> pl.Expr:
    """A calendar date without a time of day (issue 187).

    Datetime columns keep their date; text is parsed with the given format, or
    an inferred one. Other types have no meaningful date, so they are refused.
    """

    orig_lower = original_type.lower()
    column = pl.col(column_name)
    options = options or ConversionOptions(datetime_format=datetime_format)
    if orig_lower == "date":
        return column.alias(column_name)
    if orig_lower.startswith("datetime"):
        return column.dt.date().alias(column_name)
    if uses_numbers(options):
        return (
            datetime_from_numbers(column, dtype or pl.Float64(), options)
            .dt.date()
            .alias(column_name)
        )
    if orig_lower in ("string", "str", "utf8") or orig_lower.startswith(("categorical", "enum")):
        text = column.cast(pl.String)
        if datetime_format and (
            options.two_digit_year_start is not None
            or any(token in datetime_format for token in ("%H", "%I", "%z", "%:z"))
        ):
            # A date-and-time format, or a chosen century, reads through the
            # date-and-time parser and keeps the date (issue 322).
            return (
                datetime_from_text(column, options, strict=bool(strict_flag))
                .dt.date()
                .alias(column_name)
            )
        if datetime_format:
            return text.str.to_date(
                format=datetime_format, strict=bool(strict_flag)
            ).alias(column_name)
        return text.str.to_date(strict=bool(strict_flag)).alias(column_name)
    raise InvalidInputError(
        f'Only text and date and time columns can become dates, and "{column_name}" '
        "is neither."
    )


def _cast_expr(
    column_name: str,
    *,
    original_type: str,
    target_type: str,
    datetime_format: str | None,
    strict_flag: bool,
    dtype: pl.DataType | None = None,
    options: ConversionOptions | None = None,
) -> pl.Expr:
    """Build the Polars expression for one supported target type.

    Called by:
    - ``cast_lazyframe_column`` after schema inspection.
    """

    target_lower = target_type.lower()

    options = options or ConversionOptions(datetime_format=datetime_format)
    if target_lower == "datetime":
        return _datetime_cast_expr(
            column_name,
            original_type=original_type,
            datetime_format=datetime_format,
            strict_flag=strict_flag,
            dtype=dtype,
            options=options,
        )
    if target_lower == "date":
        return _date_cast_expr(
            column_name,
            original_type=original_type,
            datetime_format=datetime_format,
            strict_flag=strict_flag,
            dtype=dtype,
            options=options,
        )
    is_text = dtype is not None and (
        dtype == pl.String or isinstance(dtype, (pl.Categorical, pl.Enum))
    )
    if target_lower in ("string", "utf8", "str", "text"):
        if (original_type.startswith("Datetime") or original_type == "Date") and datetime_format:
            return pl.col(column_name).dt.strftime(datetime_format).alias(column_name)
        return pl.col(column_name).cast(pl.Utf8).alias(column_name)
    if target_lower == "integer":
        # Text is read with the chosen marks, and decimals round to the nearest
        # whole number, halves away from zero (issue 322).
        if is_text:
            return round_to_whole(number_from_text(pl.col(column_name), options)).alias(
                column_name
            )
        if dtype is not None and dtype.is_float():
            return round_to_whole(pl.col(column_name)).alias(column_name)
        return pl.col(column_name).cast(pl.Int64, strict=False).alias(column_name)
    if target_lower == "float":
        # Like integer: values that are not numbers become empty, and the
        # Data Editor warns with Undo (issues 183 and 187).
        if is_text:
            return number_from_text(pl.col(column_name), options).alias(column_name)
        return pl.col(column_name).cast(pl.Float64, strict=False).alias(column_name)
    raise InvalidInputError(
        f"Wordflow can't convert columns to {target_type} yet. Choose text, category, "
        "whole number, decimal, date, or date and time."
    )


def cast_lazyframe_column(
    lazyframe: pl.LazyFrame,
    *,
    column_name: str,
    target_type: str,
    datetime_format: str | None = None,
    strict: bool | None = None,
    categories: list[str] | None = None,
    options: ConversionOptions | None = None,
) -> CastLazyFrameColumnResult:
    """Return a new LazyFrame with one column cast to the requested dtype.

    Used by ``node_operations`` as the single operation that validates and
    builds a casted lazy plan before the selected Data Block is updated.

    Flow:
    - Capture source dtype metadata from the lazy schema.
    - Build a target expression for supported cast targets.
    - Collect a 50-row validation sample so conversion errors surface before
      the workspace is persisted.
    - Return the casted LazyFrame and response metadata.
    """

    strict_flag = strict if strict is not None else False
    try:
        schema = lazyframe.collect_schema()
        original_type = str(schema[column_name])
        target_lower = target_type.lower()
        if target_lower == "categorical":
            # An ordered category in the chosen or default order (issue 318).
            cast_expr = (
                ordered_category_expression(lazyframe, column_name, categories)
                if categories is not None
                else default_order_expression(lazyframe, column_name)
            )
        else:
            cast_expr = _cast_expr(
                column_name,
                original_type=original_type,
                target_type=target_type,
                datetime_format=datetime_format,
                strict_flag=bool(strict_flag),
                dtype=schema[column_name],
                options=options
                or ConversionOptions(datetime_format=datetime_format),
            )

        try:
            lazyframe.head(50).with_columns(cast_expr).collect()
        except Exception as sample_err:
            if target_lower in {"datetime", "date"}:
                format_phrase = (
                    f"the date format {datetime_format}"
                    if datetime_format
                    else "a date format Wordflow recognises"
                )
                reason = (
                    f'Some values in "{column_name}" don\'t match {format_phrase}. '
                    "Check the format, or clean those values first."
                )
            else:
                reason = (
                    f'Some values in "{column_name}" can\'t be read as '
                    f"{_target_label(target_type)}. Clean them first, or choose another type."
                )
            raise _cast_failure(reason, sample_err) from sample_err

        casted_lazyframe = lazyframe.with_columns(cast_expr)
        new_type = str(casted_lazyframe.collect_schema()[column_name])
        return CastLazyFrameColumnResult(
            lazyframe=casted_lazyframe,
            original_type=original_type,
            new_type=new_type,
            target_type=target_type,
            format_used=datetime_format if datetime_format else None,
            strict_used=bool(strict_flag) if target_lower == "datetime" else None,
            expression=cast_expr,
        )
    except AppError:
        raise
    except Exception as cast_error:
        raise _cast_failure(
            f'"{column_name}" can\'t be converted to {_target_label(target_type)}. '
            "Clean its values first, or choose another type.",
            cast_error,
        ) from cast_error


_RESULT_LABEL_FORMATS = {"datetime": "%Y-%m-%d %H:%M:%S", "date": "%Y-%m-%d"}


def check_cast(
    lazyframe: pl.LazyFrame,
    *,
    column_name: str,
    target_type: str,
    options: ConversionOptions,
    sample_rows: int = 8,
    failure_rows: int = 5,
) -> dict[str, object]:
    """Try a conversion on the whole column without changing it (issue 322).

    The original and converted values come from one pass over the plan, so
    their rows always line up (issue 319). Returns counts, a preview of the
    first values, and the first values that would not convert.
    """

    result = cast_lazyframe_column(
        lazyframe,
        column_name=column_name,
        target_type=target_type,
        datetime_format=options.datetime_format,
        options=options,
    )
    if result.expression is None:
        raise InvalidInputError("This conversion can't be checked.")
    dtype = lazyframe.collect_schema()[column_name]
    before = pl.col(column_name)
    label_format = _RESULT_LABEL_FORMATS.get(target_type)
    after = result.expression.alias("__after__")
    after_text = (
        pl.col("__after__").dt.strftime(label_format)
        if label_format
        else pl.col("__after__").cast(pl.String)
    )
    frame = (
        lazyframe.select(
            pl.int_range(pl.len(), dtype=pl.Int64).alias("__row__"),
            empty_value_expression(before, dtype).alias("__empty__"),
            before.cast(pl.String).alias("__before__"),
            after,
        )
        .with_columns(after_text.alias("__after_text__"))
        .collect()
    )
    filled = frame.filter(~pl.col("__empty__"))
    failed = filled.filter(pl.col("__after__").is_null())
    return {
        "total_rows": frame.height,
        "non_empty": filled.height,
        "converted": filled.height - failed.height,
        "failed": failed.height,
        "samples": [
            {"row": int(row) + 1, "value": value, "result": text}
            for row, value, text in filled.head(sample_rows)
            .select("__row__", "__before__", "__after_text__")
            .iter_rows()
        ],
        "failures": [
            {"row": int(row) + 1, "value": value}
            for row, value in failed.head(failure_rows)
            .select("__row__", "__before__")
            .iter_rows()
        ],
    }
