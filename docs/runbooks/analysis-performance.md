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
network-cold starts. Model provisioning also prepares the compiled CoreML cache
on supported Macs. Record that cache's state separately when measuring startup;
an empty embedding cache does not mean empty compiled models. Quotation always
performs fresh extraction. Profiled cases, failed cases and interrupted cases are
excluded from baseline aggregates. Reports show median/range for repetitions and
explicitly label single observations.

## Embedding acceleration and small device experiments

The two curated MiniLM models' default ONNX artifacts use CoreML MLProgram on
macOS with all compatible compute units allowed. Their sessions fix the batch to
32 and the sequence to the model's declared token limit. Input masks preserve
padding semantics; the encoder splits larger requests and removes padded rows
from its output. This does not lower the model token limit or change Topic
Segment construction.
Other models and alternate ONNX artifacts use CPU until their fixed-shape
execution is validated.

Compiled models live under the host's Hugging Face cache in `coreml/`, separate
from downloaded weights and exact-text embeddings. Cache directories identify
the immutable snapshot/artifact path, runtime build and session policy. Initial
compilation and cached loading must be reported separately. Hosts that call
`Embedder::load` without explicit `ModelAssets` do not opt into this compiled cache.

Windows requests a high-performance DirectML GPU. Sessions disable memory
patterns, use sequential execution and serialize `Run` through the existing
mutex, as required by DirectML. Windows GPU execution requires acceptance on a
real Windows host; a successful Mac test does not establish Windows performance.
See the [DirectML requirements](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html).

Provider registration and accelerated session preparation fail explicitly before
CPU retry. `provider_id()` identifies the configured policy, and
`provider_fallback_reason()` records why CPU fallback was needed. A registered
CoreML provider alone does not prove GPU or Neural Engine execution. The updated
embedding fingerprint includes the runtime and policy; old cache entries remain
disposable and are recomputed, while saved analyses require no migration.

The ignored native `embedding_device_experiment` test compares the production
encoder with CPU, legacy CoreML and MLProgram policies. It uses 100 synthetic
texts by default, or an external JSON array of strings. It retains vectors,
token counts, model identity, loading/first-batch/repeated-encoding times and optional
ONNX profiles. Inputs above the model's token limit follow the existing direct
encoder truncation contract; use the external-corpus worker for complete,
segmented document Runs. No article text is printed to the routine console.

Create the output directory and provision models outside the checkout first.
Write this case file outside the checkout, adjusting the absolute paths:

```json
{
  "model_root": "/absolute/private/measurements/models",
  "output": "/absolute/private/embedding-probe",
  "model": "sentence-transformers/all-MiniLM-L6-v2",
  "mode": "current",
  "batch_size": 32,
  "threads": 4,
  "repeats": 3,
  "profile": false,
  "input": null,
  "fixed_sequence": null,
  "compiled_cache": null
}
```

```sh
WORDFLOW_EMBEDDING_CASE=/absolute/private/case.json LDACA_EMBEDDING_THREADS=4 \
  cargo test -p ldaca-rs --features embedding --release --locked --lib \
  embedding::performance_tests::embedding_device_experiment \
  -- --exact --ignored --nocapture --test-threads=1
```

Each timed repeat encodes the complete input after a one-batch warm-up; dynamic
policies can still specialise unseen shapes on their first full pass.
Launch each case in a fresh process; for timing campaigns build once and resolve
the test executable from Cargo JSON as the external-corpus launcher does. Use
`current` and `cpu` on Windows. Mac alternatives are `coreml-legacy`,
`coreml-all`, `coreml-gpu` and `coreml-ane`; the three newer policies use MLProgram.
The `coreml-all-static` and `coreml-gpu-static` variants additionally require
`fixed_sequence` equal to the model limit, with padding to `batch_size`.
An optional pre-created private `compiled_cache` directory isolates their cache
conditions. `current` always uses production policy and its host-owned cache.

Set `profile` only for separate diagnostic runs. ONNX profiles identify graph
provider boundaries; CoreML compute-plan diagnostics in experimental policies
describe planned device dispatch. Corroborate GPU execution with a separate
Metal System Trace and filter actual compute intervals to the worker PID.
Keep instrumented times out of baseline statistics. Model acceptance also checks
both curated models against CPU with blank, Unicode, long, duplicate and partial
batch inputs, and exercises CPU fallback after a compiled-cache failure.

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
