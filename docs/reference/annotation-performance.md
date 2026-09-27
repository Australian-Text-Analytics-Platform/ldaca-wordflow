# Annotation verification and performance

Annotation Run reads bounded text batches and stages predictions before one
atomic source-label update. These measurements cover that database path, not
provider throughput or a supported-corpus limit. See [native ownership](../architecture/backend/native-analyses.md#annotation)
and [the API](native-project-api.md#annotation-and-host-ai-connections).

## Local measurements, 27 September 2026

The optimized workspace backend benchmark used 100,000 synthetic rows on the
local Apple Silicon macOS 27 host. Rows have unique text identifiers, 160-character
documents, two Codebook labels and a comparison column with equal A/B counts.
Predictions are deterministic test values; no provider is called. Batch size 100
and concurrency 10 yield at most 1,000 document texts in each read.

| Operation | Observed result |
| --- | --- |
| Identifier validation, counts and context capture | 131 ms |
| Capture through staging and atomic publication | 10.93 s |
| Full-Table comparisons, difference filter and first ten-row Arrow page | 1.89 s |
| Peak resident memory, separate test process | 119,128,064 bytes (113.6 MiB) |

The filter retained exactly 50,000 rows; comparison counts covered all 100,000.
Memory includes test setup and DuckDB, but excludes Apple model services and
browser memory. The memory run overlapped a separate build and took 15.08 s
through publication and 2.74 s for review. Timings above came from the earlier
run without competing compilation. Neither run justifies a fixed corpus limit.

Reproduce the ignored benchmark from the root workspace:

```sh
cargo test --release --locked -p wordflow-backend annotation_database_benchmark -- --ignored --nocapture
```

For process RSS, run the resulting test executable separately and read
`resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss` from its parent Python
process. macOS reports bytes. Measuring Cargo itself would include compilation.

## Provider and application evidence

The real Apple adapter classified a three-document structured batch in 2.344 s;
an in-flight cancellation requested after 100 ms completed cleanup in 114.8 ms
total. This is a local smoke test, not a model-quality benchmark or general
latency guarantee. The model runs in Apple's system service. HTTP adapters use
deterministic local providers for response validation, retry/splitting and
failure coverage; paid-provider smoke tests were not performed.

Browser Annotation, ordinary editing and dependency scenarios passed (seven
tests). Native Annotation passed Manual, synthetic HTTP and real Apple Preview
and Run journeys, with normal/narrow panes and light/dark captures. Automated
screenshots do not replace independent Computer inspection. The clean release
bundle passed local signature, packaged ICU, startup and offline runtime checks;
it was not notarized or published.

Independent browser and clean-release visual inspection remains blocked by the
locked Mac. Broader native graph tests also need follow-up: a background-window
animation check is rejected by WebKit, and the dependency scenario's Close
preview assertion fails, although its browser counterpart passes. No cause is
claimed for the latter. macOS 26 hardware, Windows and Linux execution remain
unverified locally. The [active delivery record](../../specs/active/native-annotation/tasks.md)
keeps these outstanding gates explicit.
