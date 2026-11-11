# polars-text API Reference

Version 0.6 requires Python Polars 1.44.1. Importing `polars_text` registers the
sole expression façade, the `.text` namespace. The namespace registers native
plugins against the exact imported `_internal` extension; `clean_text` and
`char_count` are native Polars expression compositions.

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
expr.text.segment_token_counts(unit="automatic", *, model=None)
expr.text.topic_modeling(
    *, embedding_model=None, embedding_cache=None,
    segmentation="automatic", max_tokens=256, seed=42,
    min_topic_size=10, max_topic_size=None, tokenizer_model=None,
    lowercase=True, cluster_sample_size=None, min_samples=None,
    outlier_similarity=None, outlier_member_quantile=None
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
and Wordflow enforce. Wordflow also offers
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, whose maximum is
128. Cache paths are dedicated disposable storage and may be replaced completely
when their schema or model-pipeline fingerprint changes.

Since 0.6.8 every embedding call sorts its texts by token count and runs
batches of 32. On macOS the two models above (their plain `model.onnx` export)
run on Core ML through static-shape sessions, one per length bucket of 32, 64,
128 and 256 tokens up to the model's maximum, each compiled on first use into
`coreml/` inside the Hugging Face cache. Other models, Linux and Windows embed
on ONNX Runtime's CPU provider. The execution policy is part of the embedding
cache fingerprint, so a Mac and a server cache separately; Core ML vectors agree
with the CPU's to about 1e-4. When Core ML cannot be prepared the model runs on
the CPU and the reason is printed once to standard error.
`POLARS_TEXT_EMBEDDING_PROVIDER=cpu` keeps a Mac on the CPU, and
`POLARS_TEXT_EMBEDDING_THREADS` caps CPU threads for embedding and topic
segmentation.

`segment_token_counts` returns `List[UInt32]`: per row, the token counts of the
units a segmentation mode keeps whole (`automatic`: the whole text;
`paragraph`: the paragraphs Automatic packs; `line`; `sentence`), counted with
the embedding model's tokenizer, special tokens included, never split. Units
without letters or digits are skipped and null rows stay null. It loads only the
tokenizer.

The scalar topic result is:

```text
{
  documents: [{doc_index, dominant_topic, topic_coverage}],
  topics: [{id, representative_words, x, y}],
  n_segments,
  outlier_segments,
  assigned_segments,
  projection_context
}
```

`min_samples` is HDBSCAN's density setting: how many neighbours a segment
needs close by to count as inside a dense region. `None` ties it to
`min_topic_size`. A smaller value leaves fewer outliers but finds many more,
smaller topics; Wordflow does not use it (see the
[Ungrouped measurement](../reviews/topic-modeling-ungrouped-2026-11-11.md)).

After clustering, outlier segments can join the topic whose centre they are
most similar to. A centre is the unit-length mean of the embeddings of the
segments clustering put in the topic, taken before any segment joins.
`outlier_similarity` admits a segment at or above that cosine similarity, the
same for every topic (`-1` admits every one). `outlier_member_quantile` sets
the bar per topic: at least as similar as that share of the topic's own
members are (`0` is the least similar member). Give one or neither. Topic
words still come from the segments clustering put in each topic.
A topic's centre stays that of the segments clustering put in it: joined
segments are stored with a `joined` mark, count towards the topic's coverage,
and are left out of the centre used for the merge tree, the map and
`topic_segment_similarities`, whose rows are `[segment_index, document_index,
start_char, end_char, similarity, joined]`.
`outlier_segments` is the number of segments in no topic at the end;
`assigned_segments` is how many joined one, or null when neither option was
given. With `cluster_sample_size`, joining follows the nearest-neighbour step.

Topic Coverage is weighted by the source-character length owned by each Topic
Segment. Outlier `-1` competes normally for dominance. Clustering still treats
each segment as one observation. When the corpus cannot support a real HDBSCAN
Topic, `topics` is empty and `projection_context` is null. Otherwise the context
is compressed MessagePack used by supported projectors without rerunning
embedding or HDBSCAN.

## Whole-Series Utilities

- `token_frequencies(series, model=...)`
- `token_frequency_stats(corpus_0, corpus_1)`
- `project_topics(projection_context, topic_count)`
- `project_topic_basis(projection_context, topic_count, corpus_sizes)`

`project_topics` returns projected `documents` and `topics` for any count from
one through the natural real-Topic count.
`project_topic_basis` returns topic metadata plus sorted
`[corpus_index, topic_id, minimum_n, count]` activations.

The immutable tokenizer catalogue is `TOKENIZER_MODELS`, a tuple of
`TokenizerModel(model_id, label, languages)` records. Registry prefetch and
loaded-model inspection are not public APIs.

Serialized-plan path functions belong to `polars_source_utils`.
