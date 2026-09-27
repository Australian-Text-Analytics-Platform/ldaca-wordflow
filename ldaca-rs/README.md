# ldaca-rs

Reusable native text analysis and LDaCA ONI/RO-Crate data access. This is a Rust
library, not a database extension, Python module, HTTP service, or application.

```rust
use ldaca_rs::text::{clean_text, word_count};
assert_eq!(clean_text("Hello, 123 WORLD!"), "hello world");
assert_eq!(word_count("Hello world"), 2);
```

## Features

Default builds provide cleaning, Unicode counts, the tokenizer catalogue, and
frequency comparison statistics. Enable only the capabilities needed:

| Feature | Capability |
| --- | --- |
| `data` | Async ONI client, bounded downloads, RO-Crate conversion, Arrow tables and exports |
| `tokenization` | Loaded tokenizers, Unicode offsets, compiled concordance and token frequencies |
| `embedding` | ONNX Runtime sentence embeddings |
| `topic-modeling` | Segmentation, embeddings, clustering, topic coverage and projections |
| `quotation` | Explicitly loaded local UDPipe quotation extractor |
| `cache` | Dedicated disposable token/embedding caches when their corresponding feature is enabled |
| `full` | All capabilities |

Data-only builds need no model runtime, Python, Polars, or DuckDB. Tokenization
and embedding support execution without persistent caches. Caching itself uses
DuckDB and therefore includes its Arrow dependencies; uncached text features do
not require the data SDK's Arrow/ONI interface.

## Native interfaces

- `text::Tokenizer::load(model_id)` loads/reuses a model; `tokenize` returns typed
  tokens. Offsets count Unicode characters in processed (possibly lowercased)
  text, with exclusive ends.
- `text::Concordance::new(query, options)` compiles a literal or regex query once.
  `find(text)` returns typed matches and contexts from the original source.
- `text::FrequencyAccumulator` counts one document at a time so hosts can stream
  input and check cancellation between documents. `token_frequencies(texts,
  &tokenizer)` uses the same accumulator over an iterator. `frequency_stats`
  compares count maps and returns lexically ordered records; undefined ratios
  retain IEEE infinity/NaN, and integer overflow returns an error.
- `embedding::Embedder::load(model_id)` loads/reuses a sentence encoder.
  `encode_batches` preserves input order; `encode_cached` additionally accepts a
  dedicated cache path when built with `cache`.
- `topic_modeling::run(documents, config)` returns independent document/topic
  results and optional binary projection context. Projectors return Rust values.
- `quotation::QuotationExtractor::load(path)` owns a model; `extract(text)` returns
  quotes with exact original-source character spans. Use one extractor per thread.
- `data::Client` is asynchronous and uses the host's Tokio runtime. Credentials
  belong to client views; download limits and cancellation remain explicit.
  `data::Table` contains Arrow record batches. Exports accept `data::table::ExportFormat`.

Model loading may download missing Hugging Face/Lindera artifacts using their
existing cache behavior. Quotation never downloads a model. Persistent text caches
are disposable files and must never point at a Wordflow project database.
`LDACA_EMBEDDING_THREADS` optionally controls the embedding runtime thread count.

## Local development

```sh
cargo test --locked
cargo test --locked --features data
cargo test --locked --all-features
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo fmt --check
```

Model acceptance requires `WORDFLOW_TEST_UDPIPE_MODEL` pointing to a provisioned
UDPipe model. `scripts/download_quotation_test_model.py` provisions the pinned
test model. Run ignored model tests explicitly with the quotation feature.

`polars-text/` is the sibling Polars/PyO3 adapter and uses a Cargo path dependency.
Its wheel retains the public Python API and lazy expressions. The old data SDK's
Python bindings have been removed. FastAPI's old SDK callers are not maintained
by this extraction. CI, publication, and independent repository setup are deferred.

UDPipe sources and licences are in `vendor/udpipe`; quotation rule attribution is
in `src/quotation/LICENSE`. No model files or user data belong in this repository.
