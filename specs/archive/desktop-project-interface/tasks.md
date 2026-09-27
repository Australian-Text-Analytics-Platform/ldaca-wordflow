# Verification

- [x] Shared original layout and desktop-only Data Loader.
- [x] Classic import dialog, recent paths, graph drop and Table/View cards.
- [x] Native browser import/save/reopen/reload and no server bootstrap requests.
- [x] Visually inspect layout and settled import dialog screenshots.
- [x] Rust embedded LDaCA table and changed-destination regression test.
- [x] Tauri lifecycle tests.
- [x] macOS bundle screenshots and native picker -> Add to Project -> stored Table.
- [x] Native drop-coordinate/listener regression and browser graph-drop dialog.
- [x] AppKit Cmd-Q displays unsaved guard; Cancel preserves identity; repeated Quit stays pending; Discard releases process and socket.
- [x] Final checks and separate Windows CI verification report (not run locally).

Frontend: 1,369 tests pass, plus native drop regression. Native browser workflow,
lint, build, tooling, version and documentation checks pass. Server navigation
passes; existing analysis 409 and superseded-analysis 404 console errors still
fail the core/quotation E2E error fixture. Windows is configured in CI but has
not been executed from this local macOS session.

Final native QA used the local debug macOS bundle. Native file selection and
import were exercised through AppKit; screenshots confirmed original panes,
classic dialog and Table card. External Finder drag was not manually certified
because Stage Manager changed window placement during automation; graph drop
routing is covered by the native-coordinate test and real browser workflow.
The bundle contains no Python runtime. Application signing used the existing
local ad-hoc workflow; this was not a notarized release build.
