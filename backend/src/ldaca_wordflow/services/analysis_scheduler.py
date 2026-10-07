"""Private fair scheduler for Workspace-owned Analysis execution."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
import uuid

from anyio.abc import TaskGroup

from .analysis_execution_types import (
    AnalysisExecutionControl,
    AnalysisExecutionKey,
    AnalysisLane,
    AnalysisSchedulingStopped,
)
from .fair_scheduler import FairSchedulerKernel


# Execution lanes by cost (issue 328): slow and medium Analyses each have
# their own slots, so a quick word frequency never waits behind topic models.
# CPU-heavy or long external waits: topic embedding (also when adding topic
# results, which can embed documents a sample left out) and the quotation
# service.
_SLOW_KINDS = frozenset(
    {
        "topic_modeling",
        "topic_modeling_data_block_creation",
        "quotation",
        "quotation_run_all",
    }
)
# Long waits on a language-model provider, light on the CPU.
_MEDIUM_KINDS = frozenset({"annotation", "annotation_run_all"})


def analysis_lane(kind: str) -> AnalysisLane:
    """The lane an Analysis kind runs in; anything not listed is fast."""

    if kind in _SLOW_KINDS:
        return "slow"
    if kind in _MEDIUM_KINDS:
        return "medium"
    return "fast"


@dataclass(frozen=True, slots=True)
class ScheduledAnalysis:
    key: AnalysisExecutionKey
    created_at: datetime
    credential: str | None
    lane: AnalysisLane = "fast"


AnalysisRunner = Callable[[ScheduledAnalysis], Awaitable[None]]
RunningCancellation = Callable[[AnalysisExecutionKey], Awaitable[None]]
WorkRemoved = Callable[[AnalysisExecutionKey], Awaitable[None]]


class AnalysisScheduler(AnalysisExecutionControl):
    """Work-conserving capacity per lane with per-user round-robin selection.

    Each lane is its own fair queue with its own slots (issue 328). A single
    ``capacity`` number makes one lane that every Analysis shares.
    """

    def __init__(
        self,
        *,
        capacity: int | Mapping[AnalysisLane, int],
        runner: AnalysisRunner,
        cancel_running: RunningCancellation,
        work_removed: WorkRemoved,
    ) -> None:
        capacities: dict[AnalysisLane, int] = (
            {"fast": capacity} if isinstance(capacity, int) else dict(capacity)
        )
        if "fast" not in capacities or any(n < 1 for n in capacities.values()):
            raise ValueError("Analysis execution capacity must be positive")
        self._cancel_running = cancel_running
        self._work_removed = work_removed
        self._kernels: dict[
            AnalysisLane, FairSchedulerKernel[AnalysisExecutionKey, ScheduledAnalysis]
        ] = {
            lane: FairSchedulerKernel[AnalysisExecutionKey, ScheduledAnalysis](
                name=f"Analysis ({lane})",
                capacity=slots,
                key=lambda item: item.key,
                user_id=lambda item: item.key.user_id,
                order_key=lambda item: (item.created_at, item.key.analysis_id),
                runner=runner,
                finished=self._finished,
            )
            for lane, slots in capacities.items()
        }

    def _kernel_for(
        self, lane: AnalysisLane
    ) -> FairSchedulerKernel[AnalysisExecutionKey, ScheduledAnalysis]:
        # A lane without its own slots shares the fast lane.
        return self._kernels.get(lane, self._kernels["fast"])

    def start(self, task_group: TaskGroup) -> None:
        """Start one dispatch loop per lane in the runtime-owned task group."""

        for kernel in self._kernels.values():
            kernel.start(task_group)

    async def enqueue(
        self,
        key: AnalysisExecutionKey,
        *,
        created_at: datetime,
        credential: str | None,
        lane: AnalysisLane = "fast",
    ) -> None:
        """Add one already-durable queued Analysis to its lane."""

        item = ScheduledAnalysis(key, created_at, credential, lane)
        try:
            await self._kernel_for(lane).enqueue(item)
        except RuntimeError as exc:
            raise AnalysisSchedulingStopped(
                "Analysis scheduler is not accepting work"
            ) from exc

    async def cancel(self, key: AnalysisExecutionKey) -> None:
        """Remove queued work or signal the private runner for active work."""

        for kernel in self._kernels.values():
            target = await kernel.cancel(key, key.user_id)
            if target == "queued":
                await self._work_removed(key)
                return
            if target == "running":
                await self._cancel_running(key)
                return

    async def has_workspace_work(
        self, user_id: str, workspace_id: uuid.UUID
    ) -> bool:
        """Return whether one Workspace still owns queued or active execution."""

        for kernel in self._kernels.values():
            if any(
                item.key.workspace_id == workspace_id
                for item in await kernel.pending_for(user_id)
            ):
                return True
        return any(
            key.user_id == user_id and key.workspace_id == workspace_id
            for key in await self.active_keys()
        )

    async def cancel_workspace(self, user_id: str, workspace_id: uuid.UUID) -> None:
        """Remove queued work and signal active work before Workspace deletion."""

        for kernel in self._kernels.values():
            await kernel.remove_where(
                user_id,
                lambda item: item.key.workspace_id == workspace_id,
            )
        active = [
            key
            for key in await self.active_keys()
            if key.user_id == user_id and key.workspace_id == workspace_id
        ]
        for key in active:
            await self._cancel_running(key)

    async def stop_dispatch(self) -> list[ScheduledAnalysis]:
        """Reject new work and return queued resources for interruption commits."""

        queued: list[ScheduledAnalysis] = []
        for kernel in self._kernels.values():
            queued.extend(await kernel.stop_dispatch())
        return queued

    async def active_keys(self) -> set[AnalysisExecutionKey]:
        keys: set[AnalysisExecutionKey] = set()
        for kernel in self._kernels.values():
            keys |= await kernel.active_keys()
        return keys

    async def has_work(self) -> bool:
        """Return whether queued or running Analysis execution still exists."""

        for kernel in self._kernels.values():
            if await kernel.has_work():
                return True
        return False

    async def wait_idle(self) -> None:
        """Wait until every selected runner has left its capacity slot."""

        for kernel in self._kernels.values():
            await kernel.wait_idle()

    async def _finished(self, item: ScheduledAnalysis) -> None:
        await self._work_removed(item.key)


__all__ = ["AnalysisLane", "AnalysisScheduler", "ScheduledAnalysis", "analysis_lane"]
