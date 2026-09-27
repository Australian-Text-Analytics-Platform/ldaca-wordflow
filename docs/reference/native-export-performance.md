# Native Export verification and performance

Measured locally on 2026-09-27, macOS 27.0, Apple Silicon, with the locked
workspace backend and DuckDB 1.5.5. This is a local observation, not a throughput
guarantee or a basis for a corpus-size limit.

## Reproducible dataset and measurement

The ignored `project::exports::tests::benchmark_exports` test creates 1,000,000
rows with an exact integer ID, roughly 168 characters of text and 31 groups.
A second View selects five groups. Every export includes the complete requested
data. Files and projects are temporary and removed when the benchmark finishes.

Run from the workspace root:

```sh
cargo test -p wordflow-backend --locked benchmark_exports -- --ignored --nocapture
```

The debug test executable was also measured directly with `/usr/bin/time -l` to
exclude compilation from resource accounting. Its second local run reported:

| Output | Time | Bytes |
|---|---:|---:|
| Arrow IPC, 1,000,000 rows | 0.416 s | 194,432,930 |
| Parquet, 1,000,000 rows | 0.216 s | 15,211,504 |
| CSV ZIP, full Table plus five-group View | 16.383 s | 7,081,490 |
| Selected project, Table and preserved View | 0.746 s | 29,372,416 |
| Complete project | 0.595 s | 29,372,416 |

Peak resident memory was 828,735,488 bytes (790 MiB) for the **whole benchmark
process**, including dataset creation, DuckDB buffers and all five operations.
It is not an isolated export-buffer measurement or evidence of constant memory.
An earlier run during concurrent compilation took 33 seconds for the ZIP and
about two seconds per project, illustrating host-load sensitivity.

IPC consumes Arrow batches; ZIP retains one temporary member at a time and
copies with a 64 KiB buffer. DuckDB owns COPY execution and its memory use.
The native shell receives a staged file rather than sending its contents through
the webview. Browser downloads still use the existing HTTP Blob flow.

## Coverage boundaries

The focused regressions exercise constraints/defaults/generated columns/indexes,
required types/sequences, macro parameter defaults in complete copies, catalogue
rebasing, external View materialization, immutable opaque result JSON, Arrow
annotations, ZIP naming and committed-snapshot isolation. Shell tests cover
cancelled/failed installation, caller disconnect, late cancellation and open
project destinations.

Browser WebdriverIO imports the repository's 480-row community survey through
the UI, downloads all five formats and a selected project, and checks format
contents. Native WebdriverIO checks the real webview's selection, inspection,
navigation, reload, themes and pane widths. Native save dialogs and release
packaging require the separate Computer/release checks; WebdriverIO does not
stand in for them. Windows and Linux were not executed locally.

See [native export ownership](../architecture/backend/native-exports.md) for
the implementation contract.
