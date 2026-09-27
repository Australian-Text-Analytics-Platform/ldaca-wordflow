# Topic Modelling verification and performance

Topic Modelling fits all submitted rows on Run. Preview samples explicitly;
neither path silently truncates text or substitutes a sample. Embedding batches
are bounded, but dimensionality reduction, clustering and the retained projection
context require memory proportional to the fitted data. See
[native analysis ownership](../architecture/backend/native-analyses.md#topic-modelling)
and [API contracts](native-project-api.md#topic-modelling).

## Local measurements, 26 September 2026

The native debug benchmark ran on the local Apple Silicon macOS host with the
English MiniLM model. It repeats the repository-owned consultation fixture to
1,000 rows, uses an initially empty temporary embedding cache, and includes
model/runtime allocation. Repeated texts benefit from cache reuse: these figures
are a reproducible regression baseline, not a diverse large-corpus throughput
estimate or a production capacity limit.

| Operation | Observed result |
| --- | --- |
| Seeded sample capture | 100 of 1,000 rows in 87 ms |
| Complete Run, capture through publication | 19.24 s; 1,019 segments; 12 topics |
| Merged map projection | 14.77 ms; 20,064 response bytes |
| Independent word projection | 16.26 ms |
| Original-row and dictionary publication | 215.26 ms |
| Cancellation requested at dimensionality reduction | 18.79 s until cleanup completed |
| Peak resident memory of isolated benchmark process | 3,480,748,032 bytes (3.24 GiB) |

Peak memory includes the model runtime, DuckDB, test setup and fitting workspaces;
it is not incremental model memory or browser memory. PaCMAP and HDBSCAN do not
provide interruption inside a stage. The UI therefore shows **Cancelling…** until
the stage returns and cleanup finishes. A cancelled operation is not abandoned.
No automatic sampling, truncation or arbitrary corpus limit was introduced.

The ignored `topic_model_benchmark` test in
`backend/src/project/topic_modeling.rs` reproduces capture, fit, projections,
publication and stage cancellation. Run it with model assets provisioned:

```sh
cargo test --manifest-path backend/Cargo.toml --locked topic_model_benchmark -- --ignored --nocapture
```

On macOS, process peak RSS can be obtained with Python's
`resource.getrusage(resource.RUSAGE_CHILDREN)` around the isolated test executable.
Optimized full-fit throughput, browser memory and larger diverse corpora remain
unmeasured. These observations do not justify a fixed supported-corpus size.

## Curated model acceptance

`topic_model_acceptance` loads the actual ONNX assets and fits the consultation
fixture, rather than replacing embeddings with a test stub. Both models passed
on macOS with CoreML/CPU execution:

| Model | Fit | English paraphrase cosine | Chinese/English paraphrase cosine |
| --- | --- | --- | --- |
| all-MiniLM-L6-v2 | 4 topics, 98 segments, 9.83 s | 0.7213 | 0.0534 |
| paraphrase-multilingual-MiniLM-L12-v2 | 4 topics, 108 segments, 11.57 s | 0.7597 | 0.9500 |

The acceptance assertions compare related housing sentences with unrelated
medical text, including a Chinese/English pair for the multilingual model.
This is a loading and semantic smoke test, not an evaluation across every
supported language or a guarantee of topic quality for an arbitrary corpus.
The English model remains the default. The model token limits are 256 and 128
respectively, independently of representative-word tokenizer selection.

## Application verification

The shared WebdriverIO scenario imports the actual synthetic JSON files through
the UI. It verifies joint 60/40 Preview, no saved Analysis for Preview, navigation
cleanup, a full 96/64 Run, synchronized tokenizer controls, unchanged-request
blocking, map selection, publication, generated-column collisions, independent
published Tables and Clear. Browser tests additionally inspect PNG/SVG/JPEG
signatures and the complete representative-word CSV ZIP. Browser and native
instrumented debug suites passed separately with unexpected-session-error checks.
The browser scenario also draws an actual lasso after zooming and verifies that
it filters the list without selecting topics for publication, then clears the
filter and restores the fitted viewport.

Computer inspection used Chrome and an **uninstrumented, optimized macOS app**
separately from WebdriverIO: normal panes, narrow wrapping, light/dark themes,
sample dialog, map labels/zoom, native save dialog and exported image, full Run,
Save/reopen and restored unchanged-request blocking. It identified and corrected
zoom-scaled map labels and clarified Preview's publication guidance. The release
bundle passed local ad-hoc signature, packaged ICU checksum/catalogue and
daylight-saving conversion checks. It was not notarized or published.

Frontend tests also cover uniform map scaling, proportional bubble area,
corpus-relative colors, lasso geometry under zoom, complete CSV candidates,
compatibility decoding, immediate sampling-dialog submission, late responses,
navigation, source invalidation and cancellation cleanup. Native tests cover
sampling, no Preview records, independent publication, cutoff ties and Preview
lease expiry; existing shared ownership tests cover transaction and deletion
races. The framework-independent engine retains its segmentation, coverage,
outlier and topic-merging regressions.

Windows and Linux compilation, model execution, rendering and packaging were
not run on this macOS host. Their existing CI lanes remain the platform checks;
local macOS success does not establish those results.

## Retained Preview document inspection

Local macOS arm64 debug benchmark (`benchmark_preview_documents`, September 27,
2026): 20,000 synthetic documents of 30 repeated Unicode phrases plus a string
identifier and nested integer/date metadata retained 14,295,370 Arrow bytes.
Capturing the already sampled relation took 32 ms. Twenty 20-document projections
with nested metadata took 165 ms total and emitted 321,440 Arrow response bytes.
These figures isolate retained rows and page projection; they exclude fitting,
model/context memory and allocator overhead. Source width and text length directly
affect memory. No sample or metadata truncation is applied. Run with
`cargo test -p wordflow-backend --locked benchmark_preview_documents -- --ignored --nocapture`.
