"""Writable model caches for a server running under any uid (issue 425).

The server image keeps the models it prefetched under /opt/wordflow, readable
by every uid and written by none: on a cluster the container may run as any
account. When a cache folder named by one of ``CACHE_VARIABLES`` can't be
written by this process, new downloads go to ``<data root>/.cache/runtime``
(or the temp folder when the Data Root can't take them), and the prefetched
entries are linked in so they still load without a download. Each move is
logged once. Desktops leave these variables unset, so nothing changes there.

Runs before the model libraries are imported: they read the variables once.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# Variable -> folder name in the fallback root.
CACHE_VARIABLES = {
    "HF_HOME": "huggingface",
    "XDG_CACHE_HOME": "xdg",
    "LINDERA_DICT_PATH": "lindera",
}
# Prefetched entries are linked at this depth (``hub/models--x`` in a Hugging
# Face cache, ``<app>/spacy`` in the XDG cache); shallower folders are made
# writable so new entries can sit beside them.
_LINK_DEPTH = 2


def _writable(folder: Path) -> bool:
    """Whether this process can create files in ``folder``, creating it if needed."""

    try:
        # Each new level private, as Wordflow's own folders are.
        for level in reversed([folder, *folder.parents]):
            if not level.exists():
                level.mkdir(mode=0o700, exist_ok=True)
        descriptor, probe = tempfile.mkstemp(prefix=".wordflow-probe.", dir=folder)
    except OSError:
        return False
    os.close(descriptor)
    Path(probe).unlink(missing_ok=True)
    return True


def _link_entries(source: Path, target: Path, depth: int) -> None:
    """Mirror ``source`` into ``target``: folders above ``depth``, links at it."""

    try:
        entries = list(source.iterdir())
    except OSError:
        return
    for entry in entries:
        destination = target / entry.name
        if depth > 1 and entry.is_dir() and not entry.is_symlink():
            destination.mkdir(exist_ok=True)
            _link_entries(entry, destination, depth - 1)
        elif not destination.exists() and not destination.is_symlink():
            try:
                destination.symlink_to(entry)
            except OSError:
                # Another process linked it first, or links aren't allowed:
                # the entry then downloads again on first use.
                continue


def _fallback_root(data_root: Path | None) -> Path:
    if data_root is not None:
        candidate = data_root / ".cache" / "runtime"
        if _writable(candidate):
            return candidate
    return Path(tempfile.gettempdir()) / "wordflow-cache"


def route_unwritable_caches(data_root: Path | None) -> dict[str, Path]:
    """Point unwritable cache variables at a writable folder; returns the moves."""

    moved: dict[str, Path] = {}
    root: Path | None = None
    for variable, name in CACHE_VARIABLES.items():
        configured = os.environ.get(variable, "").strip()
        if not configured:
            continue
        original = Path(configured)
        if _writable(original):
            continue
        if root is None:
            root = _fallback_root(data_root)
        target = root / name
        if not _writable(target):
            logger.warning(
                "%s (%s) isn't writable, and neither is %s: new downloads will fail",
                variable,
                original,
                target,
            )
            continue
        _link_entries(original, target, _LINK_DEPTH)
        os.environ[variable] = str(target)
        moved[variable] = target
        logger.info(
            "%s (%s) isn't writable by uid %s; new downloads go to %s",
            variable,
            original,
            os.getuid() if hasattr(os, "getuid") else "?",
            target,
        )
    return moved


__all__ = ["CACHE_VARIABLES", "route_unwritable_caches"]
