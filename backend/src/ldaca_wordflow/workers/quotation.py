"""Process-worker implementations for quotation Analysis execution.

Used by:
- canonical Analysis execution and backend tests that exercise quotation
  computation from immutable inputs.

Flow: normalize source text, run local or remote quotation extraction, preserve
    source-row mappings, and return the owning Analysis result or child Data
    Block payload.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any
import uuid

from ..analysis.generated_columns import (
    QUOTE_COLUMN_NAMES,
    QUOTE_EXTRACTION_COLUMN,
)
from .concordance import SOURCE_ROW_ID_COLUMN
from .progress import ProgressCallback, Step, StepReporter, keep_alive, process_tree_cpu
from .utils import process_entrypoint

# Finding quotations is nearly all of a run (issue 350), so the bar follows
# the documents checked (issue 381).
QUOTATION_PROGRESS_BAND = (0.04, 0.95)
# Tasks while Stop keeps the Run's result (issue 381).
STOPPING_NOTE = (
    "Stopping: keeping the quotations found so far (a few seconds). "
    "Choose Stop again to end now."
)
# Texts per chunk handed to one extraction process (issue 381).
QUOTATION_CHUNK_TEXTS = 20
# Finished chunks are written to disk at most this often, so the tab can show
# them and a stopped Run keeps them (issue 381). More often at first: chunks
# finish out of order and the tab shows only documents up to the first one
# not done, so the first rows need the first chunk on disk.
QUOTATION_FLUSH_SECONDS = 10.0
QUOTATION_EARLY_FLUSH_SECONDS = 2.0
QUOTATION_EARLY_SECONDS = 30.0

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ..infrastructure.storage.input_snapshots import SnapshotNode
    from ..models.quotation import ResolvedQuotationEngine


def _collect_quotation_source_from_snapshot(
    *,
    snapshot_node: SnapshotNode,
    document_column: str,
) -> tuple[
    list[str],
    dict[str, list[Any]],
    dict[str, Any],
    list[int],
]:
    """Collect quotation source rows inside the worker process.

    Flow: select the document and metadata columns from the immutable input
    snapshot, filter blank documents, and return aligned values.
    """

    import polars as pl

    from ..shared.unsupported_columns import supported_metadata_columns

    from ..analysis.generated_columns import without_previous_quotation_columns

    # A Data Block made from a Quotation Result: this run replaces its QUOTE_
    # columns instead of carrying them as metadata (issue 245).
    # A text column named like a Quotation column becomes QUOTE_source, and
    # that name is what the Result records (issue 245).
    node_data, document_column = without_previous_quotation_columns(
        snapshot_node.data, document_column
    )
    schema = node_data.collect_schema()
    if SOURCE_ROW_ID_COLUMN in schema:
        raise ValueError(f"Source column name is reserved: {SOURCE_ROW_ID_COLUMN}")
    node_data = node_data.with_row_index(SOURCE_ROW_ID_COLUMN)
    # Metadata is cast back from Python lists, which Topic Coverage cannot
    # survive, so it is left out (issue 200).
    metadata_columns = supported_metadata_columns(schema, exclude=(document_column,))

    corpus_df = (
        node_data.select(
            [
                pl.col(SOURCE_ROW_ID_COLUMN),
                pl.col(document_column),
                *[pl.col(c) for c in metadata_columns],
            ]
        )
        .filter(
            pl.col(document_column)
            .cast(pl.Utf8, strict=False)
            .str.strip_chars()
            .str.len_chars()
            .fill_null(0)
            > 0
        )
        .collect()
    )
    node_corpus = [
        str(value) if value is not None else ""
        for value in corpus_df.get_column(document_column).to_list()
    ]
    extra_columns_data: dict[str, list[Any]] = {}
    extra_columns_dtypes: dict[str, Any] = {}
    for column in metadata_columns:
        series = corpus_df.get_column(column)
        extra_columns_data[column] = series.to_list()
        extra_columns_dtypes[column] = series.dtype
    return (
        node_corpus,
        extra_columns_data,
        extra_columns_dtypes,
        [int(value) for value in corpus_df.get_column(SOURCE_ROW_ID_COLUMN).to_list()],
    )


@process_entrypoint
def run_quotation_run_all(
    artifact_dir: str,
    input_snapshot_dir: str,
    parent_node_id: uuid.UUID,
    document_column: str,
    engine: ResolvedQuotationEngine,
    quotation_service_max_batch_size: int,
    quotation_service_timeout: float,
    progress_callback: ProgressCallback,
    parts_dir: str | None = None,
    resume_path: str | None = None,
) -> dict[str, Any]:
    """Compute one complete immutable Quotation Result table.

    Each distinct text is extracted once, on several processes for the local
    engine. Finished chunks go to ``parts_dir`` as they return; texts in
    ``resume_path`` (kept from a Run that stopped) are not extracted again
    (issue 381).
    """
    try:
        progress_callback(0.02, "Loading the quotation extractor…")

        import asyncio
        import os

        import polars as pl

        from ..analysis.quotation_core import compute_quotation_groups
        from ..domain.workspace import QuotationEngineType
        from ..infrastructure.providers.quotation_client import (
            QuotationProviderClient,
        )
        from ..infrastructure.storage.input_snapshots import load_snapshot_node

        logger.info("[Worker %d] Starting quotation Run All", os.getpid())
        source_snapshot = load_snapshot_node(input_snapshot_dir, parent_node_id)

        progress_callback(0.03, "Preparing the text…")
        node_corpus, extra_columns_data, extra_columns_dtypes, source_row_ids = (
            _collect_quotation_source_from_snapshot(
                snapshot_node=source_snapshot,
                document_column=document_column,
            )
        )
        # The collector renamed a text column named like a Quotation column to
        # QUOTE_source; the Result stores and reports that name (issue 245).
        from ..analysis.generated_columns import source_text_column_name

        document_column = source_text_column_name(
            source_snapshot.data.collect_schema().names(), document_column, "QUOTE"
        )
        # Documents done, the time left and processor use (issue 350).
        quotation_reporter = StepReporter(
            progress_callback,
            band=QUOTATION_PROGRESS_BAND,
            steps=(Step("finding", "Finding quotations"),),
            cpu_clock=process_tree_cpu,
        )
        quotation_reporter.update(
            "finding", done=0, total=len(node_corpus), unit="documents checked"
        )

        input_data: dict[str, list] = {
            SOURCE_ROW_ID_COLUMN: source_row_ids,
            document_column: node_corpus,
            QUOTE_EXTRACTION_COLUMN: node_corpus,
        }
        input_data.update(extra_columns_data)
        base_df = pl.DataFrame(input_data)
        base_df = base_df.with_columns(
            [
                pl.col(column).cast(dtype)
                for column, dtype in extra_columns_dtypes.items()
            ]
        )

        import time
        from collections import Counter

        from ..analysis.quotation_core import QUOTATION_GROUP_COLUMN, QUOTATION_GROUP_DTYPE
        from ..analysis.quotation_extractor import extract_quotations_in_chunks
        from ..analysis.quotation_parts import (
            PART_TEXT_COLUMN,
            quotation_stop_path,
            write_part,
        )
        from .cpu import quotation_processes

        # Stop asks the Run to keep what it found: no new chunk starts, the
        # ones under way finish, and the result holds the documents checked.
        stop_path = (
            quotation_stop_path(Path(parts_dir).parent) if parts_dir is not None else None
        )
        stopping = False

        def should_stop() -> bool:
            nonlocal stopping
            if not stopping and stop_path is not None and stop_path.exists():
                stopping = True
                quotation_reporter.update(
                    "finding",
                    done=done_rows,
                    total=len(node_corpus),
                    unit="documents checked",
                    note=STOPPING_NOTE,
                )
            return stopping

        rows_per_text = Counter(node_corpus)
        found: dict[str, list[dict[str, Any]]] = {}
        parts_path = Path(parts_dir) if parts_dir is not None else None
        buffered_texts: list[str] = []
        buffered_quotations: list[list[dict[str, Any]]] = []
        last_flush = time.monotonic()
        done_rows = 0

        flushed_once = False
        started = time.monotonic()

        def flush() -> None:
            nonlocal last_flush, flushed_once
            last_flush = time.monotonic()
            if parts_path is None or not buffered_texts:
                return
            flushed_once = True
            try:
                write_part(parts_path, buffered_texts, buffered_quotations)
            except OSError:
                # Keeping progress must never fail the Run itself.
                logger.exception("Could not keep quotations path=%s", parts_path)
            buffered_texts.clear()
            buffered_quotations.clear()

        def record(texts: list[str], quotations: list[list[dict[str, Any]]]) -> None:
            nonlocal done_rows
            for text, quotes in zip(texts, quotations, strict=True):
                found[text] = quotes
                done_rows += rows_per_text[text]
            buffered_texts.extend(texts)
            buffered_quotations.extend(quotations)
            quotation_reporter.update(
                "finding",
                done=done_rows,
                total=len(node_corpus),
                unit="documents checked",
                note=STOPPING_NOTE
                if stopping
                else None,
            )
            now = time.monotonic()
            interval = (
                QUOTATION_EARLY_FLUSH_SECONDS
                if now - started < QUOTATION_EARLY_SECONDS
                else QUOTATION_FLUSH_SECONDS
            )
            if not flushed_once or now - last_flush >= interval:
                flush()

        if resume_path is not None and Path(resume_path).is_file():
            resumed = pl.read_parquet(resume_path)
            kept = [
                (text, quotes)
                for text, quotes in zip(
                    resumed.get_column(PART_TEXT_COLUMN).to_list(),
                    resumed.get_column(QUOTATION_GROUP_COLUMN).to_list(),
                    strict=True,
                )
                if text in rows_per_text
            ]
            if kept:
                record([text for text, _ in kept], [quotes or [] for _, quotes in kept])
                flush()
        todo = [text for text in rows_per_text if text not in found]

        async def extract_remote_texts() -> None:
            client = QuotationProviderClient(default_timeout=quotation_service_timeout)

            async def run_inline(function, *args):
                return function(*args)

            async def extract_remote(resolved_engine, documents):
                return await client.extract(resolved_engine, documents)

            try:
                step = max(1, quotation_service_max_batch_size)
                for start in range(0, len(todo), step):
                    if should_stop():
                        break
                    chunk = todo[start : start + step]
                    grouped = await compute_quotation_groups(
                        pl.DataFrame({document_column: chunk}),
                        document_column,
                        engine,
                        extract_remote_fn=extract_remote,
                        run_blocking=run_inline,
                        quotation_service_max_batch_size=quotation_service_max_batch_size,
                    )
                    record(chunk, grouped.get_column(QUOTATION_GROUP_COLUMN).to_list())
            finally:
                await client.close()

        with keep_alive(quotation_reporter):
            if engine.type is QuotationEngineType.REMOTE:
                asyncio.run(extract_remote_texts())
            else:
                processes = quotation_processes()
                logger.info(
                    "[Worker %d] Quotation Run: %d texts to extract on %d processes",
                    os.getpid(),
                    len(todo),
                    processes,
                )
                extract_quotations_in_chunks(
                    todo,
                    processes=processes,
                    chunk_size=QUOTATION_CHUNK_TEXTS,
                    on_chunk=record,
                    should_stop=should_stop,
                )
        flush()
        stopped_early = any(text not in found for text in rows_per_text)
        if stopped_early:
            base_df = base_df.filter(pl.col(document_column).is_in(list(found)))
        extracted = base_df.with_columns(
            pl.Series(
                QUOTATION_GROUP_COLUMN,
                [found[text] for text in base_df.get_column(document_column).to_list()],
                dtype=QUOTATION_GROUP_DTYPE,
            )
        )
        quote_df = (
            extracted
            .filter(pl.col("quotation").list.len().fill_null(0) > 0)
            .sort(SOURCE_ROW_ID_COLUMN)
        )
        match_count_value = quote_df.select(pl.col("quotation").list.len().sum()).item()
        match_count = int(match_count_value or 0)
        output_columns = list(quote_df.columns)

        progress_callback(0.95, "Saving the results…")

        result_path = Path(artifact_dir) / "quotation-run-all.parquet"
        result_path.parent.mkdir(parents=True, exist_ok=True)
        quote_df.write_parquet(result_path)

        progress_callback(0.98, "Saving the results…")

        logger.info("[Worker %d] Quotation Run All completed successfully", os.getpid())

        return {
            "state": "successful",
            "source": {
                "node_id": parent_node_id,
                "node_name": source_snapshot.name,
                "color": source_snapshot.color,
                "document_column": document_column,
                "metadata_columns": [
                    column
                    for column in output_columns
                    if column
                    not in {
                        SOURCE_ROW_ID_COLUMN,
                        document_column,
                        QUOTE_EXTRACTION_COLUMN,
                        "quotation",
                        *QUOTE_COLUMN_NAMES,
                    }
                ],
                "analysis_columns": [
                    QUOTE_EXTRACTION_COLUMN,
                    *QUOTE_COLUMN_NAMES,
                ],
                "internal_columns": [SOURCE_ROW_ID_COLUMN],
                "table": {
                    "table_id": "quotation-run-all",
                    "artifact": str(result_path),
                    "supports_density": False,
                },
                "source_document_count": len(node_corpus),
                "document_count": int(quote_df.height),
                "match_count": match_count,
            },
            "message": (
                f"Quotation Run stopped after {done_rows:,} of {len(node_corpus):,} documents"
                if stopped_early
                else "Quotation Run completed successfully"
            ),
            **({"checked_document_count": done_rows} if stopped_early else {}),
        }
    except Exception:
        logger.exception("Quotation Run All failed")
        raise
