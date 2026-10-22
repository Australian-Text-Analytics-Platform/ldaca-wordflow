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


@pytest.fixture
def no_pool_variables(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for variable in cpu.THREAD_POOL_VARIABLES:
        monkeypatch.delenv(variable, raising=False)
    return monkeypatch


def test_a_quota_below_the_visible_cores_caps_thread_pools(
    tmp_path: Path, no_pool_variables: pytest.MonkeyPatch
) -> None:
    # 8 CPUs of a 224-core node (issue 428).
    (tmp_path / "cpu.max").write_text("800000 100000\n")
    no_pool_variables.setattr(os, "process_cpu_count", lambda: 224)
    no_pool_variables.setenv("MKL_NUM_THREADS", "4")

    assert cpu.cap_thread_pools(tmp_path) == 8
    assert os.environ["OPENBLAS_NUM_THREADS"] == "8"
    assert os.environ["RAYON_NUM_THREADS"] == "8"
    assert os.environ["MKL_NUM_THREADS"] == "4"


def test_without_a_smaller_quota_thread_pools_are_left_alone(
    tmp_path: Path, no_pool_variables: pytest.MonkeyPatch
) -> None:
    no_pool_variables.setattr(os, "process_cpu_count", lambda: 8)
    (tmp_path / "cpu.max").write_text("max 100000\n")
    assert cpu.cap_thread_pools(tmp_path) is None
    (tmp_path / "cpu.max").write_text("1600000 100000\n")
    assert cpu.cap_thread_pools(tmp_path) is None
    assert not any(variable in os.environ for variable in cpu.THREAD_POOL_VARIABLES)
