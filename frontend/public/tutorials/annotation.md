<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)
<h1 id="help-annotation-section">Annotation tutorial</h1>

Annotation assigns a single Codebook label to each document. **Manual** and **AI**
share the source and Codebook controls in each numbered tab. Labels belong to the
source Table; a saved AI result is a report of its Run.

<h2 id="help-annotation-setup">Set up the source and Codebook</h2>

1. Add one Data Block and choose its document column.
2. Choose an annotation destination, or create a string column. AI Preview does
   not require a destination. To write labels into a View, explicitly choose
   **Materialize in place** first.
3. Select a Codebook and its code and description columns. **Create Codebook**
   creates an empty Table; **Edit Codebook** opens staged editing. Views can be
   used as read-only Codebooks.
4. Optionally choose a separate correction column to retain reviewed decisions.

Codebook codes are trimmed, nonblank and unique ignoring case. A Codebook may
contain up to 200 codes; codes have a 200-character limit and descriptions a
2,000-character limit. Editing a Codebook preserves its unrelated columns.
Existing invalid source labels remain visible until deliberately changed.

<h2 id="help-annotation-manual">Manual workflow</h2>

Choose **Start** to open an editing session. Change labels and corrections using
the current Codebook. **None** writes SQL NULL. Changes remain staged across
pages: **Save** commits them together, while **Cancel** discards them. **Close**
ends the session; if changes are pending, choose **Save**, **Discard** or **Stay**.
A failed Save keeps the draft open.

The source Table is protected while editing, including against rename, deletion
and schema changes. Reads and unrelated Table operations remain available.
Independent Tables can be edited separately. SQL Console is read-only while an
editing operation is active. If a Codebook changes, choices update; a staged
label removed from the Codebook is flagged and must be corrected before Save.

Use **Compare To** to add another coder/model column. Comparisons start masked
so labels do not influence your own decisions. **Reveal** shows values;
**Mask** hides them again. The header score opens a confusion matrix on hover or
keyboard focus, including the number of included and excluded rows. Choose
Cohen's κ (default), nominal Krippendorff's α or Percent Agreement.

**Row filter** selects one annotation/comparison column and combines valid-label
presence with **Different valid labels**. Blank or invalid labels never contribute
to differences or agreement. Choosing **Blank or invalid label** disables the
difference condition. **Clear filter** returns all rows. Filters and metrics
apply to the complete Table before pagination and include unsaved patches, marked
**Includes unsaved changes**. Preview has no row filters.

Validity uses exact-case Codebook labels after trimming: `Promise` and `promise`
are different. Without a Codebook, nonblank labels are eligible. Comparison and
metadata roles are disjoint, and document/annotation/correction columns retain
their dedicated roles. Metadata stays beside the labels in a horizontally
scrollable table. The table defaults to ten rows per page; drag its bottom-right
resize handle to adjust its shared height, bounded by the window.

<h2 id="help-annotation-ai">AI workflow</h2>

Choose a named connection and search its discovered models, or enter a model
identifier. **New connection** and **Edit connection** manage OpenAI, OpenRouter,
Anthropic, Google and Custom OpenAI-compatible endpoints. Custom endpoints may be
local and keyless. Remembered keys use the host operating system's credential
store; **Session only** keeps a key in memory until the host closes. Keys never
enter project files. A missing/unavailable credential store does not silently
save plaintext. A copied project may require selecting a connection on its new
host.

On supported Macs, **Apple Foundation Models (on-device)** is available without
creating a connection or entering a key. It uses the system model locally and
requires macOS 26+, compatible hardware, enabled Apple Intelligence and a ready
model. Its availability message explains unmet requirements. It supports guided
structured labels; it does not fall back to a cloud provider.

Enter an instruction, or press Tab in the empty instruction field to accept the
suggested prompt. **Advanced settings and examples** contains provider-aware
inference controls and execution limits. Empty temperature and **Provider
default** reasoning leave those choices to the provider. Unsupported explicit
settings fail visibly instead of being silently ignored.

An optional example source supplies text and reviewed labels. Choose Random,
First N or Last N; defaults are up to ten examples per code and seed zero.
Examples outside the current Codebook are excluded and counted. With no valid
examples, inference proceeds without examples. **Use as Example** selects the
current source and correction column. When corrections are staged, use **Save
and use as examples** first.

Default execution uses batches of 20 documents, two retries and up to ten
concurrent requests. Only document text, your instruction, the Codebook and
selected examples are sent to the selected provider. Unrelated metadata is not
sent. Cloud providers may charge for inference.

<h3 id="help-annotation-preview">Preview</h3>

**Preview** predicts a fresh document page without changing source labels or
saving a request/result. Every explicit page or page-size action captures the
current form and makes fresh predictions. Old predictions clear immediately.
Typing, focus, theme changes and presentation controls do not invoke the model.
Already-labelled nonblank documents are included; **Fill missing only** affects
Run alone.

Successful predictions remain visible alongside explicit failed-row states.
Authentication or provider-wide failures fail the request. A failed prediction
is never displayed as a valid None label. Comparisons summarize this page only.

**Edit corrections** opens the shared editor for a writable Table after checking
that the displayed source is still current. A changed source needs a fresh
Preview before editing. Clearing predictions or requesting another page retains
unsaved correction patches. Leaving the tab discards predictions and prompts
for any unsaved edits. A new visit never automatically invokes a provider.

<h3 id="help-annotation-run-all">Run and review</h3>

**Run** captures the current request independently of Preview. The default
**Reprocess all** predicts every nonblank document. **Fill missing only** selects
NULL, empty or whitespace-only destination labels; existing invalid nonblank
labels are preserved. NULL/blank documents are skipped without changing labels.
The progress card and Task Centre show the same task, with cancellation.

Run protects the target Table, stages predictions and writes successful labels
atomically with its saved report. Fatal failure or cancellation before commit
changes no labels and retains the submitted parameters. An individual document
failure preserves that row's old label while other successful predictions can
commit. A successful None prediction may clear an existing label. Partial runs
offer **Rerun**; inspect **Failed-row diagnostics** to see what failed.

**Results** distinguishes historical processed/preserved/skipped/failed counts
from current source labels. **Captured Codebook and examples** shows the actual
inference context. Review uses the live Codebook and source, including full-Table
comparisons and filters. **Edit corrections** explicitly opens a protected
session. Historical diagnostics are never applied to new row positions.

<h2 id="help-annotation-results">Results, Clear results and restoration</h2>

**Clear results** removes temporary predictions, the saved report and its owned
context/diagnostics. It retains source labels, submitted Run parameters and any
open correction draft. Committed Table-label Undo is not implemented; review
staged edits before Save. Existing View Undo remains separate.

An unchanged, fully successful request disables Run and Preview. Change execution
settings or Clear results to run again; presentation changes do not enable Run.
Partial results and loading failures offer Rerun. Failed/cancelled runs with no
completed result remain runnable. A completed Run is independent of navigation.

Reopening restores shared setup from the latest successful Manual Start or
accepted AI Run, plus saved AI inference controls. It never starts editing or
inference automatically. Unsupported saved settings appear in a compatibility
warning above the actions; recognized values still populate the panel. Local
edits are preserved while results load.

Before using labels downstream, inspect examples from every code and review
uncertain or costly errors. Agreement and model predictions support review;
they do not establish that a label is correct.

[← Back to tutorial index](./index.md)
