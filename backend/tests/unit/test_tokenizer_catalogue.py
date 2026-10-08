"""The tokeniser catalogue shown in the picker."""

from __future__ import annotations

import asyncio
from typing import Any, cast

from ldaca_wordflow.api.tokenizers import list_tokenizer_models


def test_plain_words_is_offered_for_any_language_with_spaces() -> None:
    models = {model.id: model for model in asyncio.run(list_tokenizer_models(cast(Any, None)))}

    plain = models["native:plain_words_en"]
    assert plain.label == "Plain words"
    assert plain.languages == ["*"]
    assert models["huggingface:bert-base-uncased"].languages == ["en"]
    assert "lindera:ja-ipadic-neologd" not in models
