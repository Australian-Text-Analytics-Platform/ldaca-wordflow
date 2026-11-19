"""Canonical process contract for Sequential Analysis."""

from datetime import datetime, UTC
from pathlib import Path
import uuid

import polars as pl
import pytest
from pydantic import ValidationError

from ldaca_wordflow.analysis.sequential_core import (
    SEQUENTIAL_GROUP_INDEX_COLUMN,
    SEQUENTIAL_PERIOD_INDEX_COLUMN,
    SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN,
    SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN,
    _build_sequential_result_frames,
)
from ldaca_wordflow.domain.workspace import Node, Workspace
from ldaca_wordflow.infrastructure.storage.input_snapshots import (
    create_worker_input_snapshot,
)
from ldaca_wordflow.workers.sequential import run_sequential_analysis

NODE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def _snapshot(tmp_path: Path) -> Path:
    data_root = tmp_path / "data"
    data_root.mkdir()
    workspace = Workspace(name="sequential", workspace_id=uuid.uuid4())
    workspace.add_node(
        Node(
            id=NODE_ID,
            name="Events",
            data=pl.DataFrame(
                {
                    "occurred_at": [
                        datetime(2026, 1, 1, tzinfo=UTC),
                        datetime(2026, 1, 15, tzinfo=UTC),
                    ],
                    "text": ["first", "second"],
                    "group": ["A", "a"],
                }
            ).lazy(),
            document="text",
        )
    )
    return create_worker_input_snapshot(
        workspace_id=workspace.id,
        node_ids=[NODE_ID],
        workspace=workspace,
        workspace_data_dir=data_root,
        snapshot_dir=tmp_path / "snapshot",
        max_snapshot_bytes=1024 * 1024,
    )


def test_sequential_worker_validates_and_executes_the_typed_request(
    tmp_path: Path,
) -> None:
    result = run_sequential_analysis(
        input_snapshot_dir=str(_snapshot(tmp_path)),
        artifact_dir=str(tmp_path / "output"),
        node_id=NODE_ID,
        request_payload={
            "time_column": "occurred_at",
            "frequency": "monthly",
        },
    )

    assert result["state"] == "successful"
    table = pl.read_ipc_stream(result["table"]["artifact"])
    assert table.height == 1
    assert table["sequential_count"].to_list() == [2]
    assert table[SEQUENTIAL_PERIOD_INDEX_COLUMN].to_list() == [0]
    assert table[SEQUENTIAL_GROUP_INDEX_COLUMN].to_list() == [0]
    publication = pl.read_parquet(result["publication_artifact"])
    assert publication.columns == [
        "occurred_at",
        "text",
        "group",
        SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN,
        SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN,
    ]
    assert publication.height == 2
    assert result["source"] == {
        "node_id": NODE_ID,
        "node_name": "Events",
        "document_column": "text",
        "columns": ["occurred_at", "text", "group"],
        "period_count": 1,
        "group_count": 1,
        "reference": None,
    }


def _numeric_bins(
    values: list[float], *, origin: float | None, interval: float
) -> list[tuple[float, str, int]]:
    aggregate, _publication = _build_sequential_result_frames(
        pl.LazyFrame({"x": values}),
        time_column="x",
        column_type="numeric",
        numeric_origin=origin,
        numeric_interval=interval,
    )
    return aggregate.select(
        "time_period", "time_period_formatted", "sequential_count"
    ).rows()


def test_numeric_values_on_a_bin_edge_start_the_next_bin() -> None:
    """A bin holds its start value and stops short of the next start.

    As stored, (1.4 - 1.2) / 0.1 is a hair under 2, which once put 1.4 in
    [1.3, 1.4); 0.3 / 0.1 is a hair under 3 in the same way.
    """

    assert _numeric_bins([1.2, 1.3, 1.4, 1.5], origin=1.2, interval=0.1) == [
        (1.2, "[1.2, 1.3)", 1),
        (1.3, "[1.3, 1.4)", 1),
        (1.4, "[1.4, 1.5)", 1),
        (1.5, "[1.5, 1.6)", 1),
    ]
    assert _numeric_bins([0.2, 0.3, 0.4, 0.5, 0.7], origin=0, interval=0.1) == [
        (0.2, "[0.2, 0.3)", 1),
        (0.3, "[0.3, 0.4)", 1),
        (0.4, "[0.4, 0.5)", 1),
        (0.5, "[0.5, 0.6)", 1),
        (0.7, "[0.7, 0.8)", 1),
    ]


def test_numeric_values_just_below_an_edge_stay_in_the_lower_bin() -> None:
    assert _numeric_bins(
        [1.39999999999999, 1.3999999999, 1.4, 1.4000000001], origin=1.2, interval=0.1
    ) == [
        (1.3, "[1.3, 1.4)", 2),
        (1.4, "[1.4, 1.5)", 2),
    ]


def test_numeric_bins_below_the_start_value_and_from_a_negative_start() -> None:
    values = [-0.3, -0.25, -0.2, -0.1, 0.0, 0.1]

    assert _numeric_bins(values, origin=0, interval=0.1) == [
        (-0.3, "[-0.3, -0.2)", 2),
        (-0.2, "[-0.2, -0.1)", 1),
        (-0.1, "[-0.1, 0)", 1),
        (0.0, "[0, 0.1)", 1),
        (0.1, "[0.1, 0.2)", 1),
    ]
    assert _numeric_bins(values, origin=-0.05, interval=0.1) == [
        (-0.35, "[-0.35, -0.25)", 1),
        (-0.25, "[-0.25, -0.15)", 2),
        (-0.15, "[-0.15, -0.05)", 1),
        (-0.05, "[-0.05, 0.05)", 1),
        (0.05, "[0.05, 0.15)", 1),
    ]


def test_numeric_bin_starts_and_labels_keep_full_precision() -> None:
    """Rounding to six places gave every tiny bin the start 0 and the label [0, 0)."""

    assert _numeric_bins([0.0, 1e-7, 2e-7], origin=0, interval=1e-7) == [
        (0.0, "[0, 0.0000001)", 1),
        (1e-7, "[0.0000001, 0.0000002)", 1),
        (2e-7, "[0.0000002, 0.0000003)", 1),
    ]
    # Whole numbers stay as written, however many digits, and the start
    # defaults to the smallest value.
    assert _numeric_bins([1234567.0, 5.0], origin=None, interval=10) == [
        (5.0, "[5, 15)", 1),
        (1234565.0, "[1234565, 1234575)", 1),
    ]
    assert _numeric_bins([1e300], origin=0, interval=1e300) == [
        (1e300, "[1e+300, 2e+300)", 1)
    ]


def test_numeric_bins_match_exact_arithmetic_on_the_written_numbers() -> None:
    import math
    import random
    from fractions import Fraction

    def written(value: float) -> Fraction:
        return Fraction(repr(float(value)))

    randomness = random.Random(20261119)
    for _ in range(60):
        places = randomness.choice([0, 1, 2, 3])
        interval = randomness.choice([0.01, 0.05, 0.1, 0.2, 0.25, 0.3, 0.5, 1, 2.5, 7])
        origin = round(randomness.uniform(-50, 50), places)
        values = [round(randomness.uniform(-100, 100), places) for _ in range(30)]
        # Values that land exactly on edges, as the stored numbers add up.
        values += [origin + step * interval for step in range(-4, 5)]
        expected: dict[float, int] = {}
        for value in values:
            index = math.floor((written(value) - written(origin)) / written(interval))
            start = float(written(origin) + index * written(interval))
            expected[start] = expected.get(start, 0) + 1

        counted = {
            start: count
            for start, _label, count in _numeric_bins(values, origin=origin, interval=interval)
        }

        assert counted == expected, (origin, interval)


def test_a_numeric_step_too_small_for_the_values_is_refused_in_plain_words() -> None:
    with pytest.raises(ValueError, match="The step is too small for these values"):
        _numeric_bins([1e15], origin=0, interval=1e-300)


def test_numeric_trends_run_saves_edge_values_in_their_own_bins(tmp_path: Path) -> None:
    """The saved table, and the rows a selected bin gives a new Data Block, agree."""

    data_root = tmp_path / "data"
    data_root.mkdir()
    workspace = Workspace(name="scores", workspace_id=uuid.uuid4())
    workspace.add_node(
        Node(
            id=NODE_ID,
            name="Scores",
            data=pl.DataFrame(
                {"score": [1.5, 1.2, 1.4, 1.3], "text": ["d", "a", "c", "b"]}
            ).lazy(),
            document="text",
        )
    )
    snapshot = create_worker_input_snapshot(
        workspace_id=workspace.id,
        node_ids=[NODE_ID],
        workspace=workspace,
        workspace_data_dir=data_root,
        snapshot_dir=tmp_path / "snapshot",
        max_snapshot_bytes=1024 * 1024,
    )

    result = run_sequential_analysis(
        input_snapshot_dir=str(snapshot),
        artifact_dir=str(tmp_path / "output"),
        node_id=NODE_ID,
        request_payload={
            "time_column": "score",
            "column_type": "numeric",
            "numeric_origin": 1.2,
            "numeric_interval": 0.1,
        },
    )

    assert result["state"] == "successful"
    table = pl.read_ipc_stream(result["table"]["artifact"])
    assert table.select(
        SEQUENTIAL_PERIOD_INDEX_COLUMN,
        "time_period",
        "time_period_formatted",
        "sequential_count",
        "period_start",
        "period_end",
    ).rows() == [
        (0, 1.2, "[1.2, 1.3)", 1, 1.2, 1.2),
        (1, 1.3, "[1.3, 1.4)", 1, 1.3, 1.3),
        (2, 1.4, "[1.4, 1.5)", 1, 1.4, 1.4),
        (3, 1.5, "[1.5, 1.6)", 1, 1.5, 1.5),
    ]
    publication = pl.read_parquet(result["publication_artifact"])
    assert publication.select(
        "text", SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN
    ).rows() == [("d", 3), ("a", 0), ("c", 2), ("b", 1)]


def test_sequential_frames_share_stable_indices_and_preserve_original_groups() -> None:
    aggregate, publication = _build_sequential_result_frames(
        pl.DataFrame(
            {
                "value": [15.0, float("nan"), 5.0, None, 25.0],
                "group": ["B", "ignored", "A", "ignored", None],
                "text": ["fifteen", "nan", "five", "null", "twenty-five"],
            }
        ).lazy(),
        time_column="value",
        group_by_columns=["group"],
        column_type="numeric",
        numeric_interval=10,
    )

    assert aggregate.select(
        SEQUENTIAL_PERIOD_INDEX_COLUMN,
        SEQUENTIAL_GROUP_INDEX_COLUMN,
        "group",
    ).rows() == [
        # The missing group comes last (issue 317).
        (0, 0, "A"),
        (1, 1, "B"),
        (2, 2, None),
    ]
    assert publication["text"].to_list() == ["fifteen", "five", "twenty-five"]
    assert publication["group"].to_list() == ["B", "A", None]
    assert publication[SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN].to_list() == [
        1,
        0,
        2,
    ]
    assert publication[SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN].to_list() == [
        1,
        0,
        2,
    ]


def test_sequential_frames_keep_case_variants_as_exact_multi_column_groups() -> None:
    aggregate, publication = _build_sequential_result_frames(
        pl.DataFrame(
            {
                "occurred_at": [
                    datetime(2026, 1, 1, tzinfo=UTC),
                    datetime(2026, 1, 2, tzinfo=UTC),
                    datetime(2026, 1, 3, tzinfo=UTC),
                ],
                "region": ["au", "AU", "au"],
                "party": ["jobs", "Jobs", None],
                "text": ["one", "two", "three"],
            }
        ).lazy(),
        time_column="occurred_at",
        group_by_columns=["region", "party"],
        frequency="monthly",
    )

    exact_groups = aggregate.select(
        "region",
        "party",
        SEQUENTIAL_GROUP_INDEX_COLUMN,
    ).rows()
    assert len(exact_groups) == 3
    assert {(region, party) for region, party, _index in exact_groups} == {
        ("au", "jobs"),
        ("AU", "Jobs"),
        ("au", None),
    }
    assert {index for _region, _party, index in exact_groups} == {0, 1, 2}
    assert publication.select("region", "party").rows() == [
        ("au", "jobs"),
        ("AU", "Jobs"),
        ("au", None),
    ]


def test_sequential_worker_rejects_noncanonical_request_fields(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        run_sequential_analysis(
            input_snapshot_dir=str(_snapshot(tmp_path)),
            artifact_dir=str(tmp_path / "output"),
            node_id=NODE_ID,
            request_payload={
                "time_column": "occurred_at",
                "frequency": "monthly",
                "case_sensitive": False,
            },
        )
