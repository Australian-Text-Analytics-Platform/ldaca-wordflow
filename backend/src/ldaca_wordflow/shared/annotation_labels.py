"""Labels an AI annotation run has received so far (issue 371).

The worker appends each successful batch to a JSON-lines file in the run's
scratch folder as soon as it returns, written through to disk. The backend
reads it into a temporary label Data Block while the run goes, when it stops
or fails, and after a crash, so labels already paid for are not lost.
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Sequence
from pathlib import Path

ANNOTATION_LABELS_FILE = "annotation-labels.jsonl"
# Fixed namespace: the temporary Data Block of a run has an id derived from
# the run's, so a crash recovery finds and updates the same block.
_PROGRESS_NODE_NAMESPACE = uuid.UUID("6f1d6b8e-3c0b-4a4e-9a55-371000000371")


def annotation_labels_path(scratch_dir: Path) -> Path:
    return Path(scratch_dir) / ANNOTATION_LABELS_FILE


def annotation_progress_node_id(analysis_id: uuid.UUID) -> uuid.UUID:
    """The temporary label Data Block's id for one run."""

    return uuid.uuid5(_PROGRESS_NODE_NAMESPACE, str(analysis_id))


def append_labels(path: Path, texts: Sequence[str], labels: Sequence[str | None]) -> None:
    """Append one batch and force it to disk before the next batch counts."""

    lines = "".join(
        json.dumps({"text": text, "label": label}, ensure_ascii=False) + "\n"
        for text, label in zip(texts, labels, strict=True)
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(lines)
        handle.flush()
        os.fsync(handle.fileno())


def read_labels(path: Path) -> dict[str, str | None]:
    """Every text's latest label; a line cut short by a crash is skipped."""

    labels: dict[str, str | None] = {}
    try:
        handle = open(path, encoding="utf-8")
    except FileNotFoundError:
        return labels
    with handle:
        for line in handle:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(entry, dict) or not isinstance(entry.get("text"), str):
                continue
            label = entry.get("label")
            labels[entry["text"]] = label if isinstance(label, str) else None
    return labels


__all__ = [
    "ANNOTATION_LABELS_FILE",
    "annotation_labels_path",
    "annotation_progress_node_id",
    "append_labels",
    "read_labels",
]
