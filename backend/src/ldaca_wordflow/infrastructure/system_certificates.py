"""Verify outbound HTTPS against the operating system's certificates (issue 391).

University and company networks often inspect TLS (Zscaler and similar): they
re-sign every site's certificate with their own root, which the managed
computer's operating system trusts. Python's HTTPS clients check against
certifi's bundled list instead, which lacks those roots, so on such networks
every call from the backend failed: Data Portal, sample data, AI providers
and the new-version check.

truststore makes Python's ``ssl`` module (and so httpx, the AI SDKs and
requests) verify against the macOS Keychain or the Windows certificate store.
Linux keeps certifi's bundle as before: the hosted server and Binder run on
Linux and reach these services without TLS inspection.

Call ``use_system_certificates`` once in every process before it opens an
HTTPS connection: the CLI's main process, the ``asgi`` module uvicorn imports
directly, and each spawned worker, which starts a fresh interpreter.
"""

from __future__ import annotations

import logging
import sys

logger = logging.getLogger(__name__)

_PLATFORMS = ("darwin", "win32")
_applied = False


def use_system_certificates() -> None:
    """Make this process trust the operating system's certificate store."""

    global _applied
    if _applied or sys.platform not in _PLATFORMS:
        return
    _applied = True
    try:
        import truststore

        truststore.inject_into_ssl()
    except Exception:  # Wordflow must still start with the bundled certificates.
        logger.warning(
            "Could not use the system certificate store; using the bundled one",
            exc_info=True,
        )


__all__ = ["use_system_certificates"]
