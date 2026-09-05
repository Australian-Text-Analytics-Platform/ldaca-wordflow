from __future__ import annotations
import polars as pl
from ldaca_wordflow.analysis.concordance_core import (
    compute_node_concordance_page,
)
from ldaca_wordflow.analysis.token_cache import tokenize_lazyframe

ZH_TEXT = "今天天气很好今天我们出去玩"
ZH_TOKENS = [
    {"token": "今天", "start": 0, "end": 2},
    {"token": "天气", "start": 2, "end": 4},
    {"token": "很", "start": 4, "end": 5},
    {"token": "好", "start": 5, "end": 6},
    {"token": "今天", "start": 6, "end": 8},
    {"token": "我们", "start": 8, "end": 10},
    {"token": "出去", "start": 10, "end": 12},
    {"token": "玩", "start": 12, "end": 13},
]


def test_token_mode_hydrates_only_requested_page_slice(
    tmp_path, cached_native_tokenizer
) -> None:
    cache_file = tmp_path / "tokens.duckdb"
    source = pl.DataFrame({"text": [f"hello {index}" for index in range(5)]}).lazy()
    tokenized, tokenization_col = tokenize_lazyframe(
        data=source,
        source_column="text",
        model="huggingface:bert-base-uncased",
        cache_path=cache_file,
    )

    page = compute_node_concordance_page(
        {
            "lf": tokenized,
            "column": "text",
            "label": "probe",
            "tokenization_column": tokenization_col,
        },
        {
            "search_word": "hello",
            "regex": False,
            "whole_word": False,
            "case_sensitive": False,
            "num_left_tokens": 1,
            "num_right_tokens": 1,
            "search_mode": "tokens",
        },
        page=1,
        page_size=2,
        sort_by=None,
        descending=True,
    )

    # Validate that only the 2 requested page slice rows were tokenized/cached
    import duckdb

    with duckdb.connect(str(cache_file), read_only=True) as conn:
        row = conn.execute("SELECT count(*) FROM token_cache").fetchone()
        assert row is not None
        cached_count = row[0]
    assert cached_count == 2

    assert page["pagination"]["page_size"] == 2
    assert page["pagination"]["total_source_rows"] == 5
    assert page["pagination"]["result_count"] == 2
