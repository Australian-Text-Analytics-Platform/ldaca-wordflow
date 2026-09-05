from __future__ import annotations

from io import BytesIO
import os
from pathlib import Path
import subprocess
import sys

import polars as pl

from ldaca_wordflow.shared.table_transport import (
    materialize_page,
)












def test_foreign_extension_survives_parquet_sql_and_ipc(tmp_path: Path) -> None:
    storage = pl.Struct({"value": pl.Int64, "confidence": pl.Float64})
    foreign = pl.Extension(
        "org.example.foreign_measure.v2",
        storage,
        '{"unit":"widgets"}',
    )
    path = tmp_path / "foreign.parquet"
    pl.DataFrame(
        {
            "measure": pl.Series(
                "measure",
                [{"value": 7, "confidence": 0.9}],
                dtype=foreign,
            )
        }
    ).write_parquet(path)

    source = pl.scan_parquet(path)
    source_dtype = source.collect_schema()["measure"]
    assert isinstance(source_dtype, pl.Extension)
    assert source_dtype.ext_name() == foreign.ext_name()
    assert source_dtype.ext_metadata() == foreign.ext_metadata()

    restored = pl.LazyFrame.deserialize(BytesIO(source.serialize(format="binary")))
    restored_dtype = restored.collect_schema()["measure"]
    assert isinstance(restored_dtype, pl.Extension)
    assert restored_dtype.ext_name() == foreign.ext_name()

    with pl.SQLContext(eager=False) as context:
        context.register("source", source)
        query = context.execute("SELECT measure AS renamed FROM source")
        page = materialize_page(query, page=1, page_size=20)

    decoded_dtype = pl.read_ipc_stream(BytesIO(page.content)).schema["renamed"]
    assert isinstance(decoded_dtype, pl.Extension)
    assert decoded_dtype.ext_name() == foreign.ext_name()
    assert decoded_dtype.ext_storage() == storage
    assert decoded_dtype.ext_metadata() == foreign.ext_metadata()


def test_package_bootstrap_preserves_unregistered_extensions() -> None:
    environment = os.environ.copy()
    environment.pop("POLARS_UNKNOWN_EXTENSION_TYPE_BEHAVIOR", None)
    script = """
import pathlib
import tempfile
import ldaca_wordflow
import polars as pl

storage = pl.Struct({"value": pl.Int64})
extension = pl.Extension("org.example.bootstrap.v1", storage, "metadata")
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory) / "foreign.parquet"
    pl.DataFrame(
        {"value": pl.Series("value", [{"value": 1}], dtype=extension)}
    ).write_parquet(path)
    restored = pl.scan_parquet(path).collect_schema()["value"]
    assert isinstance(restored, pl.Extension)
    assert restored.ext_name() == extension.ext_name()
    assert restored.ext_metadata() == extension.ext_metadata()
"""

    subprocess.run(
        [sys.executable, "-c", script],
        check=True,
        env=environment,
        capture_output=True,
        text=True,
    )
