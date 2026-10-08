"""Step-by-step progress for slow runs (issue 350).

A slow run (Topic Modelling, Quotation, tokenising a large corpus) reports
which step it is on, how far that step has got when it can be counted, the
time left from the rate measured on this computer, and how busy the worker
process's processors are, so the Tasks panel can show the run is alive.

``StepReporter`` turns step counts into a monotonic fraction, a plain
message and a ``ProgressDetail`` payload, rate-limited, with a heartbeat
while nothing moves. ``polars_text_progress`` polls the JSON file polars-text
writes (it cannot call back into Python) and feeds the reporter.
"""

from __future__ import annotations

import json
import tempfile
import threading
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .cpu import available_cpus

# Report at most this often while counts move, and at least this often (a
# heartbeat with the processor use) while they do not.
MIN_REPORT_SECONDS = 2.0
HEARTBEAT_SECONDS = 5.0
POLL_SECONDS = 1.0
# The time left is shown once a step has run this long with counts moving.
ETA_MIN_SECONDS = 15.0
# Workers may not report completion; the last share is left to the caller.
MAX_REPORTED_FRACTION = 0.995


class ProgressCallback(Protocol):
    """A worker's progress report: fraction, message and optional detail."""

    def __call__(
        self,
        fraction: float,
        message: str,
        detail: dict[str, Any] | None = None,
        /,
    ) -> None: ...


@dataclass(frozen=True)
class Step:
    """One step of a run: its key, plain label and share of the run's band."""

    key: str
    label: str
    weight: float = 1.0
    counted: bool = True


def format_duration(seconds: float) -> str:
    """Plain rounded durations: "less than a minute", "5 min", "2 h 10 min"."""

    minutes = int(round(seconds / 60))
    if minutes < 1:
        return "less than a minute"
    hours, minutes = divmod(minutes, 60)
    if hours == 0:
        return f"{minutes} min"
    return f"{hours} h {minutes} min" if minutes else f"{hours} h"


class StepReporter:
    """Turns step counts into progress reports for one band of a run.

    ``band`` is the part of the whole run (0 to 1) these steps cover; each
    step's share of it follows its ``weight``. Thread-safe: the polars-text
    poller and the worker thread may both call it.
    """

    def __init__(
        self,
        callback: ProgressCallback,
        *,
        band: tuple[float, float],
        steps: Sequence[Step],
        clock: Callable[[], float] = time.monotonic,
        cpu_clock: Callable[[], float] = time.process_time,
        processors: int | None = None,
    ) -> None:
        if not steps:
            raise ValueError("A StepReporter needs at least one step")
        self._callback = callback
        self._band = band
        self._steps = list(steps)
        self._index = {step.key: position for position, step in enumerate(self._steps)}
        total_weight = sum(step.weight for step in self._steps)
        self._starts: list[float] = []
        running = 0.0
        for step in self._steps:
            self._starts.append(running / total_weight)
            running += step.weight
        self._shares = [step.weight / total_weight for step in self._steps]
        self._clock = clock
        self._cpu_clock = cpu_clock
        self._processors = processors or available_cpus()
        self._lock = threading.Lock()
        self._current: int | None = None
        self._done: int | None = None
        self._total: int | None = None
        self._unit: str | None = None
        self._step_started = 0.0
        self._rate_base: tuple[float, int] | None = None
        self._last_change = 0.0
        self._last_report = float("-inf")
        self._last_fraction = band[0]
        self._cpu_sample = (clock(), cpu_clock())
        self._busy: float | None = None

    def update(
        self,
        key: str,
        done: int | None = None,
        total: int | None = None,
        unit: str | None = None,
    ) -> None:
        """Record step ``key`` at ``done`` of ``total`` and report if due."""

        with self._lock:
            now = self._clock()
            position = self._index[key]
            new_step = position != self._current
            if new_step:
                self._current = position
                self._step_started = now
                self._rate_base = None
                self._last_change = now
            elif done != self._done:
                self._last_change = now
            if done is not None and self._rate_base is None:
                # The first count of a step is the baseline: cached work
                # counted at once must not inflate the measured rate.
                self._rate_base = (now, done)
            self._done = done
            self._total = total
            self._unit = unit
            if new_step or now - self._last_report >= MIN_REPORT_SECONDS:
                self._report(now)

    def has_step(self, key: str) -> bool:
        return key in self._index

    def heartbeat(self) -> None:
        """Report the processor use when nothing else has been reported lately."""

        with self._lock:
            now = self._clock()
            if self._current is not None and now - self._last_report >= HEARTBEAT_SECONDS:
                self._report(now)

    def _fraction(self) -> float:
        assert self._current is not None
        low, high = self._band
        within = 0.0
        if self._steps[self._current].counted and self._done is not None and self._total:
            within = min(1.0, self._done / self._total)
        fraction = low + (high - low) * (
            self._starts[self._current] + self._shares[self._current] * within
        )
        self._last_fraction = min(MAX_REPORTED_FRACTION, max(self._last_fraction, fraction))
        return self._last_fraction

    def _eta_seconds(self, now: float) -> int | None:
        if self._rate_base is None or self._done is None or not self._total:
            return None
        base_time, base_done = self._rate_base
        elapsed = now - base_time
        if elapsed < ETA_MIN_SECONDS or self._done <= base_done:
            return None
        rate = (self._done - base_done) / elapsed
        return max(0, int((self._total - self._done) / rate))

    def _sample_cpu(self, now: float) -> None:
        cpu_now = self._cpu_clock()
        wall_then, cpu_then = self._cpu_sample
        if now - wall_then >= 1.0:
            self._busy = max(0.0, (cpu_now - cpu_then) / (now - wall_then))
            self._cpu_sample = (now, cpu_now)

    def _report(self, now: float) -> None:
        assert self._current is not None
        step = self._steps[self._current]
        self._sample_cpu(now)
        eta = self._eta_seconds(now) if step.counted else None
        position = (
            step.label
            if len(self._steps) == 1
            else f"Step {self._current + 1} of {len(self._steps)}, {step.label.lower()}"
        )
        if step.counted and self._done is not None and self._unit:
            counts = (
                f"{self._done:,} of {self._total:,} {self._unit}"
                if self._total
                else f"{self._done:,} {self._unit}"
            )
            message = f"{position}: {counts}"
            if eta is not None:
                message += f", about {format_duration(eta)} left"
        elif step.counted:
            message = f"{position}…"
        else:
            message = (
                f"{position}. This step doesn't report progress; "
                f"running for {format_duration(now - self._step_started)}"
            )
        detail: dict[str, Any] = {
            "step": self._current + 1,
            "steps": len(self._steps),
            "step_label": step.label,
            "done": self._done if step.counted else None,
            "total": self._total if step.counted else None,
            "unit": self._unit if step.counted else None,
            "eta_seconds": eta,
            "processors_busy": None if self._busy is None else round(self._busy, 2),
            "processors": self._processors,
            "stalled_seconds": int(now - self._last_change),
        }
        self._last_report = now
        self._callback(self._fraction(), message, detail)


def _read_progress_file(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, dict) else None


@contextmanager
def polars_text_progress(
    reporter: StepReporter,
    *,
    total: int | None = None,
    poll_seconds: float = POLL_SECONDS,
) -> Iterator[str]:
    """Poll a polars-text progress file into ``reporter`` while the block runs.

    Yields the path to pass as ``progress_path``. The file's ``label`` is the
    reporter's step key; ``total`` fills in a count the file leaves to the
    caller (the tokeniser's). The heartbeat keeps the processor use flowing
    while a step reports no counts.
    """

    stop = threading.Event()
    with tempfile.TemporaryDirectory(prefix="wordflow-progress-") as directory:
        path = Path(directory) / "progress.json"

        def poll() -> None:
            last_seen: tuple[Any, ...] | None = None
            while not stop.wait(poll_seconds):
                state = _read_progress_file(path)
                if state is not None:
                    key = state.get("label")
                    seen = (key, state.get("done"), state.get("total"))
                    if isinstance(key, str) and reporter.has_step(key) and seen != last_seen:
                        last_seen = seen
                        reporter.update(
                            key,
                            done=_as_count(state.get("done")),
                            total=_as_count(state.get("total")) or total,
                            unit=state.get("unit") or None,
                        )
                        continue
                reporter.heartbeat()

        thread = threading.Thread(target=poll, name="wordflow-progress", daemon=True)
        thread.start()
        try:
            yield str(path)
        finally:
            stop.set()
            thread.join(timeout=5)


@contextmanager
def keep_alive(reporter: StepReporter, *, interval_seconds: float = 1.0) -> Iterator[None]:
    """Send heartbeats while the block runs, for steps whose own reports can
    be minutes apart (a remote Quotation batch, for example)."""

    stop = threading.Event()

    def beat() -> None:
        while not stop.wait(interval_seconds):
            reporter.heartbeat()

    thread = threading.Thread(target=beat, name="wordflow-heartbeat", daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=5)


def _as_count(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


__all__ = [
    "ProgressCallback",
    "Step",
    "StepReporter",
    "format_duration",
    "keep_alive",
    "polars_text_progress",
]
