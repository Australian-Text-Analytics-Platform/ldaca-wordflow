<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-quotation-section">Quotation Extraction tutorial</h1>

Quotation identifies quoted speech, speakers and reporting verbs in English
news-style text. Its rules are adapted from the
[Gender Gap Tracker](https://github.com/sfu-discourse-lab/GenderGapTracker).
They were developed for Canadian news; review a representative sample when
working with social media, fiction or other genres and English varieties.

Open **Quotation** to create **Quotation 1** if there are no tabs. Each named tab
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

Click **Document** or a source metadata header to sort. In Preview, sorting is
applied before source pagination; only the resulting page is extracted. Generated
quotation fields are sortable in the saved **Quotations** tab, where every quotation
has already been calculated.

<h3 id="help-quotation-run-all">Step 3 — Run</h3>

**Run** extracts the complete input as a native task. It saves matching original
rows and quotations inside the project. First it saves the submitted request and
clears previous output atomically. A later failure or cancellation leaves the
request but no completed result. You can
edit the next request while a task runs; its captured input does not change.
Finish any Table editing session before starting Run. Progress appears in the progress card and in Tasks.

A successful Run replaces the Preview display automatically; there is no Preview/Saved results switch. The **Documents** tab is selected by default and groups quotations into their original rows. The **Quotations** tab shows one occurrence per row. Saved pages offer numbered navigation and page jumps; Preview uses document lookahead without counting the whole source. Saved results remain readable after source edits, deletion, Save As and
project reopening. Rerunning requires a valid current input.

**Add to Project → Quotations** creates one row per saved quotation. **Add to Project → Documents** creates one row per matching document with `QUOTE_extraction` joining
its quotation text. Choose a new Table name and optional fields. The original
document is always included; existing objects are never overwritten. These new
Data Blocks own their rows independently of the analysis.

<h3 id="help-quotation-clear-results">Cancel and Clear results</h3>

**Cancel** cancels the current Preview request or requests cancellation of Run.
A document already being extracted may finish first. **Clear results** removes the
Preview and completed result but retains the tab, saved Run request, draft and display preferences, and re-enables Preview. It is unavailable
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
| Saved source is missing | Saved results still work; select a replacement before rerunning |

<h2 id="help-quotation-defaults">Quick-reference defaults</h2>

| Setting | Default |
|---|---|
| Engine | Built-in English |
| Context | 5 words per side |
| Preview page | 50 source documents |
| Saved presentation | Documents |

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
