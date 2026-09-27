# Verification

- [x] Backend workload wiring and task response headers.
- [x] Frontend correlation, cancellation status, completion and reconnect observation.
- [x] Import dialogs permit dismissal while work continues.
- [x] Focused backend and frontend tests.
- [x] Full package checks and affected E2E; two existing hover tests still time out.
- [x] Native visual verification.
- [x] Documentation checks and scoped diff review.

## Verification record — 2026-09-15

- Backend: locked suite passed (32 unit, 2 CLI, 33 integration tests, one ignored
  subprocess helper); the subsequently added multi-source import cancellation
  regression also passed. Formatting and strict all-target/all-feature Clippy passed.
- Tauri: all 20 lifecycle tests, formatting and strict Clippy passed.
- Frontend: full suite passed (288 files, 1,416 tests and three build contract
  tests). The subsequently added pending-import dismissal regression passed in
  its five-test file. Lint, tooling typecheck and production build passed.
- Production routes cover one-task response correlation, SQL statement-index
  errors, transaction rollback, disconnected callers and independent projects.
  Offline LDaCA fixtures cover credentials isolation, cancellation during metadata
  and document downloads, conversion and commit, and an accepted import finishing
  while new work is paused. Import database cancellation leaves no partial source
  objects and does not block independent SQL.
- Browser E2E: the full run had 30 passes and three failures. After isolating the
  new task test from previously retained summaries, both task tests passed in a
  focused rerun. Two unchanged graph-hover tests still time out waiting for
  `Data Block actions`: `objects.spec.ts:25` and `sql-definition.spec.ts:16`.
  They fail before invoking the affected node operations; their cause was not
  addressed in this change.
- Native UI: started one owned `pnpm dev:desktop` session, then used the regular
  `pnpm build:desktop:mac` bundle because native automation could not target the
  bare development executable. Verified local and ADO imports, Materialize, Clone,
  running/cancelled SQL, single-error ownership, task history after reload, automatic
  result previews without selection changes, light/dark appearance and normal Quit.
  Discarded the disposable test project, restored the light theme and stopped the
  owned application. External LDaCA credentials were not used in native QA.
- macOS app/DMG packaging passed. Windows and signed-release verification were not
  run. The change preserves format version 6.
- Canonical documentation and tutorial publication mirror updated. Documentation
  links, documentation drift and `git diff --check` passed. Unrelated work remains
  untouched; no commit or push was made.
