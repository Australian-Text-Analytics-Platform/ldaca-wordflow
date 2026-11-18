"""Rows from JSON and JSON Lines files: where the records are, and one table.

JSON need not be a table. A file may hold its records several levels down,
such as an OCR tool's ``{"source": ..., "pages": [{"parsing_res_list": [...]}]}``.
The user chooses which list of records becomes the rows (a *record path*);
this module lists the candidates and flattens the chosen one.

A record path is a JSON Pointer (RFC 6901) of object keys, such as
``/pages/parsing_res_list``. Lists met along the way are walked item by item,
so every record of every page becomes a row. ``""`` is the top level: each
object of a top-level list, or a top-level object as one row. A JSON Lines
file is the list of its lines.

Flattening keeps only each record's first-level fields. A field whose values
all share one JSON type keeps it (whole numbers, decimals, true/false or
text); any other field, including objects and lists, becomes text, with
nested values written as JSON. Scalar fields of the objects above the records
are copied onto every row after the record's own fields, named after their
place (``pages.width``), and each list walked above the records adds its
1-based position (``pages.number``).
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final

import polars as pl

# Lists of records are found this many objects deep at most.
MAX_DISCOVERY_DEPTH: Final = 32
# Field names listed per candidate, to help users recognise it.
MAX_LISTED_FIELDS: Final = 8
_INT64_MIN: Final = -(2**63)
_INT64_MAX: Final = 2**63 - 1


class JsonRecordsError(ValueError):
    """A JSON file has no records at the chosen place; the text is for users."""


@dataclass(frozen=True, slots=True)
class RecordPathCandidate:
    """One place in a JSON file that holds records."""

    path: str
    records: int
    fields: list[str]
    field_count: int
    # Characters of text in the records' own fields; ranks the default.
    text_characters: int


@dataclass(frozen=True, slots=True)
class JsonSource:
    """One parsed JSON or JSON Lines file, with the name its rows carry."""

    label: str
    document: Any


def is_json_lines_path(name: str | Path) -> bool:
    return Path(name).suffix.lower() in {".jsonl", ".ndjson"}


def read_json_document(file_path: Path) -> Any:
    """Parse a JSON file, or a JSON Lines file as the list of its lines."""

    text = file_path.read_text(encoding="utf-8-sig")
    if not is_json_lines_path(file_path):
        return json.loads(text)
    lines: list[Any] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            lines.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise JsonRecordsError(
                f"Line {number} isn't valid JSON. Check the file with a JSON "
                "validator, then upload it again."
            ) from exc
    return lines


def parse_record_path(path: str) -> tuple[str, ...]:
    """Split a JSON Pointer into object keys; ``""`` is the top level."""

    if path == "":
        return ()
    if not path.startswith("/"):
        raise ValueError("A record path is a JSON Pointer such as /pages/items")
    return tuple(
        token.replace("~1", "/").replace("~0", "~") for token in path[1:].split("/")
    )


def format_record_path(keys: Iterable[str]) -> str:
    return "".join("/" + key.replace("~", "~0").replace("/", "~1") for key in keys)


def record_path_candidates(document: Any) -> list[RecordPathCandidate]:
    """Every place holding records, the best default first.

    The top level counts when it yields any object; deeper places count when
    a key holds a list containing objects. The default is the place whose
    records hold the most text, then the most records, then the shallowest.
    """

    found: dict[tuple[str, ...], list[dict[str, Any]]] = {}

    def visit(node: Any, keys: tuple[str, ...], depth: int) -> None:
        if depth > MAX_DISCOVERY_DEPTH:
            return
        if isinstance(node, list):
            for item in node:
                visit(item, keys, depth)
            return
        if not isinstance(node, dict):
            return
        for key, value in node.items():
            if isinstance(value, list) and any(isinstance(item, dict) for item in value):
                found.setdefault((*keys, key), []).extend(
                    item for item in value if isinstance(item, dict)
                )
            if isinstance(value, (dict, list)):
                visit(value, (*keys, key), depth + 1)

    top = _records_at(document, ())
    if top:
        found[()] = top
    visit(document, (), 0)

    candidates = []
    for keys, records in found.items():
        fields = list(dict.fromkeys(field for record in records for field in record))
        candidates.append(
            RecordPathCandidate(
                path=format_record_path(keys),
                records=len(records),
                fields=fields[:MAX_LISTED_FIELDS],
                field_count=len(fields),
                text_characters=sum(
                    len(value)
                    for record in records
                    for value in record.values()
                    if isinstance(value, str)
                ),
            )
        )
    candidates.sort(
        key=lambda item: (
            -item.text_characters,
            -item.records,
            len(parse_record_path(item.path)),
            item.path,
        )
    )
    return candidates


def default_record_path(document: Any) -> str:
    candidates = record_path_candidates(document)
    if not candidates:
        raise JsonRecordsError(
            "Wordflow found no records in this file. JSON needs objects "
            '(such as {"text": "..."}), on their own or in a list.'
        )
    return candidates[0].path


def _records_at(document: Any, keys: tuple[str, ...]) -> list[dict[str, Any]]:
    return [record for _context, record in _walk(document, keys, (), ())]


def _walk(
    node: Any,
    keys: tuple[str, ...],
    place: tuple[str, ...],
    context: tuple[tuple[str, Any], ...],
) -> Iterator[tuple[tuple[tuple[str, Any], ...], dict[str, Any]]]:
    """Yield each record at ``keys`` with the parent values copied onto it.

    ``place`` names where ``node`` sits; ``context`` holds the parent columns
    gathered so far, as (column name, value) pairs.
    """

    if isinstance(node, list):
        numbered = bool(place) and bool(keys)
        for position, item in enumerate(node, start=1):
            item_context = (
                (*context, (_column(place, "number"), position)) if numbered else context
            )
            yield from _walk(item, keys, place, item_context)
        return
    if not isinstance(node, dict):
        return
    if not keys:
        yield context, node
        return
    scalars = tuple(
        (_column(place, field), value)
        for field, value in node.items()
        if not isinstance(value, (dict, list)) and field != keys[0]
    )
    head = keys[0]
    if head in node:
        yield from _walk(node[head], keys[1:], (*place, head), (*context, *scalars))


def _column(place: tuple[str, ...], field: str) -> str:
    return ".".join((*place, field))


def flatten_json_sources(
    sources: list[JsonSource],
    record_path: str | None,
    *,
    file_column: str | None = None,
) -> pl.DataFrame:
    """One table of the records at ``record_path`` in every source.

    ``None`` picks the default place of the first source and applies it to
    all, so a batch is always read one way. With ``file_column``, each row
    starts with the label of the file it came from. A source without that
    place is refused, naming it, rather than silently adding nothing.
    """

    if not sources:
        raise JsonRecordsError("There are no JSON files to read.")
    path = (
        default_record_path(sources[0].document) if record_path is None else record_path
    )
    keys = parse_record_path(path)
    record_rows: list[dict[str, Any]] = []
    context_rows: list[dict[str, Any]] = []
    missing: list[str] = []
    for source in sources:
        if not _has_place(source.document, keys):
            missing.append(source.label)
            continue
        for context, record in _walk(source.document, keys, (), ()):
            record_rows.append(record)
            context_rows.append(
                {**({file_column: source.label} if file_column else {}), **dict(context)}
            )
    if missing:
        named = ", ".join(missing[:3]) + (" and others" if len(missing) > 3 else "")
        raise JsonRecordsError(
            f"{named} {'has' if len(missing) == 1 else 'have'} no records at "
            f"{describe_record_path(path)}. Choose another place for the rows, "
            "or add those files on their own."
        )
    if not record_rows:
        raise JsonRecordsError(
            f"Wordflow found no records at {describe_record_path(path)}."
        )
    record_fields = list(dict.fromkeys(field for row in record_rows for field in row))
    context_fields = list(dict.fromkeys(field for row in context_rows for field in row))
    taken = set(record_fields)
    renamed: dict[str, str] = {}
    for field in context_fields:
        name = field
        while name in taken:
            name = f"{name} (parent)"
        taken.add(name)
        renamed[field] = name
    # The file first, then the record's own fields (where the text is), then
    # the values copied from the levels above.
    columns: dict[str, pl.Series] = {}
    leading = [file_column] if file_column in context_fields else []
    for field in leading:
        columns[field] = _series(field, [row.get(field) for row in context_rows])
    for field in record_fields:
        columns[field] = _series(field, [row.get(field) for row in record_rows])
    for field in context_fields:
        if field in leading:
            continue
        columns[renamed[field]] = _series(
            renamed[field], [row.get(field) for row in context_rows]
        )
    return pl.DataFrame(columns)


def describe_record_path(path: str) -> str:
    """The place in words: ``pages › parsing_res_list``, or the top level."""

    keys = parse_record_path(path)
    return " › ".join(keys) if keys else "the top level"


def _has_place(document: Any, keys: tuple[str, ...]) -> bool:
    """Whether ``keys`` leads to objects (or to an empty list) in ``document``."""

    def visit(node: Any, remaining: tuple[str, ...]) -> bool:
        if isinstance(node, list):
            return not node or any(visit(item, remaining) for item in node)
        if not isinstance(node, dict):
            return False
        if not remaining:
            return True
        return remaining[0] in node and visit(node[remaining[0]], remaining[1:])

    return visit(document, keys)


def _kind(value: Any) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int" if _INT64_MIN <= value <= _INT64_MAX else "text"
    if isinstance(value, float):
        return "float" if math.isfinite(value) else "text"
    if isinstance(value, str):
        return "str"
    return "text"


def _series(name: str, values: list[Any]) -> pl.Series:
    """One column: its JSON type when every value shares it, else text."""

    kinds = {_kind(value) for value in values if value is not None}
    if kinds == {"bool"}:
        return pl.Series(name, values, dtype=pl.Boolean)
    if kinds == {"int"}:
        return pl.Series(name, values, dtype=pl.Int64)
    if kinds and kinds <= {"int", "float"}:
        return pl.Series(
            name,
            [None if value is None else float(value) for value in values],
            dtype=pl.Float64,
        )
    return pl.Series(name, [_as_text(value) for value in values], dtype=pl.String)


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    return json.dumps(value, ensure_ascii=False)


__all__ = [
    "JsonRecordsError",
    "JsonSource",
    "RecordPathCandidate",
    "default_record_path",
    "describe_record_path",
    "flatten_json_sources",
    "format_record_path",
    "is_json_lines_path",
    "parse_record_path",
    "read_json_document",
    "record_path_candidates",
]
