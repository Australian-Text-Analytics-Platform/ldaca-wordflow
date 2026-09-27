# Native ownership cleanup — 15 September 2026

This change implements the approved cleanup of the active native application.
Project format remains **6**. Archived sources and analysis execution are unchanged.

## Production changes

- Save As coordinates destination claims with Open and rejects another document
  window or external DuckDB owner. Closed-file replacement remains supported.
- Editor sessions own their snapshot and mutation protection together. Pending
  startup and accepted Save remain owned through teardown; failed Save retains
  the session for correction.
- SQL uses explicit execute/read/preview modes. Execute acquires read-only
  permission when editor protection prevents mutation. Streaming Arrow execution
  detects late errors, drains capped output and checks cancellation between batches.
- Graph cards display column counts only. Hover counting and its endpoint/cache
  are removed. The Data View retains lookahead pagination and a stable shell.
- Column mutations capture their target. Per-node column preferences survive
  preview switching and renaming. Batch deletion is sequential with partial success.
- IPC export retains column extension metadata. Running export dialogs can close
  without ending their tasks. Task refresh effects are explicit; exports do not
  trigger data reloads. SQL-cell saves update their known cache records directly.
- LDaCA Parquet preparation occurs before database permission. Selection, feedback
  context and help lookup have one owner each; obsolete state and fallbacks are removed.
- Focusing the animated Data View resize handle previously scrolled an
  overflow-hidden ancestor, moving a card away from the pointer. Clipping the fixed
  graph container prevents that movement without adding hover delays.

The canonical contracts are in [runtime ownership](../architecture/backend/native-projects.md),
[the project API](../reference/native-project-api.md),
[desktop presentation](../architecture/frontend/desktop.md) and
[preprocessing](../architecture/frontend/preprocessing.md).

## Automated verification

| Check | Result |
| --- | --- |
| Backend locked tests | 77 passed. One separately ignored subprocess helper is exercised by its parent test. |
| Tauri locked lifecycle/export tests on macOS | 26 passed |
| Rust formatting and strict Clippy, both crates | Passed |
| Frontend unit/component tests | 424 passed, plus four Node build/source-contract tests |
| Frontend lint, tooling types and build | Passed |
| Production source graph and Knip | Passed; 210 reachable source files and no unused production files |
| Chromium with Rust preview | 34 interaction tests passed |
| Formerly intermittent hover regression | Eight consecutive passes, plus the full suite |
| Quick Look Swift tests and macOS app/DMG packaging | Passed |
| Documentation drift, publication mirror, internal links and diff whitespace | Passed |

New coverage includes cross-process destination locking, concurrent Open/Save As
claims, editor startup/write/cleanup races, accepted Save ownership, SQL modes and
request-local state, read-only persistent-write/sequence rejection, late streaming
rollback, IPC metadata/precision, column-target capture, per-node preferences,
preview loading/error shells, dismissible exports, task refresh effects, source-cache
updates, feedback capture and sequential partial deletion with one notification.

Updated the packaging probe to use the current sample-import contract and explicitly
read the imported HTTPS-backed views. It passed against a temporary Rust-hosted
project; metadata-only graph inspection no longer serves as proof of remote scans.
This probe run does not verify extension loading in a signed release.

## Native visual verification

One owned `pnpm dev:desktop` session was used. The native automation tool could not
attach to its bare executable, so UI verification used the regular app produced by
`pnpm build:desktop:mac`, without a separate QA application.

Verified local import, Table/View cards with `Columns: 3`, independent selection and
preview opening, pagination, pinning retained after closing/reopening the preview,
materialization and task history, light/dark appearance and bundled Help. File Save,
Close and Reload returned focus to the editor. Saving table edits released protection;
subsequent File Save opened the native destination chooser.

A second Untitled window attempted to replace the first window's saved QA project.
After native Replace approval, Wordflow reported that the destination must be closed
first. Both windows remained usable. Cancel and Don't Save worked for the untouched
Untitled window after that failure; the named project closed without a save prompt.
The original theme and pane sizes were restored and the QA app quit normally.

Native checks above are distinct from the Chromium Rust-preview suite. Windows
native execution remains a CI/platform verification item. Release signing and
notarization were not verified; local packaging used the configured ad-hoc signature.
The build retains its non-blocking large-chunk warning, and Knip reports two
configuration hints without unused-code failures.

## Documentation

Updated the canonical runtime, API, project lifecycle, desktop and preprocessing
references, help mapping ownership, native QA instructions and active tutorials.
Regenerated the documentation publication mirror from frontend sources.
