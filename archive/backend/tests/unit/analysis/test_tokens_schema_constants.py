"""Dynamic tokenization column naming and struct-schema contract.

Asserts:
- dynamic token column names are deterministic, and
- ``tokens_struct_dtype()`` lines up with the schema polars-text's
  ``tokenize`` actually emits.

These are the contracts every tokenization consumer relies on, so any drift
between Rust and Python schemas — or between the naming helper and its consumers
— must fail loudly here.
"""


from __future__ import annotations



from typing import Any, cast

import polars as pl
import polars_text  # noqa: F401
from ldaca_wordflow.analysis.generated_columns import (
    TOKENS_END_FIELD,
    TOKENS_START_FIELD,
    TOKENS_TOKEN_FIELD,
    tokenization_column_name,
    tokens_struct_dtype,
    tokens_struct_projection,
)

# Test fixture: canonical (source, model) we use throughout this module.
_TEXT_COLUMN = "text"
_MODEL = "native:plain_words_en"
_TOKENS_NAME = f"tokenization.{_TEXT_COLUMN}.{_MODEL}"


def test_native_tokens_match_backend_schema_and_projection() -> None:
    column = tokenization_column_name(_TEXT_COLUMN, _MODEL)
    tokenized = pl.DataFrame({"text": ["hello world"]}).select(
        cast(Any, pl.col("text")).text.tokenize(model=_MODEL).alias(column)
    )
    assert tokenized.schema[column] == tokens_struct_dtype()
    unpacked = tokenized.explode(column, empty_as_null=True).select(
        *tokens_struct_projection(column)
    )
    assert unpacked.to_dict(as_series=False) == {
        TOKENS_TOKEN_FIELD: ["hello", "world"],
        TOKENS_START_FIELD: [0, 6],
        TOKENS_END_FIELD: [5, 11],
    }
