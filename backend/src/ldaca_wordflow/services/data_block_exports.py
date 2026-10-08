"""Bounded file export for ordered Workspace Data Blocks."""

from __future__ import annotations

import io
import os
import uuid
import zipfile
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import IO, BinaryIO, cast

import polars as pl

from ..shared.elapsed_time import elapsed_to_text
from ..domain.workspace import Node
from ..models.node_resources import (
    DataBlockExportFormat,
    DataBlockExportRequest,
    ResultDownloadRequest,
)
from ..shared.errors import (
    AnalysisNotFoundError,
    InvalidInputError,
    NodeNotFoundError,
    ResourceTooLargeError,
)
from ..infrastructure.storage.bounded_io import BoundedSeekableWriter
from .response_snapshots import ResponseSnapshot, ResponseSnapshotService
from .workspace import WorkspaceService


@dataclass(frozen=True, slots=True)
class _ExportFormatSpec:
    extension: str
    media_type: str


_FORMAT_SPECS = {
    DataBlockExportFormat.CSV: _ExportFormatSpec("csv", "text/csv; charset=utf-8"),
    DataBlockExportFormat.XLSX: _ExportFormatSpec(
        "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ),
    DataBlockExportFormat.JSON: _ExportFormatSpec("json", "application/json"),
    DataBlockExportFormat.PARQUET: _ExportFormatSpec(
        "parquet", "application/vnd.apache.parquet"
    ),
}

# Excel's worksheet limits: rows include the header row.
_EXCEL_MAX_ROWS = 1_048_576
_EXCEL_MAX_CELL_CHARACTERS = 32_767


class DataBlockExportService:
    """Materialize Data Blocks into immutable response-lifetime files."""

    def __init__(
        self,
        workspaces: WorkspaceService,
        response_snapshots: ResponseSnapshotService,
        *,
        max_export_bytes: int,
    ) -> None:
        if max_export_bytes < 1:
            raise ValueError("Data Block export limit must be positive")
        self._workspaces = workspaces
        self._response_snapshots = response_snapshots
        self._max_export_bytes = max_export_bytes

    async def export(
        self,
        user_id: str,
        workspace_id: uuid.UUID,
        request: DataBlockExportRequest,
    ) -> tuple[ResponseSnapshot, str, str, int]:
        """Export the exact requested Data Blocks from one stable Workspace view."""

        node_ids = request.node_ids
        spec = _FORMAT_SPECS[request.format]
        multiple = len(node_ids) > 1
        async with self._workspaces.read_context(user_id, workspace_id) as lease:
            nodes: list[Node] = []
            for node_id in node_ids:
                node = lease.workspace.nodes.get(node_id)
                if node is None:
                    raise NodeNotFoundError("Data Block not found")
                nodes.append(node)
            filename = (
                f"{_safe_export_stem(lease.workspace.name, 'workspace')}_data_blocks.zip"
                if multiple
                else f"{_safe_export_stem(nodes[0].name, str(node_ids[0]))}.{spec.extension}"
            )
            snapshot = await self._response_snapshots.create_generated(
                suffix=".zip" if multiple else f".{spec.extension}",
                max_output_bytes=self._max_export_bytes,
                reservation_bytes=self._max_export_bytes,
                producer=partial(
                    _write_export,
                    tuple((node.name, str(node.id), node.data) for node in nodes),
                    request.format,
                ),
            )
            revision = lease.revision
        return (
            snapshot,
            filename,
            "application/zip" if multiple else spec.media_type,
            revision,
        )

    async def export_result(
        self,
        user_id: str,
        workspace_id: uuid.UUID,
        analysis_id: uuid.UUID,
        request: ResultDownloadRequest,
    ) -> tuple[ResponseSnapshot, str, str, int]:
        """Download a Result selection as a file instead of a Data Block (issue 352).

        The table is built exactly as Add to Project builds it, from the same
        selection, then written like a Data Block export.
        """

        from ..workers.result_data_block_creation import (
            parse_result_selection_request,
            result_selection_frame,
        )
        from .analysis_preparation_registry import resolve_result_selection_inputs

        spec = _FORMAT_SPECS[request.format]
        payload = request.request.model_dump(mode="json")
        async with self._workspaces.read_context(user_id, workspace_id) as lease:
            parent = lease.workspace.analyses.get(analysis_id)
            if parent is None:
                raise AnalysisNotFoundError("Analysis not found")
            result_paths, document_columns, case_sensitive = resolve_result_selection_inputs(
                request.request,
                workspace=lease.workspace,
                workspace_path=lease.path,
                parent=parent,
            )
            _request, selections, _operation, nested_column = parse_result_selection_request(
                payload
            )
            frames: list[tuple[str, str, pl.LazyFrame]] = []
            for selection in selections:
                source_id = selection.source_node_id
                try:
                    frame, _columns = result_selection_frame(
                        kind=str(payload["kind"]),
                        nested_column=nested_column,
                        selection=selection,
                        path=result_paths.get(source_id),
                        document_column=document_columns.get(source_id),
                        case_sensitive=case_sensitive.get(source_id, True),
                    )
                except ValueError as exc:
                    raise InvalidInputError(str(exc)) from exc
                frames.append((selection.new_node_name, str(source_id), frame))
            multiple = len(frames) > 1
            filename = (
                f"{_safe_export_stem(frames[0][0], 'results')}_and_more.zip"
                if multiple
                else f"{_safe_export_stem(frames[0][0], 'results')}.{spec.extension}"
            )
            snapshot = await self._response_snapshots.create_generated(
                suffix=".zip" if multiple else f".{spec.extension}",
                max_output_bytes=self._max_export_bytes,
                reservation_bytes=self._max_export_bytes,
                producer=partial(_write_export, tuple(frames), request.format),
            )
            revision = lease.revision
        return (
            snapshot,
            filename,
            "application/zip" if multiple else spec.media_type,
            revision,
        )


@dataclass(slots=True)
class _WriteBudget:
    limit: int
    written: int = 0

    def consume(self, size: int) -> None:
        if self.written + size > self.limit:
            raise ResourceTooLargeError("Data Block export exceeds its storage budget")
        self.written += size


class _BudgetedBinaryWriter:
    """Count uncompressed export bytes written to one file or ZIP entry."""

    def __init__(self, output: IO[bytes], budget: _WriteBudget) -> None:
        self._output = output
        self._budget = budget
        self.exceeded = False

    def write(self, content: bytes) -> int:
        try:
            self._budget.consume(len(content))
        except ResourceTooLargeError:
            self.exceeded = True
            raise
        return self._output.write(content)

    def flush(self) -> None:
        self._output.flush()

    def tell(self) -> int:
        return self._output.tell()


def _write_export(
    frames: tuple[tuple[str, str, pl.LazyFrame], ...],
    export_format: DataBlockExportFormat,
    target: Path,
    max_output_bytes: int,
) -> None:
    spec = _FORMAT_SPECS[export_format]
    budget = _WriteBudget(max_output_bytes)
    try:
        with target.open("xb") as raw_output:
            if len(frames) == 1:
                writer = _BudgetedBinaryWriter(raw_output, budget)
                _write_lazyframe(frames[0][2], export_format, writer)
            else:
                zip_output = cast(
                    BinaryIO,
                    BoundedSeekableWriter(
                        raw_output,
                        max_output_bytes,
                        overflow=partial(
                            ResourceTooLargeError,
                            "Data Block export exceeds its storage budget",
                        ),
                    ),
                )
                with zipfile.ZipFile(
                    zip_output,
                    mode="w",
                    compression=zipfile.ZIP_DEFLATED,
                    compresslevel=6,
                ) as archive:
                    for (_name, _fallback, frame), archive_name in zip(
                        frames,
                        _archive_names(frames, spec.extension),
                        strict=True,
                    ):
                        with archive.open(archive_name, mode="w") as member:
                            writer = _BudgetedBinaryWriter(member, budget)
                            _write_lazyframe(frame, export_format, writer)
            raw_output.flush()
            os.fsync(raw_output.fileno())
    except BaseException:
        target.unlink(missing_ok=True)
        raise


def _write_lazyframe(
    frame: pl.LazyFrame,
    export_format: DataBlockExportFormat,
    writer: _BudgetedBinaryWriter,
) -> None:
    try:
        if export_format is DataBlockExportFormat.CSV:
            # The byte-order mark makes Excel read the file as UTF-8, not
            # Windows-1252, so curly quotes do not show as â€™ (issue 169).
            _elapsed_as_text(_flatten_nested_columns(frame)).sink_csv(
                cast(BinaryIO, writer), include_bom=True
            )
        elif export_format is DataBlockExportFormat.XLSX:
            writer.write(_excel_workbook_bytes(frame))
        elif export_format is DataBlockExportFormat.JSON:
            content = frame.collect().write_json().encode()
            writer.write(content)
        else:
            frame.sink_parquet(cast(BinaryIO, writer))
    except pl.exceptions.ComputeError as exc:
        if writer.exceeded:
            raise ResourceTooLargeError(
                "Data Block export exceeds its storage budget"
            ) from exc
        raise


def _flatten_nested_columns(frame: pl.LazyFrame) -> pl.LazyFrame:
    """Write list and struct values as JSON text: CSV and Excel cells are flat.

    Extension columns such as Topic Coverage are written from their physical
    storage, so a topic coverage cell reads as its topic and coverage pairs
    (issue 200).
    """

    schema = frame.collect_schema()
    nested = {
        name: pl.col(name).ext.storage()
        if isinstance(dtype, pl.Extension)
        else pl.col(name)
        for name, dtype in schema.items()
        if dtype.is_nested() or isinstance(dtype, pl.Extension)
    }
    if not nested:
        return frame
    return frame.with_columns(
        pl.when(pl.col(name).is_not_null())
        .then(
            pl.struct(value.alias("value"))
            .struct.json_encode()
            .str.strip_prefix('{"value":')
            .str.strip_suffix("}")
        )
        .alias(name)
        for name, value in nested.items()
    )


def _elapsed_as_text(frame: pl.LazyFrame) -> pl.LazyFrame:
    """Elapsed time as Wordflow shows it ("7:58.5"): CSV has no such type (issue 324)."""

    durations = [
        name
        for name, dtype in frame.collect_schema().items()
        if isinstance(dtype, pl.Duration)
    ]
    if not durations:
        return frame
    return frame.with_columns(elapsed_to_text(pl.col(name)) for name in durations)


# Excel's elapsed-time format: hours count past 24, with milliseconds.
_EXCEL_ELAPSED_FORMAT = "[h]:mm:ss.000"


def _excel_workbook_bytes(frame: pl.LazyFrame) -> bytes:
    """One worksheet named Data, within Excel's row and cell-length limits."""

    data = _flatten_nested_columns(frame).collect()
    # Excel has no time zones: write zoned datetimes as UTC wall-clock times
    # (issue 169; xlsxwriter refuses zoned values).
    zoned = [
        name
        for name, dtype in data.schema.items()
        if isinstance(dtype, pl.Datetime) and dtype.time_zone is not None
    ]
    if zoned:
        data = data.with_columns(
            pl.col(name).dt.convert_time_zone("UTC").dt.replace_time_zone(None)
            for name in zoned
        )
    # Elapsed time as Excel stores times, a fraction of a day, shown with
    # Excel's elapsed-time format so it reads back as elapsed time (issue 324).
    durations = [
        name for name, dtype in data.schema.items() if isinstance(dtype, pl.Duration)
    ]
    if durations:
        data = data.with_columns(
            (pl.col(name).dt.total_microseconds() / 86_400_000_000).alias(name)
            for name in durations
        )
    if data.height + 1 > _EXCEL_MAX_ROWS:
        raise InvalidInputError(
            f"This Data Block has {data.height:,} rows, more than an Excel worksheet "
            f"holds ({_EXCEL_MAX_ROWS - 1:,}). Export it as CSV or Parquet instead."
        )
    text_columns = [name for name, dtype in data.schema.items() if dtype == pl.String]
    if text_columns:
        longest = data.select(pl.col(text_columns).str.len_chars().max()).row(
            0, named=True
        )
        too_long = [
            name
            for name in text_columns
            if (longest[name] or 0) > _EXCEL_MAX_CELL_CHARACTERS
        ]
        if too_long:
            raise InvalidInputError(
                "Excel cells hold at most 32,767 characters, and some text in "
                + ", ".join(f"'{name}'" for name in too_long)
                + " is longer. Export it as CSV or Parquet to keep the full text."
            )
    buffer = io.BytesIO()
    data.write_excel(
        buffer,
        worksheet="Data",
        autofit=False,
        include_header=True,
        column_formats=dict.fromkeys(durations, _EXCEL_ELAPSED_FORMAT) or None,
    )
    return buffer.getvalue()


def _archive_names(
    frames: tuple[tuple[str, str, pl.LazyFrame], ...], extension: str
) -> list[str]:
    counts: dict[str, int] = {}
    names: list[str] = []
    for name, fallback, _frame in frames:
        stem = _safe_export_stem(name, fallback)
        occurrence = counts.get(stem, 0) + 1
        counts[stem] = occurrence
        unique_stem = stem if occurrence == 1 else f"{stem}_{occurrence}"
        names.append(f"{unique_stem}.{extension}")
    return names


def _safe_export_stem(value: str, fallback: str) -> str:
    normalized = "".join(
        character if character.isalnum() or character in {"-", "_"} else "_"
        for character in value.strip()
    ).strip("_")
    return normalized or fallback


__all__ = ["DataBlockExportService"]
