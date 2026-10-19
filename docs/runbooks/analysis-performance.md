# External-corpus analysis performance

Use the opt-in launcher to benchmark complete native Topic Modelling and
Quotation Runs on a private external file. Normal tests and CI do not read private
corpora or download models for this worker.

```sh
node scripts/profile-analyses.mjs --input /absolute/private/corpus.zip \
  --output /absolute/private/measurements --sizes 100,1000,5000 --repeats 3
node scripts/profile-analyses.mjs --input /absolute/private/corpus.zip \
  --output /absolute/private/measurements --sizes all --repeats 1
```

`--analysis` selects `topic`, `quotation`, or `both` (default). `--seed` defaults to
7. An unambiguous imported Data Block is selected automatically; otherwise supply
`--table`. Text collections use `document`; tabular files require `--column`.
The existing [file-import contract](../reference/native-project-api.md)
owns supported formats and ZIP behavior. There is no benchmark-specific reader,
text cleanup, silent sample reduction, duplicate removal, or truncation.

## Isolation and reproducibility

The launcher rejects output paths inside the checkout, including symlink aliases.
It leaves the source file untouched and verifies its SHA-256 before and after a
campaign. All results, sample ordinals, error logs, model caches, embedding caches,
temporary projects and traces remain under the external output directory. Model
assets remain reusable under `models/`; completed temporary projects are removed.
Do not commit or upload these directories. Native libraries and profiler traces
can retain source text even when routine launcher output contains only counts.

Each timestamped `sessions/` directory contains a manifest, Markdown report, build
logs and per-case results. The manifest records code state, executable checksum,
input checksum, effective options, toolchain and hardware. Per-case results record
the effective request and resolved model fingerprint. Sampling ranks imported row
ordinals by SHA-256 of `seed:ordinal`, takes the requested count, then restores
source order. Samples are nested and retain duplicate and blank rows. `all`
selects every imported row. Oversized requests fail instead of shrinking.

The ignored backend worker invokes the ordinary importer and runtime submission
methods. A runtime-scoped observer compiled only in tests records progress
transitions synchronously. Topic modelling retains its current production
segmentation, exact-text caching, clustering and persistence behavior. Quotation
uses its production worker pool and a fresh analysis, never resume.

## Measurement boundaries

The launcher compiles release code with Rust and C++ debug symbols before timing,
and provisions the actual models in dedicated benchmark storage first. Timing
children run sequentially, each in a new process and disposable project. No
performance pass/fail threshold is imposed.

- Import time covers the shared importer. Subset preparation is setup.
- Analysis elapsed time starts at submission and ends when the saved task result
  completes. It includes model loading, capture, computation and persistence,
  but excludes import, model downloads and compilation.
- Saved-read time covers reading the persisted analysis and its initial map or
  document page. No-topic results have no map and use the saved analysis read.
- Source-row preservation is checked separately from result eligibility. NULL
  text remains in the imported source; document result counts follow the
  analysis's existing non-NULL rules rather than forcing every row into output.
- Stage intervals follow actual progress transitions. Repeated progress messages
  within one stage do not restart its timer. Quotation exposes a combined
  extraction/commit interval; its first batch is included in the initial model
  loading interval. Use the profiler to distinguish work inside these intervals.
- macOS `/usr/bin/time -l` reports process-wide CPU and peak RSS, including
  import, setup, analysis, reads and validation. These are not incremental or
  analysis-only memory measurements. Other platforms retain elapsed/stage timing
  but do not currently collect these macOS resource metrics.

Every Topic trial runs first with an empty dedicated embedding cache, then with
the cache populated by that exact trial. Both use fresh processes and already
downloaded model files. These labels describe embeddings, not OS page caches or
network-cold starts. Quotation always performs fresh extraction. Profiled cases,
failed cases and interrupted cases are excluded from baseline aggregates. Reports
show median/range for repetitions and explicitly label single observations.

## macOS profiler captures

Run these separately from baseline measurements:

```sh
node scripts/profile-analyses.mjs --input /absolute/private/corpus.zip \
  --output /absolute/private/measurements --sizes 5000 --profile cpu
node scripts/profile-analyses.mjs --input /absolute/private/corpus.zip \
  --output /absolute/private/measurements --sizes 1000 --profile allocations
```

Profiler runs default to one repetition, use a fresh embedding cache, and save
Instruments `recording.trace` packages within the case directory. CPU Profiler
locates CPU hotspots; Allocations examines allocation stacks and retained memory.
Both include process setup; correlate analysis intervals with `events.jsonl`.
Profiler overhead means their times are not comparable with baseline timings.
Allocations requires a debuggable target on macOS. The launcher ad-hoc signs a
private copy of the test executable with `get-task-allow`, leaving the Cargo
executable untouched. It verifies the original checksum and shared Mach-O UUID,
and records the signed copy's path and checksum in `profile_worker`. Signing and
copying happen before measurement; no application or system security setting is
changed. The signed executable remains in the private session directory. A
byte-identical temporary copy is used for launch so protected-folder prompts
cannot stall the dynamic loader before the worker starts. Its `launch_path` is
recorded and the temporary copy is removed after recording. No corpus data is
copied to the temporary launch directory.
In Codex on macOS, run resource measurement and Instruments outside the command
sandbox: its restrictions prevent resource-timer queries and Instruments cache
initialization. A failed profiler or missing worker result fails the case and
retains diagnostics; it is never accepted as a successful baseline.

## Validation

Run `node --test scripts/profile-analyses.test.mjs`, the backend package checks,
and `pnpm docs:links`. Use a synthetic external ZIP and tabular file for real-model
smoke runs before private-corpus campaigns. Check imported/selected/skipped counts,
saved-result readability, input checksums and model fingerprints. Dataset content
and article identifiers belong only in the private output directory.
