# Usability Changes Trialled On This Branch

Implemented by Claude on 2 November 2026 at the product owner's request,
following [Astra's plan](ASTRA-PLAN.md) and Claude's review of it.

**Status: trial on `research/v0.7-ui-astra-handoff` only.** These changes are
not recorded in GitHub Issues or in the
[v0.7 to v0.8 migration instructions](../../releases/v0.7-to-v0.8-migration-instructions.md).
If any are kept, add their ledger entries when merging, using the
[merge notes](#merge-notes) below.

**Base: v0.7 after release 0.7.20.** On 14 November 2026 v0.7 was merged into
this branch (merge commit `fe8e60ed`), so the trial runs on top of the current
release. See [Updated to 0.7.20](#updated-to-0720) and
[How to test each change](#how-to-test-each-change).

## Scope

Claude's review sorted Astra's proposals into four groups. Only the first two
were implemented.

| Group | Treatment on this branch |
|---|---|
| Wording, discoverability and accessibility fixes | Implemented, except the sidebar label item (see [Not changed](#not-changed-and-why)) |
| Frequency result controls compacted | Implemented |
| Task entry points, focused layout, Annotation setup sequence, when a Codebook is created | Not started. Each needs a product decision first |
| Research or workflow profiles | Not started, as Astra recommended |
| Product owner's requests while testing (15 November) | Implemented as changes 6 and 7 |

Changes 1 to 6 make no backend, API, saved-state or preference changes. Each is
presentation, wording or a client-side shortcut to an existing action. Change 7
changes one backend default, recorded in the OpenAPI file.

## Updated To 0.7.20

On 14 November 2026 v0.7 was merged in. That brought Basic/Advanced modes,
Maximise results, the Trends reference corpus and the 0.7.20 fixes. The backend,
Rust packages, scripts and lockfiles are identical to v0.7. The only differences
from v0.7 are this trial and its records.

Two files conflicted:

- **Annotation screen.** v0.7 restructured it. v0.7's version was taken, and
  the trial's only change there was re-applied: the Codebook and Example panels
  don't offer the open Data Block.
- **concordance.md.** Both sides added to the Add to Project paragraph. v0.7's
  naming and column explanation were kept together with the trial's sentence
  about the summary line.

v0.7 now runs a Biome format check. Three of the trial's test files were
reformatted to pass it.

How the trial behaves with the new v0.7 features, checked live in WebKit and
Chromium with [this script](implementation/live-check-v020.mjs):

- **Maximise results in Frequency.** The settings row stays visible, and Edit
  list works while maximised. At 1024 by 768 the cloud starts at 289 px, so
  479 px of it shows in the first screen.
  [Screenshot](implementation/after-08-frequency-maximised-1024.png).
- **Concordance Basic and Advanced.** The context inputs keep their names and
  stay side by side at 1024 pixels in both modes.
  [Screenshot](implementation/after-09-concordance-basic-1024.png).
- **Add to Project.** The summary line still shows, including when the
  results are maximised. v0.7's new default name, such as
  *synthetic-discourse_concordance_housing*, appears in the same window.
- **Other input panels.** v0.7 added no new multi-panel tool. The Trends
  reference picker is its own component, so it never offers the open Data
  Block.

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

### 6. One help icon for each Run row

Requested by the product owner on 15 November: only Frequency had a help icon
for Run, Topic Modelling and Annotation had none on that row, and one icon per
row keeps the number of help icons down.

- Every Preview, Run and Clear results row now ends with one help icon, placed
  after **Clear results** and before **Stop**, so it doesn't move when Stop
  appears. It opens the tool's Run step in Help.
- Its accessible name says what it covers: "About Preview, Run and Clear
  results", or "About Run and Clear results" where the tool has no Preview.
  That also fixes the help icon that shared the name "Clear results" with the
  button beside it.
- The per-button icons were removed: Frequency's Run and Clear icons, and the
  Clear icons in Concordance, Quotation and Trends.
- Annotation's Manual mode has a **Start** / **Close** row instead. It gets the
  same kind of icon, "About Start and Close", opening the Manual workflow
  section.
- `AnalysisCardLayout` takes one `actions.help` instead of `runAllHelp` and
  `clearHelp`. Concordance builds its own row and was changed to match.
- New Help registry keys: `analysis.<tool>.run` for Concordance, Quotation,
  Trends, Topic Modelling and Annotation, and `analysis.annotation.manual`. The
  old `clear-results` keys stay in the registry; nothing in the app uses them
  now.
- Help: each tool's Run step now also points to its own Clear results section.
  Concordance and Quotation retitled "Step N: Preview" to "Step N: Preview and
  Run" and point to the Run section further down. Annotation's Preview section
  starts with a line naming the row's three buttons. The section ids did not
  change.

### 7. Frequency cloud display limit defaults to 40

Requested by the product owner on 15 November. The default was 25 in the app
and the Help said 50.

- The backend request default (`TokenFrequencyAnalysisRequest.token_limit`) and
  the frontend `DEFAULT_TOKEN_LIMIT` are both 40. Both had to change: the app
  sends no limit when it runs, so the backend default comes back with every
  result and the screen uses it.
- The OpenAPI file shows default 40. A fresh export matches it, apart from the
  file's version, which already said 0.7.19 on v0.7.
- token-frequency.md says 40 for the Cloud display limit, and for the List
  display limit, which follows it.
- Results run before the change keep 25 until they are run again or the limit
  is changed. A limit someone has already applied is kept.

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
| Full frontend check after the 0.7.20 merge, `pnpm -C frontend check` | Passed: format, lint, types, 374 test files with 2,007 tests, unused code, build, Help, versions (0.7.20) |
| Live checks in WebKit, [script](implementation/live-check.mjs) | 15 of 15 on 2 November and again after the merge; no page errors or API responses of 400 or above |
| Same live checks in Chromium | 15 of 15 on 2 November and after the merge |
| Checks with 0.7.20 features, [script](implementation/live-check-v020.mjs) | 9 of 9 in WebKit and Chromium |
| Full frontend check after changes 6 and 7 | Passed: 374 test files with 2,008 tests, Help check with 80 icon references |
| Backend tests for Frequency and the analysis contract | 40 passed |
| Run-row help and cloud default, [script](implementation/live-check-rowhelp.mjs) | 16 of 16 in WebKit and Chromium: one icon in each of the six tools (both Annotation modes), no shared "Clear results" name, Help opens at Frequency's Run step, cloud limit 40 after a run |

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
| 1024 x 768, results maximised (0.7.20) | 129 px | 289 px | 479 px |

The first two rows are the same before and after the 0.7.20 merge.

In Sol's [1024 baseline](screenshots/36-responsive-1024.png) the Cloud view
selector sits near 703 px and the cloud starts below the 768 px screen. That
baseline is read from the screenshot, not measured with this script.

### Limits

- Same environment caveats as [the evidence record](EVIDENCE.md): a source
  checkout, a scratch data folder, and the synthetic fixture. The 2 November
  runs used `UV_NO_SYNC=true`. The 14 November runs used a normal `pnpm dev`.
- Screenshot tab strips show F-1 to F-11 and C-1 to C-11 because each run
  opens a new tab. That is test residue, not a product change.
- No participant has seen these changes. They make Sol's findings smaller but
  do not show that novices now understand inputs and outputs.

## Found While Working

Both existed on v0.7 before this branch. Both are now resolved here.

- The help icon beside the results button was also named "Clear results", so
  two neighbouring controls shared an accessible name. Fixed by change 6.
- token-frequency.md said the Cloud display limit defaults to 50, while the
  code used 25. Change 7 makes both 40.

## How To Test Each Change

Start the app from this branch as usual, for example with the Wordflow folder's
"Start Wordflow" task. Use any Project with a text column. Each change can be
judged on its own.

1. **Open Data Block offered in an empty inputs panel.** Open a Data Block in
   the Data Editor, then open a new Frequency or Concordance tab. The empty
   inputs panel should name that Data Block and offer **Add** with its name.
   Click it and check the panel fills as **Add Data Block** would. In
   Annotation, check the Codebook and Example panels don't offer it.
2. **Clear labels.** In any analysis tool, the red button beside Run reads
   **Clear results**. The inputs heading reads **Remove all**. In Frequency,
   type in **Filter tokens**: its button reads **Clear filter**. Check each
   still does what it did before.
3. **Add to Project summary.** Run Concordance, then open **Add to Project**
   from Table view and from Dispersion view. Do the same in Quotation. The
   first line should say what one row will be: a match, a document with a
   match, or a quotation.
4. **Concordance context inputs.** With VoiceOver, or the Safari accessibility
   inspector, the Left and Right context inputs should be announced by their
   labels. Narrow the Concordance pane: they stack only when it's very narrow.
5. **Frequency settings row.** Run Frequency on a laptop-sized window. Stop
   words and both display limits should take one row, wrapping when narrow.
   Try **Edit list** and **Hide list**. Switch the filter on with an empty list
   and check the list opens. With words in the list and the list closed, check
   the "Hidden words:" line. Right-click a word in the cloud and check it's
   added. Try it maximised as well.
6. **Run row help.** In each analysis tool, the row with Run should end with
   one help icon after **Clear results**, and it should open that tool's Run
   step. In Annotation, check both Manual (**Start**) and AI.
7. **Cloud display limit.** Run Frequency in a new tab. The Cloud and List
   display limits should both show 40.

Things worth deciding while testing:

- Whether "Hidden words:" with up to eight words is enough, or the full list
  should stay open once it has words.
- Whether the open-Data-Block offer is helpful, or noisy when you deliberately
  inspect one Data Block while analysing another.

## Merge Notes

Each change is independent and can be kept or dropped on its own.

Don't merge this branch into v0.7 as a whole: it also carries this review
folder and about 9 MB of screenshots. Instead, start a branch from v0.7 and
apply only the kept changes. Take the diff against `6ba93a78`, the v0.7 commit
merged here, so later v0.7 work in the same files is kept:

```
git switch -c fix/v0.7-ui-trial-keep v0.7
git diff 6ba93a78 research/v0.7-ui-astra-handoff -- <files of the kept changes> | git apply --3way
```

Include the matching tests and Help pages from the table below.

| Change | Main files | Ledger area if kept |
|---|---|---|
| 1. Open Data Block offered in an empty inputs panel | `NodeInputsPanel.tsx`, `AnnotationFeature.tsx`, ui.md | Data Block actions |
| 2. Clear labels | `AnalysisCardLayout.tsx`, `ConcordanceParameterPanel.tsx`, `NodeInputsPanel.tsx`, `TokenFrequencyTokenFilterCard.tsx`, eight Help pages | Wording across the app; also add to "Label changes that replace earlier entries" |
| 3. Add to Project summary | `ResultAddToWorkspaceDialog.tsx`, `QuotationFeature.tsx`, `guidance/registry.ts`, concordance.md, quotation.md | Concordance and Quotation |
| 4. Context input names | `ConcordanceParameterPanel.tsx` | Concordance |
| 5. Frequency settings row | `TokenFrequencyResultsPanel.tsx`, `TokenFrequencyTokenFilterCard.tsx`, token-frequency.md | Frequency and Keyword Analysis |
| 6. Run row help | `AnalysisCardLayout.tsx`, `ConcordanceParameterPanel.tsx`, `AnnotationFeature.tsx`, `QuotationFeature.tsx`, `SequentialAnalysisFeature.tsx`, `TokenFrequencyParameterPanel.tsx`, `TopicModelingParameterPanel.tsx`, `bundledRegistry.ts`, six Help pages | Help and guidance |
| 7. Cloud default 40 | `domain/workspace/analysis.py`, `ldaca-wordflow.openapi.json`, `common/utils.ts`, token-frequency.md | Frequency and Keyword Analysis |

Changes 1, 2 and 6 share `AnalysisCardLayout.tsx`, `ConcordanceParameterPanel.tsx`
and `AnnotationFeature.tsx`. Applying one of those files brings all of its
changes. To keep only some, apply the file and remove the rest by hand.

For v0.8, carry over the behaviour rather than the markup: the open-Data-Block
offer and its role-panel opt-out, the three distinct labels, the row-unit line,
labelled context inputs, and a stop-word list that opens on request while
keeping hidden words visible.
