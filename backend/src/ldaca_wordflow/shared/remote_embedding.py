"""Where one Topic Modelling run embeds, when it uses a remote endpoint.

Resolved on submit (services/embedding_endpoints.py) and carried to the
worker in memory, like an Annotation key; never saved. Dependency-light, so
Analysis worker processes can import it.
"""

from __future__ import annotations

import base64
import json
from dataclasses import asdict, dataclass, field

from .errors import InvalidInputError

_RUN_PREFIX = "embedding-run:v1:"


@dataclass(frozen=True, slots=True)
class RemoteEmbeddingRun:
    """Where one Topic Modelling run embeds: everything polars-text needs."""

    endpoint: str
    served_model: str
    # A desktop endpoint's key; the worker hands it to polars-text in a
    # private temporary file. Left out of repr, so never logged.
    api_key: str | None = field(default=None, repr=False)
    # A server endpoint's key variable; the worker inherits the environment.
    api_key_env: str | None = None
    user: str | None = None
    batch_size: int | None = None
    concurrency: int | None = None


def encode_embedding_run(run: RemoteEmbeddingRun) -> str:
    payload = json.dumps(asdict(run), separators=(",", ":"))
    return _RUN_PREFIX + base64.urlsafe_b64encode(payload.encode()).decode("ascii")


def decode_embedding_run(credential: str | None) -> RemoteEmbeddingRun | None:
    """The run's endpoint, or None for any other credential."""

    if credential is None or not credential.startswith(_RUN_PREFIX):
        return None
    try:
        values = json.loads(base64.urlsafe_b64decode(credential.removeprefix(_RUN_PREFIX)))
        return RemoteEmbeddingRun(**values)
    except (ValueError, TypeError):
        raise InvalidInputError("The embedding endpoint of this run is malformed") from None


__all__ = ["RemoteEmbeddingRun", "decode_embedding_run", "encode_embedding_run"]
