"""Rows from JSON: where the records are, and the one-table rule."""

from __future__ import annotations

import json
from pathlib import Path

import polars as pl
import pytest

from ldaca_wordflow.infrastructure.storage.data_loading import (
    DataFileLoadError,
    describe_load_failure,
    materialize_data_file,
    materialize_json_files,
)
from ldaca_wordflow.infrastructure.storage.json_records import (
    JsonRecordsError,
    JsonSource,
    default_record_path,
    describe_record_path,
    flatten_json_sources,
    format_record_path,
    parse_record_path,
    record_path_candidates,
)


def _ocr_page(source: str, blocks: list[tuple[str, str]]) -> dict:
    """An OCR tool's output: records two levels down, beside boxes without text."""

    return {
        "source": source,
        "pages": [
            {
                "input_path": f"{source}#page=1",
                "width": 2423,
                "model_settings": {"use_layout_detection": True},
                "parsing_res_list": [
                    {
                        "block_label": label,
                        "block_content": content,
                        "block_bbox": [1, 2, 3, 4],
                        "block_order": None if label == "header" else index,
                    }
                    for index, (label, content) in enumerate(blocks)
                ],
                "layout_det_res": {
                    "boxes": [
                        {"label": label, "score": 0.5, "coordinate": [1, 2, 3, 4]}
                        for label, _ in blocks * 2
                    ]
                },
            }
        ],
    }


OCR = _ocr_page(
    "call-1895.jpg",
    [
        ("header", "PRICE FIVE CENTS."),
        ("text", "STOCKTON, CAL., March 27.—Officers who have been making an effort."),
    ],
)


def test_candidates_rank_the_records_with_most_text_first() -> None:
    candidates = record_path_candidates(OCR)

    # The boxes are more numerous but hold no text, so they are not the default.
    assert [item.path for item in candidates] == [
        "/pages/parsing_res_list",
        "/pages/layout_det_res/boxes",
        "/pages",
        "",
    ]
    first = candidates[0]
    assert first.records == 2
    assert first.fields == ["block_label", "block_content", "block_bbox", "block_order"]
    assert candidates[1].records == 4
    assert default_record_path(OCR) == "/pages/parsing_res_list"


def test_flattening_keeps_first_level_fields_and_copies_parent_values() -> None:
    frame = flatten_json_sources(
        [JsonSource("call.json", OCR)],
        "/pages/parsing_res_list",
        file_column="file_path",
    )

    # The file, the record's own fields, then the values copied from above.
    assert frame.columns == [
        "file_path",
        "block_label",
        "block_content",
        "block_bbox",
        "block_order",
        "source",
        "pages.number",
        "pages.input_path",
        "pages.width",
    ]
    assert frame.schema["pages.number"] == pl.Int64
    assert frame.schema["block_order"] == pl.Int64
    assert frame["block_bbox"].to_list() == ["[1, 2, 3, 4]", "[1, 2, 3, 4]"]
    assert frame["block_order"].to_list() == [None, 1]
    assert frame["source"].to_list() == ["call-1895.jpg", "call-1895.jpg"]


def test_mixed_and_nested_values_become_text_and_null_stays_empty() -> None:
    document = [
        {"id": 1, "value": "abc", "score": 1, "flag": True, "author": {"name": "Ā"}},
        {"id": 2, "value": 5, "score": 2.5, "flag": None, "author": None},
        {"id": 3, "value": {"k": [1]}, "score": None, "flag": False},
    ]

    frame = flatten_json_sources([JsonSource("a.json", document)], "")

    assert frame.schema == pl.Schema(
        {
            "id": pl.Int64,
            "value": pl.String,
            "score": pl.Float64,
            "flag": pl.Boolean,
            "author": pl.String,
        }
    )
    assert frame["value"].to_list() == ["abc", "5", '{"k": [1]}']
    assert frame["author"].to_list() == ['{"name": "Ā"}', None, None]
    assert frame["score"].to_list() == [1.0, 2.5, None]


def test_whole_numbers_beyond_int64_are_kept_as_text() -> None:
    frame = flatten_json_sources([JsonSource("a.json", [{"n": 2**70}, {"n": 1}])], "")

    assert frame["n"].to_list() == [str(2**70), "1"]


def test_top_level_object_is_one_row_and_wrapped_list_is_offered() -> None:
    document = {"data": [{"text": "a"}, {"text": "b"}], "meta": {"n": 2}}

    assert [item.path for item in record_path_candidates(document)] == ["/data", ""]
    assert flatten_json_sources([JsonSource("w.json", document)], None).height == 2
    top = flatten_json_sources([JsonSource("w.json", document)], "")
    assert top.columns == ["data", "meta"]
    assert top.height == 1


def test_a_batch_is_read_one_way_and_names_files_without_that_place() -> None:
    other = _ocr_page("call-1896.jpg", [("text", "SACRAMENTO, CAL.")])
    frame = flatten_json_sources(
        [JsonSource("a.json", OCR), JsonSource("b.json", other)],
        None,
        file_column="file_path",
    )
    assert frame["file_path"].to_list() == ["a.json", "a.json", "b.json"]

    with pytest.raises(
        JsonRecordsError, match="c.json has no records at pages › parsing_res_list"
    ):
        flatten_json_sources(
            [JsonSource("a.json", OCR), JsonSource("c.json", [{"text": "x"}])],
            "/pages/parsing_res_list",
        )


def test_columns_mixed_across_files_become_text() -> None:
    frame = flatten_json_sources(
        [JsonSource("a.json", [{"id": 1}]), JsonSource("b.json", [{"id": "x7"}])],
        "",
        file_column="file_path",
    )

    assert frame["id"].to_list() == ["1", "x7"]


def test_parent_column_that_clashes_with_a_record_field_is_renamed() -> None:
    document = {"text": "volume", "items": [{"text": "a"}]}

    frame = flatten_json_sources([JsonSource("a.json", document)], "/items")

    assert frame.columns == ["text", "text (parent)"]


def test_no_records_is_a_plain_refusal() -> None:
    with pytest.raises(JsonRecordsError, match="found no records"):
        default_record_path([1, 2, 3])
    with pytest.raises(JsonRecordsError, match="no records at the top level"):
        flatten_json_sources([JsonSource("n.json", [[1, 2]])], "")


def test_record_paths_are_json_pointers() -> None:
    keys = ("a/b", "c~d", "")
    assert parse_record_path(format_record_path(keys)) == keys
    assert parse_record_path("") == ()
    assert describe_record_path("/pages/parsing_res_list") == "pages › parsing_res_list"
    assert describe_record_path("") == "the top level"
    with pytest.raises(ValueError):
        parse_record_path("pages")


def test_loader_reads_json_and_json_lines_at_the_chosen_place(tmp_path: Path) -> None:
    json_path = tmp_path / "call.json"
    json_path.write_text(json.dumps(OCR), encoding="utf-8")
    lines_path = tmp_path / "items.jsonl"
    lines_path.write_text(
        '{"items": [{"text": "a"}, {"text": "b"}]}\n\n{"items": [{"text": "c"}]}\n',
        encoding="utf-8",
    )

    assert materialize_data_file(json_path).height == 2
    boxes = materialize_data_file(json_path, record_path="/pages/layout_det_res/boxes")
    assert boxes.height == 4
    assert "label" in boxes.columns
    # Each line is a top-level record; the items inside hold the text.
    assert materialize_data_file(lines_path)["text"].to_list() == ["a", "b", "c"]
    assert materialize_data_file(lines_path, record_path="").columns == ["items"]


def test_loader_failures_say_what_to_do(tmp_path: Path) -> None:
    lines_path = tmp_path / "bad.jsonl"
    lines_path.write_text('{"a": 1}\n{"a":\n', encoding="utf-8")
    with pytest.raises(DataFileLoadError) as raised:
        materialize_data_file(lines_path)
    assert describe_load_failure(raised.value, "bad.jsonl").startswith(
        "Line 2 isn't valid JSON."
    )

    good = tmp_path / "good.json"
    good.write_text('[{"a": 1}]', encoding="utf-8")
    broken = tmp_path / "broken.json"
    broken.write_text('[{"a": 1},\n', encoding="utf-8")
    bad_line = tmp_path / "bad.jsonl"
    bad_line.write_text('{"a": 2}\n{"a":\n', encoding="utf-8")
    latin = tmp_path / "latin.json"
    latin.write_bytes(b'[{"a": "caf\xe9"}]')
    other = tmp_path / "other.json"
    other.write_text('[{"b": 1}]', encoding="utf-8")
    wrapped = tmp_path / "wrapped.json"
    wrapped.write_text('{"items": [{"a": 3}]}', encoding="utf-8")

    # A batch leaves out what it can't read and names each file with why.
    frame, skipped = materialize_json_files(
        [
            (good, "good.json"),
            (broken, "broken.json"),
            (bad_line, "bad.jsonl"),
            (latin, "latin.json"),
        ],
        "",
    )
    assert frame.to_dicts() == [{"file_path": "good.json", "a": 1}]
    assert [(item.path, item.reason) for item in skipped] == [
        ("broken.json", "Not valid JSON (line 2)"),
        ("bad.jsonl", "Line 2 isn't valid JSON"),
        ("latin.json", "Not saved as UTF-8 text"),
    ]

    # A readable file without records at the chosen place is left out too.
    frame, skipped = materialize_json_files(
        [(other, "other.json"), (wrapped, "wrapped.json")], "/items"
    )
    assert frame.to_dicts() == [{"file_path": "wrapped.json", "a": 3}]
    assert [(item.path, item.reason) for item in skipped] == [
        ("other.json", "No records at items")
    ]

    # Nothing readable: the batch is refused, naming the files.
    with pytest.raises(DataFileLoadError) as raised:
        materialize_json_files([(broken, "broken.json"), (latin, "latin.json")], None)
    assert describe_load_failure(raised.value) == (
        "None of the files could be read (broken.json: Not valid JSON (line 2); "
        "latin.json: Not saved as UTF-8 text)."
    )
