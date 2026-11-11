# Basic and Advanced tool modes, and maximised results: design

Prepared on 11 November 2026 for Chao Sun, after his discussion with Monika.
**Status: accepted by Chao on 11 November 2026, with the changes recorded
under [Decisions](#decisions-11-november-2026); Topic Modelling's table is
still to be confirmed.** The build order and file-level steps are in
[PLAN.md](PLAN.md).

Branch: `research/v0.7-trends-normalisation` (from `v0.7`, release 0.7.19, plus
the Trends reference work and the Topic Modelling fix V07-373).

## Why

Two requests came out of the Trends normalisation work.

1. **Wordflow asks too much at once.** Normalising Trends against a reference
   Data Block is right for corpus linguists, but it adds a picker, a column, a
   tokeniser, a warning and a suggestion to a tool that most people use to
   count rows per period. Chao and Monika agreed it belongs in an **Advanced**
   mode that people turn on; otherwise the tool works in a **Basic** mode. The
   same split should ease other tools that suffer from the same problem.
2. **Reading results needs room.** On a small screen, people spend a long time
   reading Topic Modelling (bubble chart, display options, topic lists,
   passages), Concordance and Annotation tables, and the Data Editor. Monika
   asked to maximise the result to the whole window and shrink it back. To keep
   one behaviour, every tool's output and the Data Editor get the same control.

Neither is the task-focused redesign proposed on `research/v0.7-ui-astra-handoff`
(not accepted as a whole). Both are small, reversible, and keep every existing
control reachable.

## Part A. Basic and Advanced modes

### What people see

A tool that has advanced settings shows one switch, **Advanced**, at the right
end of its parameters card header. Off is Basic.

```text
Basic (default)                              Advanced on
+------------------------------------------+ +------------------------------------------+
| Trends Analysis (i)(?)        Advanced o | | Trends Analysis (i)(?)        Advanced * |
|                                          | |                                          |
| Data Blocks (1/1)                        | | Data Blocks (1/1)                        |
| Time, number or category column          | | Time, number or category column          |
| Period                                   | | Period                                   |
| Group By Columns (Optional, max 3)       | | Group By Columns (Optional, max 3)       |
|                                          | |                                          |
|                                          | | -- Advanced settings ------------------- |
|                                          | | Normalise against (optional)             |
|                                          | | Count words in      Tokeniser model      |
|                                          | |                                          |
| [Run] [Clear]                            | | [Run] [Clear]                            |
+------------------------------------------+ +------------------------------------------+
```

- Advanced settings sit together at the end of the card, under a quiet
  **Advanced settings** rule, so it is plain which settings the switch added.
  A setting that must stay beside its Data Block (Topic Modelling's
  **Sampling**) appears in place.
- A tool with no advanced settings shows no switch. Nothing changes there.
- The switch is not a preference in Settings and not a different interface:
  the tool, its results and its Help are the same in both modes.

### The rule that keeps Basic honest

**Basic never hides a setting that is still affecting the run.** In Basic, the
request the tool sends uses the default for every advanced setting, whatever
the hidden draft holds. So:

- Turning Advanced off does not delete anything. The advanced values stay in
  the draft, are not sent, and come back when Advanced is turned on again.
- If the result on screen was run with advanced settings and the switch goes
  off, the parameters now differ from that run, so **Run** becomes available
  exactly as it does for any other changed parameter. The result stays until
  it is run again or cleared.
- Results always show what the run produced. A Trends result that has a
  reference still offers **Per million words** under **Show as** in Basic.

Three more rules follow from it:

1. **Where data goes stays visible.** A setting that decides whether text
   leaves the computer (Annotation's Provider and Model, Topic Modelling's
   **Remote GPU**) is never an advanced setting.
2. **An action that sets an advanced value turns Advanced on.** Annotation's
   **Use as example** from the results is one; a Suggestion's Apply is another.
3. **A Suggestion that points at an advanced setting says so.** In Basic its
   card offers **Show advanced settings**, which turns the switch on; the
   outline then lands on the setting.

### Where the choice is kept

| What | Where | Why |
|---|---|---|
| A tab's mode | Tab setting `tool.advanced` (`'true'` or `'false'`), through `host.setSetting` | Tab settings are kept on this device per account, Project and tab (`analysisTabsPresentationStore`), like `sequential.chartType`. No backend change. |
| The mode a new tab starts in | `localStorage` `ldaca.toolMode.<viewId>`, the last choice made in that tool on this device | Someone who works in Advanced should not turn it on for every new tab. |
| A tab with no stored mode whose last run used an advanced setting | Opens in Advanced | A Project opened on another device shows what its runs used. |

Not an account preference: `preferences.toml` is read strictly, and a new
field makes 0.7.15 and earlier reject the file after a rollback
(`backend/src/ldaca_wordflow/models/user_preferences.py`).

### Which settings are advanced

A setting is Basic when a first, correct run needs it, when it has no safe
default, or when it decides where text is processed. It is Advanced when it
has a default that gives a correct result untouched and most people never
change it.

**Trends (phase A1, agreed).**

| Basic | Advanced |
|---|---|
| Data Block, time column, Period (and Every, unit), Start and Step, Group By | Normalise against, Count words in, Tokeniser model |

In Basic the tool is the 0.7.19 Trends plus the renamed **Show as** list (**Row
count**, **Composition**). The parent Data Block is offered as the reference
when Advanced is turned on, not before, so Basic sends no reference.

**Topic Modelling (proposed, not yet confirmed, not built).**

| Basic | Advanced |
|---|---|
| Data Blocks, Text column, Colour | Sampling (per Data Block) |
| Model (chosen automatically, and wrong for other languages) | Passages |
| Topic size, Min and Max (the settings most results need) | Max tokens |
| Remote GPU and its server (where text is processed) | Seed |
| | Topic sampling, Passages to sample |

Four Suggestions point at advanced settings here (`topic-large-input`,
`topic-slow-start`, `topic-segment-length`, and the sampling half of
`topic-large-input`). They get **Show advanced settings**. The
`topic-modeling.run` hint copy mentions passages, sampling and the seed and
needs rewording with a version bump.

**Annotation (agreed).**

Annotation already folds Prompt, Temperature, Thinking and the run controls
under a local **Advanced settings** fold that forgets its state. The switch
replaces that fold, so one control means the same thing in every tool.

| Basic | Advanced |
|---|---|
| Annotation Data Block, Text column, Annotation column | Example Data Block and its three sampling settings |
| Codebook (Data Block, columns, Edit) | Prompt |
| Mode (Manual or AI) | Temperature, Thinking, Thinking effort |
| Provider, Model (where text is sent) | Which rows to annotate, Rows per request, Requests at once, Retries |

`AnnotationSavedLabelsNotice` already tells people to look in Advanced
settings, and keeps its own control for **Which rows to annotate**. The
`annotation.ai.advanced` hint is reached when the switch turns on in AI mode.

**Concordance (agreed, as changed by Chao).**

| Basic | Advanced |
|---|---|
| Data Blocks, Text column, Colour | Search mode (Text or Tokens) and the Tokeniser model |
| Search word or phrase | Ignore punctuation |
| Left context, Right context | In the results: **Separated** or **Combined** (two Data Blocks) |
| Case sensitive, Whole word, **Regular expression** | |

Basic searches in Text mode only and keeps the results of two Data Blocks
separated. **Use regular expression** is shortened to **Regular expression**.
Separated or Combined is the one result control that follows the switch: it
changes how the same matches are laid out, not what was run.

**No switch for now.** Frequency (Data Blocks, column, tokeniser, colour,
Study corpus), Quotation, Data Builder, Loader and Export have few settings or
are not analysis tabs.

### How it is built

- `features/views/common/toolMode/`: `useToolMode` (reads and writes the tab
  setting and the device default, and takes "the last run used an advanced
  setting"), `ToolModeContext`, `AdvancedSwitch`, `AdvancedSection`.
- `AnalysisCardLayout` and `AnalysisFeatureHeader` gain a `headerAction` slot
  for the switch.
- Each tool owns one pure function, `basicParams(draft)`, that returns the
  draft with every advanced field at its default. The feature builds its
  request from `advanced ? draft : basicParams(draft)`. This is the only place
  the rule above is enforced, and it is unit-tested per tool.
- `NudgeDefinition` gains `advanced?: true`; `NudgeCard` reads
  `ToolModeContext` and offers **Show advanced settings** when it applies.

## Part B. Maximised results

### What people see

**Analysis tools.** The bar between the parameters and the results already
exists in every tool, in one shared component, and shows only when there are
results. It gains a **Maximise results** button beside its help icon.

```text
Normal layout                                  Maximised
+----+----------------------+----------------+ +---------------------------------------------+
| S  | T-1  T-2  +          | Project Graph  | | (window title bar, back/forward, settings)  |
| i  | Parameters card      |                | +---------------------------------------------+
| d  |                      |                | | Topic Modelling - T-2      [ Restore layout ]|
| e  | ====== handle [?][^] +----------------+ |                                             |
| b  | Results              | Data Editor    | | Results fill the window                     |
| a  |                      |                | |                                             |
| r  |                      |                | |                                             |
+----+----------------------+----------------+ +---------------------------------------------+
```

Maximising hides the sidebar, the Project Graph and Data Editor column, the
analysis tab strip and the parameters. The results pane keeps its content,
scroll position, selections and chart state, because nothing is moved or
remounted. A slim bar names the tool and tab and holds **Restore layout**.
**Esc** restores too.

**Data Editor.** The same button sits at the right end of the Data Editor
title row, before the list of tabs. Maximising hides the sidebar, the analysis
tool and the Project Graph, and the table takes the window. A column tool
(Find & replace, Add column and so on) normally takes the Project Graph's
place; while maximised it opens above the table instead, so its preview stays
beside its form.

### Decisions

| Question | Decision | Reason |
|---|---|---|
| Overlay or layout state? | **Layout state.** One store, `useLayoutFocusStore`, with `maximised: 'analysis' \| 'data-editor' \| null`; the shell hides the other regions with `display: none`. | A portal would remount charts, tables and selections. The hidden regions stay mounted, so parameter drafts and the graph survive. The window title bar and its drag region are untouched. |
| Whole results pane or one result? | The whole pane. | One behaviour for every tool. Each result keeps its own resize grip inside. |
| Where is the button? | The parameters and results bar (analysis tools); the Data Editor title row. | Result headers differ per tool (three kinds). These two rows exist in one place each. |
| Remembered across a reload? | No. | Nobody reopens Wordflow into a view with no navigation. |
| Resizable panes and remembered sizes | Unchanged. Every grip and divider works as before while maximised, and every size or ratio set by hand (parameters and results, the Project column, graph and Data Editor, each result) is the same after restoring. | Chao: one behaviour, nothing to relearn. |
| When does it restore by itself? | When the view changes (sidebar, back and forward, a handoff to another tool), the Project changes, the results are cleared, or the Data Editor has no Data Block. | The control that restores must never be the only way out. |
| The right panel's own collapse | Unchanged and independent. Maximise does not use it. | Collapse unmounts the graph and Data Editor; maximise must not. |
| Suggestions that point at a hidden setting | The card offers **Show settings**, which restores the layout. | Same idea as **Show advanced settings**. |
| Contextual Hints | Paused while their target is hidden. | A hint must not point at nothing. |
| Data Builder preview, Loader, Export | Not in this change. | They are not split layouts; the Data Builder preview can follow with the same store. |

**Esc** restores only when nothing else wants it: not while a dialog, menu or
popover is open (Radix marks the event handled), and not while typing in a
field.

### How it is built

- `stores/layoutFocusStore.ts`: the state above, `maximise(surface)`,
  `restore()`. Not persisted.
- `WorkspaceShell`: hides the sidebar and its handle, and either the main card
  or the aside, from the store; restores on a view or Project change.
- `AnalysisSplitLayout`: the button, the maximised bar, hiding the parameters
  pane, restoring when results vanish. No per-tool change.
- `AnalysisTabbedPanel`: hides the tab strip while maximised.
- `WorkspaceSelectionTabs`, `WorkspaceView`, `DataEditorToolPanel`: the Data
  Editor button, the hidden graph, and the tool panel above the table.
- `NudgeCard`: **Show settings** while maximised.

## Decisions (11 November 2026)

Chao's answers to the questions this proposal asked:

1. **Composition stays in Basic.**
2. **Annotation's table is agreed. Concordance's is agreed as changed above**
   (context sizes and the regular expression option are Basic; Separated or
   Combined is Advanced). **Topic Modelling's table was not answered** and is
   not built.
3. **The analysis tab strip is hidden while maximised.** Maximising means the
   screen is too small for the normal layout, or the person wants to
   concentrate: the goal is as much of the screen as possible, and switching
   tabs is not needed.
4. **Issues and the ledger wait** until the implementation is accepted and
   ready to merge back to `v0.7`. Then each part gets a GitHub issue and a
   `V07-nnn` record, and this folder moves to `specs/active/<issue>-<slug>/`.
5. **Maximised results keep every resizable pane's behaviour** and every
   ratio set by hand after restoring.
