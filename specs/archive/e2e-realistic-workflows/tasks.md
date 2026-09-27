# Tasks

- [x] Review current tests, source contracts and data; retain a before-change baseline.
- [x] Add shared project/task isolation and correct research evidence paths.
- [x] Add exact selected-row plot assertions and typed export value comparisons.
- [x] Add Annotation source snapshots, fresh inference, failure and cancellation checks.
- [x] Extend shared compatibility coverage and file-import preprocessing journey.
- [x] Add varied consultation narratives and verify both Topic publications.
- [x] Complete browser and native execution, including project reopening.
- [x] Finish frontend checks and update canonical testing documentation.

## Findings during verification

- Exact Sankey publication exposed a layout shift: hiding the keyboard inspection
  paragraph on blur moved Add to Project during its click. Reserve the paragraph's
  space while hidden; keep its content visible only while the chart is focused.
- The embedded driver omits modifiers on special keys. Shift+Space exercises the
  same supported chart range gesture through its working regular-key path.
- Project-window switching and IPC window targeting are distinct in the driver.
  Reopening checks explicitly target the child window's backend and use the real
  Close coordinator rather than destroying a WebView.
- Native cancellation tests wait for both the rendered Run availability and the
  accepted cancellation state before releasing held provider responses.
- Native cleanup closes Data View readers before removing their relations and
  disconnects the old document's diagnostic delivery before resetting capture.
- The browser preprocessing datetime scenario replaces text explicitly; WebDriver
  clearing a native time input did not reliably remove its previous value.

Capacity benchmarks, live providers (including opt-in Apple Foundation Models),
OS file choosers, application quit/relaunch and uninstrumented release acceptance
remain separate gates. This change does not claim those checks or exhaustive
coverage of every combination of controls.

## Local verification — 2026-09-27

- Browser: 35 spec files, 100 distinct scenarios passed across the full run and
  focused reruns. The full run exposed the existing time-input replacement issue;
  all 10 preprocessing scenarios passed after its test interaction was corrected.
  The final shared-interaction run passed all 11 scenarios in Annotation, Plots,
  representative research plots and the joined-data workflow.
- Native macOS: 20 spec files, 76 distinct active scenarios passed across full
  runs and focused reruns. Initial failures exposed reader cleanup, diagnostic
  delivery, UI availability, focus, modifier-key and IPC-targeting assumptions.
  The final focused run passed all 10 Annotation/Frequency/Plots scenarios;
  the optional Apple Foundation Models smoke test was skipped. Real project
  close/reopen and all seven representative plot cases also passed.
- These totals describe the union of verified cases, not one uninterrupted green
  full-suite run after every harness correction.
- Native evidence uses the freshly built, production-identity
  `au.edu.ldaca.wordflow` debug executable with WebDriver instrumentation.
  Latest SHA-256: `0a34c5a864bb33c76354199ab4aefbaed7a8524307aac3034cce7a302efa448e`.
- Frontend: 150 test files / 666 unit tests and 16 Node checks passed; lint,
  tooling type checks, formatting, build, unused-code, documentation drift,
  documentation links and diff checks passed. Existing vendor/build warnings and
  two Knip configuration hints remain.
- CI now retains successful browser evidence and includes Annotation, Topic
  Modelling, Export, the joined-data workflow and project reopening in the
  optimized native lane. Windows/Linux and clean release acceptance were not run
  locally for this change.

Canonical procedure: [test suites](../../../docs/runbooks/test-suites.md).
Dataset contents and expected values: [research fixtures](../../../frontend/e2e/fixtures/README.md).
