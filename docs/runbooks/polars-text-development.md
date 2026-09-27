# polars-text Development Runbook

From a checkout of the independent
[polars-text repository](https://github.com/Australian-Text-Analytics-Platform/polars-text):

```bash
make build
make test
uvx ty check
```

For faster Rust iteration, use the feature-scoped targets:

```bash
make check-basic
make check-tokenization
make check-embedding
make check-tokenization-embedding
make check-topic
make build-basic
make build-tokenization
make build-embedding
make build-tokenization-embedding
make build-topic
```

Default builds use `full = ["topic-modeling", "quotation"]`; topic modeling enables its
tokenization, embedding, and internal cache prerequisites. Base, tokenization,
embedding, tokenization-plus-embedding, topic, quotation, and full configurations must all
compile. Run strict Clippy before handoff:

```bash
cargo clippy --all-targets --all-features --locked -- -D warnings
```

Direct PyO3 functions are compiled and registered only with their owning Cargo
feature. Feature-scoped builds replace the same editable extension file, so
always finish with `uv run make build` before Python acceptance.

Leave Cargo's job count unset unless an explicit local limit is required.
Tokenizer, dictionary, and ONNX assets may download on first use.

## Quotation verification

Provision the pinned model explicitly for tests (weights are never bundled):

```sh
python scripts/download_quotation_test_model.py /tmp/quotation.udpipe
cargo test --locked --no-default-features --features quotation
WORDFLOW_TEST_UDPIPE_MODEL=/tmp/quotation.udpipe cargo test --locked --no-default-features --features quotation -- --ignored
WORDFLOW_TEST_UDPIPE_MODEL=/tmp/quotation.udpipe uv run pytest -q --require-models tests/test_quotation.py
make check-quotation
make build-quotation
```

Restore `make build` after feature-scoped builds. The quotation feature requires
a C++17 compiler, but base/tokenization/embedding/topic-only builds do not require
UDPipe or its bridge. No external UDPipe installation is used.

See [test suite ownership and artifact verification](test-suites.md) for offline
checks, feature matrices and installed-wheel acceptance.

## Shared native core

The adapter resolves `ldaca-rs` from its locked Wordflow Git dependency. Run
algorithm tests and feature checks in Wordflow; keep Series/schema and Python
ABI tests in the adapter repository. Model sources and provisioning scripts
belong to the core. The adapter's script entrypoints delegate there.
