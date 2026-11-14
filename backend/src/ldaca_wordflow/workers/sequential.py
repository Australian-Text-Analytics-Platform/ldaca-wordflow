"""Process-worker implementation for sequential Analysis execution.

The Analysis service hands this worker an immutable LazyFrame snapshot and
request payload. The worker performs the Polars aggregation and returns the
result payload that the service persists on the Analysis.
"""

from __future__ import annotations

from contextlib import ExitStack
import logging
from pathlib import Path
from typing import Any
import uuid

from .progress import ProgressCallback, Step, StepReporter, polars_text_progress
from .utils import process_entrypoint

logger = logging.getLogger(__name__)

# Tokenising the reference takes most of a run with a model tokeniser.
_TOKENIZE_PROGRESS_BAND = (0.1, 0.7)
_REFERENCE_WORD_COUNT_COLUMN = "__wordflow_trends_reference_words"


@process_entrypoint
def run_sequential_analysis(
    input_snapshot_dir: str,
    node_id: uuid.UUID,
    artifact_dir: str,
    request_payload: dict[str, Any],
    token_cache_path: str | None = None,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Execute sequential Analysis inside a worker process.

    Used by:
    - the canonical Analysis execution registry because submission must return
      without waiting for computation.

    Flow: load the snapshotted node plan, and the reference Data Block's plan
    with its words counted when the request normalises against one, invoke
    the existing pure-Polars aggregation, and return a JSON-safe payload for
    the Analysis service to publish on the canonical Analysis resource.
    """

    try:
        if progress_callback:
            progress_callback(0.05, "Loading the data…")

        import polars as pl

        from ..infrastructure.storage.input_snapshots import load_snapshot_node
        from ..analysis.sequential_core import (
            SEQUENTIAL_GROUP_INDEX_COLUMN,
            SEQUENTIAL_PERIOD_INDEX_COLUMN,
            SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN,
            SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN,
            _build_sequential_result_frames,
            reference_group_columns,
        )
        from ..analysis.token_cache import PLAIN_WORDS_EN_MODEL, tokenize_lazyframe
        from ..domain.workspace import SequentialAnalysisRequest
        from ..shared.table_transport import write_ipc_stream

        if "node_id" in request_payload:
            raise ValueError("Sequential node_id must use the snapshot selector")
        snapshot_node = load_snapshot_node(input_snapshot_dir, node_id)
        request = SequentialAnalysisRequest.model_validate(
            {"node_id": node_id, **request_payload}
        )

        reference: pl.LazyFrame | None = None
        reference_word_count_column: str | None = None
        reference_descriptor: dict[str, Any] | None = None
        if request.reference_node_id is not None:
            reference_node = load_snapshot_node(input_snapshot_dir, request.reference_node_id)
            reference = reference_node.data
            shared, ignored = reference_group_columns(
                request.group_by_columns, reference.collect_schema()
            )
            reference_descriptor = {
                "node_id": reference_node.id,
                "node_name": reference_node.name,
                "text_column": request.reference_text_column,
                "tokenizer_model": request.reference_tokenizer_model,
                "group_by_columns": shared,
                "ignored_group_by_columns": ignored,
            }
            keep = [request.time_column, *shared]
            if request.reference_text_column is None:
                reference = reference.select(*keep)
            else:
                model = request.reference_tokenizer_model or PLAIN_WORDS_EN_MODEL
                with ExitStack() as progress_stack:
                    progress_path: str | None = None
                    if progress_callback is not None and model != PLAIN_WORDS_EN_MODEL:
                        # A first run with a model tokeniser can take long (issue 350).
                        total = int(reference.select(pl.len()).collect().item())
                        reporter = StepReporter(
                            progress_callback,
                            band=_TOKENIZE_PROGRESS_BAND,
                            steps=(
                                Step(
                                    "tokenizing",
                                    f"Counting the words in {reference_node.name}",
                                ),
                            ),
                        )
                        reporter.update("tokenizing", done=0, total=total, unit="documents")
                        progress_path = progress_stack.enter_context(
                            polars_text_progress(reporter, total=total)
                        )
                    elif progress_callback:
                        progress_callback(
                            0.1, f"Counting the words in {reference_node.name}…"
                        )
                    tokenized, tokenization_column = tokenize_lazyframe(
                        data=reference,
                        source_column=request.reference_text_column,
                        model=model,
                        cache_path=token_cache_path,
                        progress_path=progress_path,
                    )
                    reference_word_count_column = _REFERENCE_WORD_COUNT_COLUMN
                    # Counted here, while the progress poller runs; the core
                    # reads the small result, not the tokens.
                    reference = (
                        tokenized.select(
                            *keep,
                            pl.col(tokenization_column)
                            .list.len()
                            .cast(pl.Int64)
                            .alias(reference_word_count_column),
                        )
                        .collect()
                        .lazy()
                    )

        if progress_callback:
            progress_callback(0.75, "Counting rows per period…")

        result_df, publication_df = _build_sequential_result_frames(
            snapshot_node.data,
            time_column=request.time_column,
            group_by_columns=request.group_by_columns,
            frequency=request.frequency,
            sort_by_time=request.sort_by_time,
            column_type=request.column_type,
            numeric_origin=request.numeric_origin,
            numeric_interval=request.numeric_interval,
            custom_interval_value=request.custom_interval_value,
            custom_interval_unit=request.custom_interval_unit,
            reference=reference,
            reference_word_count_column=reference_word_count_column,
        )

        result_path = Path(artifact_dir) / "result.arrows"
        publication_path = Path(artifact_dir) / "publication.parquet"
        result_path.parent.mkdir(parents=True, exist_ok=True)
        write_ipc_stream(result_df, str(result_path))
        publication_df.write_parquet(publication_path)

        source_columns = [
            column
            for column in publication_df.columns
            if column
            not in {
                SEQUENTIAL_PUBLICATION_PERIOD_INDEX_COLUMN,
                SEQUENTIAL_PUBLICATION_GROUP_INDEX_COLUMN,
            }
        ]

        return {
            "state": "successful",
            "table": {
                "table_id": "result",
                "artifact": str(result_path),
            },
            "publication_artifact": str(publication_path),
            "source": {
                "node_id": snapshot_node.id,
                "node_name": snapshot_node.name,
                "document_column": snapshot_node.document,
                "columns": source_columns,
                "period_count": result_df.get_column(
                    SEQUENTIAL_PERIOD_INDEX_COLUMN
                ).n_unique(),
                "group_count": result_df.get_column(
                    SEQUENTIAL_GROUP_INDEX_COLUMN
                ).n_unique(),
                "reference": reference_descriptor,
            },
        }
    except Exception:
        logger.exception(
            "Sequential Analysis failed for node=%s",
            node_id,
        )
        raise


__all__ = ["run_sequential_analysis"]
