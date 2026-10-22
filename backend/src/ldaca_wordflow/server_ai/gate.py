"""Per-person limits for server AI providers, kept in the server process.

For a provider with ``max_requests_per_user``:
- the Analysis scheduler starts a person's Run on it only when no other Run
  or Preview of theirs on that provider is going; other people's Runs go
  ahead (the waiting Run shows WAITING_MESSAGE in Tasks);
- a person's Previews on it take turns, and a Preview while their Run is
  going is refused clearly (a Run can take hours, longer than a page request
  should wait);
- a Run sends at most that many requests at once (annotation_ai).

Run one server process: this state is not shared between processes.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

import anyio

from ..domain.background import Progress
from ..shared.errors import ResourceConflictError
from .config import ServerAiProvider

_Key = tuple[str, str]  # (provider slug, user id)


def waiting_message(provider: ServerAiProvider) -> str:
    return f"Waiting for your previous {provider.name} run"


class ServerAiRunActiveError(ResourceConflictError):
    code = "server_ai_run_active"


class ServerAiUserGate:
    def __init__(self) -> None:
        self._runs: set[_Key] = set()
        self._previews: Counter[_Key] = Counter()
        self._preview_locks: dict[_Key, anyio.Lock] = {}
        self._wakers: list[Callable[[], None]] = []

    def add_waker(self, waker: Callable[[], None]) -> None:
        """Called when a person's slot frees, so a waiting Run is looked at again."""

        self._wakers.append(waker)

    def _wake(self) -> None:
        for waker in self._wakers:
            waker()

    def run_active(self, slug: str, user_id: str) -> bool:
        return (slug, user_id) in self._runs

    def try_start_run(self, slug: str, user_id: str) -> bool:
        key = (slug, user_id)
        if key in self._runs or self._previews[key]:
            return False
        self._runs.add(key)
        return True

    def finish_run(self, slug: str, user_id: str) -> None:
        self._runs.discard((slug, user_id))
        self._wake()

    def queued_progress(self, provider: ServerAiProvider, user_id: str) -> Progress | None:
        """What a new Run shows in Tasks while the person's previous one runs."""

        if not self.run_active(provider.slug, user_id):
            return None
        return Progress(fraction=None, message=waiting_message(provider))

    @asynccontextmanager
    async def preview(self, provider: ServerAiProvider, user_id: str) -> AsyncIterator[None]:
        key = (provider.slug, user_id)
        lock = self._preview_locks.setdefault(key, anyio.Lock())
        async with lock:
            if key in self._runs:
                raise ServerAiRunActiveError(
                    f"Your {provider.name} run is still going, and {provider.name} "
                    "takes a limited number of requests at a time. "
                    "Preview more rows when the run has finished."
                )
            self._previews[key] += 1
            try:
                yield
            finally:
                self._previews[key] -= 1
                if not self._previews[key]:
                    del self._previews[key]
                self._wake()


_GATE = ServerAiUserGate()


def user_gate() -> ServerAiUserGate:
    return _GATE


def reset_user_gate() -> ServerAiUserGate:
    """A fresh gate, for tests."""

    global _GATE
    _GATE = ServerAiUserGate()
    return _GATE


__all__ = [
    "ServerAiRunActiveError",
    "ServerAiUserGate",
    "reset_user_gate",
    "user_gate",
    "waiting_message",
]
