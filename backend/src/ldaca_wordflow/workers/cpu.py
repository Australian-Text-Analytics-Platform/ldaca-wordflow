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


QUOTATION_PROCESSES_ENV = "WORDFLOW_QUOTATION_PROCESSES"
# Each Quotation process loads its own spaCy model; measured ~480 MB, with
# headroom for long documents.
QUOTATION_PROCESS_BYTES = 700 * 1024 * 1024
MAX_QUOTATION_PROCESSES = 8


def _cgroup_memory_room(root: Path = Path("/sys/fs/cgroup")) -> int | None:
    """Bytes still free under a Linux cgroup memory limit (v2 or v1), or None."""

    for limit_file, usage_file in (
        (root / "memory.max", root / "memory.current"),
        (root / "memory" / "memory.limit_in_bytes", root / "memory" / "memory.usage_in_bytes"),
    ):
        try:
            limit_text = limit_file.read_text().strip()
            if limit_text == "max":
                return None
            limit = int(limit_text)
            # v1 reports a huge number when unlimited.
            if limit >= 1 << 60:
                return None
            return max(0, limit - int(usage_file.read_text().strip()))
        except (OSError, ValueError):
            continue
    return None


def quotation_processes(cgroup_root: Path = Path("/sys/fs/cgroup")) -> int:
    """Processes a Quotation Run uses for local extraction (issue 381).

    Half the processors this process may use, at most 8, and only as many as
    the free memory (a container's limit included) can hold. Never fewer than
    one, so a 2-core BinderHub VM runs as before. The deployment can set it.
    """

    configured = os.environ.get(QUOTATION_PROCESSES_ENV, "").strip()
    if configured:
        try:
            return max(1, int(configured))
        except ValueError:
            pass
    count = min(MAX_QUOTATION_PROCESSES, available_cpus(cgroup_root) // 2)
    room = _cgroup_memory_room(cgroup_root)
    if room is None:
        try:
            import psutil

            room = int(psutil.virtual_memory().available)
        except Exception:  # noqa: BLE001 - unknown memory: trust the processor count
            room = None
    if room is not None:
        count = min(count, room // QUOTATION_PROCESS_BYTES)
    return max(1, count)


def default_embedding_threads() -> None:
    """Embed on every processor this process may use, unless configured."""

    os.environ.setdefault(EMBEDDING_THREADS_ENV, str(available_cpus()))


__all__ = ["available_cpus", "default_embedding_threads", "quotation_processes"]
