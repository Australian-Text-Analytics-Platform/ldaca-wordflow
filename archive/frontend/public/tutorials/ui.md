<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-ui-overview">User Interface Overview</h1>

The LDaCA app interface is organised into three columns containing eight main sections. This page describes each section and how they work together.

![LDaCA main app](tutorials/assets/ldaca_main.png)

<h2 id="help-ui-tool-choice">1. Tool Choice</h2>

The left sidebar lists the available tool modules. Click a tool name to switch the main area (section 6) to that tool's interface. The available tools include:

- [**Data Loader**](./data-loader.md) — create or load projects and upload data files.
- [**Preprocessing**](./preprocessing.md) — filter, sample, join, stack, find, and create columns.
- [**Token Frequency**](./token-frequency.md) — count and explore the most common terms.
- [**Concordance**](./concordance.md) — inspect search terms in their surrounding context.
- [**Trends and Sequence**](./sequential-analysis.md) — count documents over time or any ordered numeric axis.
- [**Topic Modelling**](./topic-modeling.md) — discover themes with native semantic clustering.
- [**Quotation Extraction**](./quotation.md) — capture quoted speech with speaker and verb annotations.
- [**Annotation**](./annotation.md) — label text manually or with a configured AI provider.
- [**Export**](./export.md) — download selected Data Blocks or a Project archive.

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

Imports, **Default** SQL console runs, **Materialize** and **Clone** appear here.
You can close an import dialog while it continues and use **Cancel** in Tasks.
Automatic previews, page navigation, searches and SQL-cell saves do not add tasks.
Completed work refreshes your project even after you leave its original panel.
Reloading keeps task summaries but does not restore SQL result tables.
Analysis execution remains unavailable.

<h2 id="help-ui-project-graph-view">4. Project Graph</h2>

**Note:** The entire right column (Project Graph and Data Viewer) can be collapsed to save screen space. Click the top-right arrow button to hide or show the right pane.

The **Project Graph** fills the right column and visualises Data Block creation lineage. Every Data Block is a node, and creating a Derived Data Block draws an edge from parent to child. Updating an existing Data Block does not change the graph.

- Click a node to toggle its selection, which stays in sync with the sidebar. Graph selection does not open or close previews.
- Hover or keyboard-focus a card and choose **Preview data** (the eye icon) to open its table. The same control is available on compact cards when zoomed out. With a card focused, press Enter to focus its Preview button; press Enter again to open the preview.
- Double-click a card, or choose **+**, to add it to the active preprocessing inputs. When several input areas are available, the Data Block follows the pointer until you choose an area.
- Hover a Data Block and open its settings menu to **Rename**, **Clone**, **Undo**, **Redo**, or **Delete** it. Undo and Redo availability comes from that Data Block's current backend session history.
- Use **Rename** to rename the active project.
- Pan and zoom the graph with your mouse to navigate large projects. A vertical control panel sits at the top-left corner of the graph. Its collapsed form shows the selected/total Data Block count (for example, **0/2**); hover over or focus the panel to expand its button labels and the word **selected**.
  The panel provides the following actions:
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="13" height="13" style="display:inline;vertical-align:text-bottom"><path d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z"/></svg> **Zoom in** — increases the zoom level.
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 5" width="13" height="2" style="display:inline;vertical-align:middle"><path d="M0 0h32v4.2H0z"/></svg> **Zoom out** — decreases the zoom level.
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" width="13" height="12" style="display:inline;vertical-align:text-bottom"><path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.631A4.63 4.63 0 0 0 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.215c.53 0 .938.4.938.939v5.215H32V4.631A4.63 4.63 0 0 0 27.354 0zm.954 24.746c0 .53-.4.938-.939.938h-5.215V29.338h5.215A4.63 4.63 0 0 0 32 24.708v-5.215h-3.692v5.253zm-23.677.938a.939.939 0 0 1-.939-.938v-5.253H0v5.215A4.63 4.63 0 0 0 4.631 30h5.215v-3.692H4.631v.376z"/></svg> **Zoom to fit** — resets the view so all nodes are visible at once.
  - **□ / ▣ Overview** — toggles a minimap in the bottom-right corner of the graph, giving a bird's-eye view of the full project layout. Click again to hide it.
  - **⊘ Clear selection** — deselects all currently selected data blocks at once. Greyed out when nothing is selected.
  - **Delete (n)** — asks for confirmation, then deletes all selected Data Blocks. Greyed out when nothing is selected.
- Selected Data Blocks have an outline around their cards.

<h2 id="help-ui-data-viewer">5. Data Viewer</h2>

The **Data Viewer** slides up over the lower graph area when a preview opens. Opening, closing, or resizing it does not move the graph.

- Tabs show opened previews independently of selection. Drag to reorder tabs, or close a tab with its **×** button. Closing the last tab slides the Data Viewer down.
- Choosing **Preview data** again activates the existing tab without duplicating or moving it.
- Creating, cloning, or importing Data Blocks opens their previews without changing selection. Multiple results open in creation order, with the last one active; hidden backing tables are not previewed.
- The **Data View** sub-tab shows the raw table; the **Rename** button lets you rename the data block.
- **Undo** and **Redo** revert or reapply the selected Data Block's most recent plan edit. The same actions are available in the graph Data Block menu. History is independent per Data Block, stores at most 50 plans, and lasts only while the Project remains open in the backend process. Closing and reopening preserves the latest data but clears both buttons.
- Each column header shows the column name and its data type (e.g. `datetime`, `string`). Click the settings icon on a column to rename or delete it; use the data-type menu to convert its type. These operations update the selected Data Block without creating a new one. When converting, the app attempts to guess the date format automatically. This works for many common formats but can fail or produce incorrect results when the format is ambiguous (e.g. `01/02/03` could be read as DD/MM/YY, MM/DD/YY, or YY/MM/DD). If the conversion fails or the dates look wrong, use the **Format** field to specify the format explicitly using [Python strftime/strptime codes](https://docs.python.org/3/library/datetime.html#strftime-and-strptime-format-codes). Common examples:
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
- Sub-tabs (e.g. Filter, Sample, Join, Stack, Find, Create in Preprocessing) let you switch between related operations within the same tool.
- Most tools follow a common workflow: configure parameters → review a preview → choose whether to create or update when offered → click **Create Data Block** or **Update Data Block**. Filter, Find, Create, and Expression offer both modes and default to creating a new block. Sample, Join, and Stack are create-only.
- Help icons (**?**) are placed next to individual controls and link directly to the relevant written Help section.

<h2 id="help-ui-working-directory">7. Working Directory</h2>

The Data Root is the filesystem directory where Wordflow stores durable application data.

- On first launch without `DATA_ROOT` or saved configuration, use the setup screen's recommended location or choose another folder.
- The desktop app opens the operating system's native folder picker. In a browser, enter an absolute path on the server that runs Wordflow.
- Change an existing single-user Data Root under **Settings → Project → Working Directory**. After a successful change, Wordflow reloads automatically and does not copy data from the previous root.
- Environment-managed and multi-user deployments show operator guidance instead of allowing a client-side change.

<h2 id="help-ui-appearance">8. Appearance</h2>

Open **Settings → General → Appearance** to switch between **Light 2026** and
**Dark 2026**. The interface changes immediately and the selection is saved to
your account. Wordflow uses the last successful selection during startup so a
reload does not briefly show the other theme. Charts and Data Block identity
colors remain stable, while downloaded chart images keep a white background.

<h2 id="help-ui-help-feedback">9. Help and Feedback</h2>

The **Help** and **Feedback** buttons at the very bottom of the left sidebar provide quick access to assistance.

- **Help** opens the built-in written guides in a floating window (the one you are currently reading). Clicking any **?** icon scrolls Help to the relevant section.
- **Feedback** opens a form where you can report bugs, request features, or ask questions. Your feedback goes directly to the developer team. Please do not include any confidential information.
<span id="help-ui-hint-system"></span>
- Each of the nine functions can show brief **Contextual Hints** as you reach
  useful milestones. Several hints may form a progressive sequence, but each
  is acknowledged independently. Choose **Got it** or press **Enter** to
  acknowledge the current version and continue to another milestone already
  reached.
- Choose **Not now** or press **Escape** to pause hints for the current function
  visit without acknowledging anything. Switching Analysis Tabs does not
  resume them; leave the function and return to retry the earliest eligible
  unacknowledged hint.
- Contextual Hints can be disabled under **Settings → Guidance**. The same page
  can reset acknowledgment history for the current user, causing eligible hint
  versions to appear again on this device.
- A replayable **Guided Tour** is shown in Help only when one is available. A
  tour is started deliberately and is unaffected by the Contextual Hint switch.

[← Back to tutorial index](./index.md)
