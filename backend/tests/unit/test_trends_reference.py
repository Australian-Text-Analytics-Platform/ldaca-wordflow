"""Trends normalises against a reference Data Block.

A Concordance match Data Block lacks every document without a hit and repeats
a document once per match, so rates such as hits per million words need the
corpus it was made from: its rows and words per period and shared group.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
import uuid

import polars as pl
import pytest

from ldaca_wordflow.analysis.sequential_core import (
    SEQUENTIAL_PERIOD_INDEX_COLUMN,
    SEQUENTIAL_REFERENCE_ROWS_COLUMN,
    SEQUENTIAL_REFERENCE_WORDS_COLUMN,
    _build_sequential_result_frames,
    reference_group_columns,
)
from ldaca_wordflow.analysis.token_cache import PLAIN_WORDS_EN_MODEL
from ldaca_wordflow.domain.workspace import (
    Node,
    SequentialAnalysisRequest,
    Workspace,
    analysis_snapshot_input_ids,
)
from ldaca_wordflow.infrastructure.storage.input_snapshots import (
    create_worker_input_snapshot,
)
from ldaca_wordflow.services.analysis_preparation_registry import _prepare_sequential
from ldaca_wordflow.shared.errors import InvalidInputError
from ldaca_wordflow.workers.sequential import run_sequential_analysis

CORPUS_ID = uuid.UUID("00000000-0000-0000-0000-00000000c0de")
MATCHES_ID = uuid.UUID("00000000-0000-0000-0000-00000000a1ce")

# Five texts over three years; 2022 has text but no match.
CORPUS = pl.DataFrame(
    {
        "year": [2020, 2020, 2021, 2021, 2022],
        "gender": ["f", "m", "f", "f", "m"],
        "text": [
            "jobs and jobs",
            "no jobs here today",
            "work",
            "work and more work and rest",
            "nothing at all in this one",
        ],
        "words": [10, 20, 30, 40, 50],
    }
)
MATCHES = pl.DataFrame(
    {
        "year": [2020, 2020, 2020, 2021],
        "gender": ["f", "f", "m", "f"],
        "term": ["jobs", "jobs", "jobs", "work"],
    }
)


def _normalised(matches: pl.DataFrame = MATCHES, **overrides: Any) -> pl.DataFrame:
    settings: dict[str, Any] = {
        "time_column": "year",
        "group_by_columns": ["gender", "term"],
        "column_type": "numeric",
        "numeric_interval": 1,
        "reference": CORPUS.lazy(),
        "reference_word_count_column": "words",
    }
    settings.update(overrides)
    result, _publication = _build_sequential_result_frames(matches.lazy(), **settings)
    return result


def _cell(result: pl.DataFrame, period: float, **group: object) -> dict[str, Any]:
    frame = result.filter(pl.col("time_period") == period)
    for column, value in group.items():
        frame = frame.filter(pl.col(column) == value)
    assert frame.height == 1, frame
    return frame.row(0, named=True)


def test_every_period_and_group_gets_the_reference_rows_and_words() -> None:
    result = _normalised()

    # Three periods (2022 from the reference alone) for each of three groups.
    assert result.height == 9
    assert result[SEQUENTIAL_PERIOD_INDEX_COLUMN].n_unique() == 3
    jobs_f_2020 = _cell(result, 2020, gender="f", term="jobs")
    assert jobs_f_2020["sequential_count"] == 2
    assert jobs_f_2020[SEQUENTIAL_REFERENCE_ROWS_COLUMN] == 1
    assert jobs_f_2020[SEQUENTIAL_REFERENCE_WORDS_COLUMN] == 10
    work_f_2021 = _cell(result, 2021, gender="f", term="work")
    assert work_f_2021["sequential_count"] == 1
    assert work_f_2021[SEQUENTIAL_REFERENCE_ROWS_COLUMN] == 2
    assert work_f_2021[SEQUENTIAL_REFERENCE_WORDS_COLUMN] == 70
    # The term is not in the corpus, so both terms share a group's totals.
    jobs_f_2021 = _cell(result, 2021, gender="f", term="jobs")
    assert jobs_f_2021["sequential_count"] == 0
    assert jobs_f_2021[SEQUENTIAL_REFERENCE_WORDS_COLUMN] == 70
    # No match at all in 2022: a real zero over 50 words, placed by the reference.
    jobs_m_2022 = _cell(result, 2022, gender="m", term="jobs")
    assert jobs_m_2022["sequential_count"] == 0
    assert jobs_m_2022[SEQUENTIAL_REFERENCE_WORDS_COLUMN] == 50
    assert jobs_m_2022["period_start"] == 2022
    assert jobs_m_2022["time_period_formatted"] == "[2022, 2023)"
    # No women in 2022: no denominator, rather than zero words.
    jobs_f_2022 = _cell(result, 2022, gender="f", term="jobs")
    assert jobs_f_2022["sequential_count"] == 0
    assert jobs_f_2022[SEQUENTIAL_REFERENCE_ROWS_COLUMN] is None


def test_without_group_columns_the_period_total_is_the_denominator() -> None:
    result = _normalised(group_by_columns=[])

    assert result.sort("time_period").select(
        "sequential_count",
        SEQUENTIAL_REFERENCE_ROWS_COLUMN,
        SEQUENTIAL_REFERENCE_WORDS_COLUMN,
    ).rows() == [(3, 2, 30), (1, 2, 70), (0, 1, 50)]


def test_rows_only_when_no_word_count_is_given() -> None:
    result = _normalised(reference_word_count_column=None, group_by_columns=[])

    assert SEQUENTIAL_REFERENCE_WORDS_COLUMN not in result.columns
    assert result.sort("time_period")[SEQUENTIAL_REFERENCE_ROWS_COLUMN].to_list() == [
        2,
        2,
        1,
    ]


def test_the_publication_frame_keeps_only_the_analysed_rows() -> None:
    _result, publication = _build_sequential_result_frames(
        MATCHES.lazy(),
        time_column="year",
        group_by_columns=["gender"],
        column_type="numeric",
        numeric_interval=1,
        reference=CORPUS.lazy(),
    )

    assert publication.height == MATCHES.height
    assert publication.columns[:3] == ["year", "gender", "term"]


def test_a_period_the_reference_lacks_is_refused() -> None:
    stray = pl.concat(
        [MATCHES, pl.DataFrame({"year": [2019], "gender": ["f"], "term": ["jobs"]})]
    )
    with pytest.raises(InvalidInputError, match="has no rows in period 2019.0 for f"):
        _normalised(stray)


def test_more_rows_than_the_reference_has_words_is_refused() -> None:
    crowded = pl.DataFrame(
        {"year": [2020] * 11, "gender": ["f"] * 11, "term": ["jobs"] * 11}
    )
    with pytest.raises(InvalidInputError, match="more than the reference has words"):
        _normalised(crowded)


def test_a_reference_time_column_of_another_type_is_cast_or_refused() -> None:
    matches = pl.DataFrame(
        {"stamp": [dt.datetime(2026, 1, 3, 9), dt.datetime(2026, 2, 1, 9)]}
    )
    corpus = pl.DataFrame(
        {
            "stamp": [
                dt.date(2026, 1, 1),
                dt.date(2026, 1, 20),
                dt.date(2026, 2, 1),
                dt.date(2026, 3, 1),
            ]
        }
    )
    result, _publication = _build_sequential_result_frames(
        matches.lazy(),
        time_column="stamp",
        column_type="datetime",
        frequency="monthly",
        reference=corpus.lazy(),
    )
    assert result.sort("time_period").select(
        "time_period_formatted", "sequential_count", SEQUENTIAL_REFERENCE_ROWS_COLUMN
    ).rows() == [("2026-01", 1, 2), ("2026-02", 1, 1), ("2026-03", 0, 1)]

    with pytest.raises(InvalidInputError, match="different kind of value"):
        _build_sequential_result_frames(
            matches.lazy(),
            time_column="stamp",
            column_type="datetime",
            frequency="monthly",
            reference=pl.DataFrame({"stamp": ["not a date"]}).lazy(),
        )


def test_a_category_axis_counts_the_reference_per_value() -> None:
    result = _normalised(
        time_column="gender",
        column_type="category",
        group_by_columns=[],
        numeric_interval=None,
    )
    assert result.sort("time_period").select(
        "time_period_formatted", "sequential_count", SEQUENTIAL_REFERENCE_WORDS_COLUMN
    ).rows() == [("f", 3, 80), ("m", 1, 70)]


def test_reference_group_columns_split_shared_from_missing() -> None:
    assert reference_group_columns(["gender", "term"], CORPUS.schema) == (
        ["gender"],
        ["term"],
    )
    assert reference_group_columns([], ["gender"]) == ([], [])


def test_the_request_needs_a_consistent_reference() -> None:
    base = {"node_id": str(MATCHES_ID), "time_column": "year"}
    with pytest.raises(ValueError, match="different Data Block"):
        SequentialAnalysisRequest.model_validate(
            {**base, "reference_node_id": str(MATCHES_ID)}
        )
    with pytest.raises(ValueError, match="needs a reference Data Block"):
        SequentialAnalysisRequest.model_validate({**base, "reference_text_column": "text"})
    with pytest.raises(ValueError, match="Choose a tokeniser"):
        SequentialAnalysisRequest.model_validate(
            {**base, "reference_node_id": str(CORPUS_ID), "reference_text_column": "text"}
        )
    request = SequentialAnalysisRequest.model_validate(
        {
            **base,
            "reference_node_id": str(CORPUS_ID),
            "reference_text_column": "text",
            "reference_tokenizer_model": PLAIN_WORDS_EN_MODEL,
        }
    )
    # The worker reads the reference's snapshot too.
    assert analysis_snapshot_input_ids(request) == (MATCHES_ID, CORPUS_ID)


def _context(tmp_path: Path, corpus: pl.DataFrame = CORPUS) -> Any:
    return cast(
        Any,
        SimpleNamespace(
            workspace=SimpleNamespace(
                nodes={
                    MATCHES_ID: SimpleNamespace(data=MATCHES.lazy(), name="Matches"),
                    CORPUS_ID: SimpleNamespace(data=corpus.lazy(), name="Corpus"),
                }
            ),
            snapshot_dir=tmp_path,
            artifact_dir=tmp_path,
            cache_root=tmp_path / "cache",
        ),
    )


def _request(**fields: Any) -> SequentialAnalysisRequest:
    return SequentialAnalysisRequest.model_validate(
        {
            "node_id": str(MATCHES_ID),
            "time_column": "year",
            "column_type": "numeric",
            "numeric_interval": 1,
            "group_by_columns": ["gender", "term"],
            "reference_node_id": str(CORPUS_ID),
            **fields,
        }
    )


def test_preparation_checks_the_reference_before_running(tmp_path: Path) -> None:
    prepared = _prepare_sequential(
        _request(reference_text_column="text", reference_tokenizer_model="lindera:jieba"),
        _context(tmp_path),
    )
    assert prepared.token_cache_path == str(tmp_path / "cache" / "tokens.duckdb")
    assert _prepare_sequential(_request(), _context(tmp_path)).token_cache_path is None

    with pytest.raises(InvalidInputError, match="no longer exists"):
        _prepare_sequential(
            _request(reference_node_id=str(uuid.uuid4())), _context(tmp_path)
        )
    with pytest.raises(InvalidInputError, match="has no column 'year'"):
        _prepare_sequential(_request(), _context(tmp_path, CORPUS.drop("year")))
    with pytest.raises(InvalidInputError, match="does not hold text"):
        _prepare_sequential(
            _request(reference_text_column="words", reference_tokenizer_model="x"),
            _context(tmp_path),
        )
    with pytest.raises(InvalidInputError, match="is not a date, number or category"):
        _prepare_sequential(
            _request(),
            _context(tmp_path, CORPUS.with_columns(pl.col("year").cast(pl.String))),
        )


def _snapshot(tmp_path: Path) -> Path:
    data_root = tmp_path / "data"
    data_root.mkdir()
    workspace = Workspace(name="trends", workspace_id=uuid.uuid4())
    workspace.add_node(Node(id=CORPUS_ID, name="Corpus", data=CORPUS.lazy(), document="text"))
    workspace.add_node(Node(id=MATCHES_ID, name="Matches", data=MATCHES.lazy()))
    return create_worker_input_snapshot(
        workspace_id=workspace.id,
        node_ids=[MATCHES_ID, CORPUS_ID],
        workspace=workspace,
        workspace_data_dir=data_root,
        snapshot_dir=tmp_path / "snapshot",
        max_snapshot_bytes=1024 * 1024,
    )


def test_the_worker_counts_the_reference_words_with_the_tokeniser(tmp_path: Path) -> None:
    result = run_sequential_analysis(
        input_snapshot_dir=str(_snapshot(tmp_path)),
        artifact_dir=str(tmp_path / "output"),
        node_id=MATCHES_ID,
        request_payload={
            "time_column": "year",
            "column_type": "numeric",
            "numeric_interval": 1,
            "group_by_columns": ["term"],
            "reference_node_id": str(CORPUS_ID),
            "reference_text_column": "text",
            "reference_tokenizer_model": PLAIN_WORDS_EN_MODEL,
        },
    )

    table = pl.read_ipc_stream(result["table"]["artifact"])
    # 2020: "jobs and jobs" + "no jobs here today" = 7 words, and so on.
    assert table.sort("time_period", "term").select(
        "term", "sequential_count", SEQUENTIAL_REFERENCE_ROWS_COLUMN, SEQUENTIAL_REFERENCE_WORDS_COLUMN
    ).rows() == [
        ("jobs", 3, 2, 7),
        ("work", 0, 2, 7),
        ("jobs", 0, 2, 7),
        ("work", 1, 2, 7),
        ("jobs", 0, 1, 6),
        ("work", 0, 1, 6),
    ]
    assert result["source"]["reference"] == {
        "node_id": CORPUS_ID,
        "node_name": "Corpus",
        "text_column": "text",
        "tokenizer_model": PLAIN_WORDS_EN_MODEL,
        "group_by_columns": [],
        "ignored_group_by_columns": ["term"],
    }
    assert result["source"]["period_count"] == 3
