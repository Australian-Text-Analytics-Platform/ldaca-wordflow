# Verification

- [x] Implement snapshot ownership, Arrow pages and atomic Save/Cancel.
- [x] Connect shared menus, table controls and reusable label controls.
- [x] Add native action guards and teardown cleanup.
- [x] Verify focused DuckDB, frontend and Rust-preview E2E tests.
- [x] Pass frontend build/lint/tests, all 10 Rust-preview E2E tests, locked backend tests,
  Tauri lifecycle tests, formatting, strict Clippy, documentation links and diff checks.
- [x] Inspect the editor in light/dark Chromium previews and build the regular macOS bundle.
- [ ] Complete native menu and lifecycle verification in the bundled app.
  Dev launch and bundled backend health passed; full native interaction coverage remains pending.
- [x] Extend the editor draft and atomic Save to row insertions and deletions.
- [x] Verify row controls visually and pass their full regression checks: 1,396 frontend
  tests, 11 Rust-preview E2E tests, locked Rust tests and strict Clippy for both crates,
  frontend lint/build, documentation checks, and `git diff --check`.
  The regular macOS bundle passed light/dark inspection, insert/delete across pages,
  atomic Save with exact integer and NULL values, and row-only Cancel confirmation.
  Database queries confirmed the saved changes and that Cancel preserved the rows.
  `pnpm dev:desktop` startup and health passed; native automation required the regular
  bundle because it cannot attach to the unbundled development executable.
- [x] Allow direct typing into NULL cells and supply the editing snapshot count
  to Data View's shared pagination footer. Regression checks cover empty text
  versus NULL, empty tables, last-page navigation and retained drafts. All 1,398
  frontend tests, 11 Rust-preview E2E tests, backend/Tauri checks and docs checks
  passed. Native verification edited NULL text and exact integer values on pages
  1 and 17, returned to page 1, saved and confirmed the values through DuckDB.
