<!-- markdownlint-disable MD033 MD041 -->

[← Back to Help home](./index.md)

<h1 id="help-sequential-section">Trends</h1>

![Trends screenshot](tutorials/assets/sequential_analysis.png)

The Trends tool counts documents over time (or over any ordered numeric axis) and plots the result as a chart. It is useful for seeing how activity, mentions, or any measurable quantity rises and falls across a corpus.

You can break a single trend into multiple lines by grouping on one or more category or text columns, then zoom into and select specific periods for closer inspection.

<h2 id="help-sequential-parameters">Parameter panel</h2>

<h3 id="help-sequential-data-block">Step 1: Select your data</h3>

Use the Data Block selector to pick the corpus you want to analyse. Only one Data Block can be selected at a time.

<h3 id="help-sequential-time-column">Step 2: Choose a time, number or category column</h3>

The **Time, number or category column** dropdown lists every column in the selected Data Block that holds a date and time, date, elapsed time, whole number, decimal, or category value. Pick the column that represents the order or time axis you want to plot along. Dates and elapsed times come first in the list, then numbers, then categories.

- **Date and time columns** are grouped by a calendar period (hourly, daily, weekly, and so on). A **date** column (no time of day) offers daily and longer periods only.
- **Elapsed time columns** (time into a recording, such as a transcript's start times) are grouped per second, per minute, hourly, or every so many seconds, minutes or hours (**Customised**), counted from `0:00`. The axis reads like `7:00`, `8:00`, or `1:00:00` from an hour on.
- **Number columns** (whole number or decimal) are grouped by a fixed width you specify (the **Step**).
- **Category columns** give one bar per value, in the column's order (set it by clicking the column's type in the Data Editor), with empty values as the last bar, **(empty)**. Only **Bars** and **Stacked bars** are offered, and every bar has the same width. Date, elapsed time and number columns leave out rows with an empty value.

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

Trends draws at most 1,000 groups. A column with more different values, such as the text of each line, turns its badge red and **Run** stays unavailable until you choose another column. Several group columns together can also give more than 1,000 groups; then the run stops straight away and says so. A result saved with more groups (from an earlier version) is not drawn: the tab says so, and **Clear** removes it.

![Group By Columns with gender, which has 2 unique values](tutorials/assets/sequential_analysis/group_by.png)

Groups follow the values' order: A to Z for text, the column's own order for a category column, and rows with an empty value form the last group. When multiple grouping columns are added, categories are combined across all columns. Be aware this multiplies the number of series: three platforms × four genres = twelve combined series. Too many series can make the chart unreadable.

Trends retains exact group values in its result. After the analysis finishes,
use **Ignore capitals** beside the result legend when values that differ only in
capitalisation should be displayed and filtered as one group.

<h3 id="help-sequential-reference">Step 5: Normalise against a reference Data Block (optional)</h3>

Trends counts rows, so a Data Block made by Concordance shows how many matches
each period has. Periods rarely hold the same amount of text: a term can look
more frequent in 2000 than in 1980 only because the corpus has more texts, or
longer ones, from 2000. Corpus linguists compare periods by the rate per
million words instead (or per 100,000, a tenth of it), dividing the matches in
a period by all the words written in that period, in texts with a match or
without.

A Data Block made by Concordance cannot supply that total: it lacks every
document without a match and repeats a document once per match. So turn on
[**Advanced**](./ui.md#help-ui-tool-mode) at the top right of the parameters
and choose, in **Normalise against**, the Data Block these rows were made
from. With **Advanced** off, Trends counts rows and sends no reference. When
you turn it on, or choose a Data Block to analyse while it is on, the one it
was made from starts selected, with its document column and tokeniser; change
any of them, or choose **None** for counts only. The list
offers that Data Block (and the ones it was made from) first, marked **made
from this**, then every other Data Block that has the chosen time column, of
the same kind (a date for a date, a number for a number), since the
reference's rows are counted per period exactly like these; a Data Block
without that column is not listed. Choosing a Data Block that is not marked
shows a warning: a rate only means something when the reference holds every
text the rows came from, for example the whole corpus for a filtered part of
it.

With a reference chosen:

- **Count words in** names the reference's text column, so the run counts the
  words in every text of each period. The reference's document column starts
  selected. The words are counted with the **Tokeniser model** beside it, as
  Frequency's **Per million** counts them; the reference's saved tokeniser
  preference starts selected, or the one recommended for its language. Choose
  **Rows only** to skip the words and count only the reference's rows
  (documents, posts or speakers' turns).
- The totals are grouped like the result: by period, and by each Group By
  column the reference also has, such as a speaker or a party column that
  Concordance copied from it. A Group By column the reference lacks, usually
  `CONC_matched_text`, cannot split its totals, so every search term shares
  the period's total. The note under the chart names such a column in bold,
  and with **Suggestions** on a suggestion beside the chart points to the note
  whenever a rate is shown that way.
- Counting the words of a large corpus with a model tokeniser takes time on
  the first run; later runs reuse the cached tokens.

Run refuses a reference that cannot work: one without the time column, with a
time column of another kind, or with no rows in a period and group where the
analysed Data Block has some, which means it is not the Data Block these rows
were made from. It also refuses a reference with fewer words than the analysed
rows in a period, which points to the wrong Data Block or text column.

The result itself still counts rows. Choose a rate in [Show as](#help-sequential-show-as)
to see it.

<h2 id="help-sequential-run">Step 5: Run the analysis</h2>

Choose **Run** to start. Settings are locked while it works. After it finishes,
Run turns on again only when you change a setting that affects the counts.
Minimum group count, Chart, Spacing, Show as, selection, visibility, and
Ignore capitals only change what is shown, so they do not turn Run on. See
[How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

<h2 id="help-sequential-results">Result panel</h2>

![Trends results](tutorials/assets/sequential_analysis/trends_results.png)

The result panel follows the Concordance dispersion layout: result actions in
the header, chart presentation controls directly above the plot, then the chart
and its legend card. The legend card keeps Ignore capitals, minimum group count, and
period-selection controls together. Time column, period or interval, and
Group By settings remain visible in the parameter panel instead of being
repeated in the result.

![Chart controls: Chart, Spacing, download, and zoom](tutorials/assets/sequential_analysis/chart_toolbar.png)

<h3 id="help-sequential-minimum-group-count">Minimum group count</h3>

For grouped results, **Minimum group count** hides any group whose total count
across the complete result is below the entered value. The total is the number
of rows in the group over all periods, the first figure beside its name in the
legend. The default is **10**; enter **0** to show every group. A group whose
count equals the threshold remains visible. The control appears in the legend
card immediately after **Ignore capitals**, and the **?** beside it opens this
section.

Use it when a Group By column has many values, such as account names. Most of
them appear in only a few rows, and each would add its own line and legend
entry. A higher number leaves the larger groups; a lower number brings the
smaller ones back.

The filter removes small groups from the chart, legend, chart export, displayed
counts, and Add to Project. It does not change manual legend visibility: if a
filtered group was struck out, lowering the threshold restores it still struck
out. Selected periods do not change which groups meet the threshold. With
**Ignore capitals** enabled, case variants are merged before their total is compared
with the threshold.

![Legend card with Ignore capitals, Minimum group count, and Clear selection](tutorials/assets/sequential_analysis/legend.png)

<h3 id="help-sequential-chart-type">Chart type</h3>

Four plot modes are available in the **Chart** list:

- **Line**: best for continuous trends across time, especially when groups overlap or you want to compare rates of change.
- **Bars**: best for highlighting contrast between groups at each period. Each period's groups sit side by side, and every other period has a light background so its bars read as one group.
- **Stacked bars**: stacks each period's groups into one bar. Shows the total per period and its make-up, and fits many more periods than side-by-side bars. With **Show as** set to Composition every bar reaches 100%. The first group in the legend is at the top of each bar, so the bar, the legend and the tooltip read in the same order.

When there are too many periods to draw bars at a readable width (side-by-side bars need more room than stacked ones), the chart shows only as many periods as fit and says so: drag the slider under the chart to move through the rest, or choose **Line** or **Area** to see every period at once.
- **Area**: stacks all groups on top of each other. Works best when groups emerge or disappear over time and you want to see total volume alongside composition.

<h3 id="help-sequential-x-axis">Spacing: Even or To scale</h3>

The **Spacing** list next to **Chart** sets how periods are placed along the horizontal axis. Hover the **?** beside it for a short reminder, or click it to open this section.

- **Even (hide empty periods)** *(default)*: every period with data gets the same width, whatever the real time between periods. Periods with no data are left out. Best when periods are dense and you want a clean view. When the chart is too narrow for every label, some labels in the middle are hidden, but the first and last periods are always labelled.
- **To scale (show gaps)**: periods are placed by their real time or value, so empty periods show as gaps. Useful for spotting uneven events or comparing rates of change across long spans.

**Which to choose.** Start with **Even** to read the shape of the data. Switch to **To scale** when the time between periods matters. For example, monthly posts with data in January, February and June: Even shows three equal steps, January, February, June, so the four quiet months vanish; To scale leaves room for March to May, so the June posts appear after a visible pause. With a number column (such as a page or chapter number), To scale spaces the values by their size, so 1, 2 and 10 do not sit at equal distances. Spacing changes only the chart: the counts, the legend and **Add to Project** are the same in both.

Dates on the chart and in its tooltip read the same in both spacings, in the time column's own time zone: *18 Oct 2020* for days (a week shows its Monday), *18 Oct 2020 14:05* for hours and minutes, *Oct 2020* for months, *2020 Q4* for quarters and *2020* for years. Tables and downloads keep the year-first form, for example 2020-10-18. In To scale mode the tool aims for about ten labels across the visible range, dropping labels automatically if the chart is too narrow.

**Empty periods.** A period with no rows at all is hidden in Even spacing and leaves a gap on the axis in To scale spacing. Within a period that is shown, a group with no rows counts as zero, so its line dips to zero rather than breaking: "no occurrences" is genuinely zero, not unknown.

The vertical axis, titled **Rows**, counts the rows in each period: documents for a corpus, or matches for a Data Block made by Concordance. **Show as** changes the values and the title. When nothing is grouped, the single series is named after the Data Block.

<h3 id="help-sequential-show-as">Show as</h3>

Periods often hold very different amounts of data, for example many more tweets in an election week than in the month before, or more and longer texts from recent years. The **Show as** list next to **Spacing** chooses what the chart's values are. Hover the **?** beside it for a short reminder.

- **Row count**: the rows in each group and period, documents for a corpus or matches for a Data Block made by Concordance. The default.
- **Composition (% of period)**: each group as a percentage of all rows in the same period, so the groups in each period add up to 100% and you can compare how the mix of groups changes over time whatever the amount of data. This was called *Normalise to 100%* in earlier versions. It is offered when at least two groups meet the [minimum group count](#help-sequential-minimum-group-count); with one group every period would read 100%. Each period's total counts every group listed in the legend, including hidden groups, so hiding a group does not change the other percentages; groups below the minimum group count are not counted, so changing that number can change the percentages. A period whose listed groups have no rows at all has no percentage: the line breaks and no bar is drawn. In **Area** charts the stacked groups fill the chart up to 100% when none are hidden. The tooltip shows the count with its percentage, for example *412 (37.5%)*.
- **Per million words**: each group's rows divided by the words of the [reference Data Block](#help-sequential-reference) in the same period and group, times a million. This is the normalised frequency of corpus linguistics, which shows whether a term is really used more or less over time rather than following the amount of text; for a rate per 100,000 words, divide by ten. Offered when the result was run with a reference and a text column. The tooltip shows the count and the rate, for example *124 (413.3 per million of 300,000 words)*.
- **% of reference rows**: each group's rows as a percentage of the reference's rows in the same period and group, for example the share of a year's posts that mention a term when the analysed Data Block holds one row per document (**Add Concordance Documents to Project**). With one row per match the value can pass 100%, since a document can hold several matches. Offered when the result was run with a reference.

For the rates, a period that has reference words but no rows reads as zero, which is a real finding, while a group with no reference total in a period (for example no texts by women that year) is left blank. A sentence under the chart says what the rates divide by. The counts themselves do not change: the legend, the overview under the chart, **Add to Project** and selected periods still use counts of rows, and a downloaded chart notes what its values are.

The setting is kept for the tab while the Project is open, like **Chart**, and shows row counts by default.

<h3 id="help-sequential-download">Download chart</h3>

Click the download button (↓ icon) in the results header to export the chart. A dialog lets you choose SVG, PNG, JPEG or **Interactive HTML**. An image download has a header with the Data Block name, time column, period, groups and reference Data Block, plus a legend; long headers wrap onto a second line. When **Show as** is not Row count, the header also says what the values are, for example percentages of all rows in each period.

**Interactive HTML** saves the chart as one web page that opens in any browser, offline: it shows the chart exactly as it is on screen (the same groups, selected periods, zoom and theme colours), and keeps its tooltips, a legend whose entries hide or show groups, and the zoom slider (hold Command on a Mac or Control on Windows while scrolling to zoom; plain scrolling moves the page). Its last line links to the Wordflow home page. It is a picture you can explore, not a copy of Wordflow: it cannot change the Period, stop words or groups, or add anything to a Project.

<h3 id="help-sequential-legend">Legend and group visibility</h3>

The legend below the chart lists groups that meet the minimum group count, with
their colours, full-result count, and share of the counts across every listed
group, hidden ones included, for example *Speeches (40 · 30.0%)*. Hover the **?**
at the start of the legend for a reminder of this format, or click it to open this section. Percentages use one decimal place and do not change when periods
are selected or groups are hidden. When periods are selected, each visible label shows *selected/total*
before the percentage, for example *(12/40 · 30.0%)*. Click any legend item to hide or show that group.
Hidden groups retain their count and share, show **Hidden**, and use a strikethrough
label with reduced opacity.

**Reading an entry.** Say the legend lists three groups with 40, 80 and 13 rows:
133 rows in all. *Speeches (40 · 30.1%)* means 40 of those rows are speeches, 30.1% of
the 133. The counts come from the whole result, not from the visible part of the
chart, so zooming does not change them. Hiding *Speeches* keeps it at 40 and 30.1%,
and the other shares stay the same too, so the percentages always describe the same
total. Raising **Minimum group count** above 13 removes the smallest group from the
legend; the shares are then counted from the 120 rows that remain. Selecting periods
adds the rows in those periods before the slash: *(12/40 · 30.1%)* means 12 of the 40
speeches fall in the selected periods.

Use this to focus on a subset of groups. Hidden groups are not plotted and are
marked hidden in chart exports, while their legend entry retains its
full-result count.

Select **Ignore capitals** beside the legend to merge case variants without rerunning
the analysis. For example, `jobs` and `Jobs` become `jobs/Jobs`, with their
per-period values, totals, percentages, tooltip values, and export entry
summed. Changing this checkbox restores all hidden groups while preserving
selected periods, zoom, chart type, and axis mode.

<h3 id="help-sequential-zoom">Zoom and navigation</h3>

Drag the ends of the slider under the chart to zoom along the horizontal axis, or drag its middle to move the zoomed range. The shape inside the slider is an overview of the whole result: the total of the groups shown, for each period, laid out like the chart, so with **To scale** spacing empty periods show as gaps there too. Whatever **Show as** shows, the overview still shows counts. The toolbar also provides keyboard-accessible **Zoom in**, **Zoom out**, and **Reset zoom** buttons. A plain scroll with the mouse wheel or trackpad scrolls the page, even over the chart. To zoom with the wheel, hold ⌘ on a Mac (Ctrl elsewhere) while scrolling over the chart. Zoom changes only the viewport: it does not change the analysis result or clear selected periods.

<h3 id="help-sequential-period-selection">Period selection</h3>

Click anywhere inside the plot to select the time period nearest the vertical axis pointer. You do not need to target a line point, bar, or area segment. Selected periods are shaded with a soft band across the chart, and in line and area charts their points become large solid dots while the other points stay small hollow circles; in bar charts, unselected bars are dimmed to 25 % opacity.

Click a selected period again to deselect it. To select a range, click one period then **Shift-click** another: all periods between them are selected. A reminder of this sits under the chart.

With keyboard focus on the chart, use **Left Arrow**, **Right Arrow**, **Home**, and **End** to inspect points. Press **Enter** or **Space** to select the focused point, or **Shift+Enter** to select every period between it and the last one you selected.

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

## Practice exercise

1. Select a Data Block that has a date and time column.
2. Run the analysis with the **Monthly** period to see the overall trend.
3. Switch to **Weekly** and compare the granularity.
4. Add a category or text column (e.g. author, genre, or platform) as a Group By column and choose **Run** again.
5. Zoom into a period of high activity, click one period, then **Shift-click** another to select every period between them.
6. Download the chart in the format you need and compare it with the monthly view.

[← Back to Help home](./index.md)
