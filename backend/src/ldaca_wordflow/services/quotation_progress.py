"""The temporary Data Block of a Quotation Run that stopped (issue 381).

A Run that stops, fails or is interrupted leaves the quotations it found in
the Project as a Data Block with the source's text column and the quotations,
one row per distinct text. The next Run on the same Data Block, column and
engine reads it and extracts only the other texts; a successful Run removes
it. Like the annotation labels (issue 371), it is kept in the Project rather
than in the run's private folder, which every outcome removes.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import polars as pl

from ..analysis.quotation_core import QUOTATION_GROUP_COLUMN
from ..analysis.quotation_parts import (
    PART_TEXT_COLUMN,
    PARTS_SCHEMA,
    quotation_progress_node_id,
)
from ..domain.workspace import AnalysisRecord, Node, Workspace
from ..domain.workspace.analysis import (
    QuotationAnalysisRequest,
    QuotationEngineType,
    QuotationRunAllAnalysisRequest,
    RemoteQuotationEngineSelection,
)
from ..domain.workspace.provenance import (
    DerivationInput,
    DerivationProvenance,
    QuotationProgressDerivation,
    node_reference,
)
from ..infrastructure.storage.durable_fs import fsync_directory, mkdir_durable

PROGRESS_NAME_SUFFIX = " · quotations in progress"


def _operation(request: QuotationAnalysisRequest) -> QuotationProgressDerivation:
    engine = request.engine
    return QuotationProgressDerivation(
        column=request.column,
        engine_type="remote" if engine.type is QuotationEngineType.REMOTE else "local",
        engine_id=engine.engine_id
        if isinstance(engine, RemoteQuotationEngineSelection)
        else None,
    )


def quotation_progress_operation(node: Node) -> QuotationProgressDerivation | None:
    provenance = node.provenance
    if isinstance(provenance, DerivationProvenance) and isinstance(
        provenance.operation, QuotationProgressDerivation
    ):
        return provenance.operation
    return None


def is_quotation_progress_node(node: Node) -> bool:
    return quotation_progress_operation(node) is not None


def _source_id(node: Node) -> uuid.UUID | None:
    provenance = node.provenance
    if not isinstance(provenance, DerivationProvenance) or not provenance.inputs:
        return None
    return getattr(provenance.inputs[0].value, "node_id", None)


def matching_progress_nodes(
    workspace: Workspace, request: QuotationAnalysisRequest
) -> list[Node]:
    """Kept quotations a Run with this source, column and engine can reuse."""

    wanted = _operation(request)
    return [
        node
        for node in workspace.nodes.values()
        if quotation_progress_operation(node) == wanted
        and _source_id(node) == request.node_id
    ]


def resume_frame(workspace: Workspace, request: QuotationAnalysisRequest) -> pl.DataFrame:
    """Every kept text with its quotations, for the next Run to skip."""

    frames = []
    for node in matching_progress_nodes(workspace, request):
        frame = node.data.collect()
        if request.column not in frame.columns or QUOTATION_GROUP_COLUMN not in frame.columns:
            continue
        frames.append(
            frame.select(
                pl.col(request.column).cast(pl.String).alias(PART_TEXT_COLUMN),
                pl.col(QUOTATION_GROUP_COLUMN),
            )
        )
    if not frames:
        return pl.DataFrame(schema=PARTS_SCHEMA)
    return pl.concat(frames, how="vertical_relaxed").unique(
        subset=PART_TEXT_COLUMN, keep="last", maintain_order=True
    )


def save_quotation_progress(
    workspace: Workspace,
    workspace_path: Path,
    record: AnalysisRecord,
    found: pl.DataFrame,
) -> Path | None:
    """Create or refresh a stopped Run's Data Block; returns the file written.

    Does nothing when nothing was found, for another kind of run, or when the
    source Data Block is gone. The caller commits, and rolls the file back on
    failure.
    """

    request = record.request
    if not isinstance(request, QuotationRunAllAnalysisRequest) or found.height == 0:
        return None
    source = request.source
    source_node = workspace.nodes.get(source.node_id)
    if source_node is None:
        return None
    node_id = quotation_progress_node_id(record.id)
    frame = found.select(
        pl.col(PART_TEXT_COLUMN).alias(source.column),
        pl.col(QUOTATION_GROUP_COLUMN),
    )
    data_dir = workspace_path / "data"
    mkdir_durable(data_dir)
    path = data_dir / f"{node_id}-{uuid.uuid4().hex[:12]}.parquet"
    temporary = path.with_name(f".{path.name}.tmp")
    frame.write_parquet(temporary)
    temporary.replace(path)
    fsync_directory(data_dir)
    lazyframe = pl.scan_parquet(path.resolve(strict=True))
    # This block holds every kept text the Run started from, so older ones
    # for the same settings are no longer needed.
    for older in matching_progress_nodes(workspace, source):
        if older.id != node_id and not older.children:
            workspace.remove_node(older.id)
    existing = workspace.nodes.get(node_id)
    if existing is not None:
        existing.data = lazyframe
        return path
    node = Node(
        id=node_id,
        data=lazyframe,
        name=f"{source_node.name}{PROGRESS_NAME_SUFFIX}",
        provenance=DerivationProvenance(
            operation=_operation(source),
            inputs=[DerivationInput(role="source", value=node_reference(source_node.id))],
        ),
        document=source.column,
        parents=[source_node],
    )
    workspace.add_node(node)
    workspace.place_node_after_parent(node)
    return path


def discard_quotation_progress(
    workspace: Workspace, request: QuotationAnalysisRequest
) -> int:
    """After a successful Run, remove the kept quotations it superseded.

    A Data Block something was built on stays.
    """

    removed = 0
    for node in matching_progress_nodes(workspace, request):
        if node.children:
            continue
        workspace.remove_node(node.id)
        removed += 1
    return removed


__all__ = [
    "PROGRESS_NAME_SUFFIX",
    "discard_quotation_progress",
    "is_quotation_progress_node",
    "matching_progress_nodes",
    "resume_frame",
    "save_quotation_progress",
]
