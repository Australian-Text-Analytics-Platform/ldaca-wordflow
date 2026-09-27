# Delivery checks

- [x] Shared native export request, catalogue inspection and writer.
- [x] Table definitions, Arrow annotations, selected/full project scopes and View boundaries.
- [x] Shared HTTP/desktop entry points and destination protection.
- [x] Export modes, selection and window-local choices.
- [x] Focused core/UI regressions.
- [x] Complete backend/Tauri and frontend package checks.
- [x] Browser/native WebdriverIO, unexpected-error checks and real file contents.
- [x] Independent Computer review and clean release-bundle verification.
- [x] Large-table export benchmark and cancellation checks.
- [x] Documentation mirror, links and diff checks.

## Local evidence — 2026-09-27

- Locked backend: 170 unit, 2 CLI and 56 integration tests passed. Twelve unit
  benchmarks/model tests and one integration test remained ignored by default;
  the Export million-row benchmark was run explicitly.
- Locked Tauri: all 34 tests passed. Rust formatting and strict all-target,
  all-feature Clippy passed.
- Frontend: all 666 tests and 16 Node tooling tests passed. Three timeouts during
  concurrent compilation disappeared on the full four-worker rerun. Export's
  three focused UI tests passed again after final wording adjustments.
- Lint, tooling types, formatting, build, unused-code checks, documentation drift,
  publication mirror, Markdown links and diff checks passed.
- Browser Export WebdriverIO passed in 15.2 seconds on the final run. Native
  WebdriverIO passed in 3.8 seconds. Both included normal/narrow light/dark
  controls, navigation and reload; browser checks downloaded all five formats
  and a selected project. No unexpected session errors were reported.
- Computer independently reviewed the browser and clean native release app in
  normal/narrow panes and light/dark themes. Controls wrapped without overlap;
  native keyboard resizing worked. A Stage Manager thumbnail initially prevented
  native image review; the independently reopened project window produced full
  screenshots, allowing the review to finish.
- Native chooser cancellation retained the selection and created no task. Native
  CSV and selected-project saves each retained 480 survey rows. The exported
  project reopened through File → Open as an independent Table with no copied
  analyses or task history. The original window remained Untitled after export.
- `build:qa:mac` produced an optimized, uninstrumented production-identity app,
  locally ad-hoc signed. `verify:qa:mac` passed signature, bundled Quick Look,
  ICU checksum/catalogue and offline daylight-saving checks. This was local
  macOS 27.0 arm64 verification, not notarization or Windows/Linux execution.
- [Benchmark details](../../../docs/reference/native-export-performance.md)
  record timings, whole-process peak memory and reproduction.

Selected Tables with macro-dependent definitions are explicitly blocked with a
Complete project remedy, because the catalogue does not expose macro parameter
defaults. Complete copies preserve them. No lossy macro reconstruction was added.
