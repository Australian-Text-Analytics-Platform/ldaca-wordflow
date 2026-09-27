# Delivery checklist

- [x] SQL builders and real DuckDB operation tests
- [x] Atomic creation, metadata and Table/View updates
- [x] Existing forms, input cards, schema and previews connected
- [x] SQL editor, View/Table destination and draft retention
- [x] Frontend behavior and native interaction verification
- [x] Help, tutorials and canonical documentation
- [x] Required frontend, Rust, documentation and diff checks

## Verification results

- Frontend: 282 test files and 1,380 tests pass, plus three build-contract tests.
  Build, strict lint and tooling types pass. The SQL Preview retry regression
  also passes after the final adjustment. Vite retains its chunk-size warning.
- Backend: 50 tests pass, one existing test is ignored. Formatting and strict
  locked Clippy pass. New tests cover persisted reservoir samples and explicitly
  single-threaded seeded repeatability.
- Tauri: 20 lifecycle/updater/file tests pass; formatting and strict locked
  Clippy pass.
- Rust-preview browser E2E: all six preprocessing tests pass, including native
  SQL for every tool, metadata, rollback, paging and light/dark narrow panes.
  The final full run has 22 passes and one failure in the existing
  `sql-definition.spec.ts` hover test, waiting for `Data Block actions` after
  hovering the graph card. That test passed in an earlier full run and is
  reported separately; its graph-menu behavior was not changed for this failure.
- Native: one owned `pnpm dev:desktop` launch succeeded. Native automation could
  not attach to the unbundled executable, so interaction verification used the
  regular application built through `pnpm build:desktop:mac`. Both the app and
  DMG build successfully. All seven tabs were opened; ADO sample Filter previews,
  View creation, draft retention, SQL page navigation and light/dark appearance
  were checked. The final bundle also created a 35-row Table from SQL and retained
  exact 27-digit decimals in its preview and Data View. Disposable Untitled
  projects were discarded through the native close prompt.
- Documentation drift, publication sync, Markdown links and `git diff --check`
  pass. No project format change or analysis execution was introduced.

Windows execution was not performed locally. Packaging used the normal local
ad-hoc signing configuration; notarized release verification was not attempted.
