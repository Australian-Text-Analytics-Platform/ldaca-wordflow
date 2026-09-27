# polars-text API Reference

Version 0.8 requires Python Polars 1.44.1. Importing `polars_text` registers the
sole expression façade, the `.text` namespace. The namespace registers native
plugins against the exact imported `_internal` extension; all custom computation delegates to the native `ldaca-rs` library.

## Expression Namespace

```python
expr.text.tokenize(
    *, model, lowercase=True, remove_punctuation=True, cache=None
)
expr.text.concordance(
    query, *, left_tokens=5, right_tokens=5, regex=False,
    case_sensitive=False, ignore_punctuation=False
)
expr.text.embedding(*, model=None, cache=None, batch_size=None)
expr.text.topic_modeling(
    *, embedding_model=None, embedding_cache=None,
    segmentation="automatic", max_tokens=256, seed=42,
    min_topic_size=10, max_topic_size=None,
    tokenizer_model=None, lowercase=True
)
expr.text.clean_text()
expr.text.word_count()
expr.text.char_count()
expr.text.sentence_count()
```

Tokenization returns `List[Struct[token: String, start: Int64, end: Int64]]`
with Unicode character offsets. Model IDs use the `native:`, `huggingface:`, or
`lindera:` namespace. `word_count` and `sentence_count` follow Unicode UAX #29.

Concordance always slices contexts from the original source text, preserving
its punctuation and whitespace. `ignore_punctuation` changes which tokens count
toward the left and right window and L1/R1, not matching or returned text.

Topic segmentation accepts `automatic`, `line`, or `sentence`. Every mode emits
non-overlapping source spans. Oversized semantic units are subdivided on Unicode
and token boundaries without discarding tail text. `max_tokens` includes any
special tokens added by the embedding model.

The default embedder is `sentence-transformers/all-MiniLM-L6-v2`. Its Sentence
Transformers metadata declares a 256-token maximum, which both the namespace
and Wordflow enforce. Cache paths are dedicated disposable storage and may be
replaced completely when their schema or model-pipeline fingerprint changes.

The scalar topic result is:

```text
{
  documents: [{doc_index, dominant_topic, topic_coverage}],
  topics: [{id, representative_words, x, y}],
  n_segments,
  max_topic_size,
  projection_context
}
```

Topic Coverage is weighted by the source-character length owned by each Topic
Segment. Outlier `-1` competes normally for dominance. Clustering still treats
each segment as one observation. When the corpus cannot support a real HDBSCAN
Topic, `topics` is empty and `projection_context` is null. Otherwise the context
is compressed MessagePack used by supported projectors without rerunning
embedding or HDBSCAN.

`max_topic_size=None` selects the adapter's adaptive cap; a positive fixed value
sets the largest selectable topic in segments. Wordflow's own native Topic
Modelling workflow retains its established uncapped clustering behavior.

## Whole-Series Utilities

- `token_frequencies(series, model=...)`
- `token_frequency_stats(corpus_0, corpus_1)`
- `project_topics(projection_context, topic_count)`
- `project_topic_basis(projection_context, topic_count, corpus_sizes)`
- `project_topic_segments(projection_context, topic_count)`

`project_topics` returns projected `documents` and `topics` for any count from
one through the natural real-Topic count.
`project_topic_basis` returns topic metadata plus sorted
`[corpus_index, topic_id, minimum_n, count]` activations.
`project_topic_segments` returns `(document_index, start_char, end_char,
topic_id)` for every segment at the selected merge cut. Older version-2
contexts remain readable for other projections but cannot supply spans.

The immutable tokenizer catalogue is `TOKENIZER_MODELS`, a tuple of
`TokenizerModel(model_id, label, languages)` records. Registry prefetch and
loaded-model inspection are not public APIs.

Serialized-plan path functions belong to `polars_source_utils`.

## Quotation (0.8.0)

```python
pl.col("document").text.quotation(model_path="/absolute/path/model.udpipe")
```

Requires the `quotation` Cargo feature, included in `full`. The input must be
String. Construction and schema inspection do not load a model, download, or
collect. Evaluation uses only the supplied local file. Null, empty, and blank
rows return empty lists. Input order and duplicate documents are retained.

Each row returns `List[Struct]` containing `quote`, nullable `speaker` and `verb`
(String), their `*_start_idx` and `*_end_idx` (Int64, nullable for absent fields),
`quote_type` (String), `quote_token_count` (Int64), `is_floating_quote` (Boolean),
and `quote_row_idx` (Int64, consecutive within each document after filtering).
Offsets count Unicode characters with exclusive ends; each non-null string is
exactly its original source slice. Parsing and model failures raise Polars
computation errors. English is supported; spaCy output equality is not promised.
