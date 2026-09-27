<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-concordance-section">Concordance tutorial</h1>

Concordance finds words and phrases in one or two Data Blocks and shows their
contexts and positions. Entering the tool with no tabs creates **Concordance 1**.
Use **+** to create another numbered tab, or rename and reorder existing tabs.
Closing the last tab leaves an empty state until you create one or leave and return.

Each tab has a **Request** panel and a **Results** panel. **Preview** is temporary
and calculated on demand. **Run** saves the latest successful complete result
inside the project. An accepted Run saves its request and clears the previous result before calculation; a later failure or cancellation leaves no saved output.

<h2 id="help-concordance-parameters">Request panel</h2>
<h3 id="help-concordance-data-block">Choose inputs</h3>

Add one or two Data Blocks and choose a document column for each. The initial
column follows the Data Block's Document Column Preference when available.
Source colors identify the corpora; matched-term colors in dispersion are separate.
You can add, remove or clear inputs without changing the graph selection.

<h3 id="help-concordance-search-term">Enter a search</h3>

Enter a word, phrase or token alternatives. Clicking a token in Frequency opens a
new Concordance tab with all of that saved result's inputs and source columns,
in the same order, and a whole-word Text search. Preview runs for both corpora
when Frequency has two inputs, even if you clicked an individual cloud or list.
If a source is missing, select a replacement.

<h4 id="help-concordance-search-mode">Text and Tokens</h4>

**Text** searches original text. **Tokens** matches exact token alternatives,
separated by spaces, commas or a pipe. Choose a tokenizer for each input in Tokens
mode. Switching modes retains your Text options, including Regex; inactive Text options do not change token matching. Sampled language recommendations are suggestions and never replace your
explicit choice. Some models require an initial download; plain words is local.

Execution settings remain local drafts until Run is accepted. Run saves the submitted
request independently of its results. Preview never saves its request. Editing a draft
during either operation does not change the captured request or lose your edits.

<h5 id="help-concordance-regex-toggle">Search options</h5>

Text mode offers **Whole word**, **Regex** and **Case sensitive**. For example,
regex `cat|dog` matches either term. Invalid patterns report an error; a Run that already cleared its prior output does not restore it. Native regex does not support lookaround or backreferences.
Tokens mode uses exact alternatives rather than regular expressions.

<h3 id="help-concordance-context">Context</h3>

Left and right context default to ten tokens and accept 0–50. **Ignore punctuation**
means punctuation-only tokens do not consume Text context counts or become L1/R1.
Original punctuation and spacing remain in the displayed text. Token mode uses
the selected tokenizer's punctuation filtering. L1 and R1 identify neighboring eligible tokens. Token mode keeps these
neighbors even with zero visible context; Text mode uses the displayed context.

<h3 id="help-concordance-batch-size">Documents per page</h3>

Preview pages contain a bounded number of source documents (20 by default).
Documents without matches produce no visible rows; several matches in one
document produce several KWIC rows. An empty page does not mean later pages are
empty. Next uses a lookahead row rather than counting the complete source.

<h2 id="help-concordance-run">Preview</h2>

Click **Preview** to submit the current draft. Typing does not calculate matches.
Paging, page-size changes and metadata sorting use the last submitted settings.
Sorting can require a larger database scan, but only the requested document page
is matched. Presentation, colors and metadata visibility reuse the page.

An explicit Preview click refreshes unchanged settings until that request has a successful Run. Preview is unavailable while Run is active or when its successful saved request matches your draft. Change execution inputs/options or Clear results to preview again. Relevant source or
dependency changes refresh active previews; unrelated graph movement does not.
An old page remains visible and marked outdated while refreshing or after failure.
**Cancel** in the progress card cancels pending Preview work. Preview creates no
saved request, result or task. Leaving the tool, switching tabs, reloading, Run or
Clear discards it. Returning restores your local draft or saved Run request, without
recalculating Preview. Finish Table editing before submitting Preview.

<h2 id="help-concordance-results">Results panel</h2>
<h3 id="help-concordance-views">Result presentation</h3>

The Results panel follows the latest Preview or successful Run. Run replaces the Preview display; there is no Preview/Saved results switch. Use the **Table** and **Dispersion** tabs at the top to change presentation. A notice marks
results whose submitted settings differ from the current draft. Saved results
retain matching source rows and remain readable after the original source changes
or disappears. Rerunning requires valid current inputs.

<h3 id="help-concordance-table-view">Table</h3>

Each row is one match, with left context, matched text, right context, L1/R1 and character offsets. Saved
results additionally show L1/R1 frequencies. Frequencies
describe the complete saved source result, not merely the displayed page.
Saved match rows support sorting by their generated fields and selected metadata.
Preview supports source-metadata sorting only.

<h3 id="help-concordance-tooltip">Inspect a document</h3>

Click a match or document bar to open the full retained document with highlighted
matches and metadata. Previous/next navigates rows and pages. Hovering a dispersion
marker shows its context. Emoji and other Unicode characters retain correct offsets.

<h3 id="help-concordance-metadata">Metadata</h3>

Click **Metadata** to open the column-selection popover. Select original source columns, or use Select all/none. Escape or a click outside closes it without discarding your selections.
These choices affect presentation, not calculation. Combined presentation offers
only columns shared by all selected sources.

<h3 id="help-concordance-display-mode">Table and Dispersion</h3>

Table presents individual occurrences. Dispersion presents qualifying documents
and their match positions. Saved Table pages count matches; saved Dispersion
pages count documents. Preview always pages source documents.

<h3 id="help-concordance-sources-mode">Separated and Combined</h3>

Use the **Separated / Combined** tabs on the right of the Results header when
both corpora are present. Separated keeps a source card and page controls for
each corpus. Combined interleaves the source pages and disables sorting. Source
colors remain distinct. Switching returns to the first page and combines loaded
results locally without rerunning the analysis. The layout choice is local to
the open results panel.

<h3 id="help-concordance-dispersion-view">Dispersion</h3>

Document bars come first, followed by pagination, the matched-term legend and
the summary chart. Metadata appears in columns beside the bars; click a document
to inspect it or hover a marker for its context.

**Bar length proportional to text length** is off by default: equal-width bars
show relative match positions, and the summary chart is available. Turn it on to
compare actual document lengths; the summary chart is hidden. The legend and
Clear selection remain available, and existing selections are retained.

Matched-term colors are consistent across sources and separate from source colors.
The legend shows total counts, or selected/total counts when bins are selected.
Saved Dispersion shares term visibility between cards; each source keeps its own
bin selection, while Combined has a separate selection.

<h4 id="help-concordance-summary-plot">Summary</h4>

Saved density is calculated across the complete saved result, independently of
the visible document page. Preview density describes only the current captured
page. Only saved Dispersion supports term and bin filtering. Preview supports
inspection, zoom and downloads. The KWIC Table remains unfiltered; returning to
Dispersion restores its selections. Filtering never reruns analysis.

<h4 id="help-concordance-chart-type">Chart type</h4>

Choose smooth Density: line or Density: area, Density: bar, or the stepped
Cumulative chart. Chart mode and bin count are shared across source cards.
Use Zoom in, Zoom out, Reset zoom, the slider or the mouse wheel to inspect a
range. Selecting bins preserves the zoom. Downloads include source labels,
query, scope, legend and filter context.

<h4 id="help-concordance-bin-count">Bins and case</h4>

Choose the number of equal relative-position bins (20 by default). Changing it
clears bin selections. **Uncased** combines term case variants and clears term
exclusions. Grouped labels retain the original spellings, such as `jobs/Jobs`.

<h4 id="help-concordance-bin-selection">Select a range</h4>

In saved Dispersion, click a point or its plot position to toggle a bin.
Shift-click adds a range to your selection. **Select range** toggles drag mode:
a drag replaces the selection; Shift-drag adds to it. Selected dots are filled.

Focus the chart to inspect points with arrows/Home/End and select with Enter or
Space. Shift extends the selection. Escape exits range mode and hides the tooltip;
**Clear selection** removes the current block's bin filter. Preview points can be
inspected but not selected.

<h2 id="help-concordance-run-all">Run</h2>

Run first saves its request and clears the previous output, then matches all selected
inputs and atomically publishes the new result. Only one run per tab is active; other tabs may run independently.
Follow stages or cancel through Tasks or the progress card. Finish table editing before starting.
Closing a tab cancels its work and removes owned results. Published Data Blocks remain.

<h2 id="help-concordance-download">Downloads and Add to Project</h2>

Download summary charts as PNG, SVG or JPEG. Native saving uses the system chooser;
browser saving downloads the file.

**Add to Project → Matches** creates one row per saved occurrence. **Add to Project → Documents** creates one row per qualifying retained document and required
`CONC_extraction` from surviving contexts. Both publication modes capture the
current presentation: Dispersion applies its term/bin filters, while Table
publishes without those filters. Both include all qualifying rows across pages.

Choose sources, edit output names, select metadata/generated columns, use Select
all/none or Sync columns, then Add. The document column is required. All selected
Tables commit together, and existing objects are never overwritten. Cancel leaves
the project unchanged. Published Tables are independent of later result clearing,
rerunning or tab deletion; export them through ordinary Data Block controls.

<h2 id="help-concordance-clear-results">Clear results</h2>

Clear results removes both Preview and saved output while retaining the tab, saved Run request, draft and
preferences. It also makes Preview available again. It is disabled while that tab is running. Cancelling or failing a
new run never clears the previous successful result.

<h2 id="help-concordance-troubleshooting">Troubleshooting</h2>

| Symptom | Action |
| --- | --- |
| Preview shows no matches | Check options and try the next document page |
| Results marked outdated | Submit Preview or Run with the intended draft |
| Source unavailable | Replace the input; saved results remain readable |
| Run disabled | Choose valid inputs/query and finish table editing |
| Regex error | Use a supported native pattern; lookaround/backreferences are unsupported |
| Publication failed | Check names, selected columns and conflicts; the dialog retains choices |

<h2 id="help-concordance-defaults">Defaults</h2>

Text mode, whole word on, regex off, case insensitive, punctuation ignored,
ten tokens of context on either side, 20 documents per page, Table presentation,
20 bins and Line chart.

The KWIC table has a bounded scroll area and sticky headers. Click a row to inspect
its full document; selecting text does not open the inspector. Preview includes
L1, R1 and character offsets; whole-result L1/R1 frequencies appear only in saved
results. A Preview summary distinguishes matches, matching documents and inspected
source documents. Combined paging limits apply to each source separately.

The metadata picker groups shared and source-specific columns. Separated cards
show only fields present in that source; Combined uses shared metadata, source
labels and row colors. Invalid numeric input reverts to its previous value with a
reminder. Attempting an unavailable execution action explains what is required.

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
