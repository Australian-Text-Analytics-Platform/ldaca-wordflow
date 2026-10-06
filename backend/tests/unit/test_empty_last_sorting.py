"""Every table sorts empty values last, in both directions (issue 317).

Empty means missing, NaN, or blank or whitespace-only text.
"""

from __future__ import annotations

import io
import math

import polars as pl
from polars._typing import PolarsDataType
import pytest

from ldaca_wordflow.analysis.concordance_core import compute_node_concordance_page
from ldaca_wordflow.analysis.result_sort import SOURCE_ROW_COLUMN, sort_result_rows
from ldaca_wordflow.services.analysis_results import _sort_and_page
from ldaca_wordflow.shared.empty_values import empty_last_key
from ldaca_wordflow.shared.json_data import JsonData
from ldaca_wordflow.shared.table_transport import materialize_page

TEXT = ["b", None, " ", "a", ""]
NUMBERS = [1.0, math.nan, None, 0.5, 2.0]


def _sorted(values: list, dtype: PolarsDataType, descending: bool) -> list:
    frame = pl.LazyFrame({"value": pl.Series(values, dtype=dtype)})
    # Callers pass the schema's dtype instance, as the table code does.
    schema_dtype = frame.collect_schema()["value"]
    return (
        frame.sort(
            empty_last_key("value", schema_dtype),
            descending=descending,
            nulls_last=True,
        )
        .collect()["value"]
        .to_list()
    )


@pytest.mark.parametrize("descending", [False, True])
@pytest.mark.parametrize("dtype", [pl.String, pl.Categorical])
def test_blank_and_missing_text_sort_last(dtype, descending: bool) -> None:
    result = _sorted(TEXT, dtype, descending)

    assert result[:2] == (["b", "a"] if descending else ["a", "b"])
    assert sorted(result[2:], key=repr) == sorted([None, " ", ""], key=repr)


@pytest.mark.parametrize("descending", [False, True])
def test_nan_and_missing_numbers_sort_last(descending: bool) -> None:
    result = _sorted(NUMBERS, pl.Float64, descending)

    assert result[:3] == ([2.0, 1.0, 0.5] if descending else [0.5, 1.0, 2.0])
    assert all(value is None or math.isnan(value) for value in result[3:])


@pytest.mark.parametrize("descending", [False, True])
def test_result_rows_put_empty_last_and_keep_reading_order(descending: bool) -> None:
    frame = pl.LazyFrame(
        {"speaker": TEXT, SOURCE_ROW_COLUMN: [0, 1, 2, 3, 4]},
    )

    rows = (
        sort_result_rows(
            frame,
            frame.collect_schema(),
            concordance=True,
            matches=False,
            sort_by="speaker",
            descending=descending,
            case_sensitive=True,
        )
        .collect()[SOURCE_ROW_COLUMN]
        .to_list()
    )

    assert rows == ([0, 3, 1, 2, 4] if descending else [3, 0, 1, 2, 4])


@pytest.mark.parametrize("descending", [False, True])
def test_data_block_pages_put_empty_last(descending: bool) -> None:
    page = materialize_page(
        pl.LazyFrame({"score": NUMBERS}),
        page=1,
        page_size=10,
        sort_by="score",
        descending=descending,
    )

    values = pl.read_ipc_stream(io.BytesIO(page.content))["score"].to_list()
    assert values[:3] == ([2.0, 1.0, 0.5] if descending else [0.5, 1.0, 2.0])


@pytest.mark.parametrize("descending", [False, True])
def test_concordance_preview_puts_empty_metadata_last(descending: bool) -> None:
    frame = pl.LazyFrame({"text": ["the cat"] * 5, "speaker": TEXT})

    page = compute_node_concordance_page(
        {"lf": frame, "column": "text"},
        {
            "search_word": "cat",
            "regex": False,
            "num_left_tokens": 2,
            "num_right_tokens": 2,
            "case_sensitive": False,
        },
        page=1,
        page_size=10,
        sort_by="speaker",
        descending=descending,
    )

    speakers = [hits[0]["speaker"] for hits in page["data"]]
    assert speakers[:2] == (["b", "a"] if descending else ["a", "b"])
    assert all(speaker is None or not speaker.strip() for speaker in speakers[2:])


@pytest.mark.parametrize("descending", [False, True])
def test_json_results_put_nan_and_blank_text_last(descending: bool) -> None:
    rows: list[dict[str, JsonData]] = [
        {"value": value} for value in ["b", None, " ", "a", "", math.nan]
    ]

    page, _ = _sort_and_page(
        rows,
        page=1,
        page_size=10,
        sort_by="value",
        descending=descending,
        columns={"value"},
    )

    assert [row["value"] for row in page[:2]] == (
        ["b", "a"] if descending else ["a", "b"]
    )
