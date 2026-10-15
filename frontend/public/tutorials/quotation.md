<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-quotation-section">Quotation Extraction tutorial</h1>

Quotation identifies quoted speech, speakers and reporting verbs in English
news-style text. Its rules are adapted from the
[Gender Gap Tracker](https://github.com/sfu-discourse-lab/GenderGapTracker).
They were developed for Canadian news; review a representative sample when
working with social media, fiction or other genres and English varieties.

Open **Quotation** to create **QT-1** if there are no tabs. Each named tab
keeps its latest successful result. Closing the last tab leaves the empty state;
use **New Quotation analysis** to create another.

<h2 id="help-quotation-parameters">Request panel</h2>

<h3 id="help-quotation-data-block">Step 1 — Select your data</h3>

Add one Data Block and choose its text column. A fresh selector uses the saved
Document Column Preference when available. Source color identifies this input;
it is separate from the colors used for quotation highlights.

<h3 id="help-quotation-engine">Built-in English engine</h3>

Extraction runs locally using UDPipe and the adapted quotation rules. First use
requires the pinned English model; it is downloaded once and then works offline
from the local cache. Saved results remain readable without the model. Remote
engines are not available in the native application. See
[About Quotation](../information/quotation.md) for model and software notices.

<h2 id="help-quotation-run">Step 2 — Preview</h2>

Click **Preview** to extract quotations from the requested page of current source
documents. Typing or changing the source selection does not calculate anything.
Page, page-size and source-column sort changes use the last submitted input.
An explicit Preview click also refreshes unchanged input settings.

Preview never saves its input or result data. Leaving the tool, switching tabs,
reloading, Run or Clear discards it. Returning restores a local draft or saved Run
request without extraction. Finish Table editing before Preview. Preview is
unavailable during Run or when the execution request already has saved results.
Change inputs or Clear results to preview again.
Documents with no quotations contribute no visible row; a document with several
quotations displays all of them together in **Documents** mode. Switch to the **Quotations** tab to show one quotation per row. In Preview this expands the already-returned document page without extracting again; paging still counts source documents. Next uses a lookahead document, so an
empty page does not necessarily mean the source has ended. Source changes refresh
affected active previews. A failed refresh retains the previous page and marks
it outdated.

<h3 id="help-quotation-context-length">Adjust display context</h3>

**Context (words per side)** changes how much original text appears around the
quote, speaker and verb spans. The default is 5, with a range of 0–2000. It is a
display preference: changing it does not rerun extraction.

<h2 id="help-quotation-results">Results panel</h2>

Inline QUOTE, SPEAKER and VERB labels, type badges and underlines identify each quotation, including overlapping roles. Hover or focus a span to emphasize it. Click a row to
inspect its full text, highlights and metadata, then use Previous/Next to move
between rows. **Metadata and fields** opens a column-selection popover for original columns and generated
quotation fields in separate groups, each with Select all/none. Tables have bounded scrolling and sticky headers; text selection does not open the inspector. Context, visible fields and source color are saved with the tab.

Row Details stays anchored to the clicked text. If source edits move that document,
refresh results and reopen it before fetching its full matches.

Quotation cells show up to three lines. Clipped cells reveal their full highlighted content on hover or focus. Row Details uses a shorter scrollable document box and reveals the clicked quotation; extraction-pattern explanations appear beside their codes.

<img src="tutorials/assets/ui/row_details.png" alt="Quotation Row Details with the clicked quotation highlighted and complete nested source metadata" width="2582" height="1800" />

Click **Document** or a source metadata header to sort. The Reset sort icon restores original order and page one. In Preview, sorting is
applied before source pagination; only the resulting page is extracted. Generated
quotation fields are sortable in the saved **Quotations** tab, where every quotation
has already been calculated.

<h3 id="help-quotation-run-all">Step 3 — Run</h3>

**Run** extracts the complete input as a native task. It processes distinct exact texts and saves checked-text records and quotations
inside the project, including checked texts with no quotations. First it saves the submitted request and
clears previous output atomically. Bounded native workers each own an extractor;
completed batches save their checked texts and quotations together. Stop, a later
failure or a crash retains those batches. **Resume** explicitly skips checked exact
texts, including texts with no quotations, under the same extraction settings.
Changing input/settings requires a fresh Run. Reopening never starts extraction
automatically. You can
edit the next request while a task runs; its captured input does not change.
Finish any Table editing session before starting Run. Progress appears in the
progress card and in Tasks. Partial results are available during execution and
after Stop. Refresh, Resume and completion keep the current page and page size;
only an out-of-range page is clamped.

A successful Run replaces the Preview display automatically; there is no Preview/Saved results switch. The **Quotations** tab is selected by default and shows one occurrence per row. **Documents** groups quotations into their original rows. Saved pages offer numbered navigation and page jumps; Preview uses document lookahead without counting the whole source. New results attach to current source rows by exact processed text, keeping
duplicate rows and live metadata. Unprocessed new texts are absent; edited/removed
texts stop matching. A missing source produces the normal database error. Historical
results remain snapshots until Rerun.

Search **Metadata and fields**, then use **Column order** to drag columns or move
them with arrow buttons or Alt + ↑ / ↓. Presentation order is saved independently
of sorting. **Download** exports all filtered/sorted pages as CSV, XLSX, JSON or
Parquet. **Download Preview** uses only the completed current page. Document text
can be omitted from downloads, together with its dependent position fields.

**Add to Project → Quotations** creates a live View with one row per saved quote.
**Add to Project → Documents** creates a live View with `QUOTE_extraction` joining
quotation text. Checked texts with no quotation remain included with empty outputs.
The original document is required. Publication copies generated outputs into
independent hidden relations owned by the published Data Block, so later analysis
cleanup cannot alter them. Metadata stays live; a missing source retains its SQL
reference and normal database error. Deleting the published Data Block removes its
hidden output relations.

<h3 id="help-quotation-clear-results">Cancel and Clear results</h3>

**Cancel** cancels the current Preview request or requests cancellation of Run.
A native batch already being extracted may finish cleanup first. Completed batches
remain available for Resume. **Clear results** removes the Preview, partial checkpoint
and completed result but retains the tab, saved Run request, draft and display preferences, and re-enables Preview. It is unavailable
while Run is active. Neither clearing nor deleting an analysis removes Data
Blocks previously published from it. Failed runs can be tried again without Clear.

<h2 id="help-quotation-troubleshooting">Troubleshooting</h2>

| Symptom | Explanation / action |
|---|---|
| No quotations on one page | That source page may contain no detected speech; try Next |
| Initial model preparation fails | Check connectivity or the provisioned model; manual retry is available |
| Precision is low | Validate a sample against the news-style assumptions of the rules |
| Generated header cannot sort | Use the saved Quotations tab; Preview sorts source columns before extraction |
| Results use older settings | Click Preview or Run to submit the current request |
| Saved source is missing | Live results show the database error; restoring a compatible source under the same name can resolve it |

<h2 id="help-quotation-defaults">Quick-reference defaults</h2>

| Setting | Default |
|---|---|
| Engine | Built-in English |
| Context | 5 words per side |
| Preview page | 50 source documents |
| Saved presentation | Quotations |

[← Back to tutorial index](./index.md)

The area below parameters shows progress while calculating or loading, then **Preview**
or **Results**. Empty tabs have no output card. **Cancel** belongs to the progress
card. If saved results cannot load or display, **Retry** tries reading the same
output again and **Run** becomes **Rerun**. Rerun uses the current parameters,
clears the tab's old results and artifacts, and calculates from scratch. Retry
creates no analysis task. Clear never restores an older Preview.

When completed results match the current parameters, **Run** is disabled. Change
execution parameters to enable it; reverting them disables it again. Colors,
filters, stopwords and other presentation controls do not enable Run. To calculate
again after changing the source data, use **Clear results**, then **Run**. This
retains your parameters. Saved-output errors still allow **Rerun**; a successful
**Retry** restores the normal Run availability.

## Settings from another version

If saved settings contain fields or values this version cannot use, the parameter
panel restores the supported settings and shows a warning above Run. Expand a
large value to inspect its complete original JSON. Check the defaults and replace
any missing inputs before running. Opening, editing, Preview (where available)
and Clear results leave the saved settings unchanged. Run saves only supported
settings; with existing results, the action is called Rerun.

Your submitted Run request and its optional output belong to one saved analysis
in this project. Clear results removes the output but keeps the submitted settings.
A failed or cancelled Run also keeps its settings, without showing saved output.
Unsubmitted edits and Preview remain temporary. Projects using the previous
database layout cannot be opened by this schema-version-1 build; no automatic
conversion is performed.
