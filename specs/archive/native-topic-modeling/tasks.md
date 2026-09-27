# Delivery and parity checklist

- [x] Existing 40 native tests pass after initial progress/projection refactoring.
- [x] New cancellation, full-ranking exclusion and independent projection tests.
- [x] Saved request, full-source capture, artifacts and Clear; shared ownership deletion-race tests.
- [x] Seeded count/percentage sampling and temporary Preview ownership tests.
- [x] Native loading and multilingual semantic smoke acceptance; cache/model identity.
- [x] Named tabs, request restoration, shared tokenizer and sampling dialog.
- [x] Topic-count and Top-N controls; ties, outliers, blanks and zero-topic output.
- [x] Stopwords before candidate truncation, visible-word search and hover clouds.
- [x] Uniform map scale, proportional bubble areas and corpus-relative colors.
- [x] Click selection, additive lasso, separate clears and bounded keyboard lists.
- [x] Pan, zoom, fit; stable coordinates and interaction state under Top-N changes.
- [x] Atomic publication, independent typed Tables and complete topic dictionary.
- [x] Shared downloads, three image formats and optional complete CSV ZIP.
- [x] Browser and actual Tauri visual checks, normal/narrow and light/dark.
- [x] Benchmarks: full fit, memory, sampling, projection/publication, cancellation.
- [x] Rust/frontend/adapter/feature-isolation checks and affected E2E suites.
- [x] Clean release bundle; Windows/Linux not locally executed.
- [x] Canonical docs, tutorial mirror, link checks and diff checks.

Completed locally on 26 September 2026. Final frontend check: 145 test files,
651 tests plus lint/types/format/build/unused-code/documentation gates. Locked
backend, Tauri and full-feature native-library tests and strict Clippy passed;
feature isolation and the affected Polars adapter check passed. Browser and
native WebdriverIO scenarios passed against the final implementation. Clean
macOS release-bundle checks and separate Computer review passed. Windows/Linux
execution and notarization were not performed locally.

## Archived feature mapping

Paths below are relative to `archive/frontend/src/features/views/topic-modeling/`
and the replacement `frontend/src/features/tools/topic-modeling/`, respectively.

| Archived behavior/source | Current owner and verification |
| --- | --- |
| `components/panels/TopicModelingParameterPanel`, parameter/task hooks: inputs, models, segmentation, tokenizer, limits, seed | `TopicModelingFeature`; shared request decoder; tokenizer synchronization and complete Run in shared browser/native scenario |
| Parameter input sampling | Approved change: `TopicSamplingDialog` and `useTopicPreview`; immediate confirmation/cancel tests, native seeded count/percentage tests, UI 60/40 sample versus 96/64 Run |
| `hooks/useTopicProjectionLifecycle`: topic merge and projection refresh | `TopicResults`, independent native map/word queries; native projection parity and merge/coverage tests |
| `hooks/useTopicModelingResultControls`: topic count, Top-N, visible words, selection reset | `TopicResults`; compact activation model and native cutoff-tie tests; presentation unit tests |
| `components/TopicModelingStopWordsControl` | Shared Frequency stopword picker/editor; native full-ranking filtering before 100 candidates; independent word/document projection parity test |
| `components/results/TopicModelingFlowChart`, `topicModelingGraph`: bubbles, hover, pan/zoom/fit, lasso | Current same-named components; uniform scale/area/color and zoomed-lasso geometry tests; mounted browser/native selection and separate Computer zoom/label inspection |
| `components/results/TopicSelectionPanel`, `TopicSizeComposition`: search, selected removal, source counts, list hover, keyboard | Current same-named components; bounded lists, displayed-word search, separate selection/filter state; UI selection/clear and source-count assertions |
| `components/TopicModelingAddToProjectDialog`: source/name/column selection, sync and annotated output | `TopicPublishDialog` and native publication; UI all-column/collision test, native atomic rollback, source-deletion and zero-topic dictionary tests |
| `components/results/topicModelingCsv`, bubble-section image export | Shared download dialog and `topicExport`; full-candidate/escaped-label unit test; browser PNG/SVG/JPEG/ZIP verification; native save dialog and image inspection |
| Archived worker/task/error state | Approved replacement: current Analysis ownership, native tasks and connection-scoped Preview; runtime lease/cleanup tests, frontend late-response/navigation/invalidation tests, shared ownership regressions |

The map/lasso interaction implementation is adapted from the archive; automated
lasso coverage verifies transformed geometry and an actual browser pointer-drag
after zooming. Browser/native E2E drives map clicks; Computer inspection separately
checks the uninstrumented release. Native touch/pinch and every platform's pointer
interaction were not exhaustively exercised. Platform and benchmark limits are explicit in
[the verification record](../../../docs/reference/topic-modeling-performance.md).

Approved changes from the archive: sampling moves into temporary Preview; Run
always uses complete inputs; publication is saved-only; Preview has no durable
files; shared tokenizer selection; uniform map scaling and area-based bubbles;
full-ranking stopword replacement; current analysis/task ownership and errors.
