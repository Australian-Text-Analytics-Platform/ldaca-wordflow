"""Concordance Match and Document Data Block Creation worker tests."""

from __future__ import annotations

import uuid
from pathlib import Path

import polars as pl
import pytest

from ldaca_wordflow.workers.result_data_block_creation import run_result_data_block_creation


def test_sequential_data_block_creation_filters_original_rows_and_columns(
    tmp_path: Path,
) -> None:
    source_id = uuid.uuid4()
    source_path = tmp_path / "trends-publication.parquet"
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    pl.DataFrame(
        {
            "when": [1, 2, 3, 4],
            "text": ["one", "two", "three", "four"],
            "group": ["A", "B", "A", "B"],
            "unused": [10, 20, 30, 40],
            "__wordflow_trends_period_index": [0, 0, 1, 1],
            "__wordflow_trends_group_index": [0, 1, 0, 1],
        }
    ).write_parquet(source_path)

    result = run_result_data_block_creation(
        artifact_dir=str(output_dir),
        request_payload={
            "kind": "sequential_data_block_creation",
            "source": {
                "source_node_id": str(source_id),
                "selected_columns": ["when", "text", "group"],
                "new_node_name": "Selected trends",
                "selected_period_indices": [1],
                "excluded_group_indices": [1],
            },
        },
        result_paths={source_id: str(source_path)},
        document_columns={source_id: "text"},
    )
    output = result["outputs"][0]["data"]
    frame = pl.read_parquet(output_dir / output["parquet_path"])

    assert frame.columns == ["when", "text", "group"]
    assert frame.rows() == [(3, "three", "A")]
    assert output["data_block"]["document"] == "text"
    assert output["record_count"] == 1


def test_sequential_data_block_creation_uses_all_periods_when_selection_is_null(
    tmp_path: Path,
) -> None:
    source_id = uuid.uuid4()
    source_path = tmp_path / "trends-publication.parquet"
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    pl.DataFrame(
        {
            "when": [1, 2],
            "__wordflow_trends_period_index": [0, 1],
            "__wordflow_trends_group_index": [0, 0],
        }
    ).write_parquet(source_path)

    result = run_result_data_block_creation(
        artifact_dir=str(output_dir),
        request_payload={
            "kind": "sequential_data_block_creation",
            "source": {
                "source_node_id": str(source_id),
                "selected_columns": ["when"],
                "new_node_name": "All trends",
                "selected_period_indices": None,
                "excluded_group_indices": [],
            },
        },
        result_paths={source_id: str(source_path)},
        document_columns={source_id: None},
    )
    output = result["outputs"][0]["data"]
    frame = pl.read_parquet(output_dir / output["parquet_path"])

    assert frame["when"].to_list() == [1, 2]
    assert output["data_block"]["document"] is None


def test_document_data_block_creation_keeps_source_rows_and_joins_filtered_extractions(
    tmp_path: Path,
) -> None:
    source_id = uuid.uuid4()
    source_path = tmp_path / "source.parquet"
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    pl.DataFrame(
        {
            "__wordflow_source_row_id": [1, 2],
            "text": ["same document", "same document"],
            "author": ["first", "second"],
            "concordance": [
                [
                    {
                        "CONC_matched_text": "same",
                        "CONC_start_idx": 0,
                        "CONC_extraction": " same   document ",
                    },
                    {
                        "CONC_matched_text": "document",
                        "CONC_start_idx": 5,
                        "CONC_extraction": "second\n window",
                    },
                ],
                [
                    {
                        "CONC_matched_text": "same",
                        "CONC_start_idx": 0,
                        "CONC_extraction": " other row ",
                    }
                ],
            ],
        }
    ).write_parquet(source_path)

    result = run_result_data_block_creation(
        artifact_dir=str(output_dir),
        request_payload={
            "kind": "concordance_document_data_block_creation",
            "sources": [
                {
                    "source_node_id": str(source_id),
                    "selected_metadata_columns": ["author"],
                    "new_node_name": "Documents",
                    "excluded_matched_texts": [],
                    "bin_count": None,
                    "selected_bins": None,
                }
            ],
        },
        result_paths={source_id: str(source_path)},
        document_columns={source_id: "text"},
    )
    output = result["outputs"][0]["data"]
    frame = pl.read_parquet(output_dir / output["parquet_path"])

    assert output["data_block"]["color"] is None
    assert frame.columns == ["text", "CONC_extraction", "author"]
    assert frame.height == 2
    assert frame["author"].to_list() == ["first", "second"]
    assert frame["CONC_extraction"].to_list() == [
        "same document\nsecond window",
        "other row",
    ]


def test_document_data_block_creation_allows_schema_only_output(tmp_path: Path) -> None:
    source_id = uuid.uuid4()
    source_path = tmp_path / "source.parquet"
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    pl.DataFrame(
        {
            "__wordflow_source_row_id": [1],
            "text": ["alpha"],
            "concordance": [
                [
                    {
                        "CONC_matched_text": "alpha",
                        "CONC_start_idx": 0,
                        "CONC_extraction": "alpha",
                    }
                ]
            ],
        }
    ).write_parquet(source_path)

    result = run_result_data_block_creation(
        artifact_dir=str(output_dir),
        request_payload={
            "kind": "concordance_document_data_block_creation",
            "sources": [
                {
                    "source_node_id": str(source_id),
                    "selected_metadata_columns": [],
                    "new_node_name": "Empty documents",
                    "excluded_matched_texts": ["alpha"],
                    "bin_count": None,
                    "selected_bins": None,
                }
            ],
        },
        result_paths={source_id: str(source_path)},
        document_columns={source_id: "text"},
    )
    output = result["outputs"][0]["data"]
    frame = pl.read_parquet(output_dir / output["parquet_path"])

    assert frame.columns == ["text", "CONC_extraction"]
    assert frame.height == 0


def _concordance_matches_artifact(path: Path) -> None:
    """Three documents; L1 words repeat in mixed case across and within them."""

    words = [["the", "a"], ["The", "the"], ["b", "THE"]]
    pl.DataFrame(
        {
            "__wordflow_source_row_id": [0, 1, 2],
            "text": ["doc 0", "doc 1", "doc 2"],
            "author": ["c", "a", "b"],
            "concordance": [
                [
                    {
                        "CONC_matched_text": "x",
                        "CONC_start_idx": offset * 10,
                        "CONC_l1": word,
                    }
                    for offset, word in enumerate(row)
                ]
                for row in words
            ],
        }
    ).write_parquet(path)


def _create_matches(tmp_path: Path, source: dict, *, case_sensitive: bool) -> pl.DataFrame:
    source_id = uuid.uuid4()
    source_path = tmp_path / "matches.parquet"
    _concordance_matches_artifact(source_path)
    output_dir = tmp_path / f"out-{uuid.uuid4().hex}"
    output_dir.mkdir()
    result = run_result_data_block_creation(
        artifact_dir=str(output_dir),
        request_payload={
            "kind": "concordance_match_data_block_creation",
            "sources": [
                {
                    "source_node_id": str(source_id),
                    "selected_columns": ["text", "CONC_l1", "CONC_start_idx"],
                    "new_node_name": "Matches",
                    **source,
                }
            ],
        },
        result_paths={source_id: str(source_path)},
        document_columns={source_id: "text"},
        case_sensitive={source_id: case_sensitive},
    )
    output = result["outputs"][0]["data"]
    return pl.read_parquet(output_dir / output["parquet_path"])


def _rows(frame: pl.DataFrame) -> list[tuple[str, str, int]]:
    return list(
        zip(frame["text"], frame["CONC_l1"], frame["CONC_start_idx"], strict=True)
    )


def test_match_data_block_creation_keeps_the_tables_sort(tmp_path: Path) -> None:
    # Issue 275: what you see is what you get. Ties keep Data Block order
    # (issue 266); with Case sensitive off the case variants mix (issue 267).
    unsorted = _create_matches(tmp_path, {}, case_sensitive=False)
    assert _rows(unsorted) == [
        ("doc 0", "the", 0),
        ("doc 0", "a", 10),
        ("doc 1", "The", 0),
        ("doc 1", "the", 10),
        ("doc 2", "b", 0),
        ("doc 2", "THE", 10),
    ]

    descending = _create_matches(
        tmp_path, {"sort_by": "CONC_l1", "descending": True}, case_sensitive=False
    )
    assert _rows(descending) == [
        ("doc 0", "the", 0),
        ("doc 1", "The", 0),
        ("doc 1", "the", 10),
        ("doc 2", "THE", 10),
        ("doc 2", "b", 0),
        ("doc 0", "a", 10),
    ]

    sensitive = _create_matches(
        tmp_path, {"sort_by": "CONC_l1", "descending": False}, case_sensitive=True
    )
    assert sensitive["CONC_l1"].to_list() == ["THE", "The", "a", "b", "the", "the"]

    by_metadata = _create_matches(
        tmp_path, {"sort_by": "author", "descending": False}, case_sensitive=False
    )
    assert by_metadata["text"].to_list() == [
        "doc 1",
        "doc 1",
        "doc 2",
        "doc 2",
        "doc 0",
        "doc 0",
    ]


def test_match_data_block_creation_refuses_a_column_the_table_cannot_sort(
    tmp_path: Path,
) -> None:
    with pytest.raises(ValueError, match="sort column"):
        _create_matches(
            tmp_path,
            {"sort_by": "__wordflow_source_row_id", "descending": False},
            case_sensitive=False,
        )


def test_quotation_data_block_creation_keeps_the_tables_sort(tmp_path: Path) -> None:
    source_id = uuid.uuid4()
    source_path = tmp_path / "quotes.parquet"
    pl.DataFrame(
        {
            "__wordflow_source_row_id": [0, 1],
            "text": ["first", "second"],
            "author": ["b", "a"],
            "quotation": [
                [
                    {"quote": "one", "quote_row_idx": 0},
                    {"quote": "two", "quote_row_idx": 1},
                ],
                [{"quote": "three", "quote_row_idx": 0}],
            ],
        }
    ).write_parquet(source_path)
    output_dir = tmp_path / "output"
    output_dir.mkdir()

    def create(source: dict) -> list[str]:
        directory = output_dir / uuid.uuid4().hex
        directory.mkdir()
        result = run_result_data_block_creation(
            artifact_dir=str(directory),
            request_payload={
                "kind": "quotation_result_data_block_creation",
                "source": {
                    "source_node_id": str(source_id),
                    "selected_columns": ["text", "QUOTE_quote"],
                    "new_node_name": "Quotes",
                    **source,
                },
            },
            result_paths={source_id: str(source_path)},
            document_columns={source_id: "text"},
        )
        output = result["outputs"][0]["data"]
        return pl.read_parquet(directory / output["parquet_path"])["QUOTE_quote"].to_list()

    assert create({}) == ["one", "two", "three"]
    assert create({"sort_by": "author", "descending": False}) == ["three", "one", "two"]
    assert create({"sort_by": "text", "descending": True}) == ["three", "one", "two"]
    with pytest.raises(ValueError, match="sort column"):
        create({"sort_by": "QUOTE_quote", "descending": False})
