# Delivery

- [x] Implement commit scopes, dependency propagation and event refresh.
- [x] Read stopword sources in backend queries and coherent export bundles.
- [x] Separate generic result ownership and kind-scoped analysis tabs.
- [x] Keep browsing local, defer language sampling and align list ranks.
- [x] Update canonical docs and glossary.
- [x] Complete backend/frontend regression and affected browser checks.
- [x] Run affected native checks and record the desktop verification limitation.
- [x] Regenerate publication mirror and run documentation/diff checks.

## Verification

- Backend: 78 unit, 2 CLI and 45 integration tests pass; the subprocess helper
  remains intentionally ignored. The expanded multipart-export HTTP test also
  passes. Locked strict Clippy and formatting pass.
- Tauri: 31 locked tests, strict Clippy, formatting and instrumented build pass.
- Frontend: 121 test files and 513 tests pass, plus 8 build/tooling tests.
  Lint, tooling type checks, production build, unused-code and version checks pass.
- Browser: all 6 Frequency scenarios pass, including live stopword edits,
  unrelated-write request counts, reload and local display state. Affected Tasks,
  SQL console, Find, casting, table editing, graph reconnection and batch deletion
  scenarios pass.
- Native: tab navigation/reload and both preprocessing scenarios pass. Remaining
  Frequency and casting UI scenarios could not be validated: the Mac is locked,
  confirmed by native UI automation, and WebKit suspends popup animations and
  rejects animation-stability checks. Repeat these scenarios with an unlocked,
  visible test window. Native chooser/export dialogs were not manually verified.
- Documentation links, drift checks, publication mirror and `git diff --check` pass.
- The whole-tree frontend formatter still reports five pre-existing unrelated
  files: `ResizeHandle.test.tsx`, `editorTabsLayout.test.ts`, `button.test.tsx`,
  `dropdown-menu.tsx` and `sidebar.tsx`. They were left untouched.
