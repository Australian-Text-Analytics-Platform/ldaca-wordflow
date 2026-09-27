# Verification record

- [x] Read-only DuckDB parsing endpoint; exact values, casts and opaque subtrees.
- [x] Recursive tree, fixed summary forms and frontend catalogue recognition.
- [x] Bubble palette, nested containers, typed values and keyboard movement.
- [x] SQL reconstruction, inline diagnostics and retained preview/draft ownership.
- [x] Every operation and combination round-trips against DuckDB 1.5.5.
- [x] Nineteen affected Chromium/Rust-preview tests, including light/dark narrow panes,
  pointer dragging, nested moves, cycle prevention and opaque SQL subtrees.
- [x] Parser remains available during cell editing and executes no user SQL.
- [x] Full frontend suite: 396 tests and four Node build/source checks passed.
- [x] Frontend lint, build, tooling types, production reachability and unused-code checks.
- [x] Locked backend suite: 85 passed, one existing network test ignored;
  formatting and strict Clippy passed.
- [x] Native light/dark visual and interaction verification in the regular debug app bundle.
- [x] Documentation checks, publication mirror and diff whitespace check.

One owned `pnpm dev:desktop` session compiled. The native automation API could not
address that unbundled executable. After the user approved closing the pre-existing
dev process, testing used the regular debug app bundle and a disposable project.
Native checks covered palette copying, second-root combination selection, nested
movement, column operations, SQL reconstruction with an opaque CASE fragment,
and successful View creation with an independent preview and unchanged selection.

Native verification exposed HTML dragging being intercepted by the native file-drop
handler. Internal bubble dragging now uses pointer capture; the same interaction
passes native and Chromium checks without changing graph file-drop handling.

The repository-wide frontend format check reports existing issues in seven unrelated
files: `DesktopNavigationHeaderView.tsx`, `ResizeHandle.test.tsx`,
`editorTabsLayout.test.ts`, `button.test.tsx`, `dropdown-menu.tsx`, `sidebar.tsx`,
and `test/nodeMetadata.ts`. Formatting passes for the changed Build files.
No Windows native run was performed. Existing compiler/chunk-size warnings remain.
