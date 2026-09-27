# macOS bundle verification

The user authorized testing the ordinary desktop bundle after the computer-use tool
could not attach to the unbundled development process. The application was built with
`pnpm build:desktop:mac`; no separate QA application was created. All document fixtures
were disposable files under `/tmp/wordflow-window-verification`.

## Observed behavior

- The built application mounts the existing three-column interface, sidebar sections,
  graph and table. No desktop Data Root or authentication setup is required.
- Native File → New Project and Command-N create additional Untitled windows.
- Reopening the same canonical path focuses its existing window and creates no new listener.
- Command-O opens a native file chooser; opening a `.wfpj` creates another window and
  another listener in the same process. Two named projects both contained `example`.
- Command-S on a named project checkpoints without a chooser.
- Native Save As accepts macOS Replace, updates the title and path, and preserves the
  backend listener and selected table. The overwritten disposable fixture reopens normally.
- Command-R reloads the webview against its existing backend and displays stored data.
- Command-W during a long DuckDB query offers Interrupt and Close / Cancel. Cancel
  leaves the query running. Approval returns a structured interruption error, releases
  that listener, and leaves the other project's listener and displayed data intact.
- Modified Untitled Close offers Save / Don't Save / Cancel. Repeated Close does not
  bypass the existing prompt. Cancel leaves the project usable.
- Quit prompts sequentially. Cancel at the first modified project preserves all remaining
  listeners. Don't Save advances to the next project. Cancelling that project's native
  destination chooser stops Quit and preserves the project.
- Command-S on Untitled successfully writes a chosen `.wfpj` and updates its title.
- Closing the last window releases every listener while the macOS application remains
  running. Reactivating it opens an Untitled window. Command-Q exits the application.

## Corrections found through native testing

The default Tauri Close Window item also exposes macOS Close All. Those duplicate
entries were removed from File and Window so document closing uses the explicit
Close Project command. Initial native window titles now derive from the initialized
project rather than retaining the generic application title until the first Save.

The Tauri crate passes formatting, locked tests (18) and strict Clippy after these fixes.
The standard frontend production build passes. Signed release and Windows verification
remain separate CI checks.

## Final bundle recheck

`pnpm build:desktop:mac` produced the standard `.app` and `.dmg` successfully.
The rebuilt File menu contains New Project, Open, Save, Save As and Close Project;
the Window menu contains no duplicate Close Window/Close All. Untitled and named
window titles are correct immediately. Command-Shift-S opens the native chooser.
Reopening `Second.wfpj` shows the stored value 42 and reuses its existing listener
when opened again. Finder Open With → LDaCA Wordflow delivers the file-open event
to the running standard bundle.

Finder's current default `.wfpj` association points to an older Wordflow Samples QA
bundle. A plain double-click launched that obsolete application, which was closed
without editing the fixture. The global association was not changed.
