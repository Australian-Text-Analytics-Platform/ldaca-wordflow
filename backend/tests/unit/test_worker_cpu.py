"""Processors an analysis worker may use (issue 341)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from ldaca_wordflow.workers import cpu


def test_a_cgroup_v2_quota_caps_the_processor_count(tmp_path: Path) -> None:
    (tmp_path / "cpu.max").write_text("200000 100000\n")
    assert cpu.available_cpus(tmp_path) == min(2, os.process_cpu_count() or 1)


def test_a_cgroup_v1_quota_caps_the_processor_count(tmp_path: Path) -> None:
    (tmp_path / "cpu").mkdir()
    (tmp_path / "cpu" / "cpu.cfs_quota_us").write_text("150000\n")
    (tmp_path / "cpu" / "cpu.cfs_period_us").write_text("100000\n")
    assert cpu.available_cpus(tmp_path) == min(2, os.process_cpu_count() or 1)


def test_no_quota_uses_every_processor_the_process_may_run_on(tmp_path: Path) -> None:
    (tmp_path / "cpu.max").write_text("max 100000\n")
    assert cpu.available_cpus(tmp_path) == (os.process_cpu_count() or os.cpu_count() or 1)
    assert cpu.available_cpus(tmp_path / "missing") == (
        os.process_cpu_count() or os.cpu_count() or 1
    )


def test_an_explicit_thread_setting_is_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(cpu.EMBEDDING_THREADS_ENV, "8")
    cpu.default_embedding_threads()
    assert os.environ[cpu.EMBEDDING_THREADS_ENV] == "8"

    monkeypatch.delenv(cpu.EMBEDDING_THREADS_ENV)
    cpu.default_embedding_threads()
    assert os.environ[cpu.EMBEDDING_THREADS_ENV] == str(cpu.available_cpus())
