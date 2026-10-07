"""Check that a Data Block still lists its documents as an analysis read them.

Topic Modelling records which row each document came from, and Add to Project
and the Topic Map colours later put results back on those rows. A Data Block
is a plan that runs again each time it is read, and a Join made by Wordflow
0.7.10 or earlier has no fixed row order, so the rows can come back in another
order (issue 319). The run records a fingerprint of the documents in order;
later readers compare it before using row positions.
"""

from __future__ import annotations

from collections.abc import Sequence
import hashlib

import polars as pl

from .errors import InvalidInputError

ROW_ORDER_CHANGED_MESSAGE = (
    "This Data Block's documents have changed, or are in a different order, since "
    "Topic Modelling ran, so the topics can't be matched to its rows. This happens "
    "after editing the text column, or with a Data Block made by Join in Wordflow "
    "0.7.10 or earlier (join the Data Blocks again). Run Topic Modelling again on "
    "the Data Block as it is now."
)


def document_fingerprint(documents: Sequence[str]) -> str:
    """A hash of the documents in order."""

    digest = hashlib.sha256()
    for document in documents:
        encoded = document.encode("utf-8")
        digest.update(len(encoded).to_bytes(8, "little"))
        digest.update(encoded)
    return digest.hexdigest()


def documents_of(frame: pl.DataFrame, column: str) -> list[str]:
    """A text column as the analysis reads it: missing values become ""."""

    return [str(value) if value is not None else "" for value in frame[column].to_list()]


def require_same_documents(
    frame: pl.DataFrame, column: str, fingerprint: str | None
) -> None:
    """Refuse when ``frame`` lists different documents, or in another order.

    Results made before fingerprints were recorded have none; they are used
    as they are.
    """

    if fingerprint is not None and document_fingerprint(documents_of(frame, column)) != fingerprint:
        raise InvalidInputError(ROW_ORDER_CHANGED_MESSAGE)
