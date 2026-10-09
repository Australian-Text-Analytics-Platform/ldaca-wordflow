<!-- markdownlint-disable MD033 -->

<h1 id="help-tutorial-index">Wordflow Help</h1>

Wordflow keeps your texts, metadata, live queries and saved analyses together in
`.wfpj` projects. Open Help from the sidebar or use a **?** beside a control to
jump to its explanation. All written Help is bundled with your application.

![Wordflow main view](tutorials/assets/ldaca_main.png)

## Quick start

1. Create or open a project.
2. Use **Data Loader** to add files, sample data or an LDaCA collection.
3. Use **Data Editor** to change columns in place, or **Data Builder** to derive
   Data Blocks with Filter, Group, Join, Aggregate, Sample, Deduplicate, Stack,
   Build or SQL.
4. Choose an analysis, select its Data Blocks and document columns, then Run.
5. Explore the results, export figures or use **Add to Project** to publish rows.

A **Data Block** is a table of documents and their metadata. A **Table** stores
rows; a **View** reads its sources through a live SQL query. The Project Graph
shows their relationships. Saved analyses retain the inputs captured by their
successful Run; later source edits do not silently recalculate those results.

<h2 id="help-analysis-lifecycle">How Preview, Run and Clear work</h2>

**Preview**, where offered, inspects the current settings without saving an
analysis result. Preview is temporary and disappears when you leave the tool or
reload. Topic Preview uses the selected sample; AI Preview always makes a fresh
request. Data Builder Preview reads the query that Apply will use.

**Run** submits the current settings against the current Data Blocks and saves
the analysis output. It creates one task with progress and cancellation in
**Tasks**. You can switch tools or projects while accepted work continues.
Frequency and Plots have no Preview. AI Run writes predictions to its Table;
manual annotation edits use their own Save and Cancel.

**Clear results** removes owned analysis outputs and artifacts, preserving your
settings. For tools whose matching saved settings disable Run, Clear allows
another Run against changed source data. Topic result adjustments reuse retained
stages; an explicit Run always enters every stage. Older analyses missing those
stages ask you to Rerun.

A failure stays beside the responsible form or result with its original
diagnostic, Details, copy and Feedback actions. **Retry** rereads or repeats the
failed operation; **Rerun** recomputes an analysis. Neither happens automatically.
A toast reports a failure when its responsible panel is not visible.

## Help sections

- [Interface](./ui.md) — navigation, Editor, graph, Tasks and project files.
- [Data Loader](./data-loader.md) — files, folders, workbooks and LDaCA.
- [Data Editor and Data Builder](./preprocessing.md) — column edits and derived Data Blocks.
- [Frequency](./token-frequency.md) — token counts, clouds and keyness.
- [Concordance](./concordance.md) — matching words and their context.
- [Topic Modelling](./topic-modeling.md) — topics, metadata groups and retained adjustments.
- [Quotation](./quotation.md) — highlighted quotation rows and whole documents.
- [Annotation](./annotation.md) — manual drafts and AI predictions.
- [Plots](./plots.md) — Trends, Compare, Scatter, Heatmap and Sankey.
- [Export](./export.md) — CSV, XLSX, JSON and Parquet, plus analysis figures.

Help opens one initial anchor scroll below its pinned header. External links
open normally in your browser; desktop website links open in the system browser.
