"""Platform-owned application paths and Data Root filesystem validation."""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from platformdirs import PlatformDirs

from .infrastructure.storage.durable_fs import (
    atomic_write_json,
    fsync_directory,
    mkdir_durable,
)

APP_IDENTIFIER = "au.edu.ldaca.wordflow"
CONFIG_SCHEMA_VERSION = 1


class DataRootConfigError(ValueError):
    """The platform configuration file is malformed or unsupported."""


class DataRootOwnerError(PermissionError):
    """The Data Root holds Wordflow data created by another user id."""

    def __init__(self, path: Path, owner: int, uid: int) -> None:
        super().__init__(
            f"{path} belongs to uid {owner}, but Wordflow is running as uid {uid}. "
            f"Wordflow's files are private to the uid that created them, so run "
            f"as uid {owner} (or copy the data and change its owner)."
        )


# What Wordflow creates at the top of a Data Root; their owner is the uid that
# created the data (issue 425).
_OWNED_ENTRIES = ("deployment.sqlite3", "users", "workspaces")


@dataclass(frozen=True, slots=True)
class DataRootPaths:
    """Process-local configuration and recommended data locations."""

    config_file: Path
    suggested_data_root: Path


def platform_data_root_paths() -> DataRootPaths:
    """Resolve non-roaming per-user paths through operating-system conventions."""

    directories = PlatformDirs(APP_IDENTIFIER, appauthor=False, roaming=False)
    return DataRootPaths(
        config_file=directories.user_config_path / "settings.json",
        suggested_data_root=directories.user_data_path / "data",
    )


def platform_cache_root() -> Path:
    """Resolve the disposable per-user cache through operating-system conventions."""

    return PlatformDirs(
        APP_IDENTIFIER,
        appauthor=False,
        roaming=False,
    ).user_cache_path


class DataRootConfigStore:
    """Read and atomically replace the one versioned Data Root setting."""

    def __init__(self, paths: DataRootPaths | None = None) -> None:
        self.paths = paths or platform_data_root_paths()

    def read(self) -> Path | None:
        """Return the configured absolute path without touching that directory."""

        path = self.paths.config_file
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise DataRootConfigError("The saved data folder setting can't be read.") from exc
        if not isinstance(payload, dict) or payload.get("schema_version") != 1:
            raise DataRootConfigError("The saved data folder setting is from a newer or older Wordflow.")
        raw_root = payload.get("data_root")
        if not isinstance(raw_root, str) or not raw_root.strip():
            raise DataRootConfigError("The saved data folder setting has no folder.")
        root = Path(raw_root)
        if not root.is_absolute():
            raise DataRootConfigError("The saved data folder is not a full path.")
        return root.expanduser().resolve(strict=False)

    def write(self, data_root: Path) -> None:
        """Persist one canonical absolute root with a crash-safe replacement."""

        atomic_write_json(
            self.paths.config_file,
            {
                "schema_version": CONFIG_SCHEMA_VERSION,
                "data_root": str(data_root),
            },
        )
        if os.name != "nt":
            self.paths.config_file.chmod(0o600)


def probe_data_root(candidate: Path) -> Path:
    """Create, canonicalize, and prove read/write/delete access to a directory."""

    if not candidate.is_absolute():
        raise ValueError("The data folder must be a full path, not a relative one.")
    mkdir_durable(candidate)
    canonical = candidate.resolve(strict=True)
    if not canonical.is_dir():
        raise ValueError("The data folder must be a folder, not a file.")
    descriptor, raw_probe = tempfile.mkstemp(prefix=".wordflow-probe.", dir=canonical)
    probe = Path(raw_probe)
    try:
        with os.fdopen(descriptor, "w+b") as handle:
            handle.write(b"wordflow")
            handle.flush()
            os.fsync(handle.fileno())
            handle.seek(0)
            if handle.read() != b"wordflow":
                raise OSError("Data Root probe could not be read back")
    finally:
        probe.unlink(missing_ok=True)
        fsync_directory(canonical)
    check_data_root_owner(canonical)
    return canonical


def describe_data_root_failure(path: Path, exc: BaseException) -> str:
    """Path, process identity and cause, for an operator's log (issue 425)."""

    from .shared.errors import format_exception_diagnostic

    identity = (
        f"uid {os.getuid()}, gid {os.getgid()}"
        if hasattr(os, "getuid")
        else "this account"
    )
    return (
        f"Wordflow can't use its data folder {path} (running as {identity}): "
        f"{format_exception_diagnostic(exc)}"
    )


def check_data_root_owner(root: Path) -> None:
    """Refuse a Data Root whose Wordflow data another uid created.

    Files are 0600 and folders 0700, so data stays private to the uid that wrote
    it; another uid could neither read it nor safely add to it. Stopping here
    names both uids instead of failing later on single files.
    """

    if not hasattr(os, "getuid"):
        return
    uid = os.getuid()
    for name in _OWNED_ENTRIES:
        try:
            owner = (root / name).lstat().st_uid
        except FileNotFoundError:
            continue
        if owner != uid:
            raise DataRootOwnerError(root / name, owner, uid)


__all__ = [
    "APP_IDENTIFIER",
    "DataRootConfigError",
    "DataRootOwnerError",
    "DataRootConfigStore",
    "DataRootPaths",
    "platform_cache_root",
    "check_data_root_owner",
    "describe_data_root_failure",
    "platform_data_root_paths",
    "probe_data_root",
]
