<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-ui-overview">User Interface Overview</h1>

The LDaCA app interface is organised into three columns containing eight main sections. This page describes each section and how they work together.

![LDaCA main app](tutorials/assets/ldaca_main.png)

<h2 id="help-ui-tool-choice">1. Tools</h2>

The **Tools** section in the left sidebar lists the available functions. Click a tool name to switch the main area (section 6) to that tool's interface. The active tools are:

- [**Data Loader**](./data-loader.md) — import local, sample or LDaCA data.
- [**Preprocessing**](./preprocessing.md) — Filter, Sample, Join, Stack, Find, Build and SQL.
- [**Frequency**](./token-frequency.md) — count tokens or compare two corpora, with saved analysis tabs.

Other analysis tools are listed but disabled while their native implementations are pending.
Use a Data Block's menu to [export its data](./export.md).

The edit icon next to the heading lets you customise which tools appear.

<h2 id="help-ui-data-selection">2. Data Selection</h2>

Below the tool list, the **Data Blocks** panel shows the visible Data Blocks in the project.
Selection stays in sync with the [Project Graph](#help-ui-project-graph-view),
and is independent of opened data previews and preprocessing inputs.

- Click a row to select it and open its data preview. Click again to deselect it; its preview stays open.
- The total count and selected count appear above the list. **Clear selection** leaves previews open.
- Selected Data Blocks can be deleted together through the graph controls.
- Use the **+** action or double-click a graph card to add preprocessing inputs.

<h2 id="help-ui-task-centre">3. Task Centre</h2>

The **Tasks** panel sits below Data Blocks. It shows tasks belonging to this
project, with progress, elapsed time and expandable details.

- **Cancel** requests interruption. The task remains **Cancelling** while its
  work finishes cleanup. An operation that already committed stays successful.
- Finished tasks can be **Dismissed** without deleting their results. The latest
  100 finished summaries remain available while the project window stays open.
- Updates arrive automatically. A temporary connection failure keeps the current
  list visible and reconnects without repeating old error notifications.

Imports, Frequency runs, **Default** SQL console runs, **Materialize**, **Clone** and native exports appear here.
You can switch Data Loader sources or leave the pane while imports continue,
and use **Cancel** in Tasks.
Automatic previews, page navigation, searches and SQL-cell saves do not add tasks.
Completed work refreshes your project even after you leave its original panel.
Reloading keeps task summaries but does not restore SQL result tables.
Frequency results are saved separately from the task list.

<h2 id="help-ui-project-graph-view">4. Project Graph</h2>

The default layout gives the tool 70% and the graph 30% of the space beside the
sidebar. Drag the divider to resize them; your choice is remembered. You can also
focus the divider and use the arrow keys. Double-click it, or press Enter or Space
while focused, to restore the default split. The graph is capped at 800 pixels.

**Note:** The entire right column (Project Graph and Data Viewer) can be collapsed to save screen space. Click the top-right arrow button to hide or show the right pane.

The **Project Graph** fills the right column and shows visible Data Blocks and their relationships. Arrows point from source to result:

- **SQL dependency:** a solid arrow with a filled head means the target View directly reads the source. Editing SQL can change these arrows automatically.
- **Virtual link:** a dashed arrow with an open head is a recorded relationship independent of current SQL. Materializing a View preserves its registered sources as virtual parents.

Each card has React Flow's small source handle on its bottom border, where outgoing arrows begin. If both relationships connect the same pair, one SQL-dependency arrow is shown; the virtual link is retained.

Hover over a card to reveal its toolbar above it. Moving away hides the toolbar;
keyboard focus keeps its controls available. An opened action menu remains available
until you choose an action, click outside, or press Escape.

To record a logical connection, open a Data Block's menu and choose **Add logical
parent** or **Add logical child**, then click another card. A dashed line follows
the pointer while choosing. Parent means the other card points to this one;
child means this card points to the other. Escape, Cancel, or clicking empty
canvas cancels. You can also focus a card with Tab and press Enter to choose it.
Logical links do not change SQL, selection, or the displayed preview.

To change a View's input, click its solid SQL-dependency arrow. The selected
arrow highlights with an instruction. Drag the edge near the parent card's connection port
onto another card; a temporary line follows the pointer. The port stays attached to the card,
and no extra circle appears when selecting the edge. The child View stays fixed. This
works in both graph modes; **Show Dependencies** also permits hidden and
unregistered database objects. For keyboard use, focus the arrow, press Enter,
then focus the replacement card and press Enter again. Escape cancels.

All references to the old source within that View are replaced together. The
replacement must provide the columns its SQL needs. DuckDB validates the change
before committing; errors leave the original View intact. Existing logical
links are retained, so a dashed arrow to the old source may remain. This source
replacement does not add an Undo layer.

- Click a node to toggle its selection, which stays in sync with the sidebar. Graph selection does not open or close previews.
- Hover or keyboard-focus a card and choose **Preview data** (the eye icon) to open its table. The same control is available on compact cards when zoomed out. With a card focused, press Enter to focus its Preview button; press Enter again to toggle the preview.
- Double-click a card, or choose **+**, to add it to the active preprocessing inputs. When several input areas are available, the Data Block follows the pointer until you choose an area.
- Hover a Data Block and open its menu to **Rename**, **Clone**, **Export**, or **Delete** it. Views also offer **Materialize** and **More → Edit SQL Definition**; Tables offer **More → Edit Table**. **Undo** removes a View query layer; Redo is unavailable.
- Expanded cards show the table name, type and column count. Graph interactions do not count data rows. An unavailable object shows a diagnostic on its card.
- Pan and zoom the graph with your mouse to navigate large projects. A vertical control panel sits at the top-left corner of the graph. Its collapsed form shows the selected/total Data Block count (for example, **0/2**); hover over or focus the panel to expand its button labels and the word **selected**.
  The panel provides the following actions:
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="13" height="13" style="display:inline;vertical-align:text-bottom"><path d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z"/></svg> **Zoom in** — increases the zoom level.
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 5" width="13" height="2" style="display:inline;vertical-align:middle"><path d="M0 0h32v4.2H0z"/></svg> **Zoom out** — decreases the zoom level.
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" width="13" height="12" style="display:inline;vertical-align:text-bottom"><path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.631A4.63 4.63 0 0 0 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.215c.53 0 .938.4.938.939v5.215H32V4.631A4.63 4.63 0 0 0 27.354 0zm.954 24.746c0 .53-.4.938-.939.938h-5.215V29.338h5.215A4.63 4.63 0 0 0 32 24.708v-5.215h-3.692v5.253zm-23.677.938a.939.939 0 0 1-.939-.938v-5.253H0v5.215A4.63 4.63 0 0 0 4.631 30h5.215v-3.692H4.631v.376z"/></svg> **Zoom to fit** — resets the view so all nodes are visible at once.
  - **Show Dependencies** — switches from the logical Data Block graph to Tables and Views across the project's user schemas, including hidden raw tables and unregistered SQL objects. This mode shows direct View SQL dependencies only, without virtual links. Switch it off to return to the logical graph.
  - **□ / ▣ Overview** — toggles a minimap in the bottom-right corner of the graph, giving a bird's-eye view of the full project layout. Click again to hide it.
  - **⊘ Clear selection** — deselects all currently selected data blocks at once. Greyed out when nothing is selected.
  - **Delete (n)** — asks for confirmation, then deletes all selected Data Blocks. Greyed out when nothing is selected.
- Selected Data Blocks have an outline around their cards.

<h2 id="help-ui-data-viewer">5. Data Viewer</h2>

Dependency mode shows each object's schema and whether it is registered, hidden or
unregistered. It inspects definitions without reading rows. Missing references show
a diagnostic; dependencies inside macros or dynamic table functions are not expanded.
Selection, card positions and zoom are separate for each mode. Switching modes keeps
your current Data View open. Dependency objects cannot be added to preprocessing;
the sidebar continues to show visible Data Blocks.

Use the card's existing controls to preview, rename, export, delete or edit the
underlying object. Views also support SQL editing, Materialize and query-layer Undo;
Tables support Edit Table. Clone in dependency mode makes an unregistered copy in
the same schema. These actions do not automatically add Data Blocks or open previews.
Deleting a source does not cascade to dependent Views; those Views may then report
missing-source errors.

The **Data Viewer** slides up over the lower graph area when a preview opens. Opening, closing, or resizing it does not move the graph.

- One Data Block is displayed at a time, independently of selection. Its **Preview data** eye button stays highlighted while it is displayed.
- Click the same eye again to hide the viewer, or another Data Block’s eye to switch directly to its data. The header’s **×** button also closes the preview, sliding the viewer down without moving the graph.
- Creating, cloning, or importing Data Blocks leaves your selection and current preview unchanged. Choose **Preview data** on a graph card or select its sidebar row when you want to view it.
- The preview shows the table; **Rename** changes the Data Block name. The title and controls stay available while a page loads or reports an error. Page, sorting, column widths, pinning and expansion are remembered for each Data Block in this window when switching previews.
- **Undo** removes the latest generated View query layer and survives reopening. Table changes and presentation metadata have no Undo; Redo is unavailable.
- Pagination offers the next page when the query finds more rows. Editing a table has its own fixed snapshot and exact page bounds.
- Each column header shows the column name and its data type (e.g. `datetime`, `string`). Click the settings icon on a column to rename or delete it; use the data-type menu to convert its type. These operations update the selected Data Block without creating a new one.
- Choose **More SQL types…** to enter a [DuckDB SQL type](https://duckdb.org/docs/lts/sql/data_types/overview), such as `DECIMAL(18,4)`, `VARCHAR[]`, or `TIMESTAMPTZ`. The dialog loads types and aliases from the project's DuckDB catalogue each time it opens, including user-defined types. Common names appear in a **Recommended** box above the remaining types. Typing filters both sections by name, underlying type and catalogue comment. Selecting a suggestion fills the input; add parameters if needed, then click **Cast** to apply it. You can also enter types absent from the suggestions. Invalid types or incompatible values report an error and retain your input. Table casts are transactional; View casts remain live and support Undo.
- Wordflow's automatically generated categorical ENUM types are hidden from suggestions. Deliberately named project types remain available. Hiding a type does not delete it from the project.
- The **datetime** shortcut converts to `TIMESTAMP`, a wall-clock value. For text inputs, leave **Custom format** blank for strict DuckDB conversion, or supply [DuckDB date formats](https://duckdb.org/docs/current/sql/functions/dateformat) for `strptime` followed by conversion to TIMESTAMP. Wordflow does not infer formats. For an instant, choose `TIMESTAMPTZ` through **More SQL types…**; this uses native CAST without a custom format. Native TIMESTAMP conversion ignores string offsets; TIMESTAMPTZ uses offsets or the database timezone. See [DuckDB timestamp semantics](https://duckdb.org/docs/current/sql/data_types/timestamp). Common format examples:
  - `%Y-%m-%d` → `2025-05-06`
  - `%d/%m/%Y` → `06/05/2025`
  - `%m/%d/%Y` → `05/06/2025`
  - `%Y-%m-%dT%H:%M:%S` → `2025-05-06T14:30:00` (ISO 8601)
  - `%d %b %Y` → `06 May 2025`
  - `%B %d, %Y` → `May 06, 2025`
- Click any row to open the **Row Details** panel, which displays the full contents of that row in a readable layout. The <a href="tutorials/assets/ui/row_details.png" target="_blank">row details</a> panel has two sections:
  - **Document** — shows the full text of the data block's designated document column (the column marked as the primary text when the data was loaded, e.g. the column named `text`, `document`, or `doc`). The section heading displays the column name, e.g. *Document: text*. If no document column has been configured for the data block, this section is omitted.
  - **Metadata** — shows all remaining columns as a two-column key/value table, making it easy to inspect structured fields such as speaker, date, or source alongside the document text.
- Use **Previous row** and **Next row** at the bottom of the Row Details panel to review adjacent displayed rows. The Data Viewer changes table pages automatically when you move past the first or last row on a page.
- The table is paginated — use the controls at the bottom to navigate through large data blocks.
- Scroll vertically with your mouse scroll wheel. Hold **Shift** to scroll horizontally.

<h2 id="help-ui-tool-interface">6. Tool Interface</h2>

The centre column is the main working area and shows the interface of whichever tool is selected in section 1. Each tool provides its own configuration options, previews, and action buttons.

- The tool name and a short description appear at the top.
- Sub-tabs (e.g. Filter, Sample, Join, Stack, Find, Build, SQL in Preprocessing) let you switch between related operations within the same tool.
- Most tools follow a common workflow: configure parameters → review a preview → choose whether to create or update when offered → click **Create Data Block** or **Update Data Block**. Filter, Find and Build offer both modes and default to creating a new block. Sample, Join, and Stack are create-only.
- Help icons (**?**) are placed next to individual controls and link directly to the relevant written Help section.

<h2 id="help-ui-project-files">7. Project files</h2>

Each desktop window owns one `.wfpj` project. **File → New** opens another
Untitled window; **Open** opens a file in its own window or focuses it if already
open. Name a project by saving its file. **Save As** keeps the same window and
continues in the chosen file.

Changes commit immediately. Every Untitled window offers **Save / Don't Save /
Cancel** on close, even if untouched. Named projects close without a save prompt.
If work is running, closing asks whether to interrupt it first. An open table
editor must finish with its own Save or Cancel before closing the project.

<h2 id="help-ui-appearance">8. Appearance</h2>

Open **Settings → Appearance** to switch between **Light 2026** and
**Dark 2026**. The interface changes immediately and the selection is saved to
this device. Wordflow uses the last successful selection during startup so a
reload does not briefly show the other theme. Charts and Data Block identity
colors remain stable, while downloaded chart images keep a white background.

<h2 id="help-ui-help-feedback">9. Help and Feedback</h2>

The **Help** and **Feedback** buttons at the very bottom of the left sidebar provide quick access to assistance.

- **Help** opens the built-in written guides in a floating window (the one you are currently reading). Clicking any **?** icon scrolls Help to the relevant section.
- **Feedback** opens a form where you can report bugs, request features, or ask questions. Your feedback goes directly to the developer team. Please do not include any confidential information.
[← Back to tutorial index](./index.md)


## Finder Quick Look

On macOS, select a closed `.wfpj` file in Finder and press **Space**. The preview
shows its name, description, file size, modification date, visible Data Blocks and
saved SQL-cell count. Expand a Data Block to see column names and SQL types.

Quick Look reads catalogue information only: it does not load values, execute Views,
or show a relationship graph. Missing objects are labelled unavailable. If the
project is open in Wordflow, Quick Look shows an in-use message and available file
details. Open the project in Wordflow to explore its data and dependencies.

<h3 id="help-ui-session-errors">Session errors</h3>

Open **Settings → Diagnostics → Session errors** to review errors that appeared
in this window, even after dismissing a notification. Expand an entry to read
its message, time and available technical details. Notifications show the error
message immediately; **Show details** reveals the underlying error code and
diagnostic, plus the HTTP request path and status when available. **Copy details**
copies one entry; **Copy all** copies the history for troubleshooting.

The history holds the latest 200 errors in memory. **Clear** empties it, and
reloading or closing the window discards it. It is not saved in your project.
