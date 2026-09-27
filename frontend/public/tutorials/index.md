<!-- markdownlint-disable MD033 -->

<h1 id="help-tutorial-index">LDaCA Wordflow Help</h1>

<p align="center">
  <img src="/LDaCA_logo_Dark.png" alt="LDaCA" width="360" />
</p>

Welcome to LDaCA Wordflow. This Help guide provides written instructions for
the interface and each analysis feature. Open it at any time from **Help** in
the sidebar or jump directly to a section with a **?** icon.

## Overview

Wordflow offers an interface that prioritizes ease of use and efficient navigation. The main user interface includes the following main sections, systematically presented in three primary columns.

![Wordflow main view](tutorials/assets/ldaca_main.png)

1.	Tool Choice: Choose and customise which tool module to use.
2.	Data Selection: Select the data block to be analysed.
3.	Task Centre: Show progress of time-consuming tasks.
4.	Project Graph: Select Data Blocks and open their previews.
5.	Data Viewer: Preview one Data Block as a table.
6.	Tool Interface: The main interface of the selected analytic tool.
7.	Project File: Use the native File menu to open or save a `.wfpj` database.
8.	Help and Feedback: When you encounter problems.

For detailed explanation of how each of the above sections work, please refer to [User Interface Overview](./ui.md).


## Concept: How the Analyses Interoperate
Wordflow's analyses are designed to work together seamlessly, allowing you to conduct comprehensive text analyses. Here’s how the components interact:
- **Data block**: Tabular data consists of at least one column of analysable textual contents. Each row represents a unit of text (document, post, comment, speech etc.) and its associated metadata in columns. A data block can be viewed as a collection of texts with various types of metadata.
- **Project**: A set of data blocks that can be processed, analysed and derived from each other. The project is a virtual space where the user uploads, processes and manipulates all relevant data blocks to a project or task. The project is visualised as a graph of interconnecting data blocks, where the links indicates how new data blocks are derived from their parent data blocks through various operations. The user can select, rename, delete or clone the data blocks from the graph and sidebar.

Data Blocks supply the inputs to preprocessing and analysis. Preprocessing can create derived Data Blocks, while Frequency keeps its saved results privately in named analysis tabs rather than adding graph nodes.
The text corpus and metadata can be uploaded to Wordflow then loaded as a data block to an active project.
Preprocessing can create derived Data Blocks or update an existing Table or View.

- Data Loader: Upload your text files and load  the text corpus (e.g., interview transcripts, articles) into a project.
- Preprocessing: Filter, sample, join, stack, find patterns, create columns, or write DuckDB SQL.
- Frequency: Count tokens in one Data Block or compare two corpora, then explore saved lists, clouds and keyness statistics. Other analysis modules remain unavailable; their help pages are retained for reference.
- Export & Share: Export a full Data Block as CSV, JSON, NDJSON, Parquet or Arrow IPC. Close the export dialog while work continues; use the Task Centre to cancel. Save the project as a `.wfpj` file to preserve its stored data and SQL.

## How to use the help icons

- Click a **?** icon next to a control to jump straight to its explanation.
- Help will scroll to that section and briefly highlight it.
- If a help link is missing, you will see a toast and Help will stay closed.

## Quick start (first session)

1. **Create or load a project** so your work is saved together.
2. **Upload files** or import sample data to explore quickly.
3. **Clean and join** your data if needed.
4. **Preview** Data Blocks or use **SQL** to inspect the database.
5. **Run Frequency** to count or compare terms, and **export** tables or charts for sharing.


## Help sections

- [User Interface Overview](./ui.md) — learn what each section of the main screen does.
- [Data loader](./data-loader.md) — create projects and upload data.
- [Data Preprocessing](./preprocessing.md) — Filter, Sample, Join, Stack, Find, Build, and SQL.
- [Frequency](./token-frequency.md) — count and compare terms in saved analysis tabs.
- [Concordance](./concordance.md) — inspect terms in context.
- [Topic modelling](./topic-modeling.md) — discover themes with native semantic clustering.
- [Sequential analysis](./sequential-analysis.md) — analyze sequences over time.
- [Quotation extraction](./quotation.md) — capture quoted segments with context.
- [Annotation](./annotation.md) — label text manually or with a configured AI provider.
- [Export](./export.md) — download tables or reports.

## Questions to check your understanding

**Q: What is a project?**

A project is a DuckDB database file containing stored data, View definitions, saved SQL cells, saved analysis results and project metadata. Each project opens in its own independent window. Successful changes commit immediately. Every Untitled window asks where to save when closing; named projects do not need an unsaved-content prompt.

**Q: Why are there separate tutorial pages?**

Each page focuses on a single area so you can learn in small steps and jump directly from a help icon.

- [Plots: Trends, Compare, Scatter, Heatmap and Sankey](./plots.md)
