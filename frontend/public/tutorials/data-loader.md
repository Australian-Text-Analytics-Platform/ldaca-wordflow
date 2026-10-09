<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-data-loader-section">Data Loader</h1>

Add data to the current project through **Local files**, **Samples** or **LDaCA**.
Each source stays inside the main pane, with the graph and Tasks available beside
it. Switching sources or visiting Preprocessing preserves your unfinished choices.
Reloading discards these drafts.

New and Open in the native File menu create independent project windows; the
filename is the project name. See [project files](./ui.md#help-ui-project-files)
for saving and closing.

<h2 id="help-data-loader-files-section">Local files</h2>

<h3 id="help-data-loader-upload-button">Choose or drop files</h3>

Local files opens by default. Choose **Choose files…** or drop files onto Data
Loader or the exposed graph. Desktop also provides **Choose folders…**. Supported
table formats are CSV/TSV, JSON/JSONL/NDJSON, Parquet, Avro, Arrow/IPC/Feather and
XLSX/XLS/XLSM/XLSB/ODS. Text extensions are TXT, TEXT, MD, RST and LOG. ZIPs and
folders can contain both texts and tables. The Rust browser preview accepts
absolute paths on its host.

**Recent files** shows filenames, parent folders, file-type icons and current file
sizes. Click one to import it again, or drag it onto Data Loader or the graph.
The original file must still exist; an unreadable or missing file shows **Size
unavailable**. Recent files update after a successful import.

<h3 id="help-data-loader-add-button">Import into the project</h3>

Each table file creates a Data Block named after the file. If that name already exists,
a numeric suffix is added. Rename the Data Block or remove unwanted columns
after import using its menu and Data Viewer. Ordinary files and text-only folders
import immediately. Mixed folders/ZIPs and multi-sheet workbooks show content
choices, with all files and sheets initially selected. Workbook outputs use
`file_sheet` names; sheet choices appear only when a workbook has multiple sheets.

Texts combine into one Data Block, with one whole file per row and columns
`file_path`, `base_name`, `extension` and `document`. Rows follow relative-path
order. Hidden paths, `__MACOSX` and links are ignored. Nested ZIPs and unsupported
files are skipped and reported. Invalid UTF-8 text is also skipped and reported.
Overlapping selections import each file once. A malformed table aborts the complete
selection without adding any Data Blocks.

Follow progress or cancel in **Tasks**. You can import more files or switch sources
while an import runs. Failed imports leave the project unchanged; select the file
again or use **Retry** beside the original error.

On the server, browse folders and select files/folders together. Texts use the
name `folder_selection` or `selected_files`. Folder creation, Move, Delete and
ZIP download operate on the selected entries; ZIP downloads preserve folders.
Upload cards show byte progress, then **Finishing…** until the server acknowledges.
They remain visible when you leave the file list. A late cancellation may leave
the uploaded file on the server: use **Refresh destination** to check, or
**Dismiss** to remove its explanatory card. Receiving folders and their ancestors
cannot be moved or deleted until upload cleanup finishes.

Local data is stored inside the project. Imports preserve an internal raw Table
and show a View over it. You can move or remove the original file afterward.
To edit stored cells, choose **Materialise**, then **More → Edit Table**.
New Data Blocks appear in the graph and sidebar without changing selection or
opening the Data Viewer. Use **Preview data** or select a sidebar row to inspect them.

<h2 id="help-data-loader-import-sample-button">Samples</h2>

Open **Samples** and expand a collection to select individual files. Its checkbox
selects or clears all files; a dash indicates a partial selection. The footer
shows the selected-file count beside **Import selected**.

**Import as views** is selected by default. These Views read online data at a
fixed published revision; an internet connection is required to query them.
Clear the checkbox to import stored Tables for offline use. Existing sample
Views keep their original revision when newer samples are published.

<h2 id="help-data-loader-import-ldaca-button">LDaCA</h2>

Open **LDaCA** to browse collections. **Filter collections** narrows loaded names
and descriptions immediately. You can also search by keyword or collection ID,
then use the collection and file-type filters. Expand **Access token** to enter
an **LDaCA access token**, then choose **Refresh collections** to update access.
The token stays in this window, including when switching projects, and is not
saved in settings or the project. Reloading the window discards it.

Review each result's source, access information and licence. **Details** exposes
the complete description and identifier; the title opens its source portal page.
Choose **Import** to embed accessible text and metadata, or **Import metadata only**
for public metadata without downloading text. Restricted text remains disabled.
Member crates import together atomically. Invalid text encoding is replaced,
with affected files reported and their rows retained. Search results remain
available afterward; failures retain their diagnostic and **Retry**.

All imports appear in **Tasks**, which owns progress and cancellation. You can
switch sources or leave Data Loader while accepted work continues. Cancelling
before commit leaves no partially imported Data Blocks.

<h2 id="help-data-loader-troubleshooting">Troubleshooting</h2>

- If a file cannot load, verify its format and review the expandable error.
- If sample collections cannot load, use **Retry**. Failed LDaCA searches can be
  submitted again after checking the query or token.
- If an online View cannot be queried, check its source and connection. Its
  graph card remains available even if row inspection fails.
- If importing is blocked by a table editor, finish that editor with Save or Cancel.

## Practice

1. Choose a CSV and wait for its Data Block to appear in the graph.
2. Open its preview and inspect another page.
3. Save the Untitled project as a `.wfpj` file.
4. Reopen the project in Wordflow without the original CSV.

[← Back to tutorial index](./index.md)
