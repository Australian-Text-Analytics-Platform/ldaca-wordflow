<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-ui-overview">User Interface Overview</h1>

The LDaCA app interface is organised into three columns. This page describes its nine main parts and how they work together.

![LDaCA main app](tutorials/assets/ldaca_main.png)

<h2 id="help-ui-tool-choice">1. Views</h2>

The left sidebar lists the available tool modules. Click a tool name to switch the main area (section 6) to that tool's interface. The available tools include:

- [**Data Loader**](./data-loader.md): create or open Projects and upload data files.
- [**Data Builder**](./preprocessing.md): make new Data Blocks by filtering, grouping, joining, segmenting, aggregating, sampling, deduplicating, and stacking.
- [**Frequency**](./token-frequency.md): count and explore the most common terms, and compare two corpora.
- [**Concordance**](./concordance.md): inspect search terms in their surrounding context.
- [**Trends**](./sequential-analysis.md): count documents over time or any ordered numeric axis.
- [**Topic Modelling**](./topic-modeling.md): discover themes with native semantic clustering.
- [**Quotation**](./quotation.md): capture quoted speech with speaker and verb annotations.
- [**Annotation**](./annotation.md): label text manually or with a configured AI provider.
- [**Export**](./export.md): download selected Data Blocks or a Project archive.

To save space, the sidebar shows three of these with shorter names: **Loader** (Data Loader), **Builder** (Data Builder), and **Topics** (Topic Modelling). The tools themselves, and Help, use the full names.

![The Views list in the left sidebar](tutorials/assets/ui/views_list.png)

The pencil icon next to the heading (**Edit visible views**) opens a list of the tools with a tick beside each one. Untick a tool to hide it from the sidebar, and tick it again to bring it back. The Data Loader is always shown.

![The Edit visible views list](tutorials/assets/ui/edit_visible_views.png)

<h2 id="help-ui-data-selection">2. Data Blocks</h2>

Below the tool list, the **Data Blocks** panel shows every Data Block in the active Project. It is both a quick selector and a live indicator of what is selected in the [Project Graph](#help-ui-workspace-graph-view) (section 4): selecting a Data Block here is equivalent to clicking the corresponding node in the graph, and the two panels always stay in sync. It is especially useful when the right column is hidden.

- The heading shows how many Data Blocks are selected out of the total, for example **2/12** (only the total when nothing is selected). The **Clear selection** button beside it (a crossed-out circle) deselects them all.
- Click a Data Block to toggle its selection. Click again to deselect it. Click several Data Blocks in turn to build up a multi-selection.
- Each Data Block is filled with its own colour, the same colour it has in the Project Graph and in charts. A selected Data Block has a dark outline around it, and a pinned one shows a blue pin at its start.
- Pinned Data Blocks are listed first, then selected Data Blocks, then the others.
- When a name is too long for the panel, its end stays visible and its start fades out; rest the pointer on it to read the full name. You can also drag the right edge of the sidebar to make it wider.

![Data Blocks list with a pinned Data Block (candidate_info) and two selected Data Blocks](tutorials/assets/ui/data_blocks_list.png)

- Selected Data Blocks open as tabs in the Data Editor (section 5).
- Hover a Data Block to show its buttons: the pin, **More options** (the sliders icon, with **Rename**, **Make a copy**, and **Delete**), and **+**. The pin keeps it at the top of this list; click it again to unpin. In the Project Graph, hovering a Data Block shows **More options** and **+** below it. The **+** button (**Add to tool**) adds it to the inputs of the tool you are using. When the tool has one inputs panel, the Data Block is added straight away; when it has several (for example Annotation's Annotation, Codebook, and Example Data Blocks), the Data Block follows the pointer until you click the panel you want (press Esc or right-click to cancel). You can also use **Add Data Block** in the tool's inputs panel.

![Buttons shown when you hover a Data Block, with More options open](tutorials/assets/ui/data_block_menu.png)

- Most tools can only process a limited number of Data Blocks at a time, shown in their inputs panel.

<h2 id="help-ui-task-centre">3. Tasks</h2>

The **Tasks** panel sits below data selection and projects background Analyses
from the active Project together with your retained User File Imports.

- Each analysis task is named after its tool and tab, for example
  **Freq - 1** or **Topic - JP vs AUS**, and follows the tab when you rename
  it. New tabs are numbered 1, 2, 3, and so on.
- The finished steps of one tab share a row: click the row to see each step
  (**Preview**, **Run**, or **Add to Project**), the Data Blocks it
  used, and when it finished. A step that failed or is still running has its
  own row, for example **Conc - 2 · Run**.
- A **Run** with two Data Blocks runs each Data Block separately but shows as
  one task: open it to see how each Data Block went, including the reason if
  one of them failed.

![Tasks panel with the Conc - 1 row expanded](tutorials/assets/ui/tasks_panel.png)

- Failed and cancelled tasks are listed first, then running ones, then
  finished ones.
- The arrow button at the right end of a row opens that task's tab (or the
  Data Loader for a file import). Clicking anywhere else on the row shows or
  hides its details.
- When a name is too long for the panel, its beginning and end stay visible
  and the middle fades out; rest the pointer on it to read the full name.
- Analysis rows show progress and status only. Use the Analysis's owning Tab to
  cancel, clear, or re-run it.
- Queued and running User File Imports show **Stop**. The row remains visible if
  cancellation fails so you can try again.
- Successful, failed, and cancelled User File Imports remain available until
  you click **Clear**. Clearing the task removes its retained history record,
  not any files it successfully imported.
- The panel refreshes automatically, so you can keep working while tasks run
  in the background. The green dot beside the **Tasks** heading shows it is
  connected for these live updates; if the connection drops, a message and a
  **Retry** button appear instead.
- To give the Tasks panel more room, collapse **Views** or **Data Blocks** by
  clicking their headings, or drag the line between the sections.

<h2 id="help-ui-workspace-graph-view">4. Project Graph</h2>

**Note:** The entire right column (Project Graph and Data Editor) can be collapsed to save screen space. Click the top-right arrow button to hide or show the right pane.

The **Project Graph** occupies the top-right area and visualises Data Block creation lineage. Every Data Block is a node, and creating a child Data Block (made from another) draws an edge from parent to child. Updating an existing Data Block does not change the graph.

<span id="help-ui-change-project"></span>
To switch Projects without going to the Data Loader, use **Switch Project** at the right end of the Project Graph title bar and choose another Project. Wordflow asks you to confirm, then closes the current Project (it is saved automatically as you work) and opens the one you chose. While a task is still running in the current Project, the Projects in the list are disabled and a note says so: wait for the task to finish, or stop it in its tab, and then switch.

![Switch Project menu in the Project Graph title bar](tutorials/assets/ui/change_project.png)

- Click a node to select that Data Block across the entire interface. Click it again to deselect. Selections made here are reflected immediately in the Data Blocks panel (section 2) and vice versa.
- Each Data Block shows its name. When you zoom in far enough, it also shows its size, for example **2,380 rows × 21 columns**.
- Hover a Data Block and open its settings menu (the sliders icon below it) to **Rename**, **Make a copy**, **Export**, **Undo**, **Redo**, or **Delete** it. The **+** beside it adds the Data Block to the inputs of the tool you are using.

![A Data Block in the Project Graph, zoomed in, with its settings menu open](tutorials/assets/ui/graph_node_menu.png)

- More of the graph is visible when you make the right column wider (drag its left edge) or give the graph more height (drag the line between the graph and the Data Editor). A copy is named after the original with `_copy` added (for example `speeches_copy`). Undo and Redo availability comes from that Data Block's current backend session history.
- Use **Rename** beside the Project name in the title bar to rename the active Project.
- To move around a large Project, drag an empty part of the graph, or scroll with two fingers on a trackpad (or with the mouse wheel). To zoom, pinch on a trackpad, or hold Ctrl (⌘ on a Mac) while scrolling.
- To select several Data Blocks at once, hold Shift and drag a box around them, or switch the panel's drag button to **Drag to select** and drag without Shift. Every Data Block the box touches is added to the selection, as if you had clicked it. In **Drag to select** mode, drag with the right mouse button to move the graph.

![Project Graph control panel, with the drag-mode button showing its name](tutorials/assets/ui/graph_controls.png)

- A vertical control panel sits at the top-left corner of the graph. At the top it shows the selected/total Data Block count (for example, **0/2**). The panel stays narrow so it does not get in the way; rest the pointer on a button for half a second to see its name.
  The panel provides the following actions:
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="13" height="13" style="display:inline;vertical-align:text-bottom"><path d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z"/></svg> **Zoom in**: increases the zoom level.
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 5" width="13" height="2" style="display:inline;vertical-align:middle"><path d="M0 0h32v4.2H0z"/></svg> **Zoom out**: decreases the zoom level.
  - <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" width="13" height="12" style="display:inline;vertical-align:text-bottom"><path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.631A4.63 4.63 0 0 0 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.215c.53 0 .938.4.938.939v5.215H32V4.631A4.63 4.63 0 0 0 27.354 0zm.954 24.746c0 .53-.4.938-.939.938h-5.215V29.338h5.215A4.63 4.63 0 0 0 32 24.708v-5.215h-3.692v5.253zm-23.677.938a.939.939 0 0 1-.939-.938v-5.253H0v5.215A4.63 4.63 0 0 0 4.631 30h5.215v-3.692H4.631v.376z"/></svg> **Fit view**: resets the view so all nodes are visible at once.
  - **Drag to pan / Drag to select**: chooses what dragging an empty part of the graph does. **Drag to pan** (the default, a hand icon) moves the graph; **Drag to select** (a dashed box) draws a selection box. Click the button to switch.
  - **⊘ Clear selection**: deselects all currently selected Data Blocks at once. Greyed out when nothing is selected.
  - **Delete (n)**: asks for confirmation, then deletes the selected Data Blocks. The confirmation lists them with a tick each: untick any you selected by mistake to keep them (they stay selected), then click **Delete**. Greyed out when nothing is selected.
- Selected Data Blocks are outlined.

<h2 id="help-ui-data-viewer">5. Data Editor</h2>

The **Data Editor** fills the bottom-right area. It shows the contents of the selected Data Blocks as a table, and it is where you change a Data Block in place: its columns and their values. Tools that make new Data Blocks or change which rows are present (Filter, Group, Join, Segment, Aggregate, Sample, Deduplicate, Stack) are in the [Data Builder](./preprocessing.md).

- Each selected Data Block has a tab in the Data Editor title bar. Click a tab to show that Data Block; the **×** on a tab deselects it, and you can drag tabs to reorder them. When the tabs do not fit, scroll the strip or use the arrow buttons at its ends.
- To rename a Data Block, click its tab to make it the current one, then double-click the tab name, type the new name, and press Enter (Esc cancels). Analysis tool tabs are renamed the same way.
- Every rename box (tabs, columns, the Project name, Data Blocks) works the same way. Enter saves and Esc cancels. Clicking elsewhere saves an edited name. If a rename fails, for example because the name is already used, a message explains why and the box stays open with the name selected so you can fix it. Press Enter to try again, or click elsewhere without changing it to keep the original name.
- With many tabs, click the arrow at the right end of the title bar for a list of every tab in alphabetical order, and choose one to switch to it. A very long name shows its start and end, with the middle faded.

![Data Editor header with two selected Data Blocks as tabs](tutorials/assets/ui/data_editor_header.png)

![The list of Data Editor tabs, opened from the arrow at the right end of the title bar](tutorials/assets/ui/data_editor_tab_list.png)

<span id="help-ui-data-editor-column-tools"></span>

![Data Editor column tools, with the Add column menu open](tutorials/assets/ui/data_editor_tools.png)

- **Column tools** in the Data Editor header (**Add column**, **Find & replace**, **Clean text**) change the selected Data Block without creating a new one, and never add, remove, or reorder rows:
  - **Add column**: **Combine columns** (write a template such as `{title}: {body}`: type `{` to pick a column from a filtered list, or use **Insert column**; any other text, such as separators or labels, is kept as written, and columns of any type are joined as text; choose whether a missing value counts as blank text or leaves the combined value empty), **Count** (words, characters with or without spaces, or matches of a text or pattern, in a new column right of the source; words are runs of text between spaces or line breaks), **Copy column** (the copy is placed right of the original and named like a copied file, for example `text copy`, then `text copy 2`), **Extract text** (copy the matches of a text or pattern into a new column), and **Split column** (choose the number of columns, then type each delimiter and press Enter to add it: punctuation, a space, or several characters; tick **Also split at each new line** for line breaks; split from the left so the last column keeps the rest, or from the right so the first column keeps the rest).
  - **Find & replace**: replace a text, in the same column or a new one.
  - When a tool can write to **A new column, right of it**, the new column gets a suggested name (for example `text replaced`, `text cleaned`, or `text matches`) so the preview appears straight away. Press Tab to accept the grey suggestion and edit it, or type your own name.
  - Find & replace, Extract text, and Count match plain text as written. Tick **Use regular expression** to match a pattern instead; for example, a plain `.` finds only dots, while the regular expression `.` matches any character. See [Regular expressions](#help-ui-regular-expressions) for what a pattern is, with examples.
  - **Clean text**: trim spaces, collapse repeated spaces, change case (lowercase, UPPERCASE, Title Case), or remove punctuation, digits, web links, HTML tags, or XML tags and markup (declarations, comments, and CDATA wrappers too, with `&amp;`-style entities decoded), in the same column or a new one.
  - The same tools are in each column's settings menu, with that column already chosen.
  - Column names are used exactly as written, including any spaces at the start or end (for example, a CSV header `ID, text` names the second column ` text`).
  - Column choices in every tool can be filtered by typing, so long column lists never need scrolling.
- A tool opens in a panel above the table, in place of the Project Graph (use **Show Project Graph** to look at the graph, and **Back to** *tool* to return; the **×** closes the tool). While you set it up, the table previews the result with the affected columns highlighted, and the panel reports how many rows change across the whole Data Block. The table scrolls so the column you are editing sits at the left edge, with any new column beside it; for **Combine columns**, whose new column is added at the end, it scrolls to the end. Scrolling or clicking in the table yourself stops this for the current preview. **Apply** makes the change as one step, so **Undo** reverses it; **Cancel** discards it.

![Clean text open above the table: the text column is highlighted and the panel reports 1,779 rows changed](tutorials/assets/ui/column_tool_panel.png)

- If you select another Data Block while a tool has unfinished settings, Wordflow asks whether to **Keep editing** or **Discard** them.
- **Delete columns** opens a list of the Data Block's columns: tick the ones to remove (filter, **Select all**, **Select none**), then confirm. They are removed in one step, so a single **Undo** brings them all back. At least one column must remain.

![Delete columns dialog with three columns ticked](tutorials/assets/ui/delete_columns.png)

- **Undo** and **Redo**, at the right end of the tools row, revert or reapply the selected Data Block's most recent plan edit. The same actions are available in the graph Data Block menu. History is independent per Data Block, stores at most 50 plans, and lasts only while the Project remains open in the backend process. Closing and reopening preserves the latest data but clears both buttons.
- Each column header shows the column name and a symbol for its data type, which keeps columns narrow. Point to the symbol to see the type's name (and, for an unusual type, how it is stored):

  | Symbol | Data type |
  |---|---|
  | `Aa` | Text |
  | tag | Category |
  | `123` | Whole number |
  | `1.2` | Decimal |
  | calendar | Date (a calendar date with no time of day, useful for publication or sitting dates) |
  | clock | Date and time |
  | tick box | True / false |
  | list | List (of text, or of other values) |
  | pie chart | Topic coverage |

  Use the pin button to keep a column at the left edge, click the sort button (the up and down arrows) to sort the table by that column, and expand or collapse a wide text column. These operations update the selected Data Block without creating a new one.

![Column headers: pin, name, sort, data type, and settings](tutorials/assets/ui/column_header.png)

- Click the settings icon (the sliders) at the right of a column header for that column's tools (**Find & replace**, **Clean text**, **Extract text**, **Split**, **Count**, **Copy column**) and to **Rename** or **Delete** it. You can also double-click a column name to rename it: type the new name and press Enter (Esc cancels).

![A column's settings menu](tutorials/assets/ui/column_menu.png)

- Click the data type symbol to convert the column to another type. The menu lists the types by name, with the current type ticked.

![The data type menu of a column](tutorials/assets/ui/column_type_menu.png)

- A topic coverage column (`TOPIC_coverage`, added by Topic Modelling's **Add to Project**) holds each row's share of every topic rather than a single value. Its **Sort** and data type buttons are disabled, and among the column tools its settings menu offers only **Copy column** (you can still rename or delete it).
- A type change never stops because of messy data: values that cannot be converted (for example a typo such as `5OO` in a column changed to whole number) become empty, and a warning says how many there were and gives the row and value of the first one, so you can find and fix it. **Undo** restores them while the Project is open.
- Missing values, NaN, and blank text are all shown as empty cells, in the table, previews, and Row Details.
- When you convert text to a date, or a date and time, Wordflow asks **How are the dates written?** It shows a few values from the column and tries to work out the format from the data (**Detect from the data**). Detection can fail or guess wrong when dates are ambiguous (for example `01/02/03` could be day/month/year, month/day/year, or year/month/day). Then enter the format in **Date format**, or choose one of the examples, which fill it in:
  - `%d/%m/%Y` → `30/01/2020`
  - `%Y-%m-%d` → `2020-01-30`
  - `%d %b %Y` → `30 Jan 2020`
  - `%B %d, %Y` → `January 30, 2020`
  - `%d/%m/%Y %H:%M` → `30/01/2020 14:05`

  `%d` is the day, `%m` the month number, `%b` the short month name, `%B` the full month name, `%Y` the year, `%H` the hour and `%M` the minute. The full list is in [Python's date format codes](https://docs.python.org/3/library/datetime.html#strftime-and-strptime-format-codes).
- Dates and times show year first, for example `2020-01-30 14:05` (seconds appear only when they are not zero). Wordflow stores times in UTC. To type a date, for example in the Data Builder's Filter, use `YYYY-MM-DD`, or `YYYY-MM-DD HH:MM` for a date and time.
- Click any row to open the **Row Details** panel, which displays the full contents of that row in a readable layout. The panel has two sections:
  - **Document**: shows the full text of the Data Block's designated document column (the column marked as the primary text when the data was loaded, e.g. the column named `text`, `document`, or `doc`). The section heading displays the column name, e.g. *Document: text*. If no document column has been configured for the Data Block, this section is omitted.
  - **Metadata**: shows all remaining columns as a two-column key/value table, making it easy to inspect metadata columns such as speaker, date, or source alongside the document text.
- Use **Previous row** and **Next row** at the bottom of the Row Details panel to review adjacent displayed rows. The Data Editor changes table pages automatically when you move past the first or last row on a page.

![Row Details panel](tutorials/assets/ui/row_details.png)

- The table is paginated: use the controls at the bottom to choose how many rows a page shows and to move between pages.

![Table page controls](tutorials/assets/ui/pagination.png)

- Scroll vertically with your mouse scroll wheel. Hold **Shift** to scroll horizontally.

<h2 id="help-ui-tool-interface">6. Tool Interface</h2>

The centre column is the main working area and shows the interface of whichever tool is selected in section 1. Each tool provides its own configuration options, previews, and action buttons.

- The tool name and a short description appear at the top.
- Sub-tabs (e.g. Filter, Group, Join, and Stack in the Data Builder) let you switch between related operations within the same tool.
- Most tools follow a common workflow: configure parameters → review a preview → create the result. Data Builder tools always create new Data Blocks and leave their sources unchanged; the Data Editor's column tools always update the selected Data Block in place without changing its rows.
<span id="help-ui-analysis-layout"></span>
- In the analysis tools (Frequency, Concordance, Trends, Topic Modelling, Quotation, Annotation), the parameters sit above the results, and each part scrolls on its own. Once there are results, drag the bar between them to give either part more height, or use the arrow keys when the bar is focused; double-click the bar to go back to the default. Each tool remembers its own setting.
- The main results (tables, lists, and charts) fill the space below the bar, sharing it when there are several, so the bar makes them taller or shorter. To size one result on its own, drag its bottom-right corner, as with the Stop words box; the others share the space that is left. Double-click the corner to let it fill the space again. For example, in Topic Modelling make the bubble chart shorter to give the topic lists more room. Word clouds keep their width-based height until you resize them.
- Help icons (**?**) are placed next to individual controls and link directly to the relevant written Help section.
- The arrows at the top of the window go back and forward between the tools you have visited. The search box beside them (**Open quick access**) lists the analysis tabs of the open Project, for example **Frequency: 1**: type to filter them, and choose one to open it.

![Quick access list of analysis tabs](tutorials/assets/ui/quick_access.png)

<h3 id="help-ui-preview-run-clear">How Preview, Run and Clear work</h3>

The analysis tools share three buttons.

- **Preview** works out a first few pages of results so you can check your
  settings quickly. Where a tool offers it, use Preview before a long Run.
- **Run** works through all of your data. Use it for the final result, for
  sorting on every column, for charts of the whole result, and before
  **Add to Project**.
- **Clear** removes this tab's Preview and Run results so you can start again.
  It does not remove Data Blocks you have already added to the Project, and it
  does not undo changes written to a Data Block (use **Undo** in the Data Editor
  for that).

What to expect:

- **Results keep the data they were made from.** Preview and Run each take a
  copy of the settings and the data at the moment you choose them. If you later
  edit the Data Block or change a setting, the results on screen do not change.
  To see the effect, choose Preview or Run again.
- **The buttons turn on when something changes.** After a successful Preview or
  Run, its button stays off until you change a setting that affects it. Changing
  the setting back turns it off again, because the result on screen already
  matches.
- **Settings are locked while a task runs.** Use **Stop** to cancel it. The
  running task also appears in **Tasks**.
- **After a failure or a stop**, you can edit the settings again, but Preview
  and Run stay off until you choose **Clear**. The message explains what went
  wrong; **Details** has the technical text for a feedback report.
- **Results stay with the tab.** They are still there when you move to another
  tool, or close and reopen the Project.

<h2 id="help-ui-working-directory">7. Data folder</h2>

The data folder is where Wordflow keeps your Projects, imported files, and settings.

- On first start, Wordflow uses the usual location for your operating system and remembers it. There is nothing to choose.
- If that folder cannot be used (for example, Wordflow is not allowed to write to it), a setup screen says so and lets you choose another folder.
- The desktop app opens your computer's folder picker. In a browser, type the full path of a folder on the server that runs Wordflow.
- To change it later, open **Settings → Project → Data folder**. Wordflow reloads after the change and does not copy anything from the old folder.
- On a shared server, the data folder is set by the person who runs Wordflow, and Settings says so.

<h2 id="help-ui-appearance">8. Appearance</h2>

Open **Settings** (the gear icon at the top right) **→ General → Appearance** and use the switch to change between **Light 2026** and
**Dark 2026**. The interface changes immediately and the selection is saved to
your account. Wordflow uses the last successful selection during startup so a
reload does not briefly show the other theme. Charts and Data Block identity
colours remain stable, while downloaded chart images keep a white background.

![Appearance setting](tutorials/assets/ui/appearance.png)

<h2 id="help-ui-help-feedback">9. Help and Feedback</h2>

The **Help** and **Feedback** buttons at the very bottom of the left sidebar provide quick access to assistance.

- **Help** opens the built-in written guides in a floating window (the one you are currently reading). Clicking any **?** icon scrolls Help to the relevant section.
- **Feedback** opens a form where you can report bugs, request features, or ask questions. Your feedback goes directly to the developer team. Please do not include any confidential information.
- When something goes wrong, the message says what happened in plain words. Many messages also have **Details**: technical text that helps the developers find the problem. Use **Copy details**, then **Send feedback**, and paste the details into the form. If the same error keeps happening, please report it this way.
- In the title bar, the icons beside the **Wordflow** name open **About Wordflow** (i) and **Cite LDaCA Wordflow** (quote mark). Select the **Wordflow** name to open the [Wordflow website](https://sih.tools/wordflow), where the desktop app can be downloaded, or the LDaCA logo to open the [LDaCA website](https://www.ldaca.edu.au/). Both open in a new tab (in the desktop app, in your web browser).

![Wordflow name, About and Cite icons, and the LDaCA logo in the title bar](tutorials/assets/ui/title_bar.png)

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
  can reset acknowledgement history for the current user, causing eligible hint
  versions to appear again on this device.
- A replayable **Guided Tour** is shown in Help only when one is available. A
  tour is started deliberately and is unaffected by the Contextual Hint switch.

<h2 id="help-ui-regular-expressions">Regular expressions</h2>

A regular expression is a short pattern that describes the text you are looking for, rather than the exact text itself. For example, one pattern can find both *colour* and *color*, every year written as four digits, or every tweet that starts with a retweet marker. Wordflow uses them wherever you see **Use regular expression** (Concordance's Text mode, and Find & replace, Extract text, and Count in the Data Editor), in the Data Builder's Filter when **regular expression** is ticked on a *contains* condition, and in Segment's **A pattern** option. When the box is not ticked, the text is matched exactly as written.

| Pattern | What it matches |
|---|---|
| `colou?r` | *colour* or *color* (`?` makes the letter before it optional) |
| `labou?r(er)?s?` | *labour*, *labor*, *labourer*, *labourers*, *labours*, and so on |
| `^RT @` | Texts that start with *RT @*, such as retweets (`^` means the very start; in Segment it means the start of each line) |
| `[0-9]{4}` | Any four digits in a row, such as a year like *1901* |
| `\bjob(s)?\b` | The whole word *job* or *jobs*, but not *jobless* (`\b` marks the edge of a word) |
| `tax\|budget\|welfare` | Any one of the three words (`\|` means "or") |

Some characters have a special meaning: `. ? * + ( ) [ ] { } ^ $ | \`. To match one of them as an ordinary character, put a backslash before it, for example `\.` for a full stop or `\?` for a question mark.

Wordflow's patterns follow the [Rust regular expression syntax](https://docs.rs/regex/latest/regex/#syntax). It covers everyday patterns, but it does not support look-ahead or look-behind (such as `(?=...)` or `(?<=...)`). For a quick overview of the symbols, see the [MDN regular expressions cheat sheet](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet). To try a pattern on your own text before using it, paste both into [regex101.com](https://regex101.com/) and choose the **Rust** flavour.

[← Back to tutorial index](./index.md)
