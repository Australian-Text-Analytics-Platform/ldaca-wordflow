# Delivery

- [x] Backend rules, explicit operations and stopword interfaces
- [x] Frontend callers, shared query definition and tool metadata
- [x] Regression coverage
- [x] Package and E2E verification, with unrelated failures recorded below
- [x] Canonical documentation and publication checks

## Verification

- Backend: 132 locked tests passed (79 unit, 2 CLI, 51 project integration).
  The subprocess helper remains ignored in the ordinary test invocation.
  Formatting and strict all-target/all-feature Clippy passed.
- Frontend: 509 unit tests and 8 script tests passed. App/tooling TypeScript,
  lint, build, theme checks and unused-code checks passed.
- Tauri: 31 locked tests passed. The instrumented native build succeeded.
- Native WebdriverIO: 35 tests passed across casting, preprocessing and
  Frequency, including stopword creation/editing and export workflows.
- Browser WebdriverIO: 34 tests passed across casting, Find, preprocessing,
  Build, Frequency and dependency-mode objects. Two Build presentation tests
  remain failing as described below.
- Publication synchronization, documentation drift, internal links and
  `git diff --check` passed.

## Unrelated checks still failing

Two browser Build tests fail in unchanged presentation code: the operation
popover extends above the viewport, making its search input inaccessible, and
a nested combination stays beside its siblings instead of taking a full row.
The root `.gitignore` rule `build/` matches
`frontend/src/features/tools/preprocessing/build/`. Its component-specific
Tailwind rules are missing from generated CSS, including `basis-full` and the
popover's available-height constraint. Screenshots from the tests confirm both
layout symptoms. This source-discovery issue is outside the ownership refactor.

The full frontend formatting check reports five unchanged files:
`ResizeHandle.test.tsx`, `editorTabsLayout.test.ts`, `button.test.tsx`,
`dropdown-menu.tsx` and `sidebar.tsx`. No unrelated formatting was applied.

Initial concurrent runs also timed out under native compilation load. Rerunning
the complete backend and frontend suites after compilation passed without
changing test timeouts. Native Undo checks now wait for the control to become
enabled and stable before clicking; browser cast checks wait for the refreshed
column header before checking committed data.
