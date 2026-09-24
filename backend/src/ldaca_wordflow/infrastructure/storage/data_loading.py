"""File-type detection, bounded data loading, and dtype normalization.

``NodeService`` uses this module to turn a validated user-file path into a
fully inferred Polars frame before staging an immutable source Data Block.
File preview instead preserves raw CSV/TSV lexemes as strings; JSON-family
previews use the same full-file inference as source creation.
"""

import os
import stat
import unicodedata
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from types import MappingProxyType
from typing import Final

import fastexcel
import polars as pl

from .safe_paths import is_link_or_reparse

LOADABLE_FILE_TYPES: Final = MappingProxyType(
    {
        ".csv": "csv",
        ".tsv": "tsv",
        ".json": "json",
        ".jsonl": "jsonl",
        ".ndjson": "jsonl",
        ".parquet": "parquet",
        ".avro": "avro",
        ".arrow": "ipc",
        ".ipc": "ipc",
        ".feather": "ipc",
        ".xlsx": "excel",
        ".xls": "excel",
        ".xlsm": "excel",
        ".xlsb": "excel",
        ".ods": "excel",
        ".txt": "text",
        ".text": "text",
        ".md": "text",
        ".rst": "text",
        ".log": "text",
        ".zip": "zip",
    }
)


class DataFileLoadError(ValueError):
    """A user-provided data file could not be parsed by its canonical loader."""


class DirectoryTooLargeError(ValueError):
    """A folder of documents exceeds the byte or file-count limit."""


def detect_file_type(filename: str) -> str:
    """Detect file type from extension.

    Used by:
    - backend API routes, backend tests, core workspace and worker services because they
      need a backend boundary that validates inputs before delegating to workspace or worker
      state.
    """
    return LOADABLE_FILE_TYPES.get(Path(filename).suffix.lower(), "unknown")


def is_loadable_file(filename: str) -> bool:
    """Return whether one filename is admitted by the canonical allowlist."""

    return Path(filename).suffix.lower() in LOADABLE_FILE_TYPES


def load_data_file(
    file_path: Path,
    sheet_name: str | None = None,
    *,
    max_directory_bytes: int | None = None,
) -> pl.LazyFrame | pl.DataFrame:
    """Build the authoritative loader for one supported user file.

    Used by ``materialize_data_file`` and direct loader tests. Row-oriented
    formats inspect the complete bounded source when establishing their schema,
    so values after Polars' default inference window cannot invalidate a type
    selected from only the first 100 rows.
    """
    try:
        return _load_data_file(file_path, sheet_name, max_directory_bytes)
    except _DATA_FILE_LOAD_EXCEPTIONS as exc:
        raise DataFileLoadError("Data file could not be loaded") from exc


def materialize_data_file(
    file_path: Path,
    sheet_name: str | None = None,
    *,
    max_directory_bytes: int | None = None,
) -> pl.DataFrame:
    """Materialize an authoritative source frame under one error boundary.

    Called by ``NodeService`` at the source-file I/O boundary before canonical
    dtype normalization and Parquet staging. Both loader construction and lazy
    collection are translated to ``DataFileLoadError`` so deferred Polars parse
    failures have the same service contract as eager reader failures.
    """
    try:
        loaded = load_data_file(
            file_path, sheet_name, max_directory_bytes=max_directory_bytes
        )
        return loaded.collect() if isinstance(loaded, pl.LazyFrame) else loaded
    except DataFileLoadError:
        raise
    except _DATA_FILE_LOAD_EXCEPTIONS as exc:
        raise DataFileLoadError("Data file could not be loaded") from exc


def load_data_file_preview(
    file_path: Path,
    sheet_name: str | None = None,
    *,
    max_directory_bytes: int | None = None,
) -> pl.LazyFrame | pl.DataFrame:
    """Build the value-inspection loader used by ``FileReadService``.

    CSV and TSV previews disable inference so every field, including lexemes
    such as ``001``, is exposed as a string. JSON-family previews retain full
    inference because those formats encode value types directly; all remaining
    formats keep their authoritative loader behavior.
    """
    file_type = detect_file_type(file_path.name)
    try:
        if file_type == "csv":
            return pl.scan_csv(file_path, infer_schema=False)
        if file_type == "tsv":
            return pl.scan_csv(file_path, separator="\t", infer_schema=False)
        return _load_data_file(file_path, sheet_name, max_directory_bytes)
    except _DATA_FILE_LOAD_EXCEPTIONS as exc:
        raise DataFileLoadError("Data file could not be loaded") from exc


_DATA_FILE_LOAD_EXCEPTIONS = (
    OSError,
    UnicodeError,
    ValueError,
    zipfile.BadZipFile,
    zipfile.LargeZipFile,
    fastexcel.FastExcelError,
    pl.exceptions.PolarsError,
)


def _load_data_file(
    file_path: Path,
    sheet_name: str | None,
    max_directory_bytes: int | None = None,
) -> pl.LazyFrame | pl.DataFrame:
    # Callers admit only real (no-follow) directories through the user-file gate.
    if file_path.is_dir():
        return read_directory_documents(file_path, max_total_bytes=max_directory_bytes)
    file_type = detect_file_type(file_path.name)

    if file_type == "csv":
        return pl.scan_csv(file_path, infer_schema_length=None)
    if file_type == "parquet":
        return pl.scan_parquet(file_path)
    if file_type == "avro":
        return pl.read_avro(file_path)
    if file_type == "ipc":
        return pl.scan_ipc(file_path)
    if file_type == "json":
        return pl.read_json(file_path, infer_schema_length=None)
    if file_type == "jsonl":
        return pl.scan_ndjson(file_path, infer_schema_length=None)
    if file_type == "tsv":
        return pl.scan_csv(file_path, separator="\t", infer_schema_length=None)
    if file_type == "excel":
        validate_spreadsheet_container(file_path)
        result = (
            pl.read_excel(file_path, sheet_name=sheet_name)
            if sheet_name is not None
            else pl.read_excel(file_path)
        )
        if not isinstance(result, pl.DataFrame):
            raise RuntimeError("Excel import did not produce one DataFrame")
        return result
    if file_type == "text":
        return read_text_file(file_path)
    if file_type == "zip":
        return read_zip_file(file_path)
    raise ValueError(f"Unsupported file type: {file_type}")


def read_text_file(file_path: Path) -> pl.DataFrame:
    """Read a plain text file into a single-column Polars DataFrame."""
    content = file_path.read_text(encoding="utf-8")
    lines = content.splitlines()
    if not lines:
        return pl.DataFrame({"text": []})
    return pl.DataFrame({"text": lines})


_ZIP_DOCUMENT_SCHEMA = {
    "file_path": pl.String,
    "base_name": pl.String,
    "extension": pl.String,
    "document": pl.String,
}


# A folder may hold at most this many files, bounding memory and listing time.
MAX_DIRECTORY_DOCUMENTS: Final = 100_000

# Only plain-text document files become rows in a folder or ZIP of documents.
DOCUMENT_EXTENSIONS: Final = frozenset(
    suffix for suffix, kind in LOADABLE_FILE_TYPES.items() if kind == "text"
)


@dataclass(frozen=True, slots=True)
class SkippedDocumentFiles:
    """Files left out of a document table, counted per extension and reason."""

    unsupported: dict[str, int]
    not_utf8: dict[str, int]

    def as_report(self) -> list[dict[str, str | int]]:
        """Largest groups first; ``extension`` is lower-case without the dot."""

        rows = [
            {"extension": extension, "reason": reason, "count": count}
            for reason, counts in (
                ("unsupported_type", self.unsupported),
                ("not_utf8", self.not_utf8),
            )
            for extension, count in counts.items()
        ]
        return sorted(rows, key=lambda row: (-int(row["count"]), str(row["extension"])))


def _extension_label(path: PurePosixPath) -> str:
    return path.suffix.lower().lstrip(".")


def _is_skipped_document_path(path: PurePosixPath) -> bool:
    """Ignore OS metadata and hidden entries (``__MACOSX``, ``._*``, ``.DS_Store``, ``.git``)."""

    return any(part == "__MACOSX" or part.startswith(".") for part in path.parts)


class _DocumentCollector:
    """Turn candidate files into document rows and count what was skipped."""

    def __init__(self) -> None:
        self.records: list[dict[str, str]] = []
        self._unsupported: Counter[str] = Counter()
        self._not_utf8: Counter[str] = Counter()

    def wants(self, path: PurePosixPath) -> bool:
        """Return whether ``path`` is a document; count it as skipped otherwise."""

        if path.suffix.lower() in DOCUMENT_EXTENSIONS:
            return True
        self._unsupported[_extension_label(path)] += 1
        return False

    def add(self, path: PurePosixPath, content: bytes) -> None:
        try:
            document = content.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            self._not_utf8[_extension_label(path)] += 1
            return
        self.records.append(
            {
                "file_path": path.as_posix(),
                "base_name": path.stem,
                "extension": path.suffix,
                "document": document,
            }
        )

    def result(self) -> tuple[pl.DataFrame, SkippedDocumentFiles]:
        return (
            pl.DataFrame(self.records, schema=_ZIP_DOCUMENT_SCHEMA),
            SkippedDocumentFiles(dict(self._unsupported), dict(self._not_utf8)),
        )


def _read_zip_documents(file_path: Path) -> tuple[pl.DataFrame, SkippedDocumentFiles]:
    collector = _DocumentCollector()
    try:
        with zipfile.ZipFile(file_path) as archive:
            members = _validate_zip_members(archive, label="ZIP archive")
            for member in sorted(members, key=lambda item: item.filename):
                if member.is_dir():
                    continue
                path = PurePosixPath(member.filename)
                if _is_skipped_document_path(path) or not collector.wants(path):
                    continue
                collector.add(path, archive.read(member))
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        raise ValueError("ZIP archive is invalid") from exc
    return collector.result()


def _read_directory_documents(
    root: Path, max_total_bytes: int | None
) -> tuple[pl.DataFrame, SkippedDocumentFiles]:
    collector = _DocumentCollector()
    documents: list[tuple[PurePosixPath, Path]] = []
    total_bytes = 0
    file_count = 0
    pending: list[tuple[Path, PurePosixPath]] = [(root, PurePosixPath())]
    while pending:
        directory, relative = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                child = relative / entry.name
                if _is_skipped_document_path(child):
                    continue
                metadata = entry.stat(follow_symlinks=False)
                if is_link_or_reparse(metadata):
                    continue
                if stat.S_ISDIR(metadata.st_mode):
                    pending.append((Path(entry.path), child))
                    continue
                if not stat.S_ISREG(metadata.st_mode):
                    continue
                file_count += 1
                if file_count > MAX_DIRECTORY_DOCUMENTS:
                    raise DirectoryTooLargeError(
                        "Folder contains too many files to load"
                    )
                if not collector.wants(child):
                    continue
                total_bytes += metadata.st_size
                if max_total_bytes is not None and total_bytes > max_total_bytes:
                    raise DirectoryTooLargeError("Folder is too large to load")
                documents.append((child, Path(entry.path)))
    for relative, path in sorted(documents, key=lambda item: item[0].as_posix()):
        collector.add(relative, path.read_bytes())
    return collector.result()


def read_zip_file(file_path: Path) -> pl.DataFrame:
    """Read safe UTF-8 text-document ZIP members into the document table."""

    return _read_zip_documents(file_path)[0]


def read_directory_documents(
    root: Path, *, max_total_bytes: int | None = None
) -> pl.DataFrame:
    """Read a folder tree into the same document table as a ZIP of documents.

    Walks subfolders recursively in path order without following symbolic
    links, junctions, or other reparse points (they are ignored), so the walk
    cannot leave the chosen folder. ``file_path`` is relative to ``root``.
    Only text-document files count towards ``max_total_bytes``.
    """

    return _read_directory_documents(root, max_total_bytes)[0]


def read_documents(
    path: Path, *, max_total_bytes: int | None = None
) -> tuple[pl.DataFrame, SkippedDocumentFiles] | None:
    """Read a folder or ZIP as documents plus a skip report; None for other files.

    Used by source Data Block creation, which reports skipped files to the user.
    Only ``.txt``, ``.text``, ``.md``, ``.rst`` and ``.log`` files become rows,
    each holding the whole file; other types and non-UTF-8 text are counted.
    """

    try:
        if path.is_dir():
            return _read_directory_documents(path, max_total_bytes)
        if detect_file_type(path.name) == "zip":
            return _read_zip_documents(path)
    except _DATA_FILE_LOAD_EXCEPTIONS as exc:
        raise DataFileLoadError("Data file could not be loaded") from exc
    return None


def validate_spreadsheet_container(file_path: Path) -> None:
    """Bound and validate ZIP-based spreadsheet containers before parsing."""

    if file_path.suffix.lower() == ".xls":
        return
    try:
        with zipfile.ZipFile(file_path) as archive:
            _validate_zip_members(archive, label="Spreadsheet")
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        raise ValueError("Spreadsheet container is invalid") from exc


def _validate_zip_members(
    archive: zipfile.ZipFile,
    *,
    label: str,
) -> list[zipfile.ZipInfo]:
    """Validate a ZIP directory before any member is read."""

    members = archive.infolist()
    seen: set[str] = set()
    for member in members:
        raw_name = member.orig_filename
        name = raw_name[:-1] if member.is_dir() and raw_name.endswith("/") else raw_name
        posix = PurePosixPath(name)
        windows = PureWindowsPath(name)
        if (
            not name
            or "\\" in name
            or "\x00" in name
            or posix.is_absolute()
            or windows.drive
            or windows.root
            or any(part in {"", ".", ".."} for part in name.split("/"))
        ):
            raise ValueError(f"{label} contains an unsafe member path")
        collision = unicodedata.normalize("NFC", name).casefold()
        if collision in seen:
            raise ValueError(f"{label} contains colliding member names")
        seen.add(collision)
        if member.flag_bits & 0x1:
            raise ValueError(f"Encrypted {label.lower()}s are unsupported")
        unix_mode = (member.external_attr >> 16) & 0xFFFF
        kind = stat.S_IFMT(unix_mode)
        allowed = {0, stat.S_IFDIR} if member.is_dir() else {0, stat.S_IFREG}
        if kind not in allowed:
            raise ValueError(f"{label} contains a link or special file")
        if member.file_size:
            if member.compress_size == 0:
                raise ValueError(f"{label} compression ratio is invalid")
            if member.file_size / member.compress_size > 200:
                raise ValueError(f"{label} compression ratio is too high")
    return members


_JS_MAX_SAFE_INTEGER = 2**53 - 1

_CANONICAL_DATETIME = pl.Datetime(time_unit="us", time_zone="UTC")
_INTEGERS_TO_PROMOTE = {
    pl.Int8,
    pl.Int16,
    pl.Int32,
    pl.UInt8,
    pl.UInt16,
    pl.UInt32,
    pl.UInt64,
}


def normalize_dtypes(
    df: pl.DataFrame,
) -> tuple[pl.DataFrame, list[dict[str, str]]]:
    """Coerce columns to the project's canonical dtype profile.

    Returns the normalized frame plus a per-column change log
    ``[{"column", "from_dtype", "to_dtype", "reason"}, ...]`` so callers can
    surface a consolidated warning to the user. The change log is empty when
    nothing needed casting.

    ``NodeService`` returns the change log with the created Data Block so the
    caller can explain any normalization applied at ingestion.
    """
    if df.width == 0:
        return df, []

    changes: list[dict[str, str]] = []
    casts: list[pl.Expr] = []

    for col, dtype in df.schema.items():
        if isinstance(dtype, pl.Datetime):
            time_unit = dtype.time_unit
            time_zone = dtype.time_zone
            if time_unit == "us" and time_zone == "UTC":
                continue
            expr = pl.col(col)
            reason_parts: list[str] = []
            if time_zone is None:
                expr = expr.dt.replace_time_zone("UTC")
                reason_parts.append("naive datetime assumed UTC")
            elif time_zone != "UTC":
                expr = expr.dt.convert_time_zone("UTC")
                reason_parts.append(f"converted from {time_zone} to UTC")
            if time_unit != "us":
                expr = expr.dt.cast_time_unit("us")
                reason_parts.append(
                    f"precision {time_unit}->us "
                    "(text analytics does not need sub-microsecond resolution)"
                )
            casts.append(expr.alias(col))
            changes.append(
                {
                    "column": col,
                    "from_dtype": str(dtype),
                    "to_dtype": str(_CANONICAL_DATETIME),
                    "reason": "; ".join(reason_parts),
                }
            )
        elif dtype in _INTEGERS_TO_PROMOTE:
            casts.append(pl.col(col).cast(pl.Int64).alias(col))
            kind = "unsigned" if str(dtype).startswith("UInt") else "narrower signed"
            changes.append(
                {
                    "column": col,
                    "from_dtype": str(dtype),
                    "to_dtype": "Int64",
                    "reason": (
                        f"{kind} integer promoted to Int64 so joins/stacks "
                        "across heterogeneous sources align"
                    ),
                }
            )
        elif dtype == pl.Float32:
            casts.append(pl.col(col).cast(pl.Float64).alias(col))
            changes.append(
                {
                    "column": col,
                    "from_dtype": "Float32",
                    "to_dtype": "Float64",
                    "reason": "Float32 widened to Float64 for cross-source alignment",
                }
            )

    if casts:
        df = df.with_columns(casts)
    return df, changes
