"""The temporary label Data Block of an AI annotation run (issue 371).

While a run goes, the labels returned so far are kept in the Project as a
Data Block with the source's text column and the annotation column, one row
per distinct text, so a manual Join on the text column puts them back. A
successful run removes it; a run that stops, fails or is interrupted leaves
it, and the Annotation tab can write its labels into the column.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import polars as pl

from ..domain.workspace import AnalysisRecord, Node, Workspace
from ..domain.workspace.analysis import AnnotationRunAllAnalysisRequest
from ..domain.workspace.provenance import (
    AnnotationDerivation,
    DerivationInput,
    DerivationProvenance,
    node_reference,
)
from ..infrastructure.storage.durable_fs import fsync_directory, mkdir_durable
from ..shared.annotation_labels import annotation_progress_node_id
from ..shared.errors import InvalidInputError

PROGRESS_NAME_SUFFIX = " · annotation in progress"


def save_annotation_progress(
    workspace: Workspace,
    workspace_path: Path,
    record: AnalysisRecord,
    labels: dict[str, str | None],
) -> Path | None:
    """Create or refresh the run's label Data Block; returns the file written.

    Does nothing without labels, for another kind of run, or when the source
    Data Block is gone. The caller commits, and rolls the file back on failure.
    """

    request = record.request
    if not isinstance(request, AnnotationRunAllAnalysisRequest) or not labels:
        return None
    source = request.source
    source_node = workspace.nodes.get(source.node_id)
    if source_node is None:
        return None
    node_id = annotation_progress_node_id(record.id)
    frame = pl.DataFrame(
        {
            source.text_column: list(labels),
            source.annotation_column: list(labels.values()),
        },
        schema={source.text_column: pl.String, source.annotation_column: pl.String},
    )
    data_dir = workspace_path / "data"
    mkdir_durable(data_dir)
    # A new file per refresh: the previous one is collected once unreferenced.
    path = data_dir / f"{node_id}-{uuid.uuid4().hex[:12]}.parquet"
    temporary = path.with_name(f".{path.name}.tmp")
    frame.write_parquet(temporary)
    temporary.replace(path)
    fsync_directory(data_dir)
    lazyframe = pl.scan_parquet(path.resolve(strict=True))
    existing = workspace.nodes.get(node_id)
    if existing is not None:
        existing.data = lazyframe
        return path
    node = Node(
        id=node_id,
        data=lazyframe,
        name=f"{source_node.name}{PROGRESS_NAME_SUFFIX}",
        provenance=DerivationProvenance(
            operation=AnnotationDerivation(
                annotation_column=source.annotation_column,
                provider=source.provider,
                model=source.model,
            ),
            inputs=[DerivationInput(role="source", value=node_reference(source_node.id))],
        ),
        document=source.text_column,
        parents=[source_node],
    )
    workspace.add_node(node)
    workspace.place_node_after_parent(node)
    return path


def discard_annotation_progress(workspace: Workspace, analysis_id: uuid.UUID) -> bool:
    """Remove a finished run's label Data Block, unless something was built on it."""

    node = workspace.nodes.get(annotation_progress_node_id(analysis_id))
    if node is None or node.children:
        return False
    workspace.remove_node(node.id)
    return True


def is_annotation_progress_node(node: Node) -> bool:
    provenance = node.provenance
    return isinstance(provenance, DerivationProvenance) and isinstance(
        provenance.operation, AnnotationDerivation
    )


def apply_annotation_progress(
    workspace: Workspace,
    workspace_path: Path,
    progress_node_id: uuid.UUID,
) -> tuple[Node, str, int, Path]:
    """Write a label Data Block's labels into its source's annotation column.

    Rows whose text has a saved label get it; other rows keep their value. The
    source becomes a new materialised table (one Undo step), so it never
    depends on the label Data Block, which can then be removed.
    Returns the source, the column, the rows written and the new file.
    """

    progress = workspace.nodes.get(progress_node_id)
    if progress is None or not is_annotation_progress_node(progress):
        raise InvalidInputError("This Data Block holds no saved annotation labels.")
    provenance = progress.provenance
    assert isinstance(provenance, DerivationProvenance)
    operation = provenance.operation
    assert isinstance(operation, AnnotationDerivation)
    source_reference = provenance.inputs[0].value
    source = workspace.nodes.get(getattr(source_reference, "node_id", None))
    if source is None:
        raise InvalidInputError("The annotated Data Block is no longer in the Project.")
    column = operation.annotation_column
    labels = progress.data.collect()
    text_column = next(name for name in labels.columns if name != column)
    schema = source.data.collect_schema()
    if text_column not in schema or column not in schema:
        raise InvalidInputError(
            f'"{source.name}" no longer has the columns "{text_column}" and "{column}".'
        )
    saved = labels.select(
        pl.col(text_column).cast(pl.String),
        pl.col(column).alias("__saved_label__"),
    ).unique(subset=text_column, keep="last")
    frame = source.data.collect()
    joined = frame.with_columns(pl.col(text_column).cast(pl.String).alias("__text__")).join(
        saved.rename({text_column: "__text__"}),
        on="__text__",
        how="left",
        maintain_order="left",
    )
    if joined.height != frame.height:
        raise InvalidInputError("The saved labels could not be matched to single rows.")
    written = int(joined["__saved_label__"].is_not_null().sum())
    result = joined.with_columns(
        pl.when(pl.col("__saved_label__").is_not_null())
        .then(pl.col("__saved_label__").cast(schema[column]))
        .otherwise(pl.col(column))
        .alias(column)
    ).select(frame.columns)
    data_dir = workspace_path / "data"
    mkdir_durable(data_dir)
    path = data_dir / f"annotation-saved-{uuid.uuid4().hex}.parquet"
    temporary = path.with_name(f".{path.name}.tmp")
    result.write_parquet(temporary)
    temporary.replace(path)
    fsync_directory(data_dir)
    source.data = pl.scan_parquet(path.resolve(strict=True))
    return source, column, written, path


__all__ = [
    "PROGRESS_NAME_SUFFIX",
    "apply_annotation_progress",
    "discard_annotation_progress",
    "is_annotation_progress_node",
    "save_annotation_progress",
]
