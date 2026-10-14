<!-- markdownlint-disable MD033 MD041 -->

[← Back to Help](./index.md)

<h1 id="help-ui-overview">Interface</h1>

Wordflow uses three columns: navigation and Tasks on the left, tools in the centre,
and the Editor with a Data View on the right.

![Wordflow main view](tutorials/assets/ldaca_main.png)

<h2 id="help-ui-tool-choice">Tools</h2>

Choose Loader, Builder, Frequency, Concordance, Topics,
Quotation, Annotation or Plots. Export is also available from Data Block menus.
Full names remain in tool headers. The pencil beside Tools selects which tools appear. Tools initially fits its
visible list; dragging or keyboard-resizing its divider sets a manual height.
Collapse section headings to make room. Pane ratios last until reload.

Analysis tabs have short numbered names such as FR-1, CC-1, QT-1, TM-1, AN-1,
TR-1, CP-1, SC-1, HM-1 and SK-1. Click a tab to activate it; double-click its name
to rename. Use arrow keys and Home/End while focused on the strip. Edge buttons
reveal off-screen tabs. Activating a tab reveals it; resizing preserves your
manual scroll. Rename preserves the confirmed name until success. After failure,
edit and Retry, or press Escape to discard the draft.

<h2 id="help-ui-data-selection">Data Blocks</h2>

The sidebar lists visible Data Blocks. Click a row to select it and open its
preview; click again to deselect while leaving the preview open. Graph and sidebar
selection agree. Clear selection leaves previews open. Use **Add to tool** or
double-click a graph card to add Builder inputs.

Selected input cards show the source, document column and, where relevant,
tokeniser and source colour. Choices wrap in narrow panes. Shortened names have
immediate hover/focus tooltips; fully visible names do not. Removing an input card
does not delete its Data Block.

<h2 id="help-ui-task-centre">Tasks</h2>

Tasks lists active runs first, failed or cancelled runs next, then successful runs.
One Run has one task. Current tab names and **Open tab** connect tasks to their
analysis. Closing or deleting an analysis tab cancels its run and removes that
tab's task history. Import/export history remains independent.

**Cancel** requests interruption. **Cancelling** remains visible until cleanup;
an operation already committed stays successful. You can switch tools or server
projects while accepted tasks continue. Progress updates reconnect after a
connection interruption. Preview, paging and ordinary draft edits add no tasks.

<h2 id="help-ui-project-graph-view">Editor and Project Graph</h2>

The compact **Editor** strip always offers an alphabetical Data Block picker.
The upper right area shows the graph or an in-place column tool. The lower Data
View can collapse independently. Resize dividers by dragging or focusing them and
using arrow keys. Double-click the main vertical divider, or press Enter/Space,
to restore its default split. The graph's existing maximum width remains 800 px.

Graph arrows point from source to result. Solid arrows show direct SQL View
dependencies; dashed arrows record logical links. **Show Dependencies** includes
hidden and unregistered objects across user schemas without evaluating View rows.
The sidebar and Builder inputs continue to use visible Data Blocks.

- Click a card to toggle selection. Its eye button opens or closes its preview.
- Double-click a card or use **Add to tool** to choose Builder inputs.
- Hover or keyboard-focus a card to use Rename, Clone, Export and Delete. Views
  also offer Materialise, Edit SQL definition and one query-layer Undo. Tables
  offer Edit Table with its own Save/Cancel session.
- Expanded cards show type and column count; graph display does not scan full
  View row counts. Unavailable objects retain their diagnostic.
- Keep normal pan/zoom gestures, or enable **Box selection** and drag a rectangle.
  Middle/right drag remains available for panning in selection mode. The control
  panel also has Zoom in, Zoom out, Zoom to fit and Clear selection.
- Delete opens the complete SQL-dependent closure for review. Untick entries to
  keep them; keeping a dependent also keeps selected sources it requires. Confirm
  one atomic deletion. A changed dependency or engine constraint leaves the
  entire batch intact and shows its error beside the confirmation.

Logical parent/child actions let you choose another card without changing SQL.
Escape cancels picking. Click a solid dependency edge to replace its source; drag
the edge's source connection onto another card, or use the keyboard picking
instructions. DuckDB validates the new definition before committing. Existing
logical links are retained.

<h2 id="help-ui-data-viewer">Data View</h2>

One Data Block is displayed at a time, independently of selection. Its eye remains
highlighted. Choose another eye or use the alphabetical Editor picker to switch.
Close preview with **×** or collapse Data View without closing it. Importing,
cloning and creating Data Blocks do not replace your current preview.

Page, sort, column widths and presentation choices are remembered for each Data
Block in this window. Reset sort clears sorting and returns to page one. The
header and controls remain available while pages load or fail.

The Editor's **Download Data Block** button exports all committed rows as CSV,
XLSX, JSON or Parquet. An unapplied edit preview does not change this download.

Double-click a Data Block or column name to rename, or use its menu. Newly entered
names trim outer whitespace; existing exact names and internal whitespace remain.
Case-insensitive collisions are rejected. Names are not automatically truncated.

Column menus open Find/Replace, Extract, Combine, Duplicate, Clean, Split, Count
or Delete in the upper Editor area. Preview reports affected rows and reveals
changed columns. Apply closes on success and preserves the form on failure.
Multiple-column deletion is atomic: Tables show a permanent-change warning;
Views support one Undo. [Column tools](./preprocessing.md) explain each operation.

Type labels remain plain while Row Details and exports retain exact stored types
and values. Text-to-datetime conversion offers three source examples, bounded
format detection and explicit DuckDB formats. Conversion validates the complete
source and fails atomically with examples if any value is invalid.

Click a row to open **Row Details** with complete document and metadata contents,
including nested JSON and source fields beginning with `__`. Previous/Next follows
the displayed ordering across pages. Missing cells remain compact; selection
controls distinguish missing, empty text and blank text. Mouse wheel scrolls the
pane; Shift provides horizontal movement where supported.

<h2 id="help-ui-tool-interface">Tool interface</h2>

Data Builder tools are Filter, Group, Join, Aggregate, Sample, Deduplicate, Stack,
Build and SQL, in that order. Forms compile ordinary DuckDB SQL through the shared
Preview/Apply path. Tables store applied results; live Views read current sources.
Unseeded Sample and Shuffle Views can change on each evaluation.

Analysis forms retain their settings and saved results per tab. See
[How Preview, Run and Clear work](./index.md#help-analysis-lifecycle) for the common
lifecycle and each tool's Help for its distinct behaviour.

<h2 id="help-ui-project-files">Project files</h2>

On desktop, File → New opens another Untitled window. Open focuses an existing
window for that file or opens a separate one. Save names an Untitled project;
Save As continues in the chosen copy. Changes commit immediately. Untitled
windows offer Save/Don't Save/Cancel on close; named projects need no unsaved-content
prompt. Running work asks whether to interrupt. Finish a Table-edit session with
Save or Cancel before closing its project.

On the server, New immediately creates `Untitled-X.wfpj` in the permanent library.
There is no server Save step. Rename is available for an idle open project without
active tasks or a Table-edit session. Duplicate creates a permanent copy while
leaving the requesting window on the original. Switching projects keeps sessions
and background tasks alive.

<h2 id="help-ui-appearance">Appearance</h2>

Settings → General → Appearance offers Light 2026 and Dark 2026. The choice applies
immediately and is saved to this device. Charts retain source identity colours;
figure exports have a white ground. Opaque headers keep text readable while
scrolling. Long names and CJK text wrap within their available panes.

Settings is available from the workspace cog and the web welcome dialog. Its
five sections are **General**, **AI**, **Portal**, **Storage** and **Guidance**.
Closing Settings returns to the same workspace or welcome dialog without losing
drafts. Preferences belong to this desktop installation, single-user web host,
or signed-in web account, as described in the dialog.

**AI** manages connections and their credentials. Annotation's **Manage
connections** shortcut opens the same manager; choosing a provider and model
still happens in Annotation. Built-in connections cannot be edited or deleted.
Custom connections support renaming, credential replacement/removal and confirmed
individual deletion.

**Portal** explains LDaCA access. Enter a token inline in Data Loader’s LDaCA
source for restricted collections. It stays in this window’s memory until the
window closes. Public collections work without a token.

**Storage** shows the application's resolved folders and web project/data
libraries. Web locations are on the server or worker, not your local computer.
Desktop can open existing folders; web can copy their paths. This page does not
change storage locations.

**Guidance** enables contextual hints and resets their history after confirmation.
Hints explain the active tool's setup, main action, results and next steps.
An outline highlights the area the hint explains. **Got it** remembers the hint;
**Not now**, its close icon, clicking outside or Escape pauses hints until the
next visit to that tool. **Disable hints** turns
them off. Hints leave keyboard focus alone and pause during dialogs, editing or
running work. Resetting history keeps your current enable choice.

<h2 id="help-ui-help-feedback">Help and Feedback</h2>

Help opens bundled guides with a pinned title, partner logos and zoom controls.
A **?** opens its section once below the header. Information and References use
the same viewer. References shows the application version, acknowledgement
citation, concept DOI and contributors.

Feedback opens an independent native window on macOS/Windows and a dialog on the
server. It is also in the native Help menu. You can report problems without closing
your project. Website links open in the desktop system browser.

## Finder Quick Look

On macOS, select a closed `.wfpj` file and press Space. Quick Look shows catalogue
metadata, visible Data Blocks and saved SQL-cell counts without executing Views.
An open project shows an in-use message. Open Wordflow to inspect rows.

<h3 id="help-ui-session-errors">Session errors</h3>

Settings → General → Diagnostics → Session errors holds the latest 200 displayed errors in
window memory. Details preserves original engine/provider diagnostics and available
request context. Copy one entry or the history for troubleshooting. Clear empties
it; reload or closing the window discards it. No request body, headers or history
is written into your project.
