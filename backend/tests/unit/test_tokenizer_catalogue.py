"""Tokenizer catalogue offered to the pickers (issue 167)."""

from __future__ import annotations

import asyncio
from typing import Any, cast

from ldaca_wordflow.api.tokenizers import (
    HIDDEN_TOKENIZER_MODELS,
    list_tokenizer_models,
)


def test_catalogue_hides_unloadable_models_and_links_each_to_its_docs() -> None:
    models = asyncio.run(list_tokenizer_models(cast(Any, None)))
    ids = [model.id for model in models]
    assert "lindera:ja-ipadic-neologd" in HIDDEN_TOKENIZER_MODELS
    assert "lindera:ja-ipadic-neologd" not in ids
    assert {"native:plain_words_en", "lindera:ja-ipadic", "lindera:ko-dic"} <= set(ids)
    for model in models:
        assert model.languages, model.id
        assert model.docs_url and model.docs_url.startswith("https://"), model.id
