"""Vectorizer routing for the Rust topic-modeling pipeline.

The Rust topic-modeling pipeline tokenizes the topic text itself for c-TF-IDF,
so the Python side only decides *which* segmenter the pipeline should use
(plain English words vs a lindera CJK dictionary). Stopwords and display caps
are presentation settings and never enter this computation boundary.
"""


from __future__ import annotations



from ldaca_wordflow.workers.topic_pipeline import (
    _LINDERA_JA_VECTORIZER,
    _LINDERA_KO_VECTORIZER,
    _LINDERA_ZH_VECTORIZER,
    _PLAIN_WORDS_EN_VECTORIZER,
    _resolve_vectorizer_model,
)


import pytest


@pytest.mark.parametrize(
    ("documents", "expected"),
    [
        (
            ["The market rallied today as investors bought shares."],
            _PLAIN_WORDS_EN_VECTORIZER,
        ),
        (["市场今天上涨投资者纷纷买入股票"], _LINDERA_ZH_VECTORIZER),
        (["今日は市場が上昇しました。"], _LINDERA_JA_VECTORIZER),
        (["오늘 시장이 상승했습니다"], _LINDERA_KO_VECTORIZER),
        ([], _PLAIN_WORDS_EN_VECTORIZER),
    ],
    ids=["english", "chinese", "japanese", "korean", "empty-fallback"],
)
def test_vectorizer_dispatch_uses_document_script(documents, expected) -> None:
    assert _resolve_vectorizer_model(documents) == expected
