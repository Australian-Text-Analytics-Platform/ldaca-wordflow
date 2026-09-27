<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-sequential-section">Trends tutorial</h1>

![Trends screenshot](tutorials/assets/sequential_analysis.png)

The Trends tool counts documents over time (or over any ordered numeric axis) and plots the result as a chart. It is useful for seeing how activity, mentions, or any measurable quantity rises and falls across a corpus.

You can break a single trend into multiple lines by grouping on one or more category or text columns, then zoom into and select specific periods for closer inspection.

<h2 id="help-sequential-parameters">Parameter panel</h2>

<h3 id="help-sequential-data-block">Step 1: Select your data</h3>

Use the Data Block selector to pick the corpus you want to analyse. Only one Data Block can be selected at a time.

<h3 id="help-sequential-time-column">Step 2: Choose a time or number column</h3>

The **Time or number column** dropdown lists every column in the selected Data Block that holds a date and time, date, whole number, or decimal value. Pick the column that represents the order or time axis you want to plot along.

- **Date and time columns** are grouped by a calendar period (hourly, daily, weekly, and so on). A **date** column (no time of day) offers daily and longer periods only.
- **Number columns** (whole number or decimal) are grouped by a fixed width you specify (the **Step**).

The tool detects the column type automatically and shows the relevant configuration controls below.

![Selected Data Block with its time or number column, and the Period setting](tutorials/assets/sequential_analysis/parameters.png)

<h3 id="help-sequential-frequency">Step 3: Set the period (date and time columns)</h3>

When a date and time column is selected, choose a **Period**: how records are grouped into time periods.

**Standard periods**

| Option | Groups records by |
|---|---|
| Per second | Each second |
| Per minute | Each minute |
| Hourly | Each hour of the day |
| Daily | Each calendar day |
| Weekly | Each week (Mon–Sun) |
| Monthly | Each calendar month |
| Quarterly | Each quarter (Q1–Q4) |
| Yearly | Each calendar year |

![The Period list](tutorials/assets/sequential_analysis/frequency_menu.png)

**Customised interval**

Select **Customised** to bucket by a fixed duration you define: enter a positive whole number and choose a unit (seconds, minutes, hours, days, or weeks). For example, *Every 30 minutes* groups records into half-hour windows.

![Customised period: Every 1 minute](tutorials/assets/sequential_analysis/custom_interval.png)

- Smaller intervals show more detail but may produce many sparse buckets.
- Larger intervals smooth the trend and reduce noise.

<h3 id="help-sequential-numeric">Step 3: Set the start and step (number columns)</h3>

When a whole number or decimal column is selected, two fields appear:

**Start**: where the first group begins. Leave blank to start at the smallest value in the data.

**Step**: the width of each group (required). For example, a step of 10 gives 0–9, 10–19, 20–29, and so on.

<h3 id="help-sequential-group-by">Step 4: Group By Columns (optional)</h3>

To split the trend into multiple lines (one per category), add up to three columns as grouping conditions. Each added column should have a small number of distinct values; these become the separate series in the chart.

Click **Add group** to add a column selector row. A badge next to each selector shows the number of unique values in that column, which helps you judge how many series will be produced. **Remove** takes that column out again.

![Group By Columns with gender, which has 2 unique values](tutorials/assets/sequential_analysis/group_by.png)

When multiple grouping columns are added, categories are combined across all columns. Be aware this multiplies the number of series: three platforms × four genres = twelve combined series. Too many series can make the chart unreadable.

Trends retains exact group values in its result. After the analysis finishes,
use **Ignore capitals** beside the result legend when values that differ only in
capitalisation should be displayed and filtered as one group.

<h2 id="help-sequential-run">Step 5: Run the analysis</h2>

Choose **Run** to start. Settings are locked while it works. After it finishes,
Run turns on again only when you change a setting that affects the counts.
Minimum group count, Chart, Spacing, selection, visibility, and Ignore capitals
only change what is shown, so they do not turn Run on. See
[How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

<h2 id="help-sequential-results">Result panel</h2>

![Trends results](tutorials/assets/sequential_analysis/trends_results.png)

The result panel follows the Concordance dispersion layout: result actions in
the header, chart presentation controls directly above the plot, then the chart
and its legend card. The legend card keeps Ignore capitals, minimum group count, and
period-selection controls together. Time column, period or interval, and
Group By settings remain visible in the parameter panel instead of being
repeated in the result.

![Chart controls: Chart, Spacing, download, Select range, and zoom](tutorials/assets/sequential_analysis/chart_toolbar.png)

<h3 id="help-sequential-minimum-group-count">Minimum group count</h3>

For grouped results, **Minimum group count** hides any group whose total count
across the complete result is below the entered value. The default is **10**;
enter **0** to show every group. A group whose count equals the threshold remains
visible. The control appears in the legend card immediately after **Ignore capitals**.

The filter removes small groups from the chart, legend, chart export, displayed
counts, and Add to Project. It does not change manual legend visibility: if a
filtered group was struck out, lowering the threshold restores it still struck
out. Selected periods do not change which groups meet the threshold. With
**Ignore capitals** enabled, case variants are merged before their total is compared
with the threshold.

![Legend card with Ignore capitals, Minimum group count, and Clear selection](tutorials/assets/sequential_analysis/legend.png)

<h3 id="help-sequential-chart-type">Chart type</h3>

Three plot modes are available in the **Chart** list:

- **Line**: best for continuous trends across time, especially when groups overlap or you want to compare rates of change.
- **Bars**: best for highlighting contrast between groups at each period.
- **Area**: stacks all groups on top of each other. Works best when groups emerge or disappear over time and you want to see total volume alongside composition.

<h3 id="help-sequential-x-axis">Spacing: Even or To scale</h3>

The **Spacing** list next to **Chart** sets how periods are placed along the horizontal axis. Hover the information icon beside it for a short reminder.

- **Even (hide empty periods)** *(default)*: every period with data gets the same width, whatever the real time between periods. Periods with no data are left out. Best when periods are dense and you want a clean view. When the chart is too narrow for every label, some labels in the middle are hidden, but the first and last periods are always labelled.
- **To scale (show gaps)**: periods are placed by their real time or value, so empty periods show as gaps. Useful for spotting uneven events or comparing rates of change across long spans.

In To scale mode with a date and time column, axis labels show dates (for example *Apr 2018*). The tool aims for about ten labels across the visible range, dropping labels automatically if the chart is too narrow.

**Empty periods.** A period with no rows at all is hidden in Even spacing and leaves a gap on the axis in To scale spacing. Within a period that is shown, a group with no rows counts as zero, so its line dips to zero rather than breaking: "no occurrences" is genuinely zero, not unknown.

The vertical axis shows counts of rows and has no title. When nothing is grouped, the single series is named after the Data Block.

<h3 id="help-sequential-download">Download chart</h3>

Click the download button (↓ icon) in the results header to export the chart. A dialog lets you choose SVG, PNG, or JPEG. The exported file includes a header block with the Data Block name, time column, period, and row counts, plus a legend.

<h3 id="help-sequential-legend">Legend and group visibility</h3>

The legend below the chart lists groups that meet the minimum group count, with
their colours, full-result count, and share of the counts among currently
visible groups, for example *Speeches (40 · 30.0%)*. Hover the information icon
at the start of the legend for a reminder of this format. Percentages use one decimal place and do not change when periods
are selected. When periods are selected, each visible label shows *selected/total*
before the percentage, for example *(12/40 · 30.0%)*. Click any legend item to hide or show that group.
Hidden groups retain their count detail, show **Hidden**, and use a strikethrough
label with reduced opacity.

Use this to focus on a subset of groups. Hidden groups are not plotted and are
marked hidden in chart exports, while their legend entry retains its
full-result count.

Select **Ignore capitals** beside the legend to merge case variants without rerunning
the analysis. For example, `jobs` and `Jobs` become `jobs/Jobs`, with their
per-period values, totals, percentages, tooltip values, and export entry
summed. Changing this checkbox restores all hidden groups while preserving
selected periods, zoom, chart type, and axis mode.

<h3 id="help-sequential-zoom">Zoom and navigation</h3>

Use the chart slider, mouse wheel, or trackpad pinch to zoom along the horizontal axis. The toolbar also provides keyboard-accessible **Zoom in**, **Zoom out**, and **Reset zoom** buttons. Zoom changes only the viewport: it does not change the analysis result or clear selected periods.

<h3 id="help-sequential-period-selection">Period selection</h3>

Click anywhere inside the plot to select the time period nearest the vertical axis pointer. You do not need to target a line point, bar, or area segment. Selected periods are shaded with a soft band across the chart, and in line and area charts their points become large solid dots while the other points stay small hollow circles; in bar charts, unselected bars are dimmed to 25 % opacity.

To select a range, click one period then **Shift-click** another: all periods between them are selected.

For drag selection, turn on **Select range** and drag across the periods you want. A new drag replaces the current selection; **Shift-drag** adds the brushed range. Turn the mode off, or press **Escape** while the chart is focused, to return to point selection.

With keyboard focus on the chart, use **Left Arrow**, **Right Arrow**, **Home**, and **End** to inspect points. Press **Enter** or **Space** to select the focused point; hold **Shift** to extend the existing selection semantics.

Use **Clear selection** to deselect all periods without losing any other settings.

![Three selected periods shaded, with selected / total counts in the legend](tutorials/assets/sequential_analysis/period_selection.png)

<h3 id="help-sequential-add-to-workspace">Add to Project</h3>

Click **Add to Project** to create a Data Block containing original source
rows represented by the current Trends result. If periods are selected, only
those periods are included; with no selection, all periods are included. Groups
removed by Minimum group count and groups hidden through the legend are always
excluded. Zoom changes only the viewport and never the rows added to the
Project.

When Ignore capitals is on, hiding a merged legend entry excludes every exact
spelling represented by that entry.

The time or numeric axis column is required. The source Document Column and
Group By columns start selected but remain optional, while other source columns
start unselected. The dialog preserves source-column order and defaults the new
name to the source name followed by `_trends`. Its description says how many
source rows and selected periods will be added.

![Add Trends selection to Project dialog](tutorials/assets/sequential_analysis/add_to_project.png)

<h3 id="help-sequential-clear-results">Clear results</h3>

The tab keeps its result when you move to another tool or reopen the Project.
**Clear** removes it and resets the tab. After a failure or a stop, the settings
stay editable but Run stays off until you choose **Clear**. See
[How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear). Clearing or replacing the
result restores Minimum group count to **10** and clears manual legend
visibility.

<h2 id="help-sequential-troubleshooting">Troubleshooting</h2>

| Symptom | Likely cause | What to try |
|---|---|---|
| Chart shows only one bar or point | Period too coarse for the date range | Try a finer period (for example Daily instead of Yearly) |
| Too many series, chart is unreadable | Too many distinct values in group-by column(s) | Remove a group-by column, or filter the Data Block first |
| No groups meet the minimum group count | Every grouped total is below the filter | Lower Minimum group count, or enter 0 to show all groups |
| "No Trends data available" | Column type or interval is incompatible with the data | Check the column contains valid dates or numbers; check the interval is > 0 |

<h2 id="help-sequential-defaults">Quick-reference defaults</h2>

| Setting | Default | Notes |
|---|---|---|
| Period (date and time) | Monthly | Any standard or custom interval works |
| Custom interval | 1 minute | Enter a positive number and choose a unit |
| Start | Smallest value | Leave blank unless you need a specific start |
| Step | 1 | Required; must be > 0 |
| Group By | None | Up to 3 columns |
| Ignore capitals | Off | Beside the legend of a grouped result; merges case variants of a group |
| Minimum group count | 10 | Grouped results only; enter 0 to show all groups |
| Chart | Line | |
| Spacing | Even (hide empty periods) | Switch to To scale to show gaps in time |
| Zoom | Full range | Use Reset zoom to restore the complete result |
| Select range | Off | Turn on before dragging across periods |

## Practice exercise

1. Select a Data Block that has a date and time column.
2. Run the analysis with the **Monthly** period to see the overall trend.
3. Switch to **Weekly** and compare the granularity.
4. Add a category or text column (e.g. author, genre, or platform) as a Group By column and choose **Run** again.
5. Zoom into a period of high activity, turn on **Select range**, and drag across several periods.
6. Download the chart in the format you need and compare it with the monthly view.

[← Back to tutorial index](./index.md)
