"""Acquire the pinned local quotation model outside the Python environment."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import tempfile

import httpx

from ...data_root_config import platform_cache_root

MODEL_FILENAME = "english-ewt-ud-2.5-191206.udpipe"
MODEL_SHA256 = "784bd0fa85e3d831fd02a55290d0acfd05c953159dc38cc33d52e1b28add9957"
MODEL_URL = (
    "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/"
    f"handle/11234/1-3131/{MODEL_FILENAME}"
)
_MAX_MODEL_BYTES = 32 * 1024 * 1024


def _valid_model(path: Path) -> bool:
    if not path.is_file():
        return False
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest() == MODEL_SHA256


def ensure_quotation_model() -> Path:
    """Reuse verified data or atomically publish a first-use model download.

    Simultaneous downloads are harmless: every published file has the same
    pinned checksum. No runtime writes touch the signed application bundle.
    """
    root = platform_cache_root() / "udpipe"
    destination = root / MODEL_FILENAME
    if _valid_model(destination):
        return destination

    root.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=root, prefix=".quotation-", delete=False
        ) as output:
            temporary = Path(output.name)
            digest = hashlib.sha256()
            total = 0
            with httpx.stream(
                "GET", MODEL_URL, follow_redirects=True, timeout=120.0
            ) as response:
                response.raise_for_status()
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > _MAX_MODEL_BYTES:
                        raise ValueError(
                            "Quotation model download exceeds its size limit"
                        )
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != MODEL_SHA256:
                raise ValueError("Quotation model checksum mismatch")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, destination)
        return destination
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
