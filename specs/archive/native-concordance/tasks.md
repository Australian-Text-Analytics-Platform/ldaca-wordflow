# Verification record

- [x] Native matcher, Preview, Run All, typed retained artifacts and saved routes.
- [x] Request/Results interface, density, publication and Frequency handoff.
- [x] Focused backend and frontend tests.
- [x] Browser functional scenario with light/dark and narrow screenshots.
- [x] Canonical documentation, tutorials and publication mirror.
- [x] Locked Rust, adapter and Tauri checks.
- [x] Final frontend checks after publication and chart repaint corrections.
- [x] Final native Concordance scenario and visual finish review.
- [x] Dense-result benchmark including publication and peak memory.

## Measured verification

Backend: 91 unit tests, two CLI tests and 51 project tests passed; benchmark
tests remain opt-in. Native tokenizer feature tests (24) and core feature-isolation
tests (3) passed. The Polars tokenization adapter's 15 Concordance tests passed,
including the former first-word L1 regression. Locked Tauri tests (33) and strict
Clippy, including all-feature native targets, passed on macOS.

The synthetic dense-result benchmark used 50,000 documents and 500,000 matches:
Run All 10.81 seconds, one Arrow page 0.88 seconds (7,368 bytes), full-result
density 0.29 seconds, and publication 0.80 seconds. Peak test-process RSS was
759,103,488 bytes (about 724 MiB). Matching batches are bounded; DuckDB temporary
and persisted relation memory still scales with the data. These are local
development measurements, not performance guarantees.

Frontend: 527 tests in 125 files and eight build/tooling tests passed. Formatting,
lint, production build, unused-code, tooling type, documentation and version checks
passed. The full suite was rerun with two workers after an unrelated preprocessing
test exceeded its timeout while the native application was compiling.

Browser Frequency regression scenarios passed. Concordance browser and native
scenarios exercise Preview, Run All, publication, source deletion and saved-result
reopening, plus light/dark and narrow-pane captures. Static captures disable
animations in the test page so background WebView closing layers finish promptly.
The application retains its normal animations. Native static SVG resizing flushes
its paint immediately rather than depending on a background animation frame.

Independent visual review accepted all eight browser/native light/dark and
wide/narrow dispersion captures. Request, Table and dialogs received source review
and functional testing, not a complete visual capture matrix. The design
documentation pass found no new system drift.

The broader native Frequency suite passed four scenarios but did not pass as a
whole. Static-test animations and background-incompatible frame waits were
corrected. The comparison and stopword rechecks still timed out waiting for resized
Frequency word clouds to render in the inactive native WebView. These remaining
failures must not be counted as successful native coverage.

No Windows or Linux native UI, signed packaging, or interactive native export
chooser verification was performed for this change.
