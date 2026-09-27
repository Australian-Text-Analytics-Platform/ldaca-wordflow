# Delivery status

- [x] Typed native row identity and identifier edit/insert rules
- [x] Table-scoped protection and transient mutation preconditions
- [x] App-driven rename reconciliation, saved Plot bindings and local draft mapping
- [x] Manual/Codebook editing and draft-aware metrics/filtering
- [x] Manual UI, restoration and navigation protection
- [x] Host provider configurations and OS credential adapters implemented
- [x] Native provider adapters, response validation and batch splitting implemented
- [x] Fresh temporary Preview implemented
- [x] Atomic Run and report/context storage implemented
- [x] AI live-review integration and archived-feature implementation
- [x] Local performance and required Rust/frontend package checks
- [ ] Browser/native scenarios and clean-release visual acceptance
- [x] Canonical documentation, tutorial and publication mirror (final verification still required)

## Current verification

Shared runtime/editor regressions, app-driven View column rename and Undo/Redo,
saved Plot bindings and known analysis request rebasing have focused coverage.
Provider credential and adapter tests, atomic updates, failure retention, typed
identities and Preview isolation passed. Annotation browser/native journeys and
clean release packaging passed. Independent visual acceptance and broader native
graph regressions remain open; implementation checkboxes do not close these gates.

## September 27 verification update

- Workspace build uses the root Cargo manifest/lock and shared target.
- Backend: 160 unit tests, two CLI tests and 55 integration tests passed;
  strict Clippy passed. Tauri: 33 locked tests and all-feature strict Clippy passed.
  Opt-in model/large-data tests remain separate.
- Frontend: 149 test files / 663 tests plus 16 script tests passed.
  Formatting, lint, tooling types, production build, unused-code and docs checks passed.
- Browser Annotation, table editing and dependency journeys: seven tests passed.
- Native Annotation: three journeys passed, including real Apple Preview and Run.
  Tests use independent tabs/source names and check normal/narrow layouts. A Clear
  race was reproduced in a frontend regression and fixed by retaining the shared
  change observer's sole cache-cleanup ownership.
- Apple adapter live smoke: three structured labels in 2.344 seconds; cancellation
  and cleanup in 114.8 ms on macOS 27.
- Optimized database benchmark: 100,000 explicit-key rows, maximum 1,000 texts
  per batch; 131 ms capture, 10.93 s through publication and 1.89 s comparison/filter/page.
  A separate process measured 113.6 MiB peak RSS. These exclude model inference.
- The clean uninstrumented release bundle passed signature, packaged ICU, startup
  and offline runtime checks. It was locally ad-hoc signed, not notarized.
- Test provider configuration is isolated; three earlier keyless fixture
  connections were removed without touching other host connections.
- Independent Computer review is blocked by the locked Mac; unlock was requested.
- Broader native graph checks remain unresolved: WebKit rejects the inactive-tab
  animation check, and Close preview fails in the dependency scenario. The latter
  also fails independently; its browser counterpart passes. No product cause has
  been established and neither test was weakened to make it pass.
- macOS 26 hardware and Windows/Linux execution were not available locally.
- Measurements and boundaries: [Annotation performance](../../../docs/reference/annotation-performance.md).
- [Archived parity inventory](parity.md) records implementation and evidence.
