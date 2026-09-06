import gc
import json
from pathlib import Path

import pytest

from ldaca_data_rs import ConversionError, InvalidInputError, RoCrate

FIXTURES = json.loads(
    (Path(__file__).parent.parent / "fixtures/wordflow-baseline.json").read_text()
)


@pytest.mark.interop
@pytest.mark.parametrize("fixture", FIXTURES["fixtures"], ids=lambda f: f["name"])
def test_wordflow_values_and_schema_match_python_baseline(fixture, tmp_path):
    pl = pytest.importorskip("polars")
    table = RoCrate(fixture["metadata"]).wordflow_table(
        "fixture", config=fixture["config"]
    )
    output = tmp_path / "table.parquet"
    table.write_parquet(output)
    frame = pl.read_parquet(output)
    assert frame.to_dicts() == fixture["rows"]
    assert {key: str(dtype) for key, dtype in frame.schema.items()} == fixture["schema"]


@pytest.mark.interop
def test_arrow_export_survives_source_drop_and_can_be_consumed_twice():
    pa = pytest.importorskip("pyarrow")
    crate = RoCrate({"@graph": [{"@id": "w", "@type": "Work", "name": "Café 🎙"}]})
    tables = crate.to_tables(types=["Work"])
    table = tables["Work"]
    capsule = table.__arrow_c_stream__()
    del crate, tables
    gc.collect()
    # Test the public protocol as well as a capsule exported before producer deletion.
    first = pa.table(table)
    second = pa.table(table)
    del table
    gc.collect()
    reader = pa.RecordBatchReader._import_from_c_capsule(capsule)
    assert first.equals(second)
    assert reader.read_all().equals(first)
    assert first.to_pylist()[0]["name"] == "Café 🎙"


def test_no_dataframe_package_is_required_for_export(tmp_path):
    table = RoCrate({"@graph": [{"@id": "w", "@type": "Work", "x": 2}]}).to_tables(
        types=["Work"]
    )["Work"]
    for fmt in ("parquet", "csv", "ipc"):
        table.write(tmp_path / f"data.{fmt}", fmt)
        assert (tmp_path / f"data.{fmt}").stat().st_size > 0


def test_generic_wide_relationships_are_companion_tables():
    tables = RoCrate(
        {
            "@graph": [
                {
                    "@id": "w",
                    "@type": "Work",
                    "authors": [{"@id": str(n)} for n in range(12)],
                }
            ]
        }
    ).to_tables(types=["Work"])
    assert tables.keys() == ["Work", "Work_authors"]
    assert tables["Work_authors"].num_rows == 12


@pytest.mark.parametrize(
    "metadata", [{}, {"@graph": [{}]}, {"@graph": [{"@id": "x"}, {"@id": "x"}]}]
)
def test_invalid_metadata_is_an_error(metadata):
    with pytest.raises(InvalidInputError):
        RoCrate(metadata)


def test_generated_collision_is_an_error():
    crate = RoCrate(
        {"@graph": [{"@id": "w", "@type": "W", "tag": ["a", "b"], "tag_1": "real"}]}
    )
    with pytest.raises(ConversionError, match="collision"):
        crate.to_tables(types=["W"])


def test_source_file_and_directory_loading(tmp_path):
    path = tmp_path / "ro-crate-metadata.json"
    path.write_text('{"@graph": [{"@id": "x", "@type": "W"}]}')
    assert RoCrate.from_path(path).types() == ["W"]
    assert RoCrate.from_path(tmp_path).types() == ["W"]


def test_title_comes_from_described_root_after_id_rewriting():
    crate = RoCrate(
        {
            "@graph": [
                {
                    "@id": "ro-crate-metadata.json",
                    "about": {"@id": "arcp://name,corpus/"},
                },
                {
                    "@id": "arcp://name,corpus/",
                    "@type": "Dataset",
                    "name": "Australian Conversation Corpus",
                },
            ]
        }
    )
    assert crate.name("arcp://name,corpus") == "Australian Conversation Corpus"
