"""Installed tokenizer catalogue route."""

from __future__ import annotations

from fastapi import APIRouter

from polars_text import TOKENIZER_MODELS

from ..models.tokenizer import TokenizerModelResource
from .responses import api_errors
from .security import CurrentSessionSecurityDep

# Not offered in v0.7 (issue 167): its 305 MB dictionary exceeds the 128 MB
# download cap in polars-text, so it always fails to load.
HIDDEN_TOKENIZER_MODELS = frozenset({"lindera:ja-ipadic-neologd"})

# The tokenizer's or dictionary's own page, for the link in the picker.
TOKENIZER_DOCS_URLS = {
    "native:plain_words_en": "https://github.com/Australian-Text-Analytics-Platform/polars-text",
    "huggingface:bert-base-uncased": "https://huggingface.co/google-bert/bert-base-uncased",
    "lindera:jieba": "https://github.com/fxsjy/jieba",
    "lindera:cc-cedict": "https://www.mdbg.net/chinese/dictionary?page=cc-cedict",
    "lindera:ja-ipadic": "https://taku910.github.io/mecab/",
    "lindera:ja-unidic": "https://clrd.ninjal.ac.jp/unidic/",
    "lindera:ko-dic": "https://bitbucket.org/eunjeon/mecab-ko-dic",
}

router = APIRouter(
    prefix="/tokenizer-models",
    tags=["tokenizers"],
    responses=api_errors(401),
)


@router.get(
    "",
    response_model=list[TokenizerModelResource],
    responses=api_errors(500),
)
async def list_tokenizer_models(
    _principal: CurrentSessionSecurityDep,
) -> list[TokenizerModelResource]:
    return [
        TokenizerModelResource(
            id=model.model_id,
            label=model.label,
            languages=list(model.languages),
            docs_url=TOKENIZER_DOCS_URLS.get(model.model_id),
        )
        for model in TOKENIZER_MODELS
        if model.model_id not in HIDDEN_TOKENIZER_MODELS
    ]


__all__ = ["router"]
