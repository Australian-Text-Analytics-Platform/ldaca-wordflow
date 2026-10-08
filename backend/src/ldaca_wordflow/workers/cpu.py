"""Processors an analysis worker may actually use (issue 341).

Why this exists: ONNX Runtime, which embeds Topic Segments, starts one thread
per physical core by default. A 2-vCPU virtual machine often presents one core
with two hyperthreads, so embedding used half of it; and in a container with a
CPU quota (BinderHub) it can count the host's cores and start far more threads
than the quota allows. The worker sets ``POLARS_TEXT_EMBEDDING_THREADS`` to the
processors this process may use, unless the deployment set it.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

EMBEDDING_THREADS_ENV = "POLARS_TEXT_EMBEDDING_THREADS"


def _cgroup_cpu_quota(root: Path = Path("/sys/fs/cgroup")) -> int | None:
    """Whole CPUs allowed by a Linux cgroup quota (v2 or v1), or None."""

    try:
        quota, period = (root / "cpu.max").read_text().split()[:2]
        if quota != "max":
            return max(1, math.ceil(int(quota) / int(period)))
        return None
    except (OSError, ValueError):
        pass
    try:
        quota_us = int((root / "cpu" / "cpu.cfs_quota_us").read_text())
        period_us = int((root / "cpu" / "cpu.cfs_period_us").read_text())
        if quota_us > 0 and period_us > 0:
            return max(1, math.ceil(quota_us / period_us))
    except (OSError, ValueError):
        pass
    return None


def available_cpus(cgroup_root: Path = Path("/sys/fs/cgroup")) -> int:
    """Logical processors this process may run on, capped by a CPU quota."""

    count = os.process_cpu_count() or os.cpu_count() or 1
    quota = _cgroup_cpu_quota(cgroup_root)
    return min(count, quota) if quota is not None else count


def default_embedding_threads() -> None:
    """Embed on every processor this process may use, unless configured."""

    os.environ.setdefault(EMBEDDING_THREADS_ENV, str(available_cpus()))


__all__ = ["available_cpus", "default_embedding_threads"]
