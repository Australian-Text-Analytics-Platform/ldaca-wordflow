"""The operator's notice to everyone signed in to a server (issue 438).

``SERVER_NOTICE_FILE`` names a small UTF-8 text file (Markdown). It is read
again whenever its modification time or size changes, so an operator can put
up, change or take down the notice without a restart. The notice's id comes
from its text, so a changed text is a new notice that everyone sees again. A
missing, empty, unreadable or oversized file means no notice; the last two
are logged.

Records, kept for future reference in ``<DATA_ROOT>/server-notices/``, both
append-only JSON lines:

- ``notices.jsonl``: each distinct notice once, with its id, text and when it
  was first shown, so acknowledgements can be joined back to the exact words;
- ``acknowledgements.jsonl``: each Got it, with the notice id, the person's
  name and sign-in email (the email decides whether they acknowledged), and
  the time.

A person who acknowledged the current notice doesn't see it again, on any
device. Only a multi-user server shows a notice or keeps these records.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_NOTICE_BYTES = 4096
RECORDS_DIRECTORY = "server-notices"
NOTICES_FILE = "notices.jsonl"
ACKNOWLEDGEMENTS_FILE = "acknowledgements.jsonl"


@dataclass(frozen=True)
class ServerNotice:
    id: str
    text: str


_cached: tuple[tuple[str, int, int], ServerNotice | None] | None = None
_lock = threading.Lock()
# Per records folder: the notice ids archived and the (notice id, identity)
# pairs acknowledged, read from the files once and kept up to date.
_recorded: dict[Path, tuple[set[str], set[tuple[str, str]]]] = {}


def _read(path: Path, size: int) -> ServerNotice | None:
    if size > MAX_NOTICE_BYTES:
        logger.warning(
            "Server notice file %s is %d bytes, over the %d-byte limit; no notice shown",
            path,
            size,
            MAX_NOTICE_BYTES,
        )
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        logger.warning("Server notice file %s could not be read (%s); no notice shown", path, exc)
        return None
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return None
    return ServerNotice(id=hashlib.sha256(text.encode()).hexdigest()[:16], text=text)


def read_server_notice(path: Path | None) -> ServerNotice | None:
    """Return the current notice, reading the file again only when it changed."""

    global _cached
    if path is None:
        return None
    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    except OSError as exc:
        logger.warning("Server notice file %s could not be checked (%s); no notice shown", path, exc)
        return None
    key = (str(path), stat.st_mtime_ns, stat.st_size)
    if _cached is not None and _cached[0] == key:
        return _cached[1]
    notice = _read(path, stat.st_size)
    _cached = (key, notice)
    return notice


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _read_lines(path: Path) -> list[dict[str, str]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return []
    records = []
    for line in lines:
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue  # a line cut short by a crash; the rest still counts
        if isinstance(record, dict):
            records.append(record)
    return records


def _append(path: Path, record: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def _state(records: Path) -> tuple[set[str], set[tuple[str, str]]]:
    state = _recorded.get(records)
    if state is None:
        archived = {r["id"] for r in _read_lines(records / NOTICES_FILE) if "id" in r}
        acknowledged = {
            (r["notice_id"], r["email"])
            for r in _read_lines(records / ACKNOWLEDGEMENTS_FILE)
            if "notice_id" in r and "email" in r
        }
        state = (archived, acknowledged)
        _recorded[records] = state
    return state


def archive_notice(data_root: Path, notice: ServerNotice) -> None:
    """Keep the notice's exact text the first time it is shown."""

    records = data_root / RECORDS_DIRECTORY
    with _lock:
        archived, _ = _state(records)
        if notice.id in archived:
            return
        _append(
            records / NOTICES_FILE,
            {"id": notice.id, "first_shown_at": _now(), "text": notice.text},
        )
        archived.add(notice.id)


def is_acknowledged(data_root: Path, notice_id: str, email: str) -> bool:
    with _lock:
        _, acknowledged = _state(data_root / RECORDS_DIRECTORY)
        return (notice_id, email) in acknowledged


def acknowledge_notice(data_root: Path, notice: ServerNotice, *, email: str, name: str) -> None:
    """Record that this person chose Got it for ``notice`` (once per notice)."""

    records = data_root / RECORDS_DIRECTORY
    archive_notice(data_root, notice)
    with _lock:
        _, acknowledged = _state(records)
        if (notice.id, email) in acknowledged:
            return
        _append(
            records / ACKNOWLEDGEMENTS_FILE,
            {
                "notice_id": notice.id,
                "email": email,
                "name": name,
                "acknowledged_at": _now(),
            },
        )
        acknowledged.add((notice.id, email))


__all__ = [
    "ACKNOWLEDGEMENTS_FILE",
    "MAX_NOTICE_BYTES",
    "NOTICES_FILE",
    "RECORDS_DIRECTORY",
    "ServerNotice",
    "acknowledge_notice",
    "archive_notice",
    "is_acknowledged",
    "read_server_notice",
]
