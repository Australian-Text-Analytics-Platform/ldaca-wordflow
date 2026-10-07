"""Safe file inspection through the canonical Arrow IPC table boundary."""

from __future__ import annotations

import tempfile
from functools import partial
from pathlib import Path

import anyio
import polars as pl
from anyio.to_thread import run_sync as run_sync_in_worker_thread

from ..infrastructure.storage.data_loading import (
    describe_load_failure,
    DataFileLoadError,
    DirectoryTooLargeError,
    detect_file_type,
    extract_zip_table_member,
    zip_table_members,
    load_data_file_preview,
    workbook_sheet_names,
)
from ..models.files import (
    FileWorksheetsResource,
    WorkbookSheets,
    WorkbookSheetsResource,
    ZipTableMember,
    ZipTableMembersResource,
)
from ..shared.errors import (
    InvalidInputError,
    ResourceTooLargeError,
    format_exception_diagnostic,
)
from ..shared.table_transport import (
    IpcTablePage,
    encode_schema_stream,
    materialize_page,
)
from .user_files import UserFileStore


class FileReadService:
    """Own previews, worksheet discovery, and bounded UTF-8 reads.

    A single file is previewed whatever its size: previews read one page
    lazily. Folders of texts and ZIP members expand into new bytes, so their
    total stays bounded by ``max_expanded_bytes`` (issue 236).
    """

    def __init__(
        self,
        file_store: UserFileStore,
        *,
        limiter: anyio.CapacityLimiter,
        max_expanded_bytes: int,
        max_text_bytes: int,
    ) -> None:
        self._file_store = file_store
        self._limiter = limiter
        self._max_expanded_bytes = max_expanded_bytes
        self._max_text_bytes = max_text_bytes

    async def preview(
        self,
        user_id: str,
        relative_path: str,
        *,
        page: int,
        page_size: int,
        sheet_name: str | None,
        member: str | None = None,
    ) -> IpcTablePage:
        async with self._file_store.read_path(
            user_id, relative_path, allow_directory=True
        ) as path:
            if member is not None:
                # A table member of a ZIP, extracted within the preview limit;
                # a workbook member previews the chosen sheet (issue 323).
                return await self._run_sync(
                    _materialize_zip_member_page,
                    path,
                    member,
                    page,
                    page_size,
                    self._max_expanded_bytes,
                    sheet_name,
                )
            return await self._run_sync(
                _materialize_file_page,
                path,
                page,
                page_size,
                sheet_name,
                self._max_expanded_bytes,
            )

    async def zip_tables(self, user_id: str, relative_path: str) -> ZipTableMembersResource:
        """List the table files inside one ZIP archive."""

        async with self._file_store.read_path(user_id, relative_path) as path:
            if detect_file_type(path.name) != "zip":
                raise InvalidInputError("File is not a ZIP archive")
            try:
                listing = await self._run_sync(
                    zip_table_members,
                    path,
                    max_workbook_bytes=self._max_expanded_bytes,
                )
            except ValueError as exc:
                raise InvalidInputError("ZIP archive could not be read") from exc
        return ZipTableMembersResource(
            members=[
                ZipTableMember(path=name, size=size, sheets=sheets)
                for name, size, sheets in listing.members
            ],
            nested_archives=listing.nested_archives,
        )

    async def workbook_sheets(
        self, user_id: str, relative_paths: list[str]
    ) -> WorkbookSheetsResource:
        """Sheet names of several workbooks (issue 323); one unreadable
        workbook reports its error instead of failing the list."""

        workbooks: list[WorkbookSheets] = []
        for relative_path in relative_paths:
            try:
                async with self._file_store.read_path(user_id, relative_path) as path:
                    sheets = await self._run_sync(_excel_worksheets, path)
                workbooks.append(WorkbookSheets(path=relative_path, sheets=sheets))
            except InvalidInputError as exc:
                workbooks.append(
                    WorkbookSheets(path=relative_path, sheets=[], error=str(exc))
                )
        return WorkbookSheetsResource(workbooks=workbooks)

    async def schema(
        self,
        user_id: str,
        relative_path: str,
        *,
        sheet_name: str | None,
    ) -> bytes:
        async with self._file_store.read_path(
            user_id, relative_path, allow_directory=True
        ) as path:
            return await self._run_sync(
                _file_schema, path, sheet_name, self._max_expanded_bytes
            )

    async def worksheets(
        self,
        user_id: str,
        relative_path: str,
    ) -> FileWorksheetsResource:
        async with self._file_store.read_path(user_id, relative_path) as path:
            sheets = await self._run_sync(_excel_worksheets, path)
            return FileWorksheetsResource(
                sheets=sheets,
                default_sheet=sheets[0],
            )

    async def read_text(self, user_id: str, relative_path: str) -> tuple[str, str]:
        async with self._file_store.read_path(user_id, relative_path) as path:
            if (await self._stat(path)).st_size > self._max_text_bytes:
                raise ResourceTooLargeError("File is too large for a text response")
            try:
                content = await self._run_sync(path.read_text, encoding="utf-8")
            except UnicodeDecodeError as exc:
                raise InvalidInputError("File is not valid UTF-8 text") from exc
            media_type = (
                "text/markdown" if path.suffix.lower() == ".md" else "text/plain"
            )
            return content, media_type

    async def _stat(self, path: Path):
        return await self._run_sync(path.stat)

    async def _run_sync(self, function, *args, **kwargs):
        return await run_sync_in_worker_thread(
            partial(function, *args, **kwargs),
            abandon_on_cancel=False,
            limiter=self._limiter,
        )



def _preview_failure(path: Path, exc: BaseException) -> InvalidInputError:
    """Why a preview failed, in plain words, with the parser text for Details (issue 205)."""

    return InvalidInputError(
        f"Couldn't preview {path.name}. {describe_load_failure(exc, path.name)}",
        details={"diagnostic": format_exception_diagnostic(exc)},
    )

def _file_lazyframe(
    path: Path, sheet_name: str | None, max_directory_bytes: int | None = None
) -> pl.LazyFrame:
    """Build the preview-specific lazy frame consumed by page and schema reads.

    CSV/TSV fields remain raw strings while JSON-family types come from full
    inference. Deferred collection errors are translated by the materializing
    caller because constructing a lazy scanner does not necessarily parse data.
    """
    file_type = detect_file_type(path.name)
    try:
        if file_type == "excel":
            sheets = _excel_worksheets(path)
            selected = sheet_name or sheets[0]
            if selected not in sheets:
                raise InvalidInputError("Excel sheet not found")
            sheet_name = selected
        loaded = load_data_file_preview(
            path, sheet_name, max_directory_bytes=max_directory_bytes
        )
        return loaded if isinstance(loaded, pl.LazyFrame) else loaded.lazy()
    except InvalidInputError:
        raise
    except DataFileLoadError as exc:
        if isinstance(exc.__cause__, DirectoryTooLargeError):
            raise ResourceTooLargeError("Folder is too large to preview") from exc
        raise _preview_failure(path, exc) from exc


def _materialize_file_page(
    path: Path,
    page: int,
    page_size: int,
    sheet_name: str | None,
    max_directory_bytes: int | None = None,
) -> IpcTablePage:
    """Materialize one raw-value preview page and classify parser failures."""
    try:
        return materialize_page(
            _file_lazyframe(path, sheet_name, max_directory_bytes),
            page=page,
            page_size=page_size,
        )
    except (InvalidInputError, ResourceTooLargeError):
        raise
    except (DataFileLoadError, pl.exceptions.PolarsError) as exc:
        raise _preview_failure(path, exc) from exc


def _materialize_zip_member_page(
    zip_path: Path,
    member: str,
    page: int,
    page_size: int,
    max_bytes: int,
    sheet_name: str | None = None,
) -> IpcTablePage:
    with tempfile.TemporaryDirectory(prefix="wordflow-zip-member-") as scratch:
        try:
            extracted = extract_zip_table_member(
                zip_path, member, Path(scratch), max_bytes=max_bytes
            )
        except DirectoryTooLargeError as exc:
            raise ResourceTooLargeError("ZIP member is too large to preview") from exc
        except ValueError as exc:
            raise InvalidInputError("ZIP member could not be read") from exc
        return _materialize_file_page(extracted, page, page_size, sheet_name)


def _file_schema(
    path: Path, sheet_name: str | None, max_directory_bytes: int | None = None
) -> bytes:
    """Materialize the preview policy's schema and classify parser failures."""
    try:
        return encode_schema_stream(
            _file_lazyframe(path, sheet_name, max_directory_bytes).collect_schema()
        )
    except (InvalidInputError, ResourceTooLargeError):
        raise
    except (DataFileLoadError, pl.exceptions.PolarsError) as exc:
        raise _preview_failure(path, exc) from exc


def _excel_worksheets(path: Path) -> list[str]:
    if detect_file_type(path.name) != "excel":
        raise InvalidInputError("File is not an Excel workbook")
    try:
        sheets = workbook_sheet_names(path)
    except (OSError, ValueError) as exc:
        raise InvalidInputError("Excel workbook could not be read") from exc
    if not sheets:
        raise InvalidInputError("Excel workbook contains no sheets")
    return sheets


__all__ = ["FileReadService"]
