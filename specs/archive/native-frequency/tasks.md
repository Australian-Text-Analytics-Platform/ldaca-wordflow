# Delivery checks

- [x] Format-7 storage, atomic publication and cleanup.
- [x] Native Frequency task ownership, progress and cancellation.
- [x] Restored tabs, drafts, result presentations and filters.
- [x] Bundled offline recommendations and table/chart export implementation.
- [x] Backend, native algorithm and Tauri tests.
- [x] Frontend tests, lint and unused-code checks.
- [x] Scoped formatting, strict Clippy, build and tooling checks.
- [x] Browser/native Frequency WebdriverIO and native layout inspection.
- [x] Quick Look contracts, canonical docs, publication mirror and diff checks.

## Verification record

Implementation integration checks reported by the owning task:

- Backend locked suites: 66 library, 2 binary and 43 integration tests passed.
- Tauri locked tests: 31 passed.
- `ldaca-rs`: 21 tokenization tests, 3 no-default-feature tests and 10 adapter
  tests passed.
- Frontend: 475 tests across 114 files passed. The final chart-scheduling
  correction then passed all 47 focused Frequency tests.
- Lint, tooling type checks, build, strict Clippy and scoped formatting checks
  passed. The production unused-code check found 223 reachable files and no
  unused items.
- Browser Frequency: 3/3 scenarios passed against the restored fixed-tab layout.
  Existing browser project/task scenarios also passed.
- Native Frequency: 3/3 scenarios passed against the rebuilt application. One
  earlier run hit a transient embedded-driver script timeout during reload;
  the serial rerun passed.
- Broader preprocessing browser coverage passed 9/10 on its first run. The
  temporal-text-entry case then passed 1/1 in isolation without code changes.
- The owning task inspected the restored fixed tabs, request/results panels,
  ranked lists and keyness table in native light/dark themes at normal and narrow
  pane widths. The final native comparison scenario also passed with render-aware
  screenshot waits; settled individual clouds and Juxtorpus were inspected after
  resizing in both themes. Browser screenshots were inspected separately.
- Quick Look native Swift checks and all 3 packaging contract tests passed.
- Documentation links, bundled help validation and publication mirror validation
  passed. Mirror generation changes only canonical-content copies; nothing was
  committed or published remotely.

## Verification limits

Windows CI was not run in this local session. Native OS file-chooser dialogs and
the actual Finder preview were not manually rerun; native export staging/install
contracts and Quick Look's native read-only tests passed. These checks do not
claim signed release-package or cross-platform validation.

The broad frontend formatting check has seven pre-existing failures outside this
change. Its final read-only run checked 340 files and applied no fixes. These
files remain untouched:

- `frontend/src/components/layout/DesktopNavigationHeaderView.tsx`
- `frontend/src/components/layout/__tests__/ResizeHandle.test.tsx`
- `frontend/src/components/tabs/__tests__/editorTabsLayout.test.ts`
- `frontend/src/components/ui/__tests__/button.test.tsx`
- `frontend/src/components/ui/dropdown-menu.tsx`
- `frontend/src/components/ui/sidebar.tsx`
- `frontend/src/test/nodeMetadata.ts`
