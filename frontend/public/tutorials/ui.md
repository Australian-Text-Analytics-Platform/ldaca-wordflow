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

Below the tool list, the **Data Blocks** panel shows every data block in the active project. It is both a quick selector and a live indicator of what is selected in the [Project Graph](#help-ui-workspace-graph-view) (section 4) — selecting a block here is equivalent to clicking the corresponding node in the graph, and the two panels always stay in sync. It is especially useful when the right column is hidden.

- The total count and the number of currently selected data blocks are shown at the top.
- Click a data block to toggle its selection. Click again to deselect it. For tools that require more than one data block (e.g. Join or Stack), simply click each block in turn to build up a multi-selection.
- A filled circular checkbox indicates a selected data block; an empty circle indicates an unselected one.
- The list is sorted so that selected blocks always appear at the top, ordered by most recently selected first. Unselected blocks follow in alphabetical order.
- Selected data blocks automatically populate the tool interface (section 6) and the Data Editor (section 5).
- Most tools can only process a limited number of data blocks at a time; by default these are the most recently selected ones.

<h2 id="help-ui-task-centre">3. Task Centre</h2>

The **Tasks** panel sits below data selection and projects background Analyses
from the active Project together with your retained User File Imports.

- Analysis rows show progress and status only. Use the Analysis's owning Tab to
  cancel, clear, or re-run it.
- Queued and running User File Imports show **Stop**. The row remains visible if
  cancellation fails so you can try again.
- Successful, failed, and cancelled User File Imports remain available until
  you click **Clear**. Clearing the task removes its retained history record,
  not any files it successfully imported.
- **Live updates** keeps the panel refreshed automatically so you can continue
  working while tasks run in the background.

<h2 id="help-ui-workspace-graph-view">4. Project Graph</h2>

**Note:** The entire right column (Project Graph and Data Editor) can be collapsed to save screen space. Click the top-right arrow button to hide or show the right pane.

The **Project Graph** occupies the top-right area and visualises Data Block creation lineage. Every Data Block is a node, and creating a Derived Data Block draws an edge from parent to child. Updating an existing Data Block does not change the graph.

- Click a node to select that data block across the entire interface. Click it again to deselect. Selections made here are reflected immediately in the Data Blocks panel (section 2) and vice versa.
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
- Asterisked nodes indicate the currently selected data blocks.

<h2 id="help-ui-data-viewer">5. Data Editor</h2>

The **Data Editor** fills the bottom-right area. It shows the contents of the selected data blocks as a table, and it is where you change a data block in place: its columns and their values. Tools that make a new data block (Filter, Sample, Join, Stack) are in Data Preprocessing.

- Tabs along the top let you switch between multiple selected data blocks.
- The **Rename** button lets you rename the data block.
- **Column tools** change the selected data block without creating a new one:
  - **Add column**: **Combine columns** (join several columns with a separator), **Duplicate column** (the copy is placed right of the original and named like a copied file, for example `text copy`, then `text copy 2`), **Extract text** (copy the matches of a pattern into a new column), and **Split column** (split on a delimiter into several columns, the last keeping any remaining text).
  - **Find & replace**: replace the matches of a regular expression, in the same column or a new one.
  - **Clean text**: trim spaces, collapse repeated spaces, change case (lowercase, UPPERCASE, Title Case), or remove punctuation, digits, web links, or HTML tags, in the same column or a new one.
  - The same tools are in each column's settings menu, with that column already chosen.
- A tool opens in a panel above the table, in place of the Project Graph (use **Show Project Graph** to look at the graph, and **Back to** *tool* to return). While you set it up, the table previews the result with the affected columns highlighted, and the panel reports how many rows change across the whole data block. **Apply** makes the change as one step, so **Undo** reverses it; **Cancel** discards it.
- If you select another data block while a tool has unfinished settings, Wordflow asks whether to **Keep editing** or **Discard** them.
- **Delete columns** opens a list of the Data Block's columns: tick the ones to remove (filter, **Select all**, **Select none**), then confirm. They are removed in one step, so a single **Undo** brings them all back. At least one column must remain.
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
- Use **Previous row** and **Next row** at the bottom of the Row Details panel to review adjacent displayed rows. The Data Editor changes table pages automatically when you move past the first or last row on a page.
- The table is paginated — use the controls at the bottom to navigate through large data blocks.
- Scroll vertically with your mouse scroll wheel. Hold **Shift** to scroll horizontally.

<h2 id="help-ui-tool-interface">6. Tool Interface</h2>

The centre column is the main working area and shows the interface of whichever tool is selected in section 1. Each tool provides its own configuration options, previews, and action buttons.

- The tool name and a short description appear at the top.
- Sub-tabs (e.g. Filter, Sample, Join, Stack in Preprocessing) let you switch between related operations within the same tool.
- Most tools follow a common workflow: configure parameters → review a preview → click **Create Data Block** or **Update Data Block**. Tools that change rows (Filter, Sample, Join, Stack) always create a new block; Find and Create always update the selected block in place without changing its rows.
- Help icons (**?**) are placed next to individual controls and link directly to the relevant written Help section.

<h2 id="help-ui-working-directory">7. Working Directory</h2>

The Data Root is the filesystem directory where Wordflow stores durable application data.

- On first launch without `DATA_ROOT` or saved configuration, Wordflow uses the recommended location for your operating system and remembers it. There is nothing to choose.
- If that location cannot be used (for example, it is not writable), a setup screen shows the error and lets you choose another folder.
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
