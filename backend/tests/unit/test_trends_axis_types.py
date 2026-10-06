"""Trends refuses an axis column it cannot bin (issue 316)."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
import uuid

import polars as pl
import pytest

from ldaca_wordflow.domain.workspace import SequentialAnalysisRequest
from ldaca_wordflow.services.analysis_preparation_registry import _prepare_sequential
from ldaca_wordflow.shared.errors import InvalidInputError

NODE_ID = uuid.UUID("00000000-0000-0000-0000-000000000316")


def _context(tmp_path: Path) -> Any:
    frame = pl.LazyFrame(
        {
            "day": [dt.date(2026, 1, 1)],
            "stamp": [dt.datetime(2026, 1, 1, 9)],
            "clock": [dt.time(9, 30)],
            "length": [dt.timedelta(minutes=5)],
            "year": [2026],
            "score": [0.5],
            "party": ["Labor"],
        }
    )
    return cast(
        Any,
        SimpleNamespace(
            workspace=SimpleNamespace(
                nodes={NODE_ID: SimpleNamespace(data=frame)}
            ),
            snapshot_dir=tmp_path,
            artifact_dir=tmp_path,
        ),
    )


def _request(column: str, column_type: str) -> SequentialAnalysisRequest:
    return SequentialAnalysisRequest.model_validate(
        {
            "node_id": str(NODE_ID),
            "time_column": column,
            "column_type": column_type,
            "numeric_interval": 1,
        }
    )


@pytest.mark.parametrize(
    ("column", "column_type"),
    [("day", "datetime"), ("stamp", "datetime"), ("year", "numeric"), ("score", "numeric")],
)
def test_trends_accepts_dates_and_numbers(tmp_path: Path, column, column_type) -> None:
    _prepare_sequential(_request(column, column_type), _context(tmp_path))


@pytest.mark.parametrize(
    ("column", "column_type"),
    [
        ("clock", "datetime"),
        ("length", "datetime"),
        ("party", "datetime"),
        ("party", "numeric"),
        ("stamp", "numeric"),
        ("year", "datetime"),
    ],
)
def test_trends_refuses_other_axis_types(tmp_path: Path, column, column_type) -> None:
    with pytest.raises(InvalidInputError, match="time axis"):
        _prepare_sequential(_request(column, column_type), _context(tmp_path))
