<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-token-frequency-section">Frequency tutorial</h1>

Frequency counts the tokens in one or two text corpora. A single corpus produces a ranked list and word cloud. Comparing two corpora also produces a **Juxtorpus** cloud and **Keyness statistics** table.

Open Frequency to start: if no analyses exist, an empty **Frequency 1** tab is created automatically. Use **+** on the tab strip to add another analysis. New tabs use the first available number: **Frequency 1**, **Frequency 2**, and so on. You can rename them; existing names stay unchanged. The titlebar shows your location, for example **Untitled ▸ Frequency ▸ Frequency 1**, and follows the selected tab and its name. Closing the last tab leaves an empty state; use **New Frequency analysis** to create another, or leave Frequency and return to start a fresh tab automatically. Each named tab keeps its latest successful result inside the project. Tabs are independent: another tab can run while this one is working. Concordance and Quotation are also available; the other analysis tools remain unavailable.

The named tabs stay at the top of the pane while the content scrolls. Each tab contains two cards: **Token Frequency Analysis** for its inputs and Run controls, followed by **Token Frequency Results** for saved output. Both share the same scroll area, so you can move between settings and results without changing tabs.

<h2 id="help-token-frequency-parameters">Token Frequency Analysis</h2>

Choose each corpus colour in its input card. The colour stays with that Data Block when you swap Reference and Study, and updates its clouds and comparison legend without rerunning.

<h3 id="help-token-frequency-data-block">Step 1 — Select your data</h3>

Add one or two Data Blocks. For each input, select its **text column** and **tokenizer model**. The tokenizer determines how text becomes tokens; different inputs may use different models.

Available models come from the native tokenizer catalogue. Frequency can recommend a model from a small text sample using local language detection. Its model and runtime download on first use and are cached for reuse; document text stays local. A recommendation is a starting point, not a guarantee about every document. It never overwrites a model you selected explicitly. If detection is unavailable or uncertain, select a model manually. The built-in plain-words tokenizer works without a model download; other models may require an initial download.

Input, column and tokenizer changes remain drafts until a successful run saves its submitted settings. They do not silently change the Data Block's preferences. Reloading discards unrun changes and restores the inputs used by the latest successful result.

<h3 id="help-token-frequency-reference">Step 2 — Reference and study corpora</h3>

With two inputs, choose which is the **Reference** corpus and which is the **Study** corpus. The reference provides the baseline: its counts appear as **O1** and **%1**, and the study corpus appears as **O2** and **%2**. Swapping roles changes directional statistics such as LogRatio.

<h3 id="help-token-frequency-stop-words">Step 3 — Stop words</h3>

Stopwords hide tokens from the displayed results and filtered downloads. They do not change the stored token counts, corpus totals or statistics for other tokens.

Above the **Word clouds** and **Ranked lists** switch in the **Results** panel,
use **Add data block** in **Stopword Data Block**,
then choose its **Stopword column** in the selected card,
or choose **Create empty** to create a visible Table with a `word` column. Import
an existing list through Data Loader first. The same list filters both corpora
and can be reused by other analysis tabs.

- Selecting or creating a list turns filtering on. Turn the switch off to keep
  the selection without filtering. The card's **×** or **Clear all** removes the
  selection, leaving the Data Block intact. Remove the selection before choosing
  a different list.
- **Edit words…** opens removable bubbles in the Table's row order, keeping the
  first occurrence of each word. Click the input area, type a word and press
  **Enter** to add it immediately. Paste comma- or newline-separated words to add
  a batch; use a bubble's **×** to remove it immediately.
  **Add language preset…** lists sampled recommendations first. **Add to list**
  commits the selected presets together. **Sort** sorts the complete Table rows
  alphabetically by the selected word column; related column values stay together.
  **Clear** asks for confirmation before removing the displayed words.
  **Close** leaves committed changes in place; typing alone does not save a word.
- For the ordinary table editor, use **Edit Table** in the Data Block's node menu.
  Its Save and Cancel controls retain their usual atomic behavior.
- **Edit words…** on a View first copies the selected column to a new
  Table and selects it. The original View is unchanged. Closing leaves that
  new Table available in the graph.
- Right-click a word in a cloud, list or comparison to add it. Wordflow creates a
  list when necessary or copies a selected View before adding the word.
- Keep domain-specific terms you want to compare, even if a general preset
  includes them.

Matching ignores case, NULLs, blank values and duplicates. Any column type is
accepted through DuckDB's text representation. The preview shows the effective
word count; lists over 100,000 words produce an explicit error.

Each word-list change preserves unchanged cells and unrelated columns.
New rows use the other columns' defaults. Removing a word deletes its row in a
one-column Table, or clears that cell in a multi-column Table. DuckDB may reject
an edit that violates a type or constraint; the whole edit rolls back and the
unsubmitted text stays available for correction.

New lists have logical links from the current corpus inputs. Existing list
selection does not change those links or the graph selection. Editing a shared
list updates every analysis using it without another Frequency run. If a list
is missing or unreadable, the previous display is marked outdated and exports
are disabled until you resolve the selection or switch filtering off.

After results are available, carrying a Data Block from the graph shows separate
placement targets for **Frequency inputs** and **Stopword Data Block**. Place it
in the stopword target to leave the corpus inputs unchanged.

Only the selected source, column and filtering switch are saved with the tab.
Old embedded stopword arrays are ignored; no list is created automatically.

<h2 id="help-token-frequency-run">Step 4 — Run the analysis</h2>

Click **Run** after selecting the inputs, columns and models. Finish any active table-editing session first. Progress and cancellation are available in **Tasks**.

Only one run may be active in a tab. You can continue editing its parameters while the captured request runs, or work in another tab. Navigating away does not cancel accepted work. After completion, matching settings disable Run; change execution parameters or Clear results before running again.

An accepted Run first saves its request and clears the previous result atomically. A later failure or cancellation leaves no completed result, but retains the submitted request and your draft. You can run again without clearing. If the displayed result used different parameters from the current draft, it is marked accordingly.

<h2 id="help-token-frequency-results">Token Frequency Results</h2>

Results are saved privately in the project, separate from graph Data Blocks. Reading or exporting a saved result does not re-read its original source. It remains available if that source is changed, renamed or removed. Statistics are calculated from the saved token counts, with the original corpus totals preserved when you filter or sort. To rerun, select valid current inputs; saved results do not track changes to their sources.

<h3 id="help-token-frequency-token-limit">Cloud display limit</h3>

**Words per cloud** controls how many tokens are drawn, with a default of 50 and a range of 10–100. It does not truncate the saved vocabulary. Large vocabularies are queried in bounded projections rather than downloaded just to draw a small cloud.

<h3 id="help-token-frequency-list-limit">Ranked lists</h3>

Choose **Ranked lists** for token counts in descending order, with token order breaking ties. Scroll continuously through the list; there are no page controls. **List limit** may be left empty for all matching tokens. The app loads nearby rows as you scroll and renders only the visible part of the list. Bars keep the same scale throughout each filtered list, relative to its highest count. Changing filters or the list limit returns the list to the top. Paired lists keep the same ranks aligned while scrolling, even when their vocabulary sizes differ.

<h3 id="help-token-frequency-token-filter">Filter tokens</h3>

The token filter, display mode, limits and statistics sorting/page size stay local
to this window. They survive tab/tool navigation and reset when the window reloads.
Corpus colours and the selected stopword source remain saved with the tab.

**Filter tokens** and **Stopwords** sit above the display switch and apply to both
views. Each view keeps its own limit control below the switch.

The shared token filter applies to the complete vocabulary before cloud or list limits. It affects the individual results, Juxtorpus and Keyness statistics. Wildcards let you match token patterns:

- `pre*` — tokens starting with _pre_
- `*ing` — tokens ending in _ing_
- `*ation*` — tokens containing _ation_
- `c?t` — tokens with exactly one character between _c_ and _t_

Use **Clear token filter** to see the unfiltered vocabulary again. Each corpus shows its matching-token count, before display limits. Ranks are assigned after stopwords are excluded and before the token filter, so a filtered list retains the words' original ranks. Table downloads include **all matching rows**, not just the current page or displayed cloud.

<h2 id="help-token-frequency-cloud-view">Cloud view</h2>

Choose **Word clouds** to see a cloud for each corpus, with word sizes reflecting frequency. Right-click a word to add it to stopwords. Click a token in a cloud, ranked list or comparison table to open a new Concordance tab using all inputs from the saved Frequency result and a whole-word Text Preview. With two inputs, both are searched in their original order, including when you click an individual corpus's cloud or list. Right-click retains its stopword action.

The new Concordance tab starts a temporary Preview. Leaving it or reloading discards
the Preview; only Run saves its submitted request.

Clouds can be downloaded as PNG, JPEG or SVG. Bundled downloads can include stopword text. Native downloads use the file chooser; cancelling the chooser writes nothing. Once accepted, export cleanup and final file installation belong to the task.

<h3 id="help-token-frequency-unified-word-cloud">Juxtorpus</h3>

Two-corpus results include a Juxtorpus cloud:

- **Size** reflects combined frequency.
- **Colour** reflects which corpus has the higher relative frequency.
- **Ranking** uses log₁₀(O₁ + O₂) × LogRatio, selecting the high and low ends to show distinctive terms from both corpora.

Only tokens with more than 10 combined occurrences qualify. The same stopwords and token filter apply before taking each end of the ranking; overlapping words appear once. The Reference-to-Study gradient shows the colour scale. Hover or focus either label to see the full Data Block name.

<h2 id="help-token-frequency-list-view">List view</h2>

List view shows ranked tokens with exact counts and relative bars. A visual bar or cloud may scale values for drawing; the tabular counts retain their stored integer precision.

<h3 id="help-token-frequency-statistical-measures">Keyness statistics</h3>

The **Keyness statistics** table compares the reference and study corpora. Sort by a measure to inspect distinctive tokens. It starts with the highest LL values. Sorting and filtering apply to the saved full table before pagination. Use the page controls to reach any matching row; changing the filter, sort or page size returns to the first page. Hover or focus a column heading for its definition.

| Measure | Meaning |
| --- | --- |
| O1 / O2 | Observed token count in reference / study corpus |
| %1 / %2 | Share of the corpus's total tokens |
| LL | Log-likelihood statistic |
| Overuse | Corpus with the higher relative frequency, or Equal |
| Signed LL | Positive for higher relative frequency in Reference, negative for Study, zero for equal proportions |
| %DIFF | 100 × (Reference relative frequency − Study relative frequency) / Study relative frequency |
| Bayes | Bayes factor (BIC) |
| ELL | Effect size for log-likelihood |
| RRisk | Relative risk |
| LogRatio | Base-2 log of relative frequencies; positive values favour the reference corpus |
| OddsRatio | Odds ratio between corpora |
| Significance | Significance annotation from the native statistics calculation |

When Study has zero occurrences, the published %DIFF method uses a denominator of `1e-18`. This can produce extremely large percentages. The table uses scientific notation for large values and explains the zero-count case on focus or hover; exports retain the full value. Overuse and Signed LL use relative frequencies, so differing corpus sizes do not reverse their meaning.

Undefined ratios and infinities can occur, especially when a token is absent from one corpus. They are retained rather than replaced with zero. If an input causes the native calculation to fail after Run has cleared its old output, the error is reported and the submitted request remains available to run again.

Download tables as CSV or Markdown. Corpus-specific headers include the saved Reference/Study names. Overuse and Signed LL are included. Filtered downloads include all matching rows. The saved result does not depend on which page was open when you exported it.

<h3 id="help-token-frequency-clear-results">Clear results and close analysis tabs</h3>

**Clear results** removes the completed result while keeping its tab and display preferences. It is unavailable while that tab has a running task. To stop work, cancel it in Tasks and wait for cleanup.

The **×** on a named tab closes and deletes that analysis, including its private result, and requests cancellation of any active run. This is deletion, not just hiding the tab. A late completion cannot recreate it. To leave an analysis available, switch to another tab or feature instead. Dismissing a finished task only removes its task summary; it does not delete the result.

<h2 id="help-token-frequency-troubleshooting">Troubleshooting</h2>

| Symptom | What to check |
| --- | --- |
| Run is unavailable | Select valid input columns and tokenizers; wait for the tab's current run to finish |
| Run reports an editing conflict | Save or cancel the table editor, then run again |
| Language recommendation is missing | Select the tokenizer manually; detection is advisory |
| The first model load takes longer | Some tokenizer models need an initial download |
| Juxtorpus and statistics are absent | Select two corpora and run the comparison |
| The result is marked as different from the draft | It belongs to an earlier successful request; Run explicitly to use the current draft |
| A saved source no longer exists | Existing results and exports remain available; choose a current source before rerunning |
| A failed run still shows a table or cloud | The previous successful result is deliberately retained |

<h2 id="help-token-frequency-defaults">Quick-reference behavior</h2>

| Item | Behavior |
| --- | --- |
| Inputs | One or two text corpora |
| Run ownership | One active run per tab; different tabs can overlap |
| Saved output | One latest successful result per named tab |
| Parameter drafts | Local until a successful submitted run; reload discards unrun changes |
| Presentation | Stopwords, filtering and display preferences do not rerun the analysis |
| Cloud limit | 50 by default; 10–100 |
| Table exports | All matching rows, independent of the current page |
| Project file | Results and artifacts travel with the `.wfpj` file |

## Practice exercise

1. Create a Frequency tab and select one Data Block, its text column and tokenizer.
2. Run the analysis, then compare the ranked list and word cloud.
3. Create a stopword Table, then add a language preset and a domain-specific word. Confirm that filtering does not run a second task.
4. Add another corpus, choose Reference and Study roles, and run again.
5. Filter with `*ing`, then inspect Juxtorpus and sort Keyness statistics by LogRatio.
6. Export the filtered table and a cloud image.
7. Rename the tab, save the project, close and reopen it. The completed result and display preferences remain available.

[← Back to tutorial index](./index.md)

CSV and Markdown exports read the selected stopword column when you click **Export**. A bundled stopword text file uses the same word set as that table. Chart downloads retain the displayed drawing and its matching stopwords.

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
