# Usability Changes Trialled On This Branch

Implemented by Claude on 2 November 2026 at the product owner's request,
following [Astra's plan](ASTRA-PLAN.md) and Claude's review of it.

**Status: trial on `research/v0.7-ui-astra-handoff` only.** These changes are
not recorded in GitHub Issues or in the
[v0.7 to v0.8 migration instructions](../../releases/v0.7-to-v0.8-migration-instructions.md).
When the product owner decides which to keep and merges them back to v0.7,
Claude creates the GitHub Issues and migration entries for the kept ones (asked
on 15 November), using the [merge notes](#merge-notes) below. Requests made
during testing are logged in [Requests while testing](#requests-while-testing).

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
| Product owner's requests while testing (15 November) | Implemented as changes 6 to 12 (requests R1 to R12) |

Changes 1 to 6 and 8 to 10 make no backend, API, saved-state or preference
changes. Each is presentation, wording or a client-side shortcut to an existing
action. Change 7 changes one backend default, recorded in the OpenAPI file.
Change 11 adds one backend route, recorded in the OpenAPI file; it changes no
saved Project format. Change 12 is frontend only.

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

### 8. Topic Modelling: clickable word clouds and a search that applies on request

Requests R3 and R9, built to the [agreed design](#agreed-design-for-r3-to-r8).

- A bubble's word cloud opens 0.15 seconds after the pointer rests on it and
  stays 0.3 seconds after it leaves, and for as long as the pointer is in the
  card. While it closes, other bubbles don't replace it; once closed, the
  bubble under the pointer opens. Holding Shift keeps it open. One
  chart-level controller, `useBubblePopup.ts`, owns this; it replaces the
  per-bubble `components/node-tooltip.tsx`, which nothing else used and which
  was removed.
- Left-click a word in the card: it is added to the start of the search box,
  or removed if it is already a term (`topicSearch.ts`, `toggleSearchWord`).
  Right-click: it goes to the start of the stop words and the switch turns on.
  Clicks in the card no longer reach the bubble, so they don't select the
  Topic or toggle its examples. The card says what the clicks do.
- The search box's text colours matches at once; the bubbles and the list are
  filtered by the search last applied with **Apply** (Wand2 icon) or Enter.
  Emptying the box clears the filter at once. Leaving the box does nothing.
  **Apply** is enabled only while the box differs from what is applied.
- A term keeps its colour until it is removed (`assignSearchTermSlots`).
- The usage tip is on the magnifier, and on the box while its text fits; when
  the terms overflow, hovering the box shows them all (R9).
- React Flow's Shift selection key is turned off, since Shift now keeps the
  card open; nothing in the chart used it.
- **Changed from the agreed design:** in the card, matches are coloured but no
  longer bold. Bold changes the words' widths, so the cloud was laid out again
  and the other words moved after every click, and a second click landed on
  the wrong word. Colour alone keeps every word in place (checked live). The
  Topic list keeps bold matches.

Screenshot: [card with the options below the chart](implementation/after-11-topic-card-options-below.png),
[the card close up](implementation/after-10-topic-word-card.png).

### 9. Topic Modelling: hidden-words line and Sort

Requests R3 and R8.

- Under the stop words control, while the list is in use: "Hidden words:" with
  the first eight words, newest first, and the count of the rest. It wraps
  rather than truncates, so the count stays readable beside the chart.
- With Display options folded, the summary reads "Stop words on (N)".
- The editing window has **Sort** beside the word count; it sorts the draft,
  and **Save** keeps it.
- Shared helpers in `common/utils/stopWords.ts`: `stopWordsPreview` (now also
  used by Frequency), `sortStopWords` (also used by Frequency's Sort) and
  `addStopWordFirst`.

### 10. Frequency: Sort on request, one display limit beside the view selector

Requests R4 to R7.

- **Sort** shows only while **Edit list** has the list open.
- The bordered box holds only the stop words: their row, then the opened list
  or the "Hidden words" line. The display limit moved to the row with **Filter
  tokens** and the **Cloud view / List view** selector, so an opened list sits
  between the stop words and the limit.
- Cloud view shows the Cloud display limit, List view the List display limit.
  The values stay linked as before. A limit's error shows under that row.
- The two **Apply** buttons are gone; each limit already applied on Enter and
  on leaving the box. The `isApplyingTokenLimit` prop went with them (the hook
  still tracks it).
- Help image `token_frequency/display_limits.png` was recaptured to match.

### 11. AI Code Designer

Request R10, built to the [agreed design](#agreed-design-for-r10-ai-code-designer).

- **Backend.** `POST /api/workspaces/{workspace_id}/nodes/{node_id}/codebook-draft`
  streams server-sent events: `stage` (sampling, waiting, reading), then one
  `draft` or `error`. FastAPI sends a keep-alive every 15 seconds while the
  model thinks, and closing the request (Stop) cancels the model call. The
  sample is drawn under a read lease, released before the model is called.
  `infrastructure/providers/codebook_designer.py` holds sampling, the answer
  format appended to the prompt, the strict JSON schema and answer reading
  (Other always last, named exactly; at most the maximum real classes;
  repeated and reserved names dropped). `AnnotationService.draft_codebook`
  runs it through the existing provider adapters and credential store, with
  plain error messages. The route's 404 and 422 are documented as JSON
  (`streaming_api_errors`).
- **The default system prompt** is `DEFAULT_CODEBOOK_DESIGNER_PROMPT` in
  `frontend/src/features/views/annotation/codebookDesigner.ts`: the prompt
  agreed on 15 November, without its last paragraph (the JSON answer format),
  which the server appends so an edited prompt can't break reading the answer.
- **Frontend.** The brief, maximum classes and button sit above Task context
  (`CodeDesignerBrief.tsx`). The designer window (`CodebookDesignerDialog.tsx`)
  has the disclaimer, its own provider and model (starting on the tab's), sample
  size and seed, thinking effort, and the Advanced prompt; while it runs it
  hides ×, ignores Esc and outside clicks, and shows the stage, a clock and,
  after 30 seconds, that slow is normal. The provider and model picker was
  split out of the AI settings as `AnnotationProviderModelPicker.tsx` with an
  id prefix, so both can be on screen. `DialogContent` gained `hideCloseButton`.
- **Unsaved changes are kept** per tab and codebook in a session store
  (`codebookDraftStore.ts`): closing the Edit window keeps them, the Codes card
  says so, and Cancel asks before discarding. This applies to typed changes
  too, not only AI drafts.
- **Brief lock.** The designer's state is one tab setting,
  `annotation.codeDesigner`, on this device like the tab's other settings.
  Saving codes that differ from the designed ones sets `briefStale`; editing
  the brief clears it. Saving the AI draft unchanged doesn't lock it.
- **xhigh** thinking effort was not added: Wordflow's provider adapters know
  low, medium and high only.
- After testing (15 November): the "AI draft, not saved" / "Unsaved changes"
  badge is orange (the theme's orange as border, icon and tint), so it stands
  out. With no AI provider set up, the designer's provider list offers **Add
  provider**, as in the AI section; checked live in WebKit and Chromium, the
  new provider is selected and a draft follows.

Screenshots: [Edit window with the AI draft](implementation/after-14-ai-draft.png),
[designer window with Advanced](implementation/after-12-designer-window.png),
[running](implementation/after-13-designer-running.png),
[greyed brief](implementation/after-15-brief-stale.png),
[overwrite warning](implementation/after-16-overwrite-warning.png).

### 12. Drag a Data Block from the Project Graph or the sidebar onto a tool

Requests R11 (the graph) and R12 (the sidebar's Data Blocks list). People kept
trying to drag a Data Block to a tool, and touch screens teach it.

- A drag that starts on a graph Data Block carries it: past 6 pixels a small
  label follows the pointer, naming the Data Block and where a release would
  put it. The Data Block itself stays where the layout put it, as decided in
  October.
- The graph pans only when the drag starts on its background. Data Block
  cards have React Flow's `nopan` class and `touch-action: none`.
- Every inputs box (`NodeInputsPanel`) is a drop target and is highlighted
  while a drag is under way, more strongly under the pointer. Releasing on a
  box adds the Data Block as its next block, like **Add Data Block**. A full
  or locked box says why and refuses it.
- Released elsewhere on the tool: a tool with one box takes it; a tool with
  several asks for one of the highlighted boxes. Released anywhere else, or
  on Esc, the drag is cancelled.
- **Agreed with the product owner:** a drop never chooses a position among the
  blocks already in a box. No way of adding does, and a box has no reordering
  today; if order matters, reordering inside the box would be its own change.
- A click still selects, a double-click still adds, and the hover **+** still
  carries. The click that ends a drag is swallowed, so the block isn't also
  selected.
- Code: `stores/dataBlockDragStore.ts` (the gesture, the target registry and
  the drag state), `components/layout/DataBlockDragLayer.tsx` (the label),
  `NodeInputsPanel.tsx` (target and highlight), `CustomNode.tsx` (source),
  `WorkspaceShell.tsx` (the label's mount and the tool zone). It is separate
  from the carried stack: a drag leaves nothing pending.
- **From the sidebar list (R12):** a row in the Data Blocks list starts the
  same drag (`WorkspaceNodeList.tsx`). The list scrolls, so rows keep vertical
  touch scrolling (`touch-action: pan-y`): on a touch screen a sideways drag
  carries the Data Block and an up or down swipe scrolls. A click still
  toggles selection, and the row's hover buttons keep their own presses.
- Not covered: dragging several selected Data Blocks at once, and dropping on
  the Data Editor.

Screenshots: [dragging onto Frequency](implementation/after-17-drag-onto-frequency.png),
[Annotation's boxes](implementation/after-18-drag-annotation-boxes.png).

### Help pages

The Help pages, which are the documentation source of truth, were updated to
match the new labels. Pages changed: ui, token-frequency, concordance,
quotation, annotation, sequential-analysis, topic-modeling, preprocessing and
export.

- ui.md now explains that opening a Data Block is not adding it to a tool.
- token-frequency.md describes the settings row and Edit list.
- The section title "How Preview, Run and Clear work" and its link anchor were
  kept, so existing links still work.

## Requests While Testing

The product owner's requests during testing, in order, so that issues and
migration entries can be written from them later.

| # | Date | Request | State |
|---|---|---|---|
| R1 | 15 Nov 2026 | Every analysis tool's Run row should have a help icon. One icon for the whole row, pointing to the Run section of Help, is preferred over one per button. Topic Modelling and Annotation had none. | Done, change 6 |
| R2 | 15 Nov 2026 | Frequency's Cloud display limit should default to 40, in the interface and the Help. | Done, change 7 |
| R3 | 15 Nov 2026 | Topic Modelling display options: show the stop-word list like Frequency does, with a line giving the first eight words and the count. In the bubbles' pop-up word clouds: right-click a word to add it as a stop word; left-click a word to add it to the search terms, colouring it at once in every cloud, and click a coloured word again to remove it (exact terms only; typed wildcards stay). Filtering the bubbles waits for a new **Apply** button or Enter in the search box, not for leaving the box. The pop-up must stay open long enough for the pointer to reach it. | Done, changes 8 and 9 |
| R4 | 15 Nov 2026 | Frequency: hide **Sort** until **Edit list** has opened the full stop-word list. | Done, change 10 |
| R5 | 15 Nov 2026 | Frequency: the display limits go on their own line below the stop words, so an opened stop-word list sits between the two lines and pushes the limits down. | Done, change 10 |
| R6 | 15 Nov 2026 | Frequency: remove the two **Apply** buttons; a limit takes effect on Enter or on leaving the box. | Done, change 10 |
| R7 | 15 Nov 2026 | Frequency: show only the Cloud display limit in Cloud view and only the List display limit in List view. The link between the two values does not change. | Done, change 10 |
| R8 | 15 Nov 2026 | Topic Modelling: add a **Sort** button to the stop-word editing window, working like Frequency's. | Done, change 9 |
| R9 | 15 Nov 2026 | Topic Modelling search box: show the usage tooltip only on the magnifier icon, or on the box when it is empty or its text fits. When the terms overflow the box, hovering the text shows the full list instead. | Done, change 8 |
| R10 | 15 Nov 2026 | Annotation "Code designer": let the AI draft a first codebook from a sample of the real data and a short description of the coding aim (no more than 250 words, entered above Task context, which is optional extra background). The user sets a maximum number of classes (default 3), plus an "Other" class; the draft may have fewer. Definitions under 60 words, readable, and never containing real text from the data. Only for a new or empty codebook; regenerating warns before overwriting. Reasoning on. One pass, no evaluation rounds. Sample by default 10% or capped at 100 (to be settled). The hard-coded system prompt and the sampling options show only under an advanced toggle in the codebook window. R1 to R9 tested by the product owner on 15 November: all work as designed. | Done, change 11 |
| R11 | 15 Nov 2026 | Drag a Data Block from the Project Graph straight onto a tool to add it, as people keep trying to do (and as touch screens teach). Dragging on a Data Block drags it; the graph pans only when the drag starts on the background. Design point raised by the product owner: where a drag ends when a tool takes several Data Blocks. R10 tested by the product owner with the Apollo Qwen model: works, better than expected. | Done, change 12 |
| R12 | 15 Nov 2026 | Enable the same dragging from the sidebar's Data Blocks list. R11 tested by the product owner: works as expected. | Done, change 12 |

### Agreed Design For R3 To R8

Agreed with the product owner on 15 November 2026, question by question. Built
the same day as changes 8 to 10, with one change noted under change 8 (matches
in the card are coloured, not bold).

**Pop-up word cloud on a bubble (R3)**

- Opens about 0.15 seconds after the pointer settles on a bubble, so sweeping
  across bubbles doesn't cover the one being aimed at.
- Stays about 0.3 seconds after the pointer leaves the bubble, and for as long
  as the pointer is inside the pop-up. During that time, passing over another
  bubble doesn't swap it.
- Holding Shift keeps the current pop-up open.
- While the pointer is inside a pop-up, bubbles under it can't be hovered. This
  cost was accepted.
- Lasso mode and faded bubbles are unchanged: no clickable pop-up.
- Word clicks work only in these pop-up clouds, not in the Topic list, whose
  cards are selected as a whole.

**Word clicks in the pop-up cloud (R3)**

- Right-click a word: it's added to the front of the stop-word list, and the
  stop words switch turns on if it was off, as in Frequency.
- Left-click a word: that exact word is added to the front of the search box
  as a term, or removed if it's already a term. A clicked word behaves like the
  same word typed, so it also matches inside longer words. Clicking a word that
  is lit only by another term adds it as its own term. Wildcard terms are never
  removed by a click. No new search rules.

**Search term box (R3)**

- The box's text is the one list of terms. Highlighting follows the box at
  once, for typed and clicked terms, in every pop-up cloud and the Topic list.
- Filtering (fading bubbles, narrowing the Topic list) follows the terms as
  they were at the last **Apply** or Enter. Leaving the box does nothing.
  Apply is enabled only when the box differs from what is applied.
- An empty box clears the filter at once, however it became empty.
- A term keeps its colour until it's removed. A new term takes the first colour
  not in use. Editing a term in place keeps its colour. The downloaded HTML
  keeps its own simpler box and colours by position; the difference is accepted.

**Search box tooltip (R9)**

- The usage tooltip ("Words or parts of words…") shows on the magnifier icon,
  and on the box when it is empty or its text fits.
- When the terms are wider than the box, hovering the text shows the full list
  of terms instead.

**Stop words in Topic Modelling's Display options (R3, R8)**

- A "Hidden words:" line under the stop words control: the first eight words,
  then the count of the rest. Shown only while the switch is on and the list
  has words. Newest words come first.
- With the options folded, the summary reads "Stop words on" with the count.
- Editing stays in the existing window, which gains a **Sort** button that
  works like Frequency's.

**Frequency display settings (R4 to R7)**

- **Sort** shows only while the full list is open.
- The stop words are the first line. The opened list or the "Hidden words" line
  comes next. The display limit follows below.
- No Apply buttons. The limits already take effect on Enter and on leaving the
  box.
- The one limit shown sits on the row with **Filter tokens** and the **Cloud
  view / List view** selector (agreed 15 November).
- Cloud view shows only the Cloud display limit; List view shows only the List
  display limit. The values stay linked as before.

### Agreed Design For R10: AI Code Designer

Agreed with the product owner on 15 November 2026, question by question.

**Principle.** The designer is a kick-off assistant. The user does the
thinking and checking: the model's compliance is out of Wordflow's control, so
the window says so, and there is no automatic check of the definitions.

**In the Edit codebook window**

- An optional **Brief** above Task context: what the coding is for, up to 250
  words. Beside it, **Maximum classes**: default 3, range 2 to 10, not counting
  Other.
- An **AI Code Designer** button, available in Manual mode too. It needs a
  brief, an Annotation Data Block and its text column.
- The brief and maximum are kept with the Annotation tab, not in the codebook,
  and are never sent with annotation requests.
- Unsaved changes in the window, from the designer or typed by hand, stay with
  the tab until **Save** or a confirmed discard. Closing the window (×, Esc,
  clicking outside) keeps them; **Cancel** asks first. They last while the tab
  is open in this session; a reload loses them.
- After the codes are changed by hand and saved, the brief greys out and the
  button locks. The brief can still be selected and copied, and editing it
  unlocks the button. Saving an untouched AI draft doesn't lock it.

**Starting a design**

- If the codebook already has codes, a separate warning comes first, with
  **Cancel** and **Continue**: the codes will be overwritten; consider a fresh
  codebook.
- Then the designer window, always shown: a disclaimer (texts are sent to the
  provider; review every code; check definitions hold no real text or names; a
  stronger reasoning model gives a better draft), provider and model (starting
  on the tab's choice), sample size (100, range 20 to 300), sample seed, and
  thinking effort (None, Low, Medium, High; default High).
- An **Advanced** toggle at its top right shows the system prompt, editable,
  with a way back to the default.
- Sampling: random non-empty, distinct texts from the tab's Annotation Data
  Block and text column, each cut to its first 150 words.

**While it runs**

- The window is locked until it finishes: Esc, × and clicking outside do
  nothing; **Stop** cancels.
- Progress: the stage (sampling, waiting for the model, reading the answer),
  a running clock, a reassurance after 30 seconds that thinking and local
  models can take minutes, and a message at once if the connection drops.

**The result**

- Up to the maximum of real classes, then an ordinary, editable code named
  **Other** with a task-specific definition. Names of one to three words;
  definitions under 60 words, in the brief's language. These are prompt rules.
- The draft fills the Edit codebook window unsaved; **Save** writes it as one
  edit (Undo works). Task context is never written by the designer.
- On failure, the provider's message shows and the settings are kept; no
  automatic retry.
- The system prompt is hard-coded with the designer and listed in this record.

## Not Changed, And Why

- **Sidebar labels.** Claude's review proposed aligning "Loader" with "Data
  Loader". The short sidebar names were an agreed #205 decision with their own
  tests (V07-101), so they were left as they are.
- **The parameters/results split.** V07-089 built it deliberately. The space
  problem was the controls inside the results card, so only those moved.
- **Help screenshots.** Images that show the old labels or layout were not
  recaptured, except `display_limits.png` (change 10). Candidates are
  `token_frequency/stop_words.png` and `filter_tokens.png`, Topic Modelling's
  `result_settings.png` and `bubble_hover.png`, plus any image showing a Run
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
| Full frontend check after changes 8 to 10 | Passed: 376 test files with 2,031 tests, unused code, build, Help |
| Full frontend check after change 12 | Passed: 379 test files with 2,049 tests, unused code, build, theme, Help |
| Drag from the sidebar list, [script](implementation/live-check-drag-sidebar.mjs) | 6 of 6 in WebKit and Chromium with a mouse: the label names the block and box, release on the box adds, the dragged row is not selected, release elsewhere on a one-box tool adds, release on the sidebar adds nothing, a plain click still selects. Full frontend check: 2,050 tests pass |
| Drag from the graph, [script](implementation/live-check-drag.mjs) | 16 of 16 in WebKit and Chromium with a mouse, no page errors or API errors: the label follows and names the box, the box highlights, release adds the block, the graph does not pan, the label and highlight go away, release elsewhere on a one-box tool adds, a full box says so and keeps its two, the background still pans, Esc cancels, a plain click still selects, double-click still adds, Annotation asks for a box and highlights several, release between boxes adds nothing, release on Codebook adds there only. Not tried on a real touch screen |
| Full frontend check after change 11 | Passed: 378 test files with 2,042 tests, unused code, build, Help with 81 icon references |
| Full backend tests after change 11 | 1,561 passed, 2 skipped (stress and soak tests) |
| AI Code Designer, [script](implementation/live-check-designer.mjs) with [a stand-in model server](implementation/fake-llm-server.py) | 22 of 22 in WebKit and Chromium, no page errors or API errors: waits for a brief, word count, disclaimer, defaults (100, 0, High), prompt only under Advanced, stage names the model and texts sent, no × and Esc or outside clicks ignored while running, clock runs, 30-second note, draft fills the window marked unsaved, Task context untouched, closing keeps the draft, Save, untouched AI save leaves the brief usable, hand edit greys it, editing unlocks it, overwrite warning first, Stop returns to the form with the codes unchanged. The stand-in server logged the request: the default prompt plus the answer format with the maximum, the brief and Task context, 100 of 400 texts, thinking effort high, and the strict schema |
| Changes 8 to 10, [script](implementation/live-check-r3.mjs) | 31 of 31 in WebKit and Chromium, no page errors or API errors. Frequency: Sort, limit row and view switch, Enter applies. Topic Modelling on a 400-row themed corpus (7 topics): card opens after the pause, stays with the pointer in it, word click adds then removes a term without selecting the Topic, other words stay in place, right-click adds a stop word first and turns the switch on without toggling examples, closes after leaving, Shift holds it, typing doesn't filter and Enter does, emptying clears, tooltip rules, Sort in the window |

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

The first two existed on v0.7 before this branch and are resolved here. The
others were found while checking changes 8 and 11 and are not fixed.

- The help icon beside the results button was also named "Clear results", so
  two neighbouring controls shared an accessible name. Fixed by change 6.
- token-frequency.md said the Cloud display limit defaults to 50, while the
  code used 25. Change 7 makes both 40.
- **The word cloud card is clipped by the chart's frame.** It is drawn inside
  the chart, so with the Display options beside a narrow chart (about 420 px
  at 1440 wide with the Project panel open) its top and right edge are cut
  off. This was already so on v0.7; it matters more now that words are
  clicked. With the options below the chart, the card fits. A fix would draw
  the card outside the chart, or keep it within the chart's bounds.
- **In WebKit, a click near the bottom of a word can hit the word below.** In
  tightly packed clouds, WebKit's hit areas for neighbouring words overlap by
  up to about 19 px, though the letters don't (seen with *school* above
  *teacher*). Clicking the middle of the letters works. Chromium is not
  affected. It comes from the shared word cloud's layout, so Frequency's
  right-click has it too, and the desktop app uses WebKit. Possible fix:
  a little more spacing between words in the shared cloud.
- **An analysis tab forgets its Data Blocks when you switch tool before it
  has run.** A tab's input choices live in the tool's on-screen state until a
  Preview or Run is sent, and leaving the tool drops them (this is v0.7's
  behaviour). For Annotation this means a new tab loses its Annotation Data
  Block and Codebook on a tool switch. The AI Code Designer's unsaved draft is
  kept separately, per tab and codebook, so it is not lost with them.
- **Model requests stop after five minutes.** Every provider request has a
  300-second limit (`INFERENCE_TIMEOUT_SECONDS`). A slow local model thinking
  hard could reach it; the designer then shows the provider's timeout message.
  The limit could be raised for the designer only if this proves a problem.

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
8. **Topic word clouds and search.** Run Topic Modelling on a corpus with
   several topics. Sweep the pointer across bubbles: no card should pop up
   until it rests. Move from a bubble into its card and click words: each is
   added to the start of the search box and coloured in every card and the
   list, and the other words stay put; click again to remove. Check the
   bubbles fade only on **Apply** or Enter, and that clearing the box
   un-fades them. Right-click a word: it should appear first in "Hidden
   words". Hold Shift and move away: the card should stay. Type more terms
   than fit and hover the box.
9. **Topic stop words.** With stop words on, check the "Hidden words" line,
   the folded summary's count, and **Sort** in the editing window.
10. **Frequency limits.** Check **Sort** appears only with the list open, the
    limit sits beside the view selector and swaps with the view, an opened
    list pushes the limit row down, and Enter or clicking away applies a limit.
11. **AI Code Designer.** In an Annotation tab with a Data Block and text
    column, choose **Create new** for an empty Codebook and open **Edit**.
    Write a brief and choose **AI Code Designer**. Check the disclaimer, try
    **Advanced**, pick a strong model and design. While it runs, check Esc
    and clicking outside do nothing, and try **Stop** once. Review the draft,
    close the window and reopen it (the draft stays), then **Save**. Change a
    code by hand, save, and check the brief greys out until you edit it.
    Design again on a codebook with codes: the warning comes first. Also type
    a code by hand, press Esc, and check it's still there.
12. **Drag from the graph.** Drag a Data Block from the Project Graph onto
    Frequency's Data Blocks box, then a second, then a third (refused: full).
    Check the graph pans only when you drag its background. In Annotation,
    drop one on **Codebook** and one between the boxes. Press Esc mid-drag.
    Check a click still selects and a double-click still adds. Do the same
    from the sidebar's Data Blocks list, and on a touch screen check the list
    still scrolls with an up or down swipe.

Things worth deciding while testing:

- Whether "Hidden words:" with up to eight words is enough, or the full list
  should stay open once it has words.
- Whether the open-Data-Block offer is helpful, or noisy when you deliberately
  inspect one Data Block while analysing another.
- The card's timings (0.15 seconds to open, 0.3 to close) are first guesses.
  They are constants in `useBubblePopup.ts`.
- Whether coloured-not-bold matches in the card are clear enough.
- How good the designer's drafts are with your models, and whether the
  default prompt needs tuning. It is in `codebookDesigner.ts` and editable
  under Advanced.
- Whether 100 texts is the right default sample.
- How dragging feels on a trackpad and on a touch screen, which the checks
  did not cover, and whether 6 pixels is the right start distance.

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
| 8. Topic word clouds and search | `useBubblePopup.ts` (new), `topicSearch.ts` (new), `TopicModelingFlowChart.tsx`, `components/node-tooltip.tsx` (removed), `useTopicModelingResultControls.ts`, `topicModelingAdapters.ts`, `topicModelingGraph.ts`, `TopicSelectionPanel.tsx`, `TopicModelingBubbleChartSection.tsx`, `TopicModelingResultsPanel.tsx`, `TopicModelingFeature.tsx`, topic-modeling.md | Topic Modelling |
| 9. Topic stop words | `TopicModelingStopWordsControl.tsx`, `TopicModelingResultsPanel.tsx`, `common/utils/stopWords.ts`, topic-modeling.md | Topic Modelling |
| 10. Frequency limits | `TokenFrequencyResultsPanel.tsx`, `TokenFrequencyFeature.tsx`, `useTokenFrequencyPreferences.ts`, `common/utils/stopWords.ts`, token-frequency.md, `display_limits.png` | Frequency and Keyword Analysis |
| 12. Drag from the graph | `stores/dataBlockDragStore.ts`, `components/layout/DataBlockDragLayer.tsx` (both new), `NodeInputsPanel.tsx`, `CustomNode.tsx`, `WorkspaceNodeList.tsx`, `WorkspaceShell.tsx`, ui.md | Data Block actions |
| 11. AI Code Designer | Backend: `codebook_designer.py` (new), `services/annotations.py`, `models/annotations.py`, `api/workspaces/nodes.py`, `api/responses.py`, `runtime.py`, the OpenAPI file and the generated client, `test_current_api_surface.py`. Frontend: `codebookDesigner.ts`, `codebookDraftStore.ts`, `CodeDesignerBrief.tsx`, `CodebookDesignerDialog.tsx`, `AnnotationProviderModelPicker.tsx` (all new), `AnnotationClassDescriptionsEditor.tsx`, `AnnotationAiSettings.tsx`, `AnnotationFeature.tsx`, `providerCredentialRequests.ts`, `components/ui/dialog.tsx`, `bundledRegistry.ts`, annotation.md | Annotation |

Changes 1, 2 and 6 share `AnalysisCardLayout.tsx`, `ConcordanceParameterPanel.tsx`
and `AnnotationFeature.tsx`. Changes 5 and 10 share `TokenFrequencyResultsPanel.tsx`
(10 builds on 5), changes 8 and 9 share `TopicModelingResultsPanel.tsx`, and
changes 9 and 10 share `common/utils/stopWords.ts`, and changes 1, 6 and 11
share `AnnotationFeature.tsx`, and changes 1, 2 and 12 share
`NodeInputsPanel.tsx`. Applying one of those files
brings all of its changes. To keep only some, apply the file and remove the
rest by hand.

For v0.8, carry over the behaviour rather than the markup: the open-Data-Block
offer and its role-panel opt-out, the three distinct labels, the row-unit line,
labelled context inputs, and a stop-word list that opens on request while
keeping hidden words visible.
