<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-sequential-section">Trends tutorial</h1>

Open **Plots → Trends** to explore rows over a date or numeric axis. The other
[Plots modes](./plots.md) compare categories, individual observations, cells and
transitions. Each mode keeps its own named tabs, parameters and saved results.

<h2 id="help-sequential-parameters">Parameters</h2>
<h3 id="help-sequential-data-block">Choose a Data Block</h3>

Select one Table or View. Join tables, reshape columns and convert text dates in
Preprocessing first. Run retains a snapshot so subsequent source changes do not
alter this result.

<h3 id="help-sequential-time-column">Choose the axis</h3>

Use a date, timestamp or numeric column. Positions always represent real dates
or numbers. Unusable axis values are omitted and their count is reported.

<h3 id="help-sequential-frequency">Time intervals</h3>

Daily is the default. Choose second, minute, hour, day, week, month, quarter or
year. Use **Every** for a custom number of seconds, minutes, hours, days or
weeks. Weeks start Monday. Timezone-aware timestamps have a timezone selector,
defaulting to UTC. Plain dates/timestamps retain their stored calendar meaning.

Datetime conversion first tries DuckDB's direct cast on up to 200 rows. If it
fails, Wordflow infers a format and checks the same sample. Ambiguous or
unsupported formats open a manual-format dialog. For example,
`2020-10-17 00:52:37.000 +0000` uses `%Y-%m-%d %H:%M:%S.%f %z`.
Parsed offsets retain timezone-aware values. This is a sample check: a View may
still encounter incompatible values later, reported through the error notification.

<h3 id="help-sequential-numeric">Numeric intervals</h3>

Width defaults to 1. Leave origin empty to use the smallest usable axis value,
or enter an origin explicitly. Fractional widths and negative axes are supported.
For extremely large exact values, the renderer may label an offset axis to keep
adjacent observations distinct; tooltips retain original values.

<h3 id="help-sequential-group-by">Group the observations</h3>

Use **Add** in Grouping to select up to three columns. Each row shows its
distinct-value count and a remove button; removing all groups restores a single
series for all rows. Exact spellings remain distinct unless Uncased is enabled in Results.
Choose Count rows (default), Sum, Mean or Median. The last three require a numeric
measurement column. Invalid measurements are reported separately.

<h2 id="help-sequential-run">Run</h2>

Run saves the submitted parameters and replaces previous output. Cancel through
the progress card or Task Centre. Failed/cancelled runs retain their submitted
request and remain runnable. There is no Preview in Plots.

Unchanged successful parameters disable Run. Change parameters or Clear results
to run again. Saved-output errors enable Rerun. Presentation settings do not
re-enable Run. Editing the form does not alter the saved request until Run.

<h2 id="help-sequential-results">Results</h2>
<h3 id="help-sequential-minimum-group-count">Minimum rows per group</h3>

The default is **0**, showing every group. The threshold applies to the complete
case-merged group, independently of interval selection. Lowering it restores
eligible groups; manually hidden groups remain hidden.

<h3 id="help-sequential-chart-type">Presentation</h3>

Line is the default. Smooth curves changes interpolation, not observations.
Count and nonnegative Sum also support stacked Area and Bar. Mean, Median and
signed sums use Line or grouped Bar. Daily time results additionally support
Calendar: one calendar per visible group, a shared color scale, and year
navigation that changes only the viewport.

Normalize to 100% is available for Count/nonnegative Sum. The denominator
includes all groups passing the minimum filter, including hidden groups.
Zero-total percentages are undefined.

<h3 id="help-sequential-x-axis">Continuous positions and gaps</h3>

Every interval between the first and last usable observations is represented.
An empty interval contributes zero Count/Sum and a gap for Mean/Median. An
observed interval with no usable measurement is a gap even for Sum. There is
no categorical-spacing switch.

<h3 id="help-sequential-legend">Legend</h3>

Click a colored group label to hide/show it. Labels retain total row counts and
show selected/total counts when intervals are selected. Hidden labels are
subdued and struck through. Uncased merges case variants from original saved
observations, including correct means and medians, resets hidden groups and
preserves interval selections.

<h3 id="help-sequential-zoom">Zoom and keyboard navigation</h3>

Use the slider, wheel, Zoom in/out or Reset zoom. Zoom changes only the viewport.
Focus the chart and use arrow keys/Home/End to inspect points. Enter/Space selects;
Shift extends selection. Escape exits range mode.

<h3 id="help-sequential-period-selection">Select intervals</h3>

Click a point or plot position to toggle an interval across visible groups.
Shift-click extends from the previous anchor. Select range enables dragging:
a plain drag replaces selection, while Shift-drag adds. Clear Selection leaves
other settings unchanged.

<h3 id="help-sequential-download">Download</h3>

Choose PNG, SVG or JPEG and Download chart. The export captures displayed zoom,
filters, selection, source, measure, interval/timezone and the colored legend.
Exports remain unavailable while projections are loading or outdated.

<h3 id="help-sequential-add-to-project">Add to Project</h3>

Publish original retained rows from selected intervals and visible eligible
groups. With no interval selection, all intervals are included. Zoom and Calendar
year do not restrict publication. Required execution columns remain selected;
other metadata is optional. The new Table is independently owned and does not
open Data View or change graph selection.

<h3 id="help-sequential-clear-results">Clear results</h3>

Clear removes saved output while retaining submitted parameters and presentation
settings. It resets transient selections and visibility. It is unavailable during
an active Run. Published Tables are unaffected.

<h2 id="help-sequential-troubleshooting">Troubleshooting</h2>

If a plot is empty, check the axis, measurement and minimum group size. If there
are too many groups, remove grouping columns or filter the input in Preprocessing.
If a projection fails, use Retry or adjust its settings; Rerun replaces saved
output. Missing source data does not prevent reading an existing saved result.

<h2 id="help-sequential-defaults">Defaults</h2>

Count rows; daily intervals; numeric width 1 with automatic origin; no groups;
exact case; minimum rows 0; Line; smoothing on; full viewport; no selection.

[← Back to tutorial index](./index.md)
