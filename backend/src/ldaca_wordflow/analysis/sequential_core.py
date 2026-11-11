"""Pure Polars sequential-analysis computation used by process workers."""

from __future__ import annotations


import polars as pl

from ..shared.elapsed_time import MICROSECONDS, elapsed_to_text
from ..shared.empty_values import empty_value_expression
from ..shared.errors import InvalidInputError
from ..shared.unsupported_columns import supported_metadata_columns

SEQUENTIAL_PERIOD_INDEX_COLUMN = "period_index"
SEQUENTIAL_GROUP_INDEX_COLUMN = "group_index"
SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN = "__wordflow_trends_period_index"
SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN = "__wordflow_trends_group_index"
_SEQUENTIAL_ROW_INDEX_COLUMN = "__wordflow_trends_row_index"
# Denominators from the reference Data Block, per period and shared group
# column: its rows, and the words of its text column when one was chosen.
SEQUENTIAL_REFERENCE_ROWS_COLUMN = "reference_rows"
SEQUENTIAL_REFERENCE_WORDS_COLUMN = "reference_words"
# With a reference the result holds every period and group, so a period with
# words but no rows reads as zero, not as missing; this bounds that grid.
MAX_TRENDS_CELLS = 2_000_000
# Elapsed-time steps in microseconds (issue 324).
_ELAPSED_STEPS = {"second": "s", "minute": "min", "hourly": "h"}
_ELAPSED_CUSTOM_UNITS = {"seconds": "s", "minutes": "min", "hours": "h"}
_CUSTOM_UNIT_SPEC: dict[str, tuple[str, str]] = {
    "seconds": ("s", "%Y-%m-%d %H:%M:%S"),
    "minutes": ("m", "%Y-%m-%d %H:%M"),
    "hours": ("h", "%Y-%m-%d %H:00"),
    "days": ("d", "%Y-%m-%d"),
    "weeks": ("w", "%Y-%m-%d"),
}


def reference_group_columns(
    group_by_columns: list[str] | None, reference_columns: list[str] | pl.Schema
) -> tuple[list[str], list[str]]:
    """Split the group columns into those the reference has and those it lacks.

    The reference's totals are grouped by the columns it shares with the
    analysed Data Block, usually metadata such as a speaker or a year. A
    column it lacks, such as a Concordance search term, cannot split its
    totals, so every group of that column shares the same denominator.
    """

    names = set(reference_columns.names() if isinstance(reference_columns, pl.Schema) else reference_columns)
    shared = [column for column in (group_by_columns or []) if column in names]
    missing = [column for column in (group_by_columns or []) if column not in names]
    return shared, missing


def _assign_time_period(
    df: pl.DataFrame,
    *,
    time_column: str,
    column_type: str,
    frequency: str,
    numeric_origin: float | None,
    numeric_interval: float | None,
    custom_interval_value: int | None,
    custom_interval_unit: str | None,
) -> tuple[pl.DataFrame, str, float | None, float | None]:
    """Add ``time_period`` to every row, dropping rows without an axis value.

    Returns the frame, the datetime label format, and the numeric origin and
    interval it used, so a reference frame bins exactly like the analysed one.
    """

    time_format = ""
    numeric_interval_value: float | None = None
    numeric_origin_value: float | None = None

    if column_type == "datetime":
        sub_day = frequency in {"second", "minute", "hourly"} or (
            frequency == "custom"
            and custom_interval_unit in {"hours", "minutes", "seconds"}
        )
        if sub_day and df.schema.get(time_column) == pl.Date:
            # A Date has no time of day; read it as midnight so sub-day
            # periods still work (the UI hides them for Date columns, issue 187).
            df = df.with_columns(pl.col(time_column).cast(pl.Datetime("us")))
        if frequency == "second":
            time_expr = pl.col(time_column).dt.truncate("1s").alias("time_period")
            time_format = "%Y-%m-%d %H:%M:%S"
        elif frequency == "minute":
            time_expr = pl.col(time_column).dt.truncate("1m").alias("time_period")
            time_format = "%Y-%m-%d %H:%M"
        elif frequency == "hourly":
            time_expr = pl.col(time_column).dt.truncate("1h").alias("time_period")
            time_format = "%Y-%m-%d %H:%M"
        elif frequency == "daily":
            time_expr = pl.col(time_column).dt.date().alias("time_period")
            time_format = "%Y-%m-%d"
        elif frequency == "weekly":
            time_expr = (
                pl.col(time_column).dt.truncate("1w").dt.date().alias("time_period")
            )
            time_format = "%Y-W%U"
        elif frequency == "monthly":
            time_expr = (
                pl.col(time_column).dt.truncate("1mo").dt.date().alias("time_period")
            )
            time_format = "%Y-%m"
        elif frequency == "quarterly":
            time_expr = (
                pl.col(time_column).dt.truncate("3mo").dt.date().alias("time_period")
            )
            time_format = "%Y-Q"
        elif frequency == "yearly":
            time_expr = (
                pl.col(time_column).dt.truncate("1y").dt.date().alias("time_period")
            )
            time_format = "%Y"
        elif frequency == "custom":
            if custom_interval_value is None or custom_interval_value <= 0:
                raise ValueError(
                    "custom_interval_value must be a positive integer when frequency='custom'"
                )
            unit_spec = _CUSTOM_UNIT_SPEC.get(custom_interval_unit or "")
            if unit_spec is None:
                raise ValueError(
                    f"Unsupported custom_interval_unit '{custom_interval_unit}'. "
                    f"Use one of: {sorted(_CUSTOM_UNIT_SPEC)}"
                )
            duration_suffix, time_format = unit_spec
            duration = f"{int(custom_interval_value)}{duration_suffix}"
            time_expr = pl.col(time_column).dt.truncate(duration).alias("time_period")
        else:
            raise ValueError("Unsupported datetime frequency")

        df = df.filter(pl.col(time_column).is_not_null()).with_columns(time_expr)
    elif column_type == "elapsed":
        # Time into a recording, binned from zero by a fixed step; the period
        # is the step's start in seconds, labelled like 7:58 (issue 324).
        if frequency == "custom":
            unit = _ELAPSED_CUSTOM_UNITS.get(custom_interval_unit or "")
            if unit is None or not custom_interval_value or custom_interval_value <= 0:
                raise ValueError(
                    "A custom elapsed-time step needs a number of seconds, minutes "
                    "or hours"
                )
            step = MICROSECONDS[unit] * int(custom_interval_value)
        elif frequency in _ELAPSED_STEPS:
            step = MICROSECONDS[_ELAPSED_STEPS[frequency]]
        else:
            raise ValueError("Elapsed time bins by seconds, minutes or hours")
        micros = pl.col(time_column).dt.total_microseconds()
        df = df.filter(pl.col(time_column).is_not_null()).with_columns(
            ((micros // step) * step / 1_000_000).alias("time_period")
        )
    elif column_type == "category":
        # One position per category value, in the column's order; empty values
        # are kept and become the last position, "(empty)" (issue 318).
        df = df.with_columns(
            pl.when(empty_value_expression(pl.col(time_column), df.schema[time_column]))
            .then(None)
            .otherwise(pl.col(time_column))
            .alias("time_period")
        )
    else:
        # Numeric binning
        if numeric_interval is None or numeric_interval <= 0:
            raise ValueError(
                "numeric_interval must be a positive number for numeric sequential analysis"
            )
        numeric_interval_value = float(numeric_interval)
        df = df.with_columns(
            pl.col(time_column).cast(pl.Float64()).alias("__numeric_value__"),
        ).filter(
            pl.col("__numeric_value__")
            .is_not_null()
            .and_(pl.col("__numeric_value__").is_finite())
        )
        if numeric_origin is not None:
            numeric_origin_value = float(numeric_origin)
        else:
            origin_series = df.select(pl.col("__numeric_value__").min()).to_series()
            numeric_origin_value = origin_series[0] if len(origin_series) else None
        if numeric_origin_value is None:
            raise ValueError(
                "Couldn't work out a start value from the data. Enter a Start value."
            )

        df = df.with_columns(
            (
                (pl.col("__numeric_value__") - pl.lit(numeric_origin_value))
                / pl.lit(numeric_interval_value)
            )
            .floor()
            .cast(pl.Int64)
            .alias("__numeric_bin__"),
        )
        df = df.with_columns(
            (
                pl.lit(numeric_origin_value)
                + pl.col("__numeric_bin__").cast(pl.Float64)
                * pl.lit(numeric_interval_value)
            ).alias("time_period"),
        )
    return df, time_format, numeric_origin_value, numeric_interval_value


def _cast_like(
    frame: pl.DataFrame, columns: list[str], schema: pl.Schema, *, what: str
) -> pl.DataFrame:
    """Cast the reference's columns to the analysed Data Block's types."""

    for column in columns:
        if column not in frame.columns:
            raise InvalidInputError(
                f"The reference Data Block has no column '{column}'. Choose as the "
                "reference the Data Block this one was made from."
            )
        target = schema[column]
        if frame.schema[column] == target:
            continue
        try:
            if frame.schema[column] == pl.String and (
                target.is_temporal() or target.is_numeric()
            ):
                # Text never reads as a date or number here (Polars would
                # parse it, with a deprecation warning).
                raise TypeError("text is not a date or number")
            frame = frame.with_columns(pl.col(column).cast(target, strict=True))
        except Exception as exc:
            raise InvalidInputError(
                f"The reference's '{column}' column holds a different kind of value "
                f"from the analysed Data Block's, so it can't be used {what}. Choose "
                "as the reference the Data Block this one was made from."
            ) from exc
    return frame


def _group_text(row: dict[str, object], group_by_columns: list[str]) -> str:
    values = [str(row[column]) if row[column] is not None else "(empty)" for column in group_by_columns]
    return ", ".join(values)


def _normalise_against_reference(
    result_df: pl.DataFrame,
    *,
    df: pl.DataFrame,
    reference_df: pl.DataFrame,
    period_indices: pl.DataFrame,
    group_indices: pl.DataFrame | None,
    group_by_columns: list[str],
    time_column: str,
    column_type: str,
    reference_word_count_column: str | None,
) -> pl.DataFrame:
    """Give every period and group its row, with the reference's totals beside it.

    The totals are grouped by the period and the group columns the reference
    shares; a group column it lacks shares the period's total. A period or
    group the analysed Data Block has rows in must also exist in the
    reference, and never with fewer words than those rows: otherwise the
    reference is not the Data Block this one was made from.
    """

    shared, _missing = reference_group_columns(group_by_columns, reference_df.schema)
    reference_df = _cast_like(reference_df, shared, df.schema, what="to group the totals")
    aggregations = [pl.len().cast(pl.Int64).alias(SEQUENTIAL_REFERENCE_ROWS_COLUMN)]
    if reference_word_count_column is not None:
        aggregations.append(
            pl.col(reference_word_count_column)
            .sum()
            .cast(pl.Int64)
            .alias(SEQUENTIAL_REFERENCE_WORDS_COLUMN)
        )
    totals = reference_df.group_by(["time_period", *shared]).agg(aggregations)

    groups = (
        group_indices
        if group_indices is not None
        else pl.DataFrame({SEQUENTIAL_GROUP_INDEX_COLUMN: [0]}).with_columns(
            pl.col(SEQUENTIAL_GROUP_INDEX_COLUMN).cast(pl.UInt32)
        )
    )
    if period_indices.height * groups.height > MAX_TRENDS_CELLS:
        raise InvalidInputError(
            f"Normalising gives {period_indices.height:,} periods for each of "
            f"{groups.height:,} groups, too many to draw. Choose a longer period "
            "or group columns with fewer different values."
        )
    cells = period_indices.join(groups, how="cross")
    joined = cells.join(
        result_df.drop(["time_period", *group_by_columns]),
        on=[SEQUENTIAL_PERIOD_INDEX_COLUMN, SEQUENTIAL_GROUP_INDEX_COLUMN],
        how="left",
    ).with_columns(pl.col("sequential_count").fill_null(0))

    # A period the analysed Data Block has no rows in takes its bounds from
    # the reference, so the chart can place it.
    if column_type == "category":
        bounds = period_indices.select(
            "time_period",
            pl.col("time_period").cast(pl.String).alias("__bound_start__"),
            pl.col("time_period").cast(pl.String).alias("__bound_end__"),
        )
    else:
        bounds = (
            pl.concat(
                [
                    df.select("time_period", time_column),
                    reference_df.select("time_period", time_column),
                ]
            )
            .group_by("time_period")
            .agg(
                pl.col(time_column).min().alias("__bound_start__"),
                pl.col(time_column).max().alias("__bound_end__"),
            )
        )
    joined = (
        joined.join(bounds, on="time_period", how="left", nulls_equal=True)
        .with_columns(
            pl.coalesce("period_start", "__bound_start__").alias("period_start"),
            pl.coalesce("period_end", "__bound_end__").alias("period_end"),
        )
        .drop(["__bound_start__", "__bound_end__"])
    )
    joined = joined.join(totals, on=["time_period", *shared], how="left", nulls_equal=True)

    uncovered = joined.filter(
        (pl.col("sequential_count") > 0)
        & pl.col(SEQUENTIAL_REFERENCE_ROWS_COLUMN).is_null()
    )
    if uncovered.height > 0:
        first = uncovered.row(0, named=True)
        where = f"period {first['time_period']}"
        if shared:
            where += f" for {_group_text(first, shared)}"
        raise InvalidInputError(
            f"The reference Data Block has no rows in {where}, but the analysed "
            f"Data Block has {first['sequential_count']:,}. Choose as the reference "
            "the Data Block this one was made from."
        )
    if reference_word_count_column is not None:
        over = joined.filter(
            pl.col("sequential_count") > pl.col(SEQUENTIAL_REFERENCE_WORDS_COLUMN)
        )
        if over.height > 0:
            first = over.row(0, named=True)
            where = f"period {first['time_period']}"
            if shared:
                where += f" for {_group_text(first, shared)}"
            raise InvalidInputError(
                f"The analysed Data Block has {first['sequential_count']:,} rows in "
                f"{where}, more than the reference has words there "
                f"({first[SEQUENTIAL_REFERENCE_WORDS_COLUMN]:,}). Check the "
                "reference Data Block and its text column."
            )
    return joined.select(
        [
            *result_df.columns,
            SEQUENTIAL_REFERENCE_ROWS_COLUMN,
            *(
                [SEQUENTIAL_REFERENCE_WORDS_COLUMN]
                if reference_word_count_column is not None
                else []
            ),
        ]
    )


def _build_sequential_result_frames(
    lf: pl.LazyFrame,
    *,
    time_column: str,
    group_by_columns: list[str] | None = None,
    frequency: str = "monthly",
    sort_by_time: bool = True,
    column_type: str = "datetime",
    numeric_origin: float | None = None,
    numeric_interval: float | None = None,
    custom_interval_value: int | None = None,
    custom_interval_unit: str | None = None,
    reference: pl.LazyFrame | None = None,
    reference_word_count_column: str | None = None,
) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Pure-Polars implementation of sequential analysis.

    Groups records by time period (datetime truncation or numeric binning),
    counts occurrences per group, and returns a DataFrame with aggregated
    results.  No text-processing dependency required.

    With a ``reference`` frame (the Data Block the analysed one was made
    from), every period and group gets a row carrying the reference's rows
    and, when ``reference_word_count_column`` names a per-row word count,
    its words, grouped by the period and the group columns the reference
    shares. The reference bins with the analysed frame's own settings,
    including its numeric origin.
    """

    normalized_column_type = (column_type or "datetime").lower()
    if normalized_column_type not in {"datetime", "numeric", "category", "elapsed"}:
        raise ValueError(
            "Unsupported column_type. Use 'datetime', 'numeric', 'category' or "
            "'elapsed' for sequential analysis"
        )

    # The worker writes both outputs immediately after this computation, so the
    # shared collect is the explicit artifact boundary for both frames.
    source_df = lf.collect()
    reserved_columns = {
        SEQUENTIAL_PERIOD_INDEX_COLUMN,
        SEQUENTIAL_GROUP_INDEX_COLUMN,
        SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN,
        SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN,
        _SEQUENTIAL_ROW_INDEX_COLUMN,
    }
    if reference is not None:
        reserved_columns |= {
            SEQUENTIAL_REFERENCE_ROWS_COLUMN,
            SEQUENTIAL_REFERENCE_WORDS_COLUMN,
        }
    collision = reserved_columns.intersection(source_df.columns)
    if collision:
        raise ValueError(f"Source column name is reserved: {sorted(collision)[0]}")
    df = source_df.with_row_index(_SEQUENTIAL_ROW_INDEX_COLUMN)

    df, time_format, numeric_origin_value, numeric_interval_value = _assign_time_period(
        df,
        time_column=time_column,
        column_type=normalized_column_type,
        frequency=frequency,
        numeric_origin=numeric_origin,
        numeric_interval=numeric_interval,
        custom_interval_value=custom_interval_value,
        custom_interval_unit=custom_interval_unit,
    )

    reference_df: pl.DataFrame | None = None
    if reference is not None:
        reference_df = _cast_like(
            reference.collect(), [time_column], source_df.schema, what="as the time axis"
        )
        reference_df, _format, _origin, _interval = _assign_time_period(
            reference_df,
            time_column=time_column,
            column_type=normalized_column_type,
            frequency=frequency,
            # The analysed frame's origin, so both bin alike.
            numeric_origin=numeric_origin_value,
            numeric_interval=numeric_interval,
            custom_interval_value=custom_interval_value,
            custom_interval_unit=custom_interval_unit,
        )

    # Determine grouping columns
    group_cols = ["time_period"] + (group_by_columns or [])

    period_frames = [df.select("time_period")]
    if reference_df is not None:
        # A period with reference rows but none here is a real zero.
        period_frames.append(reference_df.select("time_period"))
    period_indices = (
        pl.concat(period_frames)
        .unique()
        .sort("time_period", nulls_last=True)
        .with_row_index(SEQUENTIAL_PERIOD_INDEX_COLUMN)
    )
    # nulls_equal: the "(empty)" category position is a real period (issue 318).
    df = df.join(period_indices, on="time_period", how="left", nulls_equal=True)
    group_indices: pl.DataFrame | None = None
    if group_by_columns:
        group_indices = (
            df.select(group_by_columns)
            .unique()
            # Category columns follow their order; the missing group comes last
            # (issues 317 and 318).
            .sort(group_by_columns, nulls_last=True)
            .with_row_index(SEQUENTIAL_GROUP_INDEX_COLUMN)
        )
        df = df.join(
            group_indices,
            on=group_by_columns,
            how="left",
            nulls_equal=True,
        )
    else:
        df = df.with_columns(pl.lit(0, dtype=pl.UInt32).alias(SEQUENTIAL_GROUP_INDEX_COLUMN))

    # Perform aggregation
    if normalized_column_type == "category":
        # A category has no start or end; Data Block Creation selects by index.
        df = df.with_columns(pl.col("time_period").cast(pl.String).alias(time_column))
    result_df = df.group_by(
        [
            *group_cols,
            SEQUENTIAL_PERIOD_INDEX_COLUMN,
            SEQUENTIAL_GROUP_INDEX_COLUMN,
        ]
    ).agg(
        [
            pl.len().alias("sequential_count"),
            pl.col(time_column).min().alias("period_start"),
            pl.col(time_column).max().alias("period_end"),
        ]
    )

    if reference_df is not None:
        result_df = _normalise_against_reference(
            result_df,
            df=df,
            reference_df=reference_df,
            period_indices=period_indices,
            group_indices=group_indices,
            group_by_columns=list(group_by_columns or []),
            time_column=time_column,
            column_type=normalized_column_type,
            reference_word_count_column=reference_word_count_column,
        )

    # Add formatted time period for display
    if normalized_column_type == "category":
        result_df = result_df.with_columns(
            pl.col("time_period")
            .cast(pl.String)
            .fill_null("(empty)")
            .alias("time_period_formatted"),
            pl.col("time_period").cast(pl.String),
        )
    elif normalized_column_type == "elapsed":
        # Seconds, like the period, so the chart places each bin (issue 324).
        result_df = result_df.with_columns(
            (pl.col(name).dt.total_microseconds() / 1_000_000).alias(name)
            for name in ("period_start", "period_end")
        )
        result_df = result_df.with_columns(
            elapsed_to_text(
                pl.duration(
                    microseconds=(pl.col("time_period") * 1_000_000)
                    .round(0)
                    .cast(pl.Int64)
                )
            ).alias("time_period_formatted")
        )
    elif normalized_column_type == "datetime":
        if frequency == "weekly":
            result_df = result_df.with_columns(
                pl.col("time_period")
                .dt.strftime("%Y-W%W")
                .alias("time_period_formatted")
            )
        elif frequency == "quarterly":
            result_df = result_df.with_columns(
                [
                    pl.col("time_period").dt.year().alias("__year__"),
                    ((pl.col("time_period").dt.month() - 1).floordiv(3).add(1)).alias(
                        "__quarter__"
                    ),
                ]
            )
            result_df = result_df.with_columns(
                pl.format(
                    "{}-Q{}",
                    pl.col("__year__"),
                    pl.col("__quarter__"),
                ).alias("time_period_formatted")
            ).drop(["__year__", "__quarter__"])
        else:
            result_df = result_df.with_columns(
                pl.col("time_period")
                .dt.strftime(time_format)
                .alias("time_period_formatted")
            )
    else:
        interval_lit = pl.lit(numeric_interval_value)
        result_df = result_df.with_columns(
            [
                pl.col("time_period").round(6).alias("time_period"),
                (pl.col("time_period") + interval_lit).alias("__numeric_period_end__"),
            ]
        )

        def _format_numeric(value: float | None) -> str | None:
            """Format one numeric interval boundary for the result label."""

            if value is None:
                return None
            return format(value, ".6g")

        result_df = result_df.with_columns(
            [
                pl.col("time_period")
                .map_elements(_format_numeric, return_dtype=pl.String)
                .alias("__numeric_period_label_start__"),
                pl.col("__numeric_period_end__")
                .map_elements(_format_numeric, return_dtype=pl.String)
                .alias("__numeric_period_label_end__"),
            ]
        )
        result_df = result_df.with_columns(
            pl.format(
                "[{}, {})",
                pl.col("__numeric_period_label_start__"),
                pl.col("__numeric_period_label_end__"),
            ).alias("time_period_formatted")
        ).drop(
            [
                "__numeric_period_end__",
                "__numeric_period_label_start__",
                "__numeric_period_label_end__",
            ]
        )

    # Sort by time if requested
    if sort_by_time:
        sort_cols = [SEQUENTIAL_PERIOD_INDEX_COLUMN, SEQUENTIAL_GROUP_INDEX_COLUMN]
        result_df = result_df.sort(sort_cols)

    selection_indices = df.select(
        _SEQUENTIAL_ROW_INDEX_COLUMN,
        pl.col(SEQUENTIAL_PERIOD_INDEX_COLUMN).alias(
            SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN
        ),
        pl.col(SEQUENTIAL_GROUP_INDEX_COLUMN).alias(
            SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN
        ),
    )
    publication_df = (
        source_df.with_row_index(_SEQUENTIAL_ROW_INDEX_COLUMN)
        .join(
            selection_indices,
            on=_SEQUENTIAL_ROW_INDEX_COLUMN,
            how="inner",
            maintain_order="left",
        )
        .drop(_SEQUENTIAL_ROW_INDEX_COLUMN)
        .select(
            # Topic Coverage is not carried into Trends Results (issue 200).
            *supported_metadata_columns(source_df.schema),
            SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN,
            SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN,
        )
    )
    return result_df, publication_df


def _run_sequential_analysis(
    lf: pl.LazyFrame,
    *,
    time_column: str,
    group_by_columns: list[str] | None = None,
    frequency: str = "monthly",
    sort_by_time: bool = True,
    column_type: str = "datetime",
    numeric_origin: float | None = None,
    numeric_interval: float | None = None,
    custom_interval_value: int | None = None,
    custom_interval_unit: str | None = None,
) -> pl.DataFrame:
    """Return the public aggregate while preserving the established core API."""

    result, _publication = _build_sequential_result_frames(
        lf,
        time_column=time_column,
        group_by_columns=group_by_columns,
        frequency=frequency,
        sort_by_time=sort_by_time,
        column_type=column_type,
        numeric_origin=numeric_origin,
        numeric_interval=numeric_interval,
        custom_interval_value=custom_interval_value,
        custom_interval_unit=custom_interval_unit,
    )
    return result


__all__ = [
    "MAX_TRENDS_CELLS",
    "SEQUENTIAL_GROUP_INDEX_COLUMN",
    "SEQUENTIAL_PERIOD_INDEX_COLUMN",
    "SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN",
    "SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN",
    "SEQUENTIAL_REFERENCE_ROWS_COLUMN",
    "SEQUENTIAL_REFERENCE_WORDS_COLUMN",
    "_build_sequential_result_frames",
    "_run_sequential_analysis",
    "reference_group_columns",
]
