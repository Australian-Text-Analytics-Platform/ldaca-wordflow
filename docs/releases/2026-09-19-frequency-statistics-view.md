# Frequency statistics View verification — 19 September 2026

Frequency now publishes a private statistics View over immutable saved count
Tables. The decision was conditional on measuring the repeated query cost.
[Native analyses](../architecture/backend/native-analyses.md) owns the current
storage and lifecycle contract; this page records the benchmark evidence.

## Method

The [reproducer](../../backend/scripts/benchmark_frequency_views.py) loads the
production SQL definition and compares it with a materialized copy of its original
17 statistical fields. The Table path derives Overuse and Signed LL as the prior
implementation did. The View path includes those fields in its saved definition.
No real project or user corpus is opened.

Run from the repository root:

```sh
uv run --no-project --with duckdb==1.5.5 python backend/scripts/benchmark_frequency_views.py --on-disk --output /tmp/frequency-view-benchmark.json
```

Use `--threads 1` for the serial case, `--sizes` to choose vocabulary sizes and
`--repeats` to change the repetition count. Omit `--on-disk` for an in-memory
database. The Python DuckDB wheel is a benchmark-only tool; no application
dependency was added. All database/export files are generated in a temporary
directory and removed on normal completion.

Measurements used DuckDB 1.5.5 on the local macOS development machine, four
threads, an on-disk database with warm caches, alternating execution order and
five measured repetitions after warming each path. Synthetic vocabularies contain
10,000, 100,000 and 1,000,000 distinct tokens, with partial overlap, exclusive
tokens, different frequency distributions and unequal corpus totals.

Each page measures the actual query shape: total-row count followed by a sorted
50-row page. The deep page starts halfway through the vocabulary. The filtered
page includes a wildcard and stopwords. Juxtorpus selects 100 words from each
ranking end, with the existing minimum-count rule and deduplication, and includes
both the row-count query and result query. CSV measures complete sorted output
using DuckDB `COPY` into a temporary file.

These are engine-level measurements, not full HTTP/UI latency or the runtime's
Rust CSV-formatting cost. They do not establish cold-disk, memory-pressure or
other-platform performance. No benchmark was run concurrently with compilation
or application test suites.

## Results

Median milliseconds, rounded to one decimal:

| Query | 100,000: Table | 100,000: View | 1,000,000: Table | 1,000,000: View |
| --- | ---: | ---: | ---: | ---: |
| LL first page | 11.8 | 26.2 | 29.7 | 101.8 |
| Signed LL first page | 12.3 | 26.8 | 31.8 | 102.0 |
| Overuse first page | 13.5 | 26.9 | 41.3 | 108.7 |
| Difference % first page | 11.4 | 24.3 | 32.4 | 100.8 |
| LL halfway page | 22.1 | 36.9 | 94.1 | 171.6 |
| Filtered LL page | 16.8 | 25.6 | 53.1 | 81.1 |
| Juxtorpus | 7.7 | 26.9 | 25.0 | 102.6 |
| Complete CSV | 129.3 | 136.8 | 488.2 | 539.2 |

At 10,000 tokens, first-page queries took 4.2–4.4 ms with the View versus
1.8–2.1 ms with the Table. A separate single-thread in-memory prototype run
(three measured repetitions) gave 233 ms versus 85 ms for a one-million-token LL
page, 204 ms versus 50 ms for Juxtorpus, and 1.40 s versus 1.31 s for CSV output.

The View is slower, generally two to four times the stored Table's query cost.
The absolute increase remained below the stated decision limits: roughly 100 ms
for routine queries at 100,000 tokens and 500 ms for the million-token stress
case. This supports the View for the tested scale while removing the stored
statistics rows and their publication-time calculation. It does not justify a
claim of unchanged performance or constant cost for arbitrary vocabularies.

## Numerical and persistence checks

Backend tests compare every statistical field against the native Rust
implementation, with exact integer comparison and floating-point tolerance.
Fixtures cover 2,000 varied tokens, exclusive/shared tokens, unequal totals,
Unicode, empty corpora, zero counts, near-maximum unsigned totals, NaN and infinity.
The ELL and Difference % formulas are unchanged.

Integration coverage includes sorting Overuse/Signed LL, filtering without
recalculating totals, complete exports, View privacy, source removal, Save As and
reopening, legacy materialized results, and transactional replacement/clear/delete.
Cancellation and panic tests retain the previous Tables, View and BLOB together.
