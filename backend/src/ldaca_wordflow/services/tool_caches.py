"""Per-user tool caches: their sizes and a manual clear (issue 334).

Why this exists: the Topic Modelling embedding cache and the tokeniser cache
grow with every corpus a user analyses, and v0.7 never clears them. Settings
shows each cache's size with a Clear button; v0.8 plans automatic clean-up
(issue 259).

polars-text opens each cache only while holding an exclusive lock on
``<cache>.lock`` (``cache.rs`` ``with_file_lock``), so clearing takes the same
lock first: it never removes a file a running analysis is using, and waits a
few seconds before reporting that the cache is busy.
"""

from __future__ import annotations

import os
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from ..analysis.token_cache import TOKENS_CACHE_FILENAME
from ..infrastructure.storage.embedding_cache import EMBEDDINGS_CACHE_FILENAME
from ..shared.errors import ToolCacheBusyError

ToolCacheKind = Literal["topic_modeling", "tokeniser"]

TOOL_CACHE_FILENAMES: dict[ToolCacheKind, str] = {
    "topic_modeling": EMBEDDINGS_CACHE_FILENAME,
    "tokeniser": TOKENS_CACHE_FILENAME,
}

_LOCK_WAIT_SECONDS = 5.0


def _cache_files(cache_root: Path, kind: ToolCacheKind) -> list[Path]:
    """The cache database and its write-ahead log."""

    path = cache_root / TOOL_CACHE_FILENAMES[kind]
    return [path, path.with_name(f"{path.name}.wal")]


def tool_cache_size(cache_root: Path, kind: ToolCacheKind) -> int:
    """Bytes the cache uses on disk (0 when it does not exist)."""

    total = 0
    for path in _cache_files(cache_root, kind):
        try:
            total += path.stat().st_size
        except FileNotFoundError:
            continue
    return total


# The same exclusive lock polars-text takes (fs2: flock on POSIX, LockFileEx
# on Windows). Chosen by sys.platform so type checkers on every platform see
# only that platform's module.
if sys.platform == "win32":
    import msvcrt

    def _try_lock(fd: int) -> bool:
        try:
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        except OSError:
            return False
        return True

    def _unlock(fd: int) -> None:
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)

else:
    import fcntl

    def _try_lock(fd: int) -> bool:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        return True

    def _unlock(fd: int) -> None:
        fcntl.flock(fd, fcntl.LOCK_UN)


@contextmanager
def _exclusive_cache_lock(lock_path: Path, wait_seconds: float) -> Iterator[None]:
    """Hold the same exclusive lock polars-text takes, or raise when busy."""

    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o644)
    deadline = time.monotonic() + wait_seconds
    try:
        while not _try_lock(fd):
            if time.monotonic() >= deadline:
                raise ToolCacheBusyError()
            time.sleep(0.1)
        try:
            yield
        finally:
            _unlock(fd)
    finally:
        os.close(fd)


def clear_tool_cache(
    cache_root: Path,
    kind: ToolCacheKind,
    *,
    wait_seconds: float = _LOCK_WAIT_SECONDS,
) -> int:
    """Delete one tool cache and return the bytes freed.

    The next run of that tool recomputes what it needs, so it is slower once.
    A file another process still holds open (Windows) counts as busy.
    """

    files = _cache_files(cache_root, kind)
    if not any(path.exists() for path in files):
        return 0
    lock_path = files[0].with_name(f"{files[0].name}.lock")
    with _exclusive_cache_lock(lock_path, wait_seconds):
        freed = tool_cache_size(cache_root, kind)
        try:
            for path in files:
                path.unlink(missing_ok=True)
        except PermissionError as exc:
            raise ToolCacheBusyError() from exc
    return freed


__all__ = [
    "TOOL_CACHE_FILENAMES",
    "ToolCacheKind",
    "clear_tool_cache",
    "tool_cache_size",
]
