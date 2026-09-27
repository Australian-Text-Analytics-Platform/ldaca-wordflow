<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-export-section">Export data and projects</h1>

Choose **Export** in the sidebar. Use **Data files** for interchange, or
**Wordflow project** for an independent `.wfpj` copy. The graph menu's **Export**
shortcut still downloads a single Data Block.

<h2 id="help-export-parameters">Choose the output</h2>

Add Data Blocks through the searchable picker, **Add all**, **Use graph selection**,
or a Data Block's **+** button. Remove individual cards or use **Clear all**.
The picker normally shows visible Data Blocks. Enable **Include hidden and other
schema objects** when needed. Add all respects the picker's search and scope.

<h3 id="help-export-format">Format</h3>

| Format | Use |
|---|---|
| CSV (default) | Spreadsheet and plain table exchange |
| JSON | A JSON array of row objects |
| NDJSON | One JSON object per line |
| Parquet | Typed, compressed columnar data |
| Arrow IPC | A standard `.arrow` file with typed values and Wordflow field annotations |

One selected Data Block produces one file. Multiple selections produce a ZIP
with one file per Data Block, in selection order. Export includes all committed
rows and columns, regardless of Data View paging, filters or unsaved edits.
Parquet preserves typed values; use Arrow IPC or `.wfpj` when you need Wordflow's
extension annotations too.

### Wordflow project

**Selected Data Blocks** creates a fresh project containing the selection,
applicable metadata and relationships. Table constraints, defaults and indexes
are retained. If a foreign key requires another Table, include it explicitly.
If a Table definition depends on SQL macros, use Complete project to preserve
the macro definitions and parameter defaults.
Saved analyses and SQL cells are excluded.

**Complete project** includes hidden/unregistered data, saved analyses and their
outputs, SQL cells and project metadata. Temporary Preview, unfinished form edits,
active tasks, provider credentials and host model caches are excluded. An
incomplete analysis retains its submitted settings without resuming its task.

The contents list explains which Views remain Views and which become Tables.
Views whose dependencies are excluded, external or cannot be safely inspected
are materialized. This makes their exported data independent of the original
project. A required View that cannot be read prevents the export; no partial
project is saved. Inspection is repeated during export. External files can still
change while they are being read. SQL cells are preserved as authored; export
does not rewrite paths in arbitrary future SQL.

<h2 id="help-export-results">Save the file</h2>

<h3 id="help-export-run">Export</h3>

Choose **Export**, then select a destination in the native save dialog. The
Task Centre shows progress and provides Cancel. You can continue working while
export reads a consistent committed snapshot. Cancellation or failure before
installation preserves an existing destination; successful export replaces it
only after the new output is ready. Choose a destination other than an open
project. Errors appear once through the expandable notification.

The original project stays open, with the same name and path. Export never opens
the new copy automatically. Browser usage downloads through normal browser
handling. Choices survive navigation to another tool but reset on reload.

**Save As** changes the open document's destination. **Export → Wordflow project**
creates a separate portable copy while you keep working in the original.

## Practice

1. Export two Data Blocks as CSV and inspect both files inside the ZIP.
2. Export one as Arrow IPC and verify the complete row count.
3. Export a selected project and review its View materialization list.
4. Open the copy separately and check its data without the original source files.

[← Back to tutorial index](./index.md)

Project inspection summarizes Data Blocks, saved analyses and SQL cells. Expand internal details for backing storage. Blockers and required materialization remain visible before export.
