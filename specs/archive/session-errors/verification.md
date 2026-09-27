# Verification — 20 September 2026

## Delivered behavior

Settings → Diagnostics retains 200 window-local error occurrences, with
expandable messages, available stacks, task IDs, copy and clear actions.
Reload discards the UI history. No project format, backend endpoint,
dependency or persistent application storage was added.

The existing notification reporter remains the single toast owner. The same
records feed browser/native E2E assertions. Runner-owned records survive toast
dismissal, Clear and document reloads. Intentional negative scenarios declare
message patterns and exact counts. A capture failure also fails the test.

Build's SQL-to-bubble parser now leaves failures in its existing inline feedback,
without a second toast. Its invalid draft remains intact. A regression test and
the browser SQL-handoff scenario cover that ownership.

## Focused verification

- Unit coverage exercises bounds, clearing, task ownership, toast expansion,
  React/global failures, clipboard failure and expected/missing/extra E2E errors.
- The browser and native diagnostics scenarios verify retained history after
  dismissing the toast, details, Clear, reload, both themes and no horizontal
  overflow. Browser verification uses a narrow 680-pixel window.
- Native driver stale-element signals are retained in reports but excluded from
  failure assertions only when the exact message and injected document-root
  stack identify the driver. The same message from an app frame still fails.
- Browser cast, source-replacement, partial-delete, SQL-definition and task
  negative scenarios pass with explicit error expectations.
- Production bundles contain no E2E capture bridge.

## Follow-up investigation and fixes

The initial broad runs found genuine defects and test-driver problems. No broad
expected-error patterns were added to silence them.

| Observed failure | Confirmed cause and fix |
| --- | --- |
| `Failed to fetch` / `Load failed` during forced navigation | WebDriver can destroy pending reads before DOM unload handlers run. The test bridge explicitly aborts signalled reads before navigation, preserving AbortError semantics. Uncancelled transport failures still propagate; accepted operations continue. |
| Native `null is not an object (evaluating 'e.document')` | The pinned embedded driver creates synthetic MouseEvents without their originating window. The native test adapter supplies `view` for synthetic events only, allowing D3 drag listeners to initialize. |
| Native dependency edge cannot be selected at compact zoom | WebKit did not honour the width of React Flow's unpainted interaction path. An explicitly transparent stroke restores the invisible hit area. The native scenario verifies a hit outside the thin visible line before selecting and reconnecting. |
| Cast Undo appears unfinished or conflicts with cleanup | Tests could accept an old preview label before Undo completed. They now wait for the Undo control's completed state before asserting the restored type or dropping fixtures. |
| Build popover search clipped and nested expressions misplaced | The root `build/` ignore matched the preprocessing Build source folder, excluding its classes from Tailwind discovery. The exception now names the current `tools` source path. |
| Boolean preview cells emit invalid `title` warnings | Tooltips now use the existing preview-value formatter, including booleans and arrays. The regression failed before the fix. |
| Dependency graph contains other scenarios' objects | Browser fixtures now clear all test-created user schemas, including unregistered objects and named types. A regression recreates the same quoted schema and enum after reset. |
| Menu collision test never reaches its intended position | A single pointer move started React Flow's drag but did not move the card. The test sends an intermediate threshold-crossing move and verifies the final card position. |
| Imports and materialization stop refreshing after Save As | Reopening the saved database replaced its change-notification sender. Save As now preserves the runtime's existing channel. A backend regression covers repeated saves; the browser project scenario verifies a subsequent import appears without reload while preserving the displayed preview. |

A separate browser-driver probe confirmed that a detached control reports
`isDisplayed() = false` while a fresh lookup of its replacement reports `true`.
The reduced-motion reopening assertion now resolves the current control while
waiting, retaining the same visibility requirement. No application workaround,
extra exception filter or test-operation retry was added. Temporary diagnostic
specs were removed.

Final verification:

- The completed-source native suite passes all 7 files (44 scenarios) in 1m29s,
  with no unexpected captured errors.
- The full browser run passes 22 of 24 files, with no unexpected session errors.
  Its two remaining failures were test assertions: an offscreen card in the new
  Save As regression and a detached control during preview reopening. Both were
  corrected. The affected original files then pass together, plus six repeated
  overlay scenarios across light/dark themes: 9 passing scenarios. The other
  22 files were unchanged; the entire browser suite was not rerun after these
  final test-only corrections.
- Frontend verification passes 518 unit tests, 8 tooling tests, lint, tooling
  typecheck, production build, native test build, source/unused-code checks,
  format check, documentation checks/publication sync and Markdown links.
- Native screenshots cover source reconnection and the menu in both themes;
  browser screenshots confirm the Build controls and nested layout.

The five baseline formatter failures were formatted; the repository-wide source
format check now passes.

Error reports remain under `frontend/.tmp/wdio/` (native) and
`frontend/.tmp/wdio/browser/` (browser), named `<test-title>.errors.json`.
They include errors emitted before Clear/reload and any assertion failure.

The native Rust suite passes 31 tests. Its initial documentation-test stage
could not resolve Tauri crates during overlapping builds; an isolated rerun
passes. The backend suite passes 133 tests with one existing ignored test,
including the Save As notification regression. Strict backend and Tauri Clippy,
Rust formatting and diff-whitespace checks pass.
