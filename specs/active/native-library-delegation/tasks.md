# Delivery checks

## Implementation

- [x] DuckDB Live limit, preserved Default draining and rollback.
- [x] Advisory previews, self-join roles and native collision handling.
- [x] Explicit datetime targets and precise shadcn temporal controls.
- [x] One Build debounce, native readiness and trimmed preview table state.
- [x] Radix pagination and sidebar pointer capture.
- [x] Canonical docs, publication mirror and link checks.

## Verification

- [x] Frontend: 417 Vitest tests and 4 build/source-graph checks pass.
- [x] Frontend lint, build, tooling type checks and unused-code checks pass.
- [x] Chromium against the Rust preview: 39 E2E tests pass. Includes the existing
  graph hover tests, self-join role placement, metadata, empty results, native casts,
  precise temporal text, popup interaction, and light/dark rendering.
- [x] Backend: locked tests pass (80 passed, 1 existing ignored); formatting and
  strict Clippy pass. The Live limit skips a deliberately late error while Default
  encounters it and rolls back; parameterized SQL retains exact Arrow values.
- [x] Tauri: 26 locked tests, formatting and strict Clippy pass.
- [x] Quick Look native checks and regular macOS debug app bundling pass.
- [x] Documentation links, publication mirror and `git diff --check` pass.
- [ ] Actual native interaction verification: an existing development session owns
  port 3001, so the requested new `pnpm dev:desktop` session could not start. The
  regular app bundle built successfully, but computer automation repeatedly timed
  out attaching to its exact path. Native UI interaction is unverified. No other
  development session was stopped.

The full frontend formatter reports seven pre-existing, unchanged files:
`DesktopNavigationHeaderView.tsx`, `ResizeHandle.test.tsx`,
`editorTabsLayout.test.ts`, `button.test.tsx`, `dropdown-menu.tsx`, `sidebar.tsx`,
and `test/nodeMetadata.ts`. Files changed by this cleanup are formatted. One
pre-existing long Build interaction test exceeded its five-second timeout while
Rust/bundle compilation ran concurrently; the focused test and subsequent full
frontend run passed without raising its timeout. Browser process launch initially
required macOS sandbox escalation; the authorized rerun passed.

Windows execution was not performed on this macOS host. No project format,
dependency, concurrency, lifecycle ownership or archived-source changes were made.
