# Usability Changes Trialled On This Branch

Implemented by Claude on 2 November 2026 at the product owner's request,
following [Astra's plan](ASTRA-PLAN.md) and Claude's review of it.

**Status: trial on `research/v0.7-ui-astra-handoff` only.** These changes are
not recorded in GitHub Issues or in the
[v0.7 to v0.8 migration instructions](../../releases/v0.7-to-v0.8-migration-instructions.md).
If any are kept, add their ledger entries when merging, using the
[merge notes](#merge-notes) below.

## Scope

Claude's review sorted Astra's proposals into four groups. Only the first two
were implemented.

| Group | Treatment on this branch |
|---|---|
| Wording, discoverability and accessibility fixes | Implemented, except the sidebar label item (see [Not changed](#not-changed-and-why)) |
| Frequency result controls compacted | Implemented |
| Task entry points, focused layout, Annotation setup sequence, when a Codebook is created | Not started. Each needs a product decision first |
| Research or workflow profiles | Not started, as Astra recommended |

No backend, API, saved-state or preference changes were made. Every change is
presentation, wording or a client-side shortcut to an existing action.

## Changes

### 1. The empty inputs panel names the Data Block open in the Data Editor

Addresses Sol's finding U1: a Data Block can be open in the Data Editor while
the tool still has no input.

- When a tool has no inputs and the Data Editor's active tab is a Data Block
  the tool can take, the empty panel adds a line: "**name** is open in the Data
  Editor but not added to this tool", with an **Add name** button.
- The button calls the same add path as **Add Data Block**, so limits and
  rejection messages are unchanged.
- Selection and inputs stay independent. Nothing is added without a click.
- Annotation's **Codebook** and **Example** panels opt out, because the open
  Data Block is usually the one being annotated.

[Screenshot](implementation/after-01-empty-input-suggestion.png).
Code: `NodeInputsPanel.tsx` reads `activeNodeId` from the selection store and
takes a new `offerOpenDataBlock` prop (default on). `AnnotationFeature.tsx`
passes it off for the two role panels.

### 2. Each "Clear" says what it clears

Addresses Astra's point that "Clear" relied on context. The Frequency screen
alone showed three buttons labelled "Clear".

| Where | Before | After | Effect, unchanged |
|---|---|---|---|
| Run row in every analysis tool | Clear | **Clear results** | Removes the tab's Preview and Run results |
| Inputs panel heading | Clear | **Remove all** | Takes every Data Block out of the tool |
| Frequency token filter | Clear | **Clear filter** | Empties the filter |

The visible text now contains each button's existing accessible name, which
fixes a label-in-name mismatch on the inputs button ("Remove all Data Blocks"
was announced while "Clear" was shown). Other "Clear" buttons, such as Tasks,
caches, Loader selection and Topic selection, were left alone.

### 3. The Add to Project window says what a row will be

Addresses Sol's U7. The window used to say "Choose which immutable Result
columns create new Project Data Blocks."

It now opens with one line before the column list, for example: "Each match
becomes one row in the new Data Block. Choose the columns to keep. The Result
and the original Data Block stay as they are."

- Concordance Table view: one row per match.
- Concordance Dispersion view: one row per document with a match, its matches
  together in one column.
- Quotation: one row per quotation, through a new `rowUnit` prop.
- With two sources it says "each new Data Block".

The two contextual hints that said "Run stores an immutable Result" now say
"Run keeps the Result". Column selection is unchanged.
[Screenshot](implementation/after-06-concordance-dialog.png).

### 4. Concordance context-length inputs have names

Fixes the accessibility finding in Sol's brief. The **Left context (tokens)**
and **Right context (tokens)** labels are now tied to their inputs, which were
announced as unnamed spin buttons. Their grid also wraps by the pane's width
instead of a window breakpoint, as the frontend guide requires for content in
resizable panes. They stay side by side at 1024 pixels.
[Screenshot](implementation/after-07-concordance-1024.png).

### 5. Frequency display settings take one row

Addresses Sol's U3: at 1024 by 768 the word cloud started below the first
screen.

- Stop words, Cloud display limit and List display limit sit in one bordered
  row that wraps by the pane's width. This follows the "Result settings" row
  Topic Modelling already uses.
- The stop-word text box opens with **Edit list** and closes with **Hide
  list**. It opens by itself when the filter is turned on with no words yet.
- While the list is closed and the filter is on, a line shows "Hidden words:"
  with up to eight words and a count of the rest. Astra asked that active
  exclusions stay visible when their controls collapse.
- **Filter tokens** and the **Cloud view / List view** selector share one row.
  The filter still comes first in reading order.
- Kept as before: the switch, the list picker, Sort, right-click to add a word,
  picking a list switching the filter on, the count in the label, both Apply
  buttons, every help icon, and the parameters/results split from V07-089.

Screenshots: [1440 wide](implementation/after-02-frequency-1440.png),
[1024 wide](implementation/after-03-frequency-1024.png),
[list open](implementation/after-04-frequency-1024-edit-list.png),
[hidden words](implementation/after-05-frequency-1024-hidden-words.png).

### Help pages

The Help pages, which are the documentation source of truth, were updated to
match the new labels. Pages changed: ui, token-frequency, concordance,
quotation, annotation, sequential-analysis, topic-modeling, preprocessing and
export.

- ui.md now explains that opening a Data Block is not adding it to a tool.
- token-frequency.md describes the settings row and Edit list.
- The section title "How Preview, Run and Clear work" and its link anchor were
  kept, so existing links still work.

## Not Changed, And Why

- **Sidebar labels.** Claude's review proposed aligning "Loader" with "Data
  Loader". The short sidebar names were an agreed #205 decision with their own
  tests (V07-101), so they were left as they are.
- **The parameters/results split.** V07-089 built it deliberately. The space
  problem was the controls inside the results card, so only those moved.
- **Help screenshots.** Images that show the old labels or layout were not
  recaptured. Candidates are `token_frequency/stop_words.png`,
  `display_limits.png` and `filter_tokens.png`, plus any image showing a Run
  row.

## Verification

| Check | Result |
|---|---|
| Type-check, `tsc --noEmit` | Passed |
| Lint, `pnpm -C frontend lint` | Passed |
| Frontend tests, `pnpm -C frontend test -- --run` | 364 files, 1,920 tests passed; build-verification tests 3 of 3 |
| Help check, `pnpm -C frontend docs:check` | Passed |
| Live checks in WebKit, [script](implementation/live-check.mjs) | 15 of 15 in the final runs; no page errors or API responses of 400 or above |
| Same live checks in Chromium | 15 of 15 in two runs |

One earlier WebKit run, made while the screenshot timing was being adjusted,
printed 14 pass lines. Its failing line was not captured. Every later run
passed all 15.

New and updated unit tests cover the suggestion and its opt-out, the button
labels, the dialog summary for each row unit, the named context inputs, the
collapsed stop-word list, the hidden-words line, opening on an empty list,
and the absence of window breakpoints in the settings row.

### Where The Word Cloud Starts

Measured live in WebKit with the default layout and the Project panel open.

| Window | Settings row height | Word cloud top | Cloud visible in the first screen |
|---|---|---|---|
| 1440 x 1000 | 74 px | 538 px | 462 px |
| 1024 x 768 | 129 px | 623 px | 145 px |

In Sol's [1024 baseline](screenshots/36-responsive-1024.png) the Cloud view
selector sits near 703 px and the cloud starts below the 768 px screen. That
baseline is read from the screenshot, not measured with this script.

### Limits

- Same environment caveats as [the evidence record](EVIDENCE.md): a source
  checkout with `UV_NO_SYNC=true`, a scratch data folder, and the synthetic
  fixture.
- Screenshot tab strips show F-1 to F-11 and C-1 to C-11 because each run
  opens a new tab. That is test residue, not a product change.
- No participant has seen these changes. They make Sol's findings smaller but
  do not show that novices now understand inputs and outputs.

## Found While Working

These existed before this branch and were not changed.

- The help icon beside the results button is also named "Clear results", so
  two neighbouring controls share an accessible name. The Run help icon is
  named "Run Frequency" and does not have this problem.
- token-frequency.md says the Cloud display limit defaults to 50. The code
  default, `DEFAULT_TOKEN_LIMIT`, is 25.

## Merge Notes

Each change is independent and can be kept or dropped on its own.

| Change | Main files | Ledger area if kept |
|---|---|---|
| 1. Open Data Block offered in an empty inputs panel | `NodeInputsPanel.tsx`, `AnnotationFeature.tsx`, ui.md | Data Block actions |
| 2. Clear labels | `AnalysisCardLayout.tsx`, `ConcordanceParameterPanel.tsx`, `NodeInputsPanel.tsx`, `TokenFrequencyTokenFilterCard.tsx`, eight Help pages | Wording across the app; also add to "Label changes that replace earlier entries" |
| 3. Add to Project summary | `ResultAddToWorkspaceDialog.tsx`, `QuotationFeature.tsx`, `guidance/registry.ts`, concordance.md, quotation.md | Concordance and Quotation |
| 4. Context input names | `ConcordanceParameterPanel.tsx` | Concordance |
| 5. Frequency settings row | `TokenFrequencyResultsPanel.tsx`, `TokenFrequencyTokenFilterCard.tsx`, token-frequency.md | Frequency and Keyword Analysis |

For v0.8, carry over the behaviour rather than the markup: the open-Data-Block
offer and its role-panel opt-out, the three distinct labels, the row-unit line,
labelled context inputs, and a stop-word list that opens on request while
keeping hidden words visible.
