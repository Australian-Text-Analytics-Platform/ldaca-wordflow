"""Step progress for slow runs (issue 350)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import pytest

from ldaca_wordflow.domain.background import Progress
from ldaca_wordflow.workers.progress import (
    Step,
    StepReporter,
    format_duration,
    polars_text_progress,
)


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.cpu = 0.0

    def wall(self) -> float:
        return self.now

    def process(self) -> float:
        return self.cpu


def reporter_with(
    steps: tuple[Step, ...],
    band: tuple[float, float] = (0.1, 0.9),
) -> tuple[StepReporter, list[tuple[float, str, dict[str, Any] | None]], FakeClock]:
    reports: list[tuple[float, str, dict[str, Any] | None]] = []
    clock = FakeClock()
    reporter = StepReporter(
        lambda fraction, message, detail=None: reports.append((fraction, message, detail)),
        band=band,
        steps=steps,
        clock=clock.wall,
        cpu_clock=clock.process,
        processors=2,
    )
    return reporter, reports, clock


TWO_STEPS = (
    Step("embedding", "Reading the text into the model", weight=3),
    Step("grouping", "Grouping the segments into topics", weight=1, counted=False),
)


def test_counted_steps_fill_their_share_of_the_band() -> None:
    reporter, reports, clock = reporter_with(TWO_STEPS)

    reporter.update("embedding", done=0, total=100, unit="segments")
    clock.now = 3
    reporter.update("embedding", done=50, total=100, unit="segments")
    clock.now = 6
    reporter.update("grouping")

    fractions = [fraction for fraction, _message, _detail in reports]
    assert fractions == pytest.approx([0.1, 0.1 + 0.8 * 0.75 * 0.5, 0.1 + 0.8 * 0.75])
    assert reports[1][1] == (
        "Step 1 of 2, reading the text into the model: 50 of 100 segments"
    )
    assert reports[2][1].startswith(
        "Step 2 of 2, grouping the segments into topics. This step doesn't report progress"
    )
    detail = reports[2][2]
    assert detail is not None
    assert (detail["step"], detail["steps"], detail["done"]) == (2, 2, None)


def test_reports_are_rate_limited_but_step_changes_are_immediate() -> None:
    reporter, reports, clock = reporter_with(TWO_STEPS)
    reporter.update("embedding", done=0, total=100, unit="segments")
    clock.now = 0.5
    reporter.update("embedding", done=10, total=100, unit="segments")
    assert len(reports) == 1
    clock.now = 0.6
    reporter.update("grouping")
    assert len(reports) == 2


def test_time_left_comes_from_the_measured_rate_after_cached_work() -> None:
    reporter, reports, clock = reporter_with(TWO_STEPS)
    # 40 cached segments count at once; they must not inflate the rate.
    reporter.update("embedding", done=40, total=1000, unit="segments")
    clock.now = 20
    reporter.update("embedding", done=140, total=1000, unit="segments")

    detail = reports[-1][2]
    assert detail is not None
    # 100 segments in 20 s: 860 left take 172 s.
    assert detail["eta_seconds"] == 172
    assert reports[-1][1].endswith("140 of 1,000 segments, about 3 min left")


def test_heartbeat_reports_processor_use_and_how_long_counts_stalled() -> None:
    reporter, reports, clock = reporter_with(TWO_STEPS)
    reporter.update("grouping")
    clock.now, clock.cpu = 10, 18
    reporter.heartbeat()

    detail = reports[-1][2]
    assert detail is not None
    assert detail["processors_busy"] == 1.8
    assert detail["processors"] == 2
    assert detail["stalled_seconds"] == 10


def test_single_step_messages_have_no_step_numbers() -> None:
    reporter, reports, _clock = reporter_with((Step("finding", "Finding quotations"),))
    reporter.update("finding", done=3, total=10, unit="documents")
    assert reports[-1][1] == "Finding quotations: 3 of 10 documents"


def test_progress_never_goes_back_and_stops_short_of_complete() -> None:
    reporter, reports, clock = reporter_with(
        (Step("finding", "Finding quotations"),), band=(0.25, 1.0)
    )
    reporter.update("finding", done=10, total=10, unit="documents")
    clock.now = 5
    reporter.update("finding", done=4, total=10, unit="documents")
    assert reports[0][0] == pytest.approx(0.995)
    assert reports[1][0] == pytest.approx(0.995)


def test_reports_validate_as_task_progress() -> None:
    reporter, reports, clock = reporter_with(TWO_STEPS)
    reporter.update("embedding", done=5, total=10, unit="segments")
    clock.now = 10
    reporter.update("grouping")
    for fraction, message, detail in reports:
        progress = Progress.model_validate(
            {"fraction": fraction, "message": message, "detail": detail}
        )
        assert progress.detail is not None


def test_format_duration_is_plain() -> None:
    assert format_duration(20) == "less than a minute"
    assert format_duration(5 * 60) == "5 min"
    assert format_duration(2 * 3600 + 10 * 60) == "2 h 10 min"
    assert format_duration(3600) == "1 h"


def test_polars_text_progress_polls_the_file(tmp_path: Path) -> None:
    reports: list[str] = []
    reporter = StepReporter(
        lambda _fraction, message, _detail=None: reports.append(message),
        band=(0.0, 1.0),
        steps=(Step("tokenizing", "Tokenising the text"),),
    )
    with polars_text_progress(reporter, total=8, poll_seconds=0.05) as path:
        Path(path).write_text(
            json.dumps({"label": "tokenizing", "done": 4, "total": None, "unit": "documents"})
        )
        deadline = time.monotonic() + 5
        while not reports and time.monotonic() < deadline:
            time.sleep(0.05)
    # The tokeniser leaves the total to the caller.
    assert reports[0] == "Tokenising the text: 4 of 8 documents"
    assert not Path(path).exists()
