"""One Apollo LLM request at a time per user, in the main process.

Runs are admitted by the Analysis scheduler: a user's second Run waits in the
queue until the first one finishes, while other users' Runs go ahead. Preview
requests run in the main process: a user's Previews take turns, and a Preview
while that user's Run is going is refused with a clear message (a Run can take
hours, longer than a page request should wait).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

import anyio

from ..domain.background import Progress
from ..shared.errors import ResourceConflictError
from .config import APOLLO_PROVIDER_NAME

WAITING_MESSAGE = f"Waiting for your previous {APOLLO_PROVIDER_NAME} run"


class ApolloRunActiveError(ResourceConflictError):
    code = "apollo_llm_run_active"


class ApolloUserGate:
    def __init__(self) -> None:
        self._runs: set[str] = set()
        self._previews: Counter[str] = Counter()
        self._preview_locks: dict[str, anyio.Lock] = {}
        self._wakers: list[Callable[[], None]] = []

    def add_waker(self, waker: Callable[[], None]) -> None:
        """Called when a user's slot frees, so a waiting Run is looked at again."""

        self._wakers.append(waker)

    def _wake(self) -> None:
        for waker in self._wakers:
            waker()

    def run_active(self, user_id: str) -> bool:
        return user_id in self._runs

    def try_start_run(self, user_id: str) -> bool:
        if user_id in self._runs or self._previews[user_id]:
            return False
        self._runs.add(user_id)
        return True

    def finish_run(self, user_id: str) -> None:
        self._runs.discard(user_id)
        self._wake()

    def queued_progress(self, user_id: str) -> Progress | None:
        """What a new Run shows in Tasks while the user's previous one runs."""

        if not self.run_active(user_id):
            return None
        return Progress(fraction=None, message=WAITING_MESSAGE)

    @asynccontextmanager
    async def preview(self, user_id: str) -> AsyncIterator[None]:
        lock = self._preview_locks.setdefault(user_id, anyio.Lock())
        async with lock:
            if self.run_active(user_id):
                raise ApolloRunActiveError(
                    f"Your {APOLLO_PROVIDER_NAME} run is still going, and "
                    f"{APOLLO_PROVIDER_NAME} takes one request at a time. "
                    "Preview more rows when the run has finished."
                )
            self._previews[user_id] += 1
            try:
                yield
            finally:
                self._previews[user_id] -= 1
                if not self._previews[user_id]:
                    del self._previews[user_id]
                self._wake()


_GATE = ApolloUserGate()


def user_gate() -> ApolloUserGate:
    return _GATE


def reset_user_gate() -> ApolloUserGate:
    """A fresh gate, for tests."""

    global _GATE
    _GATE = ApolloUserGate()
    return _GATE


__all__ = [
    "WAITING_MESSAGE",
    "ApolloRunActiveError",
    "ApolloUserGate",
    "reset_user_gate",
    "user_gate",
]
