# Interface And Behavior Memory

Reference: [evaluation memory](MEMORY.md). This records observed behavior and
source contracts. It is not a proposed information architecture.

## 1. The Researcher's Interface Model

| Concept visible to a researcher | What it actually controls | Important boundary |
|---|---|---|
| Project | Saved research work containing Data Blocks and analysis tabs | Engineering documents/API call this a Workspace |
| User File in Loader | Uploaded or imported source material | Uploading alone does not create a Data Block |
| Data Block | Named tabular data, schema, color and lineage | Imported files become independent source snapshots when added |
| Data Blocks sidebar / Project Graph selection | Which Data Blocks appear in the Data Editor | Does not itself add those Data Blocks to the active tool |
| Tool input card | Explicit Data Block role, chosen column and sometimes tokeniser | Different tools have different roles and limits |
| Analysis tab | A separate analysis context within one function | Backend owns tab identity; unsubmitted draft controls are client state |
| Result | The retained output of an analysis | It is not automatically a new Data Block |
| Add to Project | Publish a source or derived Data Block | In output dialogs the selected view may determine the output's row unit |
| Apply in Data Editor | Edit a Data Block in place | Does not create a new lineage branch |
| Download / Export | Save a file to the computer | Does not necessarily create another object inside the Project |

See the [glossary](../../../CONTEXT.md),
[Data Block domain](../../domain/workspaces-and-data-blocks.md) and
[analysis domain](../../domain/analyses-and-imports.md). Use actual UI labels
when discussing training. The glossary's internal "Workspace" and "Topic
Segment" should not silently replace the UI's "Project" and "Passages".

## 2. Persistent Shell

- **Header:** branding, back/forward navigation, Project-named quick access
  control, Settings. Quick access searches analysis tabs across tools, not
  just Projects.
- **Left:** Views, Data Blocks and Tasks are independently collapsible and
  vertically resizable. The sidebar itself is horizontally resizable.
- **Center:** active tool. Six analysis views have their own tab strip and
  parameters/results split. Builder has operation tabs instead.
- **Right:** Project controls and lineage graph above the Data Editor.
  The whole Project panel can collapse. Opening a Data Editor tool replaces
  the graph with that tool's form; the table below becomes its preview.
- **Help:** sidebar Help plus local information/help icons, contextual hints,
  and result-dependent suggestions. These are multiple complementary systems.

The graph is valuable provenance and a selector, not a visual workflow
programming canvas: choosing a tool and its inputs remains a separate action.

Primary source anchors:

- [WorkspaceShell](../../../frontend/src/components/layout/WorkspaceShell.tsx),
  [WorkspaceView](../../../frontend/src/components/layout/WorkspaceView.tsx).
- [Sidebar](../../../frontend/src/components/layout/Sidebar.tsx),
  [NodeActionsToolbar](../../../frontend/src/components/layout/NodeActionsToolbar.tsx).
- [ViewRouteSync](../../../frontend/src/components/layout/ViewRouteSync.tsx),
  [viewSearch](../../../frontend/src/features/views/viewSearch.ts).

## 3. Tool Inventory

Limits below are the observed input-card limits, not generic backend capacity
claims. "Inspected" does not mean the underlying model or every mode was run.

| View / sidebar label | Main user choices and specialist surfaces | Output and evidence |
|---|---|---|
| Data Loader / Loader | Create/open/import Project; upload files/folder; samples; LDaCA; file preview; Add to Project | Uploaded synthetic CSV, checked preview, created 24-row source Data Block. File library and Project manager remain separate |
| Data Builder / Builder | Filter, Group, Join, Segment, Aggregate, Sample, Deduplicate, Stack; operation-specific inputs; preview; output name | Sample's Slice mode created a six-row derived Data Block and graph edge. Other operations inventoried, not all executed |
| Frequency | Up to two inputs; text column; tokeniser; color; Run; result stop-word controls, cloud/list limits, token filter, cloud/list views | Plain words Run completed. `the=32`, `said=24`, `housing=8`. Comparing two corpora and cross-tool word gestures were not exercised |
| Concordance | Up to two inputs; text/token search; context lengths; case, punctuation, whole word, regex; Preview/Run; metadata; table/dispersion | Preview and Run both completed for `housing`: eight matches. Output-column dialog inspected. Match vs document outputs are distinct contracts |
| Trends | One input; time/number/category axis; type-dependent bins/period; up to three grouping columns; chart and spacing; range selection | Run on default numeric `id` axis represented all 24 rows. Time conversion, grouping and range-derived output not exercised |
| Topic Modelling / Topics | Up to two inputs; text column and sampling; model; Passages; Max tokens; topic size; seed; topic sampling; optional remote GPU | Setup and a short-text suggestion inspected. No embedding/clustering Run. Topic results were not generated for this audit |
| Quotation | One input and text column; Preview/Run; engine/provider configuration depends on available deployment | Setup inspected only. No local model download, extraction Run or remote service call |
| Annotation | Main Data Block, text and annotation column; Codebook; Manual/AI; optional example Data Block; provider and advanced settings in AI mode | Manual/AI setup inspected; Create new immediately created an empty Codebook Data Block. No codes saved, manual labels or AI inference |
| Export | Explicit inputs or Add all; output format; single/multiple downloads; whole-Project archive | Source CSV download completed and contained 24 rows plus header. Whole-Project archive not exported |

Authoritative view inventory:
[viewRegistry](../../../frontend/src/features/views/viewRegistry.ts):33.
Builder operation order:
[DataPreprocessingFeature](../../../frontend/src/features/views/preprocessing/DataPreprocessingFeature.tsx):49.

## 4. Interaction Sequences And Why They Matter

### Getting data into analysis

1. Create/open a Project.
2. Upload/import a file into the file library.
3. Add it to the Project, with a preview confirmation for the tested CSV.
4. Choose a tool.
5. Add a Data Block explicitly to that tool.
6. Choose its text/axis column and any required tokeniser.
7. Preview or Run as that tool permits.
8. Inspect the Result; publish a derived Data Block or download if needed.

Selecting a Data Block in step 3's graph/sidebar can open its Data Editor
without satisfying step 5. This distinction supports inspecting one object
while analysing another, but requires an understandable teaching model.

The **+** on a hovered Data Block and **Add Data Block** inside inputs are
alternative input routes. A single input target consumes the + directly;
multiple-role tools can use a carried Data Block that must be placed into a
specific panel. Source-inspected, not fully pointer/keyboard-tested here:
[NodeInputsPanel](../../../frontend/src/features/views/common/components/NodeInputsPanel.tsx):91.

### Results and editing are different action families

- Builder's sampled rows are previewed automatically as its draft changes;
  Add to Project creates the named derived Data Block.
- Concordance exposes explicit Preview and Run. Run retains complete results;
  Add to Project opens a second selection/naming decision.
- Frequency and Trends expose Run without the same page-oriented Preview.
- Data Editor tools expose a live preview and Apply, Cancel and Close.
  The tested Find & replace kept the tool open after Apply. Undo restored the
  original text. The graph temporarily gave way to the editing form.
- Annotation combines setup, Codebook editing, manual labeling and AI batch
  behavior; these should not be assumed to share every analysis lifecycle.

There is an "input Clear", a "result Clear", selection clearing, and task
record clearing. Their shared word does not mean their effects are equivalent.

### State and continuity

- Entering an empty analysis tool creates its first ready tab.
- Six tab prefixes are visible: F, C, T, TM, Q and A.
- Unsubmitted input selections disappeared across fresh browser visits in
  testing; completed Runs restored their submitted context and Results.
  Distinguish client drafts from retained analyses in any profile design.
- Only the function is represented in the current route's `view` search
  parameter; tab, graph selection, column and full research question are not
  part of that search contract.
- Tasks offer another route back into an owning analysis tab. Clearing or
  hiding navigation must not strand retained work.

Source:
[AnalysisTabsHost](../../../frontend/src/features/views/common/tabs/AnalysisTabsHost.tsx):108,
[tabStateOps](../../../frontend/src/features/views/common/tabs/tabStateOps.ts):1,
[analysisNavigation](../../../frontend/src/features/views/common/analysisNavigation.ts):16.

## 5. Existing Disclosure And Customization

| Mechanism | Existing behavior | Boundary to preserve |
|---|---|---|
| Views pencil / Settings > Views | Persistent account preference hides individual tool entries | Loader always stays visible. Hiding the active Quotation view returned to Loader and survived reload; its tab was not deleted |
| Settings > General > Enable multi-tab | Off hides chrome in an ordinary one-tab analysis | Two existing tabs still show the strip. Preference changes do not delete tabs/results |
| Collapse Project panel | More room for the active analysis | Graph/Data Editor remain reopenable; this is not data deletion |
| Resizable splits | User allocates space to navigation, analysis, graph, table and results | Container width, not just viewport width, determines readable feature layout |
| Contextual hints | Default enabled after preferences load; can pause/reset/disable | Independent from deliberately launched tours and from suggestions |
| Suggestions | Result/input-dependent advice with an action, Dismiss and Help | Not a blocking wizard; do not remove expert control or silently change parameters |
| Annotation advanced settings | Existing per-tool disclosure | Does not imply a cross-app basic/advanced mode |
| Column menus and hover actions | Keep specialist actions out of the resting interface | Discoverability and keyboard/touch alternatives still matter |

Sources:
[useVisibleViews](../../../frontend/src/features/views/useVisibleViews.ts):5,
[SettingsDialog](../../../frontend/src/components/dialogs/SettingsDialog.tsx):60,
[AnalysisTabsHost](../../../frontend/src/features/views/common/tabs/AnalysisTabsHost.tsx):139,
[guidance registry](../../../frontend/src/features/guidance/registry.ts):5.

## 6. Invariants For The Next Reviewer

These are constraints to verify in a future implementation, not instructions
to implement a redesign now.

- Preserve data lineage and the distinction between new Data Blocks and
  in-place edits. Do not equate session Undo with durable provenance.
- Never hide work irretrievably when changing profiles or visibility.
  Existing tabs/results and specialist entry points need a recovery path.
- Keep shared interaction patterns without erasing tool-specific input roles,
  row units, mandatory output columns or cancellation/partial-result behavior.
- Preserve table position/focus during sorting and paging, plain-language
  failures with technical Details, rename recovery, and Help while runs lock
  parameters. These are documented prior user-feedback fixes.
- Any profile should disclose presentation and parameter effects separately.
  A visibility-only profile must not quietly change an analysis request.
- Account preferences, per-device hints/layout state, Project-owned saved work,
  and client drafts have different owners. Decide explicitly where any new
  profile belongs rather than duplicating authority.
- Treat v0.8 parity reports as historical evidence, not proof about today's
  `main` branch or a reason to port an entire alternative interface.
