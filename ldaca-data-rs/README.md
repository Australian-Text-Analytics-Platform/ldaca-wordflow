# ldaca-data-rs

A standalone Rust and Python SDK for LDaCA ONI data access and RO-Crate conversion
to Apache Arrow. No pandas, Polars, SQLite, or PyArrow installation is required.
The Python interface delegates network and conversion operations to Rust.

## Python

```python
from ldaca_data_rs import Client, RoCrate

with Client(api_key=None) as client:  # supply your ONI API key for restricted data
    page = client.search(query="conversation", limit=25)
    crate = client.get_crate("arcp://name,example")
    print(crate.types())
    config = crate.infer_config()
    tables = crate.to_tables(types=["CreativeWork", "Person"])
    tables["CreativeWork"].write_parquet("works.parquet")
    tables.write_dir("exported-tables", format="csv")

# Offline conversion also accepts a mapping, JSON bytes, or a metadata file/directory.
crate = RoCrate({"@graph": [{"@id": "item", "@type": "CreativeWork", "name": "Café"}]})
table = crate.to_tables(types=["CreativeWork"])["CreativeWork"]
```

`AsyncClient` exposes the same operations as awaitables and is an async context
manager. Use it in asyncio applications; `Client` is for scripts and process
workers. Cancelling an await cancels native I/O. Create clients in their calling
process: they cannot be pickled. `with_api_key(key)` returns an independent
credential-bound view over the same HTTP pool; closing a view does not close its
siblings. Credentials are never included in client representations or errors.

The configurable base URL defaults to `https://data.ldaca.edu.au/api`. Requests
retain base path prefixes, encode IDs and file paths, and never send credentials
across origins. Authenticated HTTPS redirects cannot downgrade to HTTP. Credentials
must be supplied explicitly; the SDK does not read credential files or environment
variables. Public data can be accessed without a key. The SDK does not log in,
create/revoke tokens, accept terms, administer repositories, or modify portal data.

### Data-access methods

| Method | Result |
| --- | --- |
| `configuration()`, `version()`, `authenticated()` | Original ONI JSON |
| `browse(member_of=..., conforms_to=..., limit=..., offset=...)` | Original paginated structural results |
| `get_object(identifier)` | Object summary or `None` for a missing object |
| `get_metadata(identifier, resolved=False, rewrite_ids=False)` | Original or resolved metadata with explicit ID rewriting |
| `get_crate(...)` | Indexed offline `RoCrate` |
| `search(query, method=..., limit=25, offset=0)` | `SearchPage` with normalized items and original response |
| `search_raw(body, index="items")`, `search_field(field, value, index="items")` | Raw query support without losing aggregations |
| `featured_collections(identifiers)` | Ordered normalized summaries |
| `stream_file(identifier, path, max_bytes=...)` | Iterator/async iterator of bytes |
| `download_file(identifier, path, destination, max_bytes=...)` | Bytes written to a new file |
| `download_texts(identifier, paths, max_total_bytes=...)` | Ordered path/text mapping |
| `document_table(identifier, paths, max_total_bytes=...)` | Arrow `crate_id`, `path`, `text` table for explicitly selected files |

Search methods are `keyword`, `identifier`, `collection`, `file_format`, and `all`.
Convenience search page sizes are 1–100; offsets are zero-based. `SearchPage.raw`
retains access/error metadata, aggregations and provider pagination information.
Server-side totals may be capped by ONI/OpenSearch. Use `search_raw` for additional
query controls; the SDK does not invent an unsupported scroll API.

Defaults are a 30-second request timeout, 8 MiB JSON limit, 16 MiB per text-document
input, eight concurrent downloads and 10,000 documents. Bulk operations require an
explicit aggregate byte budget. Actual decompressed bytes are counted even when
Content-Length is absent or incorrect. Text decoding is strict, using the declared
charset or UTF-8. Download failures cancel remaining work and remove incomplete
files. There are no automatic retries. Close partially consumed generators
(`close()`/`aclose()`) to release their response streams promptly.

Exceptions derive from `DataError`: `InvalidInputError`, `InvalidResponseError`,
`HttpError`, `TimeoutError`, `SizeLimitError`, `ConversionError`, `IoError`, and
`CancelledError`. Python task cancellation remains `asyncio.CancelledError`.

## Conversion contract

`RoCrate` retains metadata order and indexes unique nonempty entity IDs. It rejects
malformed graphs, supports ordinary JSON-LD value/reference containers, and never
fetches or expands remote contexts. Rich containers and arbitrary nested objects
are retained as canonical JSON strings in flat tables. It is not an RDF engine.

`infer_config()` discovers types and properties without selecting a table.
`to_tables(types=[...])` or `to_tables(config={...})` selects tables explicitly.
Configuration supports `tables`, `potential_tables`, `all_props`, `ignore_props`,
`expand_props` and `junctions`. SQL export queries are unsupported.

- Selected entity types become ordered primary tables with `entity_id`.
- References produce name and ID columns, retaining unresolved target IDs.
- Configured expansion follows one level only, even in cyclic graphs.
- Small repeated values use a base column and suffixes `_1` through `_10`.
- More than ten references or eleven scalar values produce companion tables with
  `source_id`, zero-based `ordinal`, `target_id`, and `value`. Explicit junctions
  use the same representation. Generic conversion never discards wide relations.
- Generated column/table collisions are errors. Original property/type names are
  retained in Arrow metadata and directory export manifests.
- Schema inference scans all selected rows, retaining late properties and nulls.
  Numeric promotion is lossless; incompatible mixtures become UTF-8. Empty selected
  types produce an empty table with `entity_id`.
- Metadata is indexed in memory; bounded record batches do not imply out-of-core
  graph processing. Arrow output shares owned buffers through the capsule protocol.

Tables implement `__arrow_c_schema__` and `__arrow_c_stream__`. Optional consumers
can use `pyarrow.table(table)` or `polars.from_arrow(table)` without a JSON table
round trip. `write_parquet`, `write_csv`, and `write_ipc` use native Arrow writers.
Files are published atomically and never overwrite existing destinations. A table
set exports into a new directory with portable, hashed filenames and a manifest.
CSV uses UTF-8, header rows, standard quoting and empty fields for nulls; CSV alone
does not preserve Arrow types or distinguish every null/empty-string case. Parquet
and IPC retain types and schema metadata.

### Wordflow compatibility

`RoCrate.wordflow_table(identifier, config=...)` and
`Client.wordflow_table(identifier, crate, max_total_bytes=...)` explicitly select
`wordflow_v1`. The client variant prefers corpus text documents and falls back to
metadata. This profile preserves Wordflow's existing column names, ordering,
configuration selection, derivative preference and omission of wide relationships.
Those omissions are compatibility behavior, not the generic SDK default.

## Rust and development

The native library has no Python dependency unless the `python` feature is enabled.
Use the root async `Client` with Tokio or `blocking::Client` in synchronous code.
Modules expose `RoCrate`, typed configuration, Arrow `Table`/`TableSet`, document
conversion and typed `Error` results. No Python calls occur in the native core.

```sh
cargo test --locked
cargo clippy --all-targets --all-features --locked -- -D warnings
uv sync --python 3.14 --group interop
uv run --no-sync pytest -q
uv run --no-sync ty check ldaca_data_rs
uv run --no-sync ruff check ldaca_data_rs tests
uv build
```

Python binding tests live under `tests/python`; Rust integration tests live in
`tests/*.rs`, sharing captured compatibility data in `tests/fixtures`. For core
wheel acceptance, install only the SDK, pytest and pytest-asyncio into a fresh
environment and run `pytest -q -m "not interop"` against the tests from outside
the checkout. Run the full suite separately with optional consumers installed.

Use standard GIL-enabled CPython 3.11–3.14. PyArrow and Polars are test-only optional
consumers. `uv` build fingerprints include Rust sources and embedded configuration
so editable installs rebuild after native changes. The sdist contains native source
and configs. The CI workflow builds Linux x86-64, macOS arm64 and Windows x86-64
wheels. Version 0.1.0 remains unpublished until an explicit release action.

The tabulation approach follows
[RO-Crate Tabulator](https://github.com/Sydney-Informatics-Hub/rocrate-tabular);
this SDK is not a port of its SQLite engine, CLI, or notebook API. Wordflow's
application-owned rules and corpus configuration are the compatibility reference.

### Wordflow application acceptance

Run `uv run --no-sync python tests/oni_fixture.py` from this package to serve only
synthetic data on port 8873. From Wordflow's root, run:

```sh
WORDFLOW_SDK_ACCEPTANCE=1 \
LDACA_ONI_API_BASE_URL=http://127.0.0.1:8873/api \
LDACA_ONI_FEATURED_COLLECTION_IDS='["arcp://name,sdk-public"]' \
pnpm -C frontend test:e2e portal-sdk.spec.ts
```

The existing runner supplies a temporary Data Root. `sdk-public`, `sdk-failure`
and `sdk-slow` exercise successful publication, access failure and cancellation.
These are local fixtures, not public portal identifiers.
