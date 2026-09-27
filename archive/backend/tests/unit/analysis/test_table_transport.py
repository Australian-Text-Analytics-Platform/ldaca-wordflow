from __future__ import annotations
from io import BytesIO
import polars as pl
import pytest
from ldaca_wordflow.shared.table_transport import (
    TOPIC_COVERAGE_EXTENSION,
    encode_schema_stream,
    materialize_page,
    topic_coverage_dtype,
)
from ldaca_wordflow.shared.errors import InvalidInputError



def test_materialize_page_uses_lookahead_without_returning_extra_row() -> None:
    page = materialize_page(
        pl.DataFrame({"value": [3, 1, 2]}).lazy(),
        page=1,
        page_size=2,
        sort_by="value",
    )

    assert page.has_next is True
    assert pl.read_ipc_stream(BytesIO(page.content)).to_dict(as_series=False) == {
        "value": [1, 2]
    }


def test_materialize_last_page_reports_no_next_page() -> None:
    page = materialize_page(
        pl.DataFrame({"value": [1, 2, 3]}).lazy(),
        page=2,
        page_size=2,
    )

    assert page.has_next is False
    assert pl.read_ipc_stream(BytesIO(page.content))["value"].to_list() == [3]


def test_schema_stream_has_no_rows_and_preserves_types() -> None:
    content = encode_schema_stream(pl.Schema({"name": pl.String, "count": pl.Int64}))

    frame = pl.read_ipc_stream(BytesIO(content))
    assert frame.schema == pl.Schema({"name": pl.String, "count": pl.Int64})
    assert frame.height == 0


def test_invalid_sort_column_is_rejected() -> None:
    with pytest.raises(InvalidInputError, match="sort column"):
        materialize_page(
            pl.DataFrame({"value": [1]}).lazy(),
            page=1,
            page_size=20,
            sort_by="missing",
        )


def test_topic_coverage_extension_has_stable_identity_and_storage() -> None:
    dtype = topic_coverage_dtype(2)

    assert dtype.ext_name() == TOPIC_COVERAGE_EXTENSION
    assert dtype.ext_storage() == pl.Array(
        pl.Struct({"topic_id": pl.Int64, "coverage": pl.Float64}), 3
    )
