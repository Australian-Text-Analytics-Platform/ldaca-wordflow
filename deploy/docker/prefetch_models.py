"""Download, at image build time, the models Wordflow otherwise fetches on first use.

Runs Wordflow's own code paths, so the files land exactly where the running
app looks for them: the spaCy model for Quotation (under the platform cache,
XDG_CACHE_HOME), and the topic embedder and BERT tokenizer used by the Rust
pipeline (under HF_HOME).
"""

from __future__ import annotations

from ldaca_wordflow.analysis.quotation_extractor import _load_spacy_model
from ldaca_wordflow.workers.topic_modeling import _DEFAULT_EMBEDDER_MODEL
from ldaca_wordflow.workers.topic_pipeline import _run_rust_topic_modeling

TOPICS = (
    "The council approved the new budget for public housing.",
    "Rents in the city rose again this quarter.",
    "The cricket team won the final after a long innings.",
    "Fans celebrated the football victory late into the night.",
    "Researchers published a study on coral reef bleaching.",
    "Ocean temperatures are damaging the reef ecosystem.",
)


def main() -> None:
    _load_spacy_model()
    docs = [f"{text} Example {index}." for index in range(5) for text in TOPICS]
    for tokenizer in ("native:plain_words_en", "huggingface:bert-base-uncased"):
        _run_rust_topic_modeling(
            all_docs=docs,
            seed=0,
            min_cluster_size=2,
            vectorizer_model=tokenizer,
            embedder_model=_DEFAULT_EMBEDDER_MODEL,
        )
    print("Models are cached.")


if __name__ == "__main__":
    main()
