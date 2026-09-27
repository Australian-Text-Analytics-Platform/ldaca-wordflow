# Delivery checks

- [x] Independent operation connections and lifecycle leases.
- [x] Runtime modified flag and backend/Quick Look format 6.
- [x] Typed tasks, cooperative cancellation, retained results and bounded summaries.
- [x] Native task HTTP/SSE and shared Task Centre presentation.
- [x] Focused database concurrency and task ownership tests.
- [x] Focused frontend reconnect, progress, cancellation and notification tests.
- [x] Full required checks and native visual verification (one unchanged hover failure recorded below).
- [x] Final documentation verification and archive.

## Verification record

- Backend: 64 tests passed, plus the intentionally ignored subprocess helper;
  locked tests, formatting and strict Clippy passed.
- Tauri: 20 lifecycle/updater tests passed; locked tests, formatting and strict
  Clippy passed.
- Frontend: 1,411 Vitest tests and three build-contract tests passed. Lint,
  application build and tooling type checks passed.
- Rust-preview E2E: 31/32 passed. The unchanged SQL-definition hover test at
  `frontend/e2e-native/sql-definition.spec.ts:16` still loses the graph hover
  toolbar and also failed when rerun alone. This is separate from native task
  behavior. The task fixture passed cancellation, dismissal and light/dark
  visual checks; its screenshot-only rerun also passed.
- Quick Look native tests passed offline inspection, file integrity, lock release,
  in-use states and format validation. The regular macOS application and DMG built.
- `pnpm dev:desktop` launched after macOS sandbox access was granted. Native
  automation cannot target its bare binary, so the regular bundle was used to
  verify Task Centre empty state, light/dark appearance, collapse/expand, Reload
  and Quit. Original Light 2026 was restored and the owned sessions closed.
- Production consumers remain unchanged. Active-task UI is verified with
  test-owned snapshots and real backend task submissions in Rust tests, not a
  demonstration endpoint.
- Windows execution and signed/notarized release verification were not performed
  locally. The local macOS bundle is ad-hoc signed.
