"""Process-isolated portal imports; SDK owns protocol and table conversion."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from multiprocessing.queues import Queue
from pathlib import Path
from typing import Any, cast

from ldaca_data_rs import Client

from ..shared.portable_names import portable_name_error
from .invocations import DataPortalImportInput
from .utils import process_entrypoint


@process_entrypoint
def data_portal_import_process(
    *,
    progress_queue: Queue[Any],
    invocation: DataPortalImportInput,
) -> dict[str, object]:
    """Materialize one SDK table into private, quota-supervised staging."""
    report = cast(Callable[[dict[str, object]], None], progress_queue.put)
    staging = Path(invocation.staging_dir).resolve(strict=True)
    report({"fraction": 0.05, "message": "Fetching Data Portal metadata"})
    with Client(
        api_key=invocation.api_token,
        base_url=invocation.api_base_url,
        timeout=invocation.timeout,
        concurrency=invocation.download_concurrency,
        max_json_bytes=min(invocation.max_output_bytes, 8 * 1024 * 1024),
        max_document_bytes=min(invocation.max_output_bytes, 16 * 1024 * 1024),
    ) as client:
        crate = client.get_crate(invocation.identifier, rewrite_ids=True)
        corpus_name = invocation.requested_name or crate.name(invocation.identifier)
        folder_name = _safe_name(corpus_name)
        destination = staging / f"{folder_name}.parquet"
        report({"fraction": 0.25, "message": "Converting Data Portal content"})
        table = client.wordflow_table(
            invocation.identifier,
            crate,
            max_total_bytes=invocation.max_output_bytes,
        )
        table.write_parquet(destination)

    if destination.stat().st_size > invocation.max_output_bytes:
        raise ValueError("Data Portal import exceeds its storage budget")
    readme = staging / "README.md"
    readme.write_text(
        f"# {corpus_name}\n\nSource: {invocation.identifier}\n",
        encoding="utf-8",
    )
    total_bytes = destination.stat().st_size + readme.stat().st_size
    if total_bytes > invocation.max_output_bytes:
        raise ValueError("Data Portal import exceeds its storage limit")
    report({"fraction": 0.95, "message": "Portal import is ready to publish"})
    return {
        "kind": "data_portal",
        "destination_path": f"LDaCA/{folder_name}",
        "file_count": 2,
        "bytes_written": total_bytes,
    }


def _safe_name(value: str) -> str:
    """Keep the metadata title readable while making one portable path component."""

    normalized = unicodedata.normalize("NFC", value)
    normalized = re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]+', " - ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .")
    normalized = re.sub(r"\.{2,}", ".", normalized)
    # Leave room for the extension within the portable component byte limit.
    stem = normalized.encode("utf-8")[:200].decode("utf-8", errors="ignore").rstrip(" .")
    stem = stem or "LDaCA collection"
    if portable_name_error(stem, exact=True) is not None:
        stem = f"LDaCA {stem}"
    if portable_name_error(stem, exact=True) is not None:
        raise RuntimeError("Portal storage-name sanitizer produced an invalid name")
    return stem


__all__ = ["data_portal_import_process"]
