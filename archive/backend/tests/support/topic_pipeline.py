from __future__ import annotations
from typing import Any
import polars as pl



def _fake_topic_modeling_expr_factory(
    *,
    documents: list[dict[str, Any]],
    topics: list[dict[str, Any]],
    n_segments: int,
    coverage: list[list[dict[str, Any]]] | None = None,
    seen_kwargs: dict[str, Any] | None = None,
):
    """Build a fake ``.text.topic_modeling`` method returning a canned struct.

    The real expression returns one scalar run result with independent document
    outcomes and complete topic metadata. The fake mirrors that nested shape so
    backend validation can be tested without running the Rust pipeline.
    """

    documents = [
        {
            **document,
            "topic_coverage": (
                coverage[index]
                if coverage is not None
                else document.get(
                    "topic_coverage",
                    [
                        {
                            "topic_id": int(document["dominant_topic"]),
                            "coverage": 1.0,
                        }
                    ]
                    if int(document["dominant_topic"]) >= 0
                    else [],
                )
            ),
        }
        for index, document in enumerate(documents)
    ]

    def _fake(self, **kwargs):  # noqa: ANN001 - mirrors namespace method shape
        if seen_kwargs is not None:
            seen_kwargs.update(kwargs)
        return pl.struct(
            pl.Series(
                "documents",
                [documents],
                dtype=pl.List(
                    pl.Struct(
                        {
                            "doc_index": pl.UInt32,
                            "dominant_topic": pl.Int32,
                            "topic_coverage": pl.List(
                                pl.Struct(
                                    {"topic_id": pl.Int32, "coverage": pl.Float32}
                                )
                            ),
                        }
                    )
                ),
            ),
            pl.Series(
                "topics",
                [topics],
                dtype=pl.List(
                    pl.Struct(
                        {
                            "id": pl.Int32,
                            "representative_words": pl.List(
                                pl.Struct(
                                    {"word": pl.String, "occurrence_count": pl.UInt64}
                                )
                            ),
                            "x": pl.Float32,
                            "y": pl.Float32,
                        }
                    )
                ),
            ),
            pl.lit(n_segments, dtype=pl.UInt32).alias("n_segments"),
            pl.lit(b"context", dtype=pl.Binary).alias("projection_context"),
        )

    return _fake
