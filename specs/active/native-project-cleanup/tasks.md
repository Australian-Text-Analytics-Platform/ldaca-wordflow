# Native project cleanup

## Implementation

- [x] B1–B8: format-4 project identity, single-project runtime, lifecycle API,
  serialized ownership, retained close and interruption without shutdown deadlines.
- [x] B9–B18: concrete request/error contracts, validated transaction executor,
  scoped query rewriting, canonical names, graph diagnostics, metadata operations,
  spooled Arrow/exports, shared import allocation and Origin enforcement.
- [x] T1–T8: document registry, scoped discovery/commands, native dialogs, independent
  backends, close/Quit/updater coordination and streaming native file writes.
- [x] T9 configuration: library-validation entitlement and signed-artifact CI scan.
- [x] F1–F15: shared presentation types, optional actions, read-only document queries,
  per-window state, named mutations, Arrow transport separation, schema state cleanup,
  cancellation, canonical rename cleanup, topology-only layout, one error owner,
  settings reuse, removed obsolete helpers and migrated project terminology.

## Verification

- [x] Real DuckDB integration coverage: persistence, clean format rejection, replacement,
  live views, metadata, rollback, CTE scope, case handling, exports, graph diagnostics,
  Origin rejection and structured extraction errors.
- [x] Runtime coverage: isolated same-name projects, detached operation ownership,
  interruption, repeated close and cancellation before initialization.
- [x] Tauri unit coverage: 18 tests including native close decision flow, declined
  interruption, cancelled/failed Save, modified Untitled content and replacement writes.
- [x] Frontend build, lint, tests, tooling types, unused exports, documentation drift
  and version checks.
- [x] Chromium with Rust preview: six interaction tests pass. Screenshots inspected
  for the preserved three-column layout, sample graph/table, settings and light/dark styling.
- [x] Both Rust crates: locked tests, formatting and strict Clippy.
- [x] Documentation links and `git diff --check`.
- [x] Owned `pnpm dev:desktop` starts an embedded backend. Its health and current-project
  HTTP responses confirm a clean Untitled format-4 project.
- [x] Actual Tauri bundle verification after the user authorized `pnpm build:desktop:mac`:
  native menus, shortcuts, independent windows, duplicate file opening, Save/Replace,
  reload, interruption, repeated Close, cancelled Quit/Save and last-window lifecycle.
  Two observed menu/title defects were fixed and the final bundle rechecked. See
  [native verification](native-verification.md). Finder's stale QA default association
  remains an OS configuration issue; Open With the standard application works.
- [ ] Browser FastAPI suite: two passed, one skipped, one quotation test failed on an
  analysis-resource 404. This has not been established as a pre-existing baseline failure.
- [ ] Whole-frontend formatting check: unrelated existing test files still report
  formatting differences; they were not reformatted as part of native cleanup.
- [ ] Windows native results and signed macOS HTTPS scan: configured in CI, not run locally.

Keep this change active until the outstanding acceptance checks are resolved. Signed
verification is deferred to release CI per the user's latest instruction.
