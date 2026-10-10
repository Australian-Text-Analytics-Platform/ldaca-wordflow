"""Process-worker implementation for topic-modeling analysis.

Used by:
- canonical Analysis execution and backend tests that exercise topic-modeling
  computation from immutable inputs.

Flow: load workspace corpora, choose sampling and embedding settings, build topic
    payloads, and return private artifacts to the Analysis service.

The implementation is split across several sub-modules:
- ``topic_types`` — internal frozen dataclasses
- ``topic_pipeline`` — corpus sampling, c-TF-IDF vectorizer/stopword
  selection, and the Rust-pipeline runner
- ``topic_result`` — result payload building and exact reduction

Embedding, dimensionality reduction, clustering, and c-TF-IDF labeling all run
inside the ``polars_text`` Rust extension; there is no Python BERTopic or
SentenceTransformer dependency anymore.
"""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Any, cast

from ..analysis.topic_inclusion import topic_inclusion_descriptor
from ..analysis.topic_projection import (
    TopicNodeInfo,
    build_topic_projection_basis,
    build_topic_projection_payload,
    ungrouped_document_counts,
)
from .topic_pipeline import (
    _resolve_vectorizer_model,
    _run_rust_topic_modeling,
    _sample_corpora_for_topic_modeling,
)
from ..shared.document_fingerprint import document_fingerprint, require_same_documents
from .topic_result import (
    _build_empty_topic_payload,
    _coverage_by_doc_index,
)
from .topic_types import _PreparedTopicPayload
from .cpu import default_embedding_threads
from .progress import ProgressCallback, Step, StepReporter, polars_text_progress
from .utils import process_entrypoint

# Default ONNX embedder used by the Rust ORT pipeline when no override is given.
_DEFAULT_EMBEDDER_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

logger = logging.getLogger(__name__)

__all__ = [
    "run_topic_modeling_analysis",
    "run_topic_modeling_data_block_creation",
]


@process_entrypoint
def run_topic_modeling_data_block_creation(
    *,
    input_snapshot_dir: str,
    output_dir: str,
    request_payload: dict[str, Any],
    projection_context_path: str,
    source_projection: dict[uuid.UUID, dict[str, Any]],
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Materialize selected Topic Modelling rows and meanings as Data Blocks."""

    import polars as pl

    from ..analysis.generated_columns import (
        TOPIC_COLUMN,
        TOPIC_COVERAGE_COLUMN,
        TOPIC_COVERAGE_OUTPUT_COLUMN,
        TOPIC_MEANING_COLUMN,
        TOPIC_MODELING_GENERATED_COLUMNS,
        TOPIC_NAME_COLUMN,
        TOPIC_TOP1_COLUMN,
        TOPIC_TOP1_NAME_COLUMN,
    )
    from ..analysis.topic_inclusion import top_topic_ids
    from ..domain.workspace import TopicModelingDataBlockCreationAnalysisRequest
    from ..shared.topic_types import UNGROUPED_TOPIC_ID, topic_coverage_dtype
    from ..infrastructure.storage.input_snapshots import load_snapshot_node

    request = TopicModelingDataBlockCreationAnalysisRequest.model_validate(request_payload)
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    from .topic_pipeline import _project_rust_topic_modeling

    projection_context = Path(projection_context_path).read_bytes()
    projection = _project_rust_topic_modeling(
        projection_context=projection_context,
        cluster_count=request.cluster_count,
        document_count=sum(int(item["size"]) for item in source_projection.values()),
    )
    segment_assignments: list[tuple[int, int, int, int]] = []
    if request.row_unit == "topics":
        from polars_text import project_topic_segments

        try:
            segment_assignments = project_topic_segments(
                projection_context, request.cluster_count
            )
        except ValueError as exc:
            raise ValueError(
                "Adding one row per topic needs a Topic Modelling run made with this "
                "version of Wordflow. Re-run the analysis, then choose Add to Project "
                "again."
            ) from exc
    meaning_values = {
        int(topic["id"]): [
            str(candidate["word"])
            for candidate in topic.get("representative_words") or []
        ]
        for topic in projection["topics"]
    }
    meaning_values.update(
        {item.topic_id: list(item.words) for item in request.topic_meanings_override}
    )
    # Names people gave Topics at this count; the name
    # columns are added only when some Topic has one.
    topic_name_values = {item.topic_id: item.name for item in request.topic_names_override}

    outputs: list[dict[str, Any]] = []
    total = len(request.node_ids)
    for index, source_uuid in enumerate(request.node_ids):
        source_id = source_uuid
        source = load_snapshot_node(input_snapshot_dir, source_id)
        # A Data Block made from a Topic Modelling Result: the new TOPIC_
        # columns replace its old ones, which are neither carried nor joined
        # (issue 246).
        previous_topic_columns = [
            column
            for column in source.data.collect_schema().names()
            if column in TOPIC_MODELING_GENERATED_COLUMNS
        ]
        source_context = source_projection.get(source_id)
        if source_context is None:
            raise ValueError("Topic Modelling source projection is unavailable")
        # Read the source once, in memory, as the run did, and check it still
        # lists the run's documents in the same order: rows are matched by
        # position (issue 319).
        source_frame = source.data.drop(previous_topic_columns).collect()
        fingerprint = cast(str | None, source_context.get("fingerprint"))
        if fingerprint is not None:
            require_same_documents(
                source_frame, str(source_context["text_column"]), fingerprint
            )
        source_data = source_frame.lazy()
        selected_columns = [
            column
            for column in request.selected_columns[source_uuid]
            if column not in TOPIC_MODELING_GENERATED_COLUMNS
        ]
        schema = source_data.collect_schema()
        missing = [column for column in selected_columns if column not in schema]
        if missing:
            raise ValueError(f"Topic Modelling Data Block Creation columns not found: {missing}")
        offset = int(source_context["offset"])
        size = int(source_context["size"])
        row_indices = list(source_context["row_indices"])
        projected_documents = projection["documents"][offset : offset + size]
        selected_topic_ids = set(request.topic_ids or [])
        document_column: str | None = (
            source.document if source.document in selected_columns else None
        )
        if request.row_unit == "topics":
            text_column = str(source_context["text_column"])
            joined, included_top_topics = _topic_segment_rows(
                source_data=source_data,
                text_column=text_column,
                selected_columns=selected_columns,
                segment_assignments=segment_assignments,
                offset=offset,
                size=size,
                row_indices=row_indices,
                selected_topic_ids=selected_topic_ids,
            )
            document_column = text_column
            if topic_name_values:
                joined = joined.with_columns(
                    _topic_name_expression(topic_name_values).alias(TOPIC_NAME_COLUMN)
                )
        else:
            included_rows: list[int] = []
            included_top_topics: set[int] = set()
            for row_offset, document in enumerate(projected_documents):
                row_topics = top_topic_ids(
                    document.get("topic_coverage") or [],
                    request.cluster_count,
                    request.top_n_topics,
                )
                # Ungrouped (-1) holds the documents with no real Topic (issue 362).
                ungrouped = not row_topics and UNGROUPED_TOPIC_ID in selected_topic_ids
                if (
                    selected_topic_ids
                    and not row_topics.intersection(selected_topic_ids)
                    and not ungrouped
                ):
                    continue
                included_rows.append(row_offset)
                included_top_topics.update(row_topics or ({UNGROUPED_TOPIC_ID} if ungrouped else set()))
            padded_coverage = _coverage_by_doc_index(
                [
                    {
                        "doc_index": row_offset,
                        "topic_coverage": document.get("topic_coverage") or [],
                    }
                    for row_offset, document in enumerate(projected_documents)
                ],
                size,
                list(range(request.cluster_count)),
            )
            assignments = pl.DataFrame(
                {
                    "__row_nr__": pl.Series(
                        "__row_nr__",
                        [row_indices[row_offset] for row_offset in included_rows],
                        dtype=pl.Int64,
                    ),
                    TOPIC_COLUMN: pl.Series(
                        TOPIC_COLUMN,
                        [
                            int(projected_documents[row_offset]["dominant_topic"])
                            for row_offset in included_rows
                        ],
                        dtype=pl.Int64,
                    ),
                    TOPIC_COVERAGE_COLUMN: pl.Series(
                        TOPIC_COVERAGE_COLUMN,
                        [padded_coverage[row_offset] for row_offset in included_rows],
                        dtype=topic_coverage_dtype(request.cluster_count),
                    ),
                }
            ).lazy()
            joined = (
                source_data.with_row_index("__row_nr__")
                .with_columns(pl.col("__row_nr__").cast(pl.Int64))
                .join(assignments, on="__row_nr__", how="inner", maintain_order="left")
                .select(
                    *[pl.col(column) for column in selected_columns],
                    pl.col(TOPIC_COLUMN).alias(TOPIC_TOP1_COLUMN),
                    *(
                        [
                            _topic_name_expression(topic_name_values).alias(
                                TOPIC_TOP1_NAME_COLUMN
                            )
                        ]
                        if topic_name_values
                        else []
                    ),
                    pl.col(TOPIC_COVERAGE_COLUMN).alias(
                        TOPIC_COVERAGE_OUTPUT_COLUMN
                    ),
                )
            )
        topic_data_id = uuid.uuid4()
        topic_meanings_id = uuid.uuid4()
        topic_data_path = destination / f"{topic_data_id}.parquet"
        # Collected, not streamed, so row order is the one checked above.
        joined.collect().write_parquet(topic_data_path)
        topic_data = pl.scan_parquet(topic_data_path)
        output_columns = topic_data.collect_schema().names()
        record_count = int(topic_data.select(pl.len()).collect().item())
        present_topic_ids = sorted(included_top_topics)
        topic_meanings_frame = pl.DataFrame(
            {
                TOPIC_COLUMN: present_topic_ids,
                TOPIC_MEANING_COLUMN: [
                    meaning_values.get(topic_id, []) for topic_id in present_topic_ids
                ],
            },
            schema={
                TOPIC_COLUMN: pl.Int64,
                TOPIC_MEANING_COLUMN: pl.List(pl.String),
            },
        )
        if topic_name_values:
            topic_meanings_frame = topic_meanings_frame.with_columns(
                pl.Series(
                    TOPIC_NAME_COLUMN,
                    [
                        _topic_name(topic_id, topic_name_values)
                        for topic_id in present_topic_ids
                    ],
                    dtype=pl.String,
                )
            )
        topic_meanings_output_path = destination / f"{topic_meanings_id}.parquet"
        topic_meanings_frame.lazy().sink_parquet(topic_meanings_output_path)

        topic_name = request.new_node_names[source_uuid]
        topic_data_provenance = {
            "type": "derivation",
            "operation": {
                "kind": "topic_modeling_data_block_creation",
                "role": "topic_data",
                "cluster_count": request.cluster_count,
                "top_n_topics": request.top_n_topics,
                "row_unit": request.row_unit,
            },
            "inputs": [
                {
                    "role": "source",
                    "value": {"type": "node", "node_id": source_id},
                }
            ],
        }
        topic_meanings_provenance = {
            "type": "derivation",
            "operation": {
                "kind": "topic_modeling_data_block_creation",
                "role": "topic_meanings",
                "cluster_count": request.cluster_count,
                "top_n_topics": request.top_n_topics,
                "row_unit": request.row_unit,
            },
            "inputs": [
                {
                    "role": "source",
                    "value": {"type": "node", "node_id": topic_data_id},
                }
            ],
        }
        outputs.append(
            {
                "source_node_id": source_id,
                "topic_data": {
                    "data_block": {
                        "id": topic_data_id,
                        "name": topic_name,
                        "provenance": topic_data_provenance,
                        "document": document_column,
                        "color": None,
                    },
                    "parquet_path": str(topic_data_path),
                    "output_columns": output_columns,
                    "record_count": record_count,
                },
                "topic_meanings": {
                    "data_block": {
                        "id": topic_meanings_id,
                        "name": f"{topic_name} topic meanings",
                        "provenance": topic_meanings_provenance,
                        "document": None,
                        "color": None,
                    },
                    "parquet_path": str(topic_meanings_output_path),
                    "output_columns": topic_meanings_frame.columns,
                    "record_count": len(present_topic_ids),
                },
            }
        )
        if progress_callback:
            progress_callback(
                0.95 * (index + 1) / total,
                "Saving the topics…",
            )
    return {
        "state": "successful",
        "outputs": outputs,
        "message": "Topic Modelling results added to the Project",
    }


def _topic_name(topic_id: int, names: dict[int, str]) -> str:
    """A Topic's name, or "Topic 5" / "Ungrouped" as the app shows it."""

    from ..shared.topic_types import UNGROUPED_TOPIC_ID

    if topic_id == UNGROUPED_TOPIC_ID:
        return "Ungrouped"
    return names.get(topic_id) or f"Topic {topic_id}"


def _topic_name_expression(names: dict[int, str]) -> Any:
    """:func:`_topic_name` over the Topic column, so no name cell is empty."""

    import polars as pl

    from ..analysis.generated_columns import TOPIC_COLUMN
    from ..shared.topic_types import UNGROUPED_TOPIC_ID

    topic = pl.col(TOPIC_COLUMN)
    return (
        pl.when(topic == UNGROUPED_TOPIC_ID)
        .then(pl.lit("Ungrouped"))
        .otherwise(
            topic.replace_strict(
                names,
                default=pl.format("Topic {}", topic),
                return_dtype=pl.String,
            )
        )
    )


# Joins a Topic's segments within one document, in source order.
TOPIC_SEGMENT_SEPARATOR = "\n"


def _topic_segment_rows(
    *,
    source_data: Any,
    text_column: str,
    selected_columns: list[str],
    segment_assignments: list[tuple[int, int, int, int]],
    offset: int,
    size: int,
    row_indices: list[int],
    selected_topic_ids: set[int],
) -> tuple[Any, set[int]]:
    """Build one row per (document, Topic) holding only that Topic's segments.

    Called by: ``run_topic_modeling_data_block_creation`` for ``row_unit="topics"``.

    Flow: keep this source's segments (by global document index), drop outliers
    and unselected Topics, slice each span from the same text the run segmented
    (the text column as a string, nulls as ""), join a Topic's segments within a
    document in source order, and attach its share of the document's segmented
    characters, its segment count, and the selected source columns.
    """
    import polars as pl

    from ..analysis.generated_columns import (
        TOPIC_COLUMN,
        TOPIC_SEGMENT_COUNT_COLUMN,
        TOPIC_SHARE_COLUMN,
    )
    from ..shared.topic_types import UNGROUPED_TOPIC_ID

    document_characters: dict[int, int] = {}
    kept: list[tuple[int, int, int, int]] = []
    for document_index, start, end, topic_id in segment_assignments:
        local = document_index - offset
        if not 0 <= local < size:
            continue
        row = int(row_indices[local])
        document_characters[row] = document_characters.get(row, 0) + (end - start)
        # Ungrouped segments only when Ungrouped is chosen (issue 362).
        if topic_id < 0 and UNGROUPED_TOPIC_ID not in selected_topic_ids:
            continue
        if selected_topic_ids and topic_id not in selected_topic_ids:
            continue
        kept.append((row, start, end, topic_id))

    segments = pl.DataFrame(
        {
            "__row_nr__": [row for row, _, _, _ in kept],
            "__start__": [start for _, start, _, _ in kept],
            "__length__": [end - start for _, start, end, _ in kept],
            TOPIC_COLUMN: [topic_id for _, _, _, topic_id in kept],
        },
        schema={
            "__row_nr__": pl.Int64,
            "__start__": pl.Int64,
            "__length__": pl.Int64,
            TOPIC_COLUMN: pl.Int64,
        },
    )
    totals = pl.DataFrame(
        {
            "__row_nr__": list(document_characters),
            "__document_characters__": list(document_characters.values()),
        },
        schema={"__row_nr__": pl.Int64, "__document_characters__": pl.Int64},
    )
    source = source_data.with_row_index("__row_nr__").with_columns(
        pl.col("__row_nr__").cast(pl.Int64)
    )
    topic_rows = (
        source.select(
            "__row_nr__",
            pl.col(text_column).cast(pl.String).fill_null("").alias("__text__"),
        )
        .join(segments.lazy(), on="__row_nr__", how="inner")
        .with_columns(
            pl.col("__text__")
            .str.slice(pl.col("__start__"), pl.col("__length__"))
            .alias("__segment__")
        )
        .sort("__row_nr__", TOPIC_COLUMN, "__start__")
        .group_by("__row_nr__", TOPIC_COLUMN, maintain_order=True)
        .agg(
            pl.col("__segment__")
            .str.join(TOPIC_SEGMENT_SEPARATOR)
            .alias("__topic_text__"),
            pl.col("__length__").sum().alias("__topic_characters__"),
            pl.len().cast(pl.Int64).alias(TOPIC_SEGMENT_COUNT_COLUMN),
        )
        .join(totals.lazy(), on="__row_nr__", how="left")
        .with_columns(
            (
                pl.col("__topic_characters__")
                / pl.col("__document_characters__").cast(pl.Float64)
            ).alias(TOPIC_SHARE_COLUMN)
        )
    )
    carried = [column for column in selected_columns if column != text_column]
    joined = (
        topic_rows.join(
            source.select("__row_nr__", *carried),
            on="__row_nr__",
            how="left",
        )
        .sort("__row_nr__", TOPIC_COLUMN)
        .select(
            pl.col("__topic_text__").alias(text_column),
            *[pl.col(column) for column in carried],
            pl.col(TOPIC_COLUMN),
            pl.col(TOPIC_SHARE_COLUMN),
            pl.col(TOPIC_SEGMENT_COUNT_COLUMN),
        )
    )
    return joined, {topic_id for _, _, _, topic_id in kept}


# ---------------------------------------------------------------------------
# Main pipeline stages
# ---------------------------------------------------------------------------


def _load_corpora_from_snapshot(
    input_snapshot_dir: str,
    node_payloads: list[TopicNodeInfo],
) -> tuple[list[list[str]], list[TopicNodeInfo]]:
    """Return raw document lists from Analysis-owned node plan snapshots.

    Called by:
    - ``_prepare_payload`` when the Analysis invocation contains immutable
      snapshot references instead of eagerly collected corpora.

    Flow: load each snapshotted LazyFrame, resolve typed display/schema metadata,
    and collect the selected text column inside the worker process.
    """

    import polars as pl

    from ..infrastructure.storage.input_snapshots import load_snapshot_node

    raw_corpora: list[list[str]] = []
    resolved_infos: list[TopicNodeInfo] = []
    for node_info in node_payloads:
        if not node_info.text_column:
            raise ValueError("Choose a text column for each Data Block")
        from ..analysis.generated_columns import TOPIC_MODELING_GENERATED_COLUMNS

        if node_info.text_column in TOPIC_MODELING_GENERATED_COLUMNS:
            # These hold topics from an earlier run, not documents (issue 246).
            from ..shared.errors import InvalidInputError

            raise InvalidInputError(
                f"{node_info.text_column} holds topics from an earlier Topic "
                "Modelling run, not documents. Choose the column with the text "
                "to model."
            )
        snapshot_node = load_snapshot_node(input_snapshot_dir, node_info.node_id)
        resolved_infos.append(
            TopicNodeInfo(
                node_id=node_info.node_id,
                text_column=node_info.text_column,
                node_name=snapshot_node.name,
                original_columns=tuple(snapshot_node.data.collect_schema().names()),
            )
        )
        selected = snapshot_node.data.select(
            pl.col(node_info.text_column).alias("__doc_col__")
        ).collect()
        raw_corpora.append(
            [
                str(value) if value is not None else ""
                for value in selected["__doc_col__"].to_list()
            ]
        )
    return raw_corpora, resolved_infos


# The polars-text pipeline's share of a run and its steps' rough shares of
# the time on a CPU (issue 350): reading the text into the model dominates.
TOPIC_PROGRESS_BAND = (0.1, 0.85)
TOPIC_PROGRESS_STEPS = (
    Step("segmenting", "Splitting the documents into segments", weight=0.03),
    Step("embedding", "Reading the text into the model", weight=0.62),
    Step("arranging", "Arranging the segments", weight=0.1, counted=False),
    Step("grouping", "Grouping the segments into topics", weight=0.18, counted=False),
    Step("topic_words", "Finding each topic's words", weight=0.07, counted=False),
)


def _prepare_payload(
    *,
    node_infos: list[TopicNodeInfo],
    artifact_dir: str,
    corpora: list[list[str]],
    progress_callback: ProgressCallback | None,
) -> _PreparedTopicPayload:
    """Prepare payload data consumed by topic-modeling worker pipeline.

    Called by:
    - ``run_topic_modeling_analysis`` (this module).

    Flow: load workspace corpora, choose sampling and embedding settings, build
        topic payloads, and return artifacts to the Analysis service.
    """
    artifact_root = Path(artifact_dir)
    artifact_root.mkdir(parents=True, exist_ok=True)

    if len(corpora) != len(node_infos):
        raise ValueError(
            "Topic modeling payload mismatch: corpora and node_infos lengths differ"
        )

    if progress_callback:
        progress_callback(0.05, "Preparing the text…")

    return _PreparedTopicPayload(
        artifact_root=artifact_root,
        corpora=corpora,
    )


def _compute_topic_payload(
    *,
    embedding_cache_path: str,
    node_infos: list[TopicNodeInfo],
    corpora: list[list[str]],
    artifact_root: Path,
    artifact_prefix: str,
    min_cluster_size: int,
    random_seed: int,
    progress_callback: ProgressCallback | None,
    max_cluster_size: int | None = None,
    sample_fractions: list[float | None] | None,
    segmentation_method: str,
    max_segment_tokens: int,
    cluster_sample_size: int | None = None,
) -> dict[str, Any]:
    """Run the full topic-modeling pipeline: sample, run Rust, build the payload.

    Called by:
    - ``run_topic_modeling_analysis`` (this module).

    Flow: sample each corpus, pick the c-TF-IDF vectorizer from the
    document script mix, call the Rust pipeline (chunk -> ORT embed -> PaCMAP
    -> HDBSCAN -> c-TF-IDF, plus optional merge for target/exact modes), and turn
    its JSON result into the wire payload. For ``exact`` mode it also persists a
    JSON re-aggregation context so the slider can request a different count later.
    """
    sampled = _sample_corpora_for_topic_modeling(
        corpora=corpora,
        sample_fractions=sample_fractions,
        random_seed=random_seed,
    )
    if not sampled.all_docs:
        return _build_empty_topic_payload(
            sampled=sampled,
            node_infos=node_infos,
        )

    if any(size == 0 for size in sampled.corpus_sizes):
        raise ValueError("All corpora must contain at least one document.")

    random_state = int(random_seed)
    vectorizer_model = _resolve_vectorizer_model(sampled.all_docs)

    logger.info(
        "[Worker %d] Running Rust topic-modeling pipeline (%d docs, min_cluster_size=%d)",
        os.getpid(),
        len(sampled.all_docs),
        min_cluster_size,
    )
    def run_rust(progress_path: str | None) -> dict:
        return _run_rust_topic_modeling(
            all_docs=sampled.all_docs,
            seed=random_state,
            min_cluster_size=min_cluster_size,
            max_cluster_size=max_cluster_size,
            vectorizer_model=vectorizer_model,
            embedder_model=_DEFAULT_EMBEDDER_MODEL,
            embedding_cache=embedding_cache_path,
            segmentation_method=segmentation_method,
            max_segment_tokens=max_segment_tokens,
            cluster_sample_size=cluster_sample_size,
            progress_path=progress_path,
        )

    if progress_callback:
        # polars-text reports its five steps through a file (issue 350).
        reporter = StepReporter(
            progress_callback, band=TOPIC_PROGRESS_BAND, steps=TOPIC_PROGRESS_STEPS
        )
        reporter.update("segmenting", done=0, total=len(sampled.all_docs), unit="documents")
        with polars_text_progress(reporter) as progress_path:
            rust_result = run_rust(progress_path)
    else:
        rust_result = run_rust(None)

    if progress_callback:
        progress_callback(0.85, "Putting the topics together…")

    basis = build_topic_projection_basis(
        rust_result=rust_result,
        corpus_sizes=sampled.corpus_sizes,
    )
    topic_inclusion = topic_inclusion_descriptor(len(basis["topics"]))
    payload = build_topic_projection_payload(
        basis=basis,
        node_infos=node_infos,
        corpus_sizes=sampled.corpus_sizes,
        top_n_topics=int(topic_inclusion["top_n_topics"]),
    )
    natural_count = len(payload["topics"])
    raw_context = rust_result["projection_context"]
    context_path: Path | None = None
    if raw_context is not None:
        if not isinstance(raw_context, bytes):
            raise ValueError("Topic projection context is malformed")
        context_path = artifact_root / f"{artifact_prefix}_topic_projection_context.msgpack.zst"
        context_path.write_bytes(raw_context)
    payload["clustering"] = {
        "cluster_count": natural_count,
        "min_cluster_count": 1 if natural_count >= 1 else 0,
        "max_cluster_count": natural_count,
        "default_cluster_count": natural_count,
        "adjustable": natural_count > 1,
        "max_topic_size": rust_result.get("max_topic_size"),
        "clustered_segments": rust_result.get("clustered_segments"),
        "auto_decision": rust_result.get("auto_decision"),
        "auto_document_share": rust_result.get("auto_document_share"),
        "largest_topic_size": rust_result.get("largest_topic_size"),
    }
    payload["projection_context"] = {
        "version": 2,
        "artifact": str(context_path) if context_path is not None else None,
        "source_row_indices": sampled.active_corpora_indices,
        "source_document_fingerprints": [
            document_fingerprint(corpus) for corpus in corpora
        ],
    }
    payload["segment_count"] = int(rust_result.get("n_segments") or 0)
    payload["ungrouped_documents"] = ungrouped_document_counts(
        list(rust_result.get("documents") or []), sampled.corpus_sizes
    )
    logger.info(
        "Topic modeling diagnostics engine=rust backend=ort model=%s vectorizer=%s "
        "random_seed=%d corpus_sizes_before=%s corpus_sizes_after=%s",
        _DEFAULT_EMBEDDER_MODEL,
        vectorizer_model,
        random_state,
        sampled.corpus_sizes_before_sample,
        sampled.corpus_sizes,
    )
    return payload


def _compute_topic_modeling(
    node_infos: list[TopicNodeInfo],
    artifact_dir: str,
    artifact_prefix: str,
    embedding_cache_path: str,
    corpora: list[list[str]],
    min_cluster_size: int = 10,
    max_cluster_size: int | None = None,
    random_seed: int = 0,
    segmentation_method: str = "automatic",
    max_segment_tokens: int = 256,
    progress_callback: ProgressCallback | None = None,
    sample_fractions: list[float | None] | None = None,
    cluster_sample_size: int | None = None,
) -> dict[str, Any]:
    """Execute topic modeling in a worker process.

    Used by:
    - canonical topic-modeling Analysis execution, which owns submission,
      progress, cancellation, and artifact cleanup.
        Why:
        - Runs the Rust ``polars_text`` topic-modeling pipeline (ORT embeddings
            + PaCMAP + HDBSCAN + c-TF-IDF) out-of-process and returns an artifact
            manifest (Parquet outputs) for main-process lazy retrieval/finalization.

    ``min_cluster_size`` controls the smallest HDBSCAN cluster in the initial
    natural fit. The Rust pipeline manages its own in-process embedder and
    DuckDB embedding cache.

    Flow: load workspace corpora, sample, run the Rust pipeline, build topic
        payloads, and return artifacts to the Analysis service.
    """
    try:
        if progress_callback:
            progress_callback(
                0.01,
                "Loading the topic model. The first run may download model files…",
            )

        logger.info("[Worker %d] Starting topic-modeling Analysis", os.getpid())

        prepared_payload = _prepare_payload(
            node_infos=node_infos,
            artifact_dir=artifact_dir,
            corpora=corpora,
            progress_callback=progress_callback,
        )

        if progress_callback:
            progress_callback(0.07, "Loading the embedding model…")

        topic_payload = _compute_topic_payload(
            embedding_cache_path=embedding_cache_path,
            node_infos=node_infos,
            corpora=prepared_payload.corpora,
            artifact_root=prepared_payload.artifact_root,
            artifact_prefix=artifact_prefix,
            min_cluster_size=min_cluster_size,
            max_cluster_size=max_cluster_size,
            random_seed=random_seed,
            progress_callback=progress_callback,
            sample_fractions=sample_fractions,
            segmentation_method=segmentation_method,
            max_segment_tokens=max_segment_tokens,
            cluster_sample_size=cluster_sample_size,
        )

        if progress_callback:
            progress_callback(0.9, "Saving the topics…")

        result = {
            "topics": topic_payload["topics"],
            "corpus_sizes": topic_payload["corpus_sizes"],
            "sources": topic_payload["sources"],
            "clustering": topic_payload["clustering"],
            "topic_inclusion": topic_payload["topic_inclusion"],
            "projection_context": topic_payload["projection_context"],
            "segment_count": topic_payload["segment_count"],
            "ungrouped_documents": topic_payload.get("ungrouped_documents"),
        }

        logger.info("[Worker %d] Topic modeling completed successfully", os.getpid())
        return result

    except Exception as e:
        logger.error("[Worker %d] Topic modeling failed: %s", os.getpid(), e)
        raise


@process_entrypoint
def run_topic_modeling_analysis(
    *,
    node_infos: list[TopicNodeInfo],
    artifact_dir: str,
    input_snapshot_dir: str,
    embedding_cache_path: str,
    min_cluster_size: int,
    random_seed: int,
    segmentation_method: str,
    max_segment_tokens: int,
    sample_fractions: list[float | None] | None,
    progress_callback: ProgressCallback | None = None,
    max_cluster_size: int | None = None,
    cluster_sample_size: int | None = None,
) -> dict[str, Any]:
    """Run the canonical snapshot-only topic-modeling process contract."""

    default_embedding_threads()

    corpora, resolved_infos = _load_corpora_from_snapshot(
        input_snapshot_dir,
        node_infos,
    )
    return _compute_topic_modeling(
        node_infos=resolved_infos,
        artifact_dir=artifact_dir,
        artifact_prefix="topic_modeling",
        corpora=corpora,
        min_cluster_size=min_cluster_size,
        max_cluster_size=max_cluster_size,
        random_seed=random_seed,
        segmentation_method=segmentation_method,
        max_segment_tokens=max_segment_tokens,
        progress_callback=progress_callback,
        sample_fractions=sample_fractions,
        cluster_sample_size=cluster_sample_size,
        embedding_cache_path=embedding_cache_path,
    )
