<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-ui-overview">User Interface Overview</h1>

The LDaCA app interface is organised into three columns containing eight main sections. This page describes each section and how they work together.

![LDaCA main app](tutorials/assets/ldaca_main.png)

<h2 id="help-ui-tool-choice">1. Tool Choice</h2>

The left sidebar lists the available tool modules. Click a tool name to switch the main area (section 6) to that tool's interface. The available tools include:

- [**Data Loader**](./data-loader.md) — create or open projects and upload data files.
- [**Data Builder**](./preprocessing.md): make new Data Blocks by filtering, grouping, joining, segmenting, aggregating, sampling, deduplicating, and stacking.
- [**Frequency**](./token-frequency.md) — count and explore the most common terms, and compare two corpora.
- [**Concordance**](./concordance.md) — inspect search terms in their surrounding context.
- [**Trends**](./sequential-analysis.md) — count documents over time or any ordered numeric axis.
- [**Topic Modelling**](./topic-modeling.md) — discover themes with native semantic clustering.
- [**Quotation**](./quotation.md) — capture quoted speech with speaker and verb annotations.
- [**Annotation**](./annotation.md) — label text manually or with a configured AI provider.
- [**Export**](./export.md) — download selected Data Blocks or a Project archive.

The edit icon next to the heading (**Edit visible views**) lets you choose which tools appear.

<h2 id="help-ui-data-selection">2. Data Selection</h2>

Below the tool list, the **Data Blocks** panel shows every data block in the active project. It is both a quick selector and a live indicator of what is selected in the [Project Graph](#help-ui-workspace-graph-view) (section 4) — selecting a block here is equivalent to clicking the corresponding node in the graph, and the two panels always stay in sync. It is especially useful when the right column is hidden.

- The total count and the number of currently selected data blocks are shown at the top.
- Click a data block to toggle its selection. Click again to deselect it. Click several blocks in turn to build up a multi-selection.
- A filled circular checkbox indicates a selected data block; an empty circle indicates an unselected one.
- Pinned blocks are listed first, then selected blocks, then the others.
- Selected data blocks open as tabs in the Data Editor (section 5).
- Hover a data block, here or in the Project Graph, to show its buttons. The pin keeps it at the top of this list. The **+** button (**Add to selection**) adds it to the inputs of the tool you are using. When the tool has one inputs panel, the block is added straight away; when it has several (for example Annotation's Annotation, Codebook, and Example Data Blocks), the block follows the pointer until you click the panel you want (press Esc or right-click to cancel). You can also use **Add data block** in the tool's inputs panel.
- Most tools can only process a limited number of data blocks at a time, shown in their inputs panel.

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

<span id="help-ui-change-project"></span>
To switch projects without going to the Data Loader, use **Change Project** at the right end of the Project Graph title bar and choose another project. Wordflow asks you to confirm, then closes the current project (it is saved automatically as you work) and opens the one you chose. While a task is still running in the current project, the projects in the list are disabled and a note says so: wait for the task to finish, or stop it in its tab, and then switch.

![Change Project menu in the Project Graph title bar](tutorials/assets/ui/change_project.png)

- Click a node to select that data block across the entire interface. Click it again to deselect. Selections made here are reflected immediately in the Data Blocks panel (section 2) and vice versa.
- Each Data Block shows its name and size, for example **1,234 rows × 5 columns**.
- Hover a Data Block and open its settings menu to **Rename**, **Clone**, **Export**, **Undo**, **Redo**, or **Delete** it. A clone is a copy named after the original with `_clone` added (for example `speeches_clone`). Undo and Redo availability comes from that Data Block's current backend session history.
- Use **Rename** beside the project name in the title bar to rename the active project.
- To move around a large project, drag an empty part of the graph, or scroll with two fingers on a trackpad (or with the mouse wheel). To zoom, pinch on a trackpad, or hold Ctrl (⌘ on a Mac) while scrolling.
- To select several data blocks at once, hold Shift and drag a box around them, or switch the panel's drag button to **Drag to select** and drag without Shift. Every data block the box touches is added to the selection, as if you had clicked it. In **Drag to select** mode, drag with the right mouse button to move the graph.

![Project Graph control panel, with the drag-mode button showing its name](tutorials/assets/ui/graph_controls.png)

- A vertical control panel sits at the top-left corner of the graph. At the top it shows the selected/total Data Block count (for example, **0/2**). The panel stays narrow so it does not get in the way; rest the pointer on a button for half a second to see its name.
  The panel provides the following actions:
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="13" height="13" style="display:inline;vertical-align:text-bottom"><path d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z"/></svg> **Zoom in** — increases the zoom level.
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 5" width="13" height="2" style="display:inline;vertical-align:middle"><path d="M0 0h32v4.2H0z"/></svg> **Zoom out** — decreases the zoom level.
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" width="13" height="12" style="display:inline;vertical-align:text-bottom"><path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.631A4.63 4.63 0 0 0 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.215c.53 0 .938.4.938.939v5.215H32V4.631A4.63 4.63 0 0 0 27.354 0zm.954 24.746c0 .53-.4.938-.939.938h-5.215V29.338h5.215A4.63 4.63 0 0 0 32 24.708v-5.215h-3.692v5.253zm-23.677.938a.939.939 0 0 1-.939-.938v-5.253H0v5.215A4.63 4.63 0 0 0 4.631 30h5.215v-3.692H4.631v.376z"/></svg> **Fit view** — resets the view so all nodes are visible at once.
  - **Drag to pan / Drag to select**: chooses what dragging an empty part of the graph does. **Drag to pan** (the default, a hand icon) moves the graph; **Drag to select** (a dashed box) draws a selection box. Click the button to switch.
  - **⊘ Clear selection** — deselects all currently selected data blocks at once. Greyed out when nothing is selected.
  - **Delete (n)** — asks for confirmation, then deletes all selected Data Blocks. Greyed out when nothing is selected.
- Selected data blocks are outlined.

<h2 id="help-ui-data-viewer">5. Data Editor</h2>

The **Data Editor** fills the bottom-right area. It shows the contents of the selected data blocks as a table, and it is where you change a data block in place: its columns and their values. Tools that make new data blocks or change which rows are present (Filter, Group, Join, Segment, Aggregate, Sample, Deduplicate, Stack) are in the [Data Builder](./preprocessing.md).

- Tabs along the top let you switch between multiple selected data blocks.
- The **Rename** button lets you rename the data block.
<span id="help-ui-data-editor-column-tools"></span>

![Data Editor column tools, with the Add column menu open](tutorials/assets/ui/data_editor_tools.png)

- **Column tools** in the Data Editor header (**Add column**, **Find & replace**, **Clean text**) change the selected data block without creating a new one, and never add, remove, or reorder rows:
  - **Add column**: **Combine columns** (write a template such as `{title}: {body}`: type `{` to pick a column from a filtered list, or use **Insert column**; any other text, such as separators or labels, is kept as written, and columns of any type are joined as text; choose whether a missing value counts as blank text or leaves the combined value empty), **Count** (words, characters with or without spaces, or matches of a text or pattern, in a new column right of the source; words are runs of text between spaces or line breaks), **Duplicate column** (the copy is placed right of the original and named like a copied file, for example `text copy`, then `text copy 2`), **Extract text** (copy the matches of a text or pattern into a new column), and **Split column** (choose the number of columns, then type each delimiter and press Enter to add it: punctuation, a space, or several characters; tick **Also split at each new line** for line breaks; split from the left so the last column keeps the rest, or from the right so the first column keeps the rest).
  - **Find & replace**: replace a text, in the same column or a new one.
  - When a tool can write to **A new column, right of it**, the new column gets a suggested name (for example `text replaced`, `text cleaned`, or `text matches`) so the preview appears straight away. Press Tab to accept the grey suggestion and edit it, or type your own name.
  - Find & replace, Extract text, and Count match plain text as written. Tick **Use regular expression** to match a pattern instead; for example, a plain `.` finds only dots, while the regular expression `.` matches any character.
  - **Clean text**: trim spaces, collapse repeated spaces, change case (lowercase, UPPERCASE, Title Case), or remove punctuation, digits, web links, HTML tags, or XML tags and markup (declarations, comments, and CDATA wrappers too, with `&amp;`-style entities decoded), in the same column or a new one.
  - The same tools are in each column's settings menu, with that column already chosen.
  - Column names are used exactly as written, including any spaces at the start or end (for example, a CSV header `ID, text` names the second column ` text`).
  - Column choices in every tool can be filtered by typing, so long column lists never need scrolling.
- A tool opens in a panel above the table, in place of the Project Graph (use **Show Project Graph** to look at the graph, and **Back to** *tool* to return). While you set it up, the table previews the result with the affected columns highlighted, and the panel reports how many rows change across the whole data block. The table scrolls so the column you are editing sits at the left edge, with any new column beside it; for **Combine columns**, whose new column is added at the end, it scrolls to the end. Scrolling or clicking in the table yourself stops this for the current preview. **Apply** makes the change as one step, so **Undo** reverses it; **Cancel** discards it.
- If you select another data block while a tool has unfinished settings, Wordflow asks whether to **Keep editing** or **Discard** them.
- **Delete columns** opens a list of the Data Block's columns: tick the ones to remove (filter, **Select all**, **Select none**), then confirm. They are removed in one step, so a single **Undo** brings them all back. At least one column must remain.
- **Undo** and **Redo** revert or reapply the selected Data Block's most recent plan edit. The same actions are available in the graph Data Block menu. History is independent per Data Block, stores at most 50 plans, and lasts only while the Project remains open in the backend process. Closing and reopening preserves the latest data but clears both buttons.
- Each column header shows the column name and its data type: `text`, `categorical`, `integer`, `decimal`, `datetime`, or `date` (`date` is a calendar date with no time of day, useful for publication or sitting dates). Use the pin button to keep a column at the left edge, click the sort button to sort the table by that column, and expand or collapse a wide text column. Click the settings icon on a column to rename or delete it; use the data-type menu to convert its type. These operations update the selected Data Block without creating a new one.
- A type change never stops because of messy data: values that cannot be converted (for example a typo such as `5OO` in a column changed to integer) become empty, and a warning says how many there were and gives the row and value of the first one, so you can find and fix it. **Undo** restores them while the Project is open.
- Missing values, NaN, and blank text are all shown as empty cells, in the table, previews, and Row Details.
- When converting text to a date or datetime, the app attempts to guess the date format automatically. This works for many common formats but can fail or produce incorrect results when the format is ambiguous (e.g. `01/02/03` could be read as DD/MM/YY, MM/DD/YY, or YY/MM/DD). If the conversion fails or the dates look wrong, use the **Format** field to specify the format explicitly using [Python strftime/strptime codes](https://docs.python.org/3/library/datetime.html#strftime-and-strptime-format-codes). Common examples:
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
- Sub-tabs (e.g. Filter, Group, Join, and Stack in the Data Builder) let you switch between related operations within the same tool.
- Most tools follow a common workflow: configure parameters → review a preview → create the result. Data Builder tools always create new Data Blocks and leave their sources unchanged; the Data Editor's column tools always update the selected block in place without changing its rows.
<span id="help-ui-analysis-layout"></span>
- In the analysis tools (Frequency, Concordance, Trends, Topic Modelling, Quotation, Annotation), the parameters sit above the results, and each part scrolls on its own. Once there are results, drag the bar between them to give either part more height, or use the arrow keys when the bar is focused; double-click the bar to go back to the default. Each tool remembers its own setting.
- The main results (tables, lists, and charts) fill the space below the bar, sharing it when there are several, so the bar makes them taller or shorter. To size one result on its own, drag its bottom-right corner, as with the Stop words box; the others share the space that is left. Double-click the corner to let it fill the space again. For example, in Topic Modelling make the bubble chart shorter to give the topic lists more room. Word clouds keep their width-based height until you resize them.
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
- In the title bar, the icons beside the **Wordflow** name open **About Wordflow** (i) and **Cite LDaCA Wordflow** (quote mark). Select the **Wordflow** name to open the [Wordflow website](https://sih.tools/wordflow), where the desktop app can be downloaded, or the LDaCA logo to open the [LDaCA website](https://www.ldaca.edu.au/). Both open in a new tab (in the desktop app, in your web browser).
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
