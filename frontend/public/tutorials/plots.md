<!-- markdownlint-disable MD033 MD041 -->

[← Tutorial index](./index.md)

# Plots

Explore a Table or View with **Trends**, **Compare**, **Scatter**, **Heatmap** or
**Sankey**. Each mode has independent named tabs. Entering an empty mode creates
its first tab; closing its last tab leaves the empty state until you enter again.

<h2 id="plots-parameters">Choose data and Run</h2>

Use **Add data block** to select one Table or View. Prepare joins, reshaping and
text-to-date conversions in Preprocessing. Select the mode's columns, then **Run**.
There is no Preview. Run saves the submitted settings and replaces previous
output; cancellation or failure retains the submitted settings without output.
The progress card and Task Centre show the same task.

- **Trends:** choose a date/time or numeric axis and up to three grouping columns.
  Count rows is the default; Sum, Mean and Median use a numeric value column.
  Date intervals default to daily, with Monday weeks. Custom intervals use a
  positive number of seconds, minutes, hours, days or weeks. Numeric width defaults
  to 1; a blank origin uses the smallest usable value. A timezone-aware timestamp
  has a timezone selector (UTC initially); plain dates/timestamps keep their stored
  calendar interpretation.
- **Compare:** choose a category and optional stack category. Plot Count or a
  nonnegative Sum as stacked bars.
- **Scatter:** select numeric X/Y and optional color category, bubble size and row
  label. Each usable row is a distinct point, even when coordinates repeat. Axes
  are linear; bubble area represents nonnegative size. Hollow markers identify zero.
- **Heatmap:** select row/column categories and Count, Sum, Mean or Median.
  Cells show raw values, never row/column percentages.
- **Sankey:** choose at least two ordered stage columns. Bands count rows or sum a
  nonnegative weight. Identical labels at different stages remain separate nodes.

Unsupported saved settings appear above Run. Supported siblings still restore.
Opening or editing a tab does not rewrite the saved request. Run replaces it with
supported settings. Matching saved results disable Run; use Clear results before
running unchanged parameters against changed source data.

## Presentation and selection

Trends offers Line, Area and Bar, plus Calendar after a daily date/time Run.
Smooth curves changes interpolation only and is available for Line and Area. Eligible Area/Bar charts stack counts
or nonnegative sums; Mean, Median and signed sums use lines or grouped bars.
Calendar uses one calendar per visible group with a shared color scale. All groups
show the same complete months covering the results within the selected year.
Padding outside the results stays blank; hiding a group does not change the date
range. Changing year changes the viewport, not the rows published.

Count/Sum fill empty intervals with zero; Mean/Median leave gaps. An interval with
rows but no usable numeric measurements is also a gap, including Sum.
Unusable axes and measurements are reported; they are never silently imputed.
NULL categories, empty strings and literal labels remain distinct.

**Uncased** merges string categories. Means and medians are recalculated from the
saved rows. Trends' **Minimum rows per group** defaults to zero and applies to
complete groups after merging. Legend buttons hide groups. Compare offers category
or descending-total order and Horizontal/Vertical orientation. Long category names
initially use horizontal bars. Category labels wrap instead of being skipped;
large charts use local scrolling and category zoom to keep labels readable.

Heatmap identifies the measure and both category columns. Blank cells have no
usable measurement or no observations; zero remains a measured value. Selected
cells have outlines without changing their value colors. Sankey names every stage
and uses consistent colors for the same category across stages.

Scatter uses translucent bubbles to reduce overlap. Its size key names the size
column and largest bubble value; hiding a group does not rescale the remaining
bubbles.

**Normalize to 100%** is a Results option for eligible Trends/Compare charts. The
denominator includes every group passing the minimum, even hidden groups. Hiding
one group leaves its share undisplayed. A zero total has no percentage.

Click plotted observations to toggle selection. Shift adds; Trends Shift-click
extends across intervals. **Select range** enables dragging: drag replaces the
selection and Shift-drag adds. Arrow keys inspect points, Enter/Space selects,
Shift extends, and Escape leaves range mode. Active drag modes are highlighted.
Scatter and Heatmap also offer **Zoom area**: drag a rectangle to focus that region
without changing the selection. Zoom in/out, Reset zoom and sliders remain available.
Hold Ctrl while using the wheel to zoom; ordinary scrolling moves the page.
An empty viewport offers **Show full plot**. If all legend groups are hidden,
**Show all groups** restores them.

Trends selects intervals across visible groups; Compare selects category/stack
segments; Heatmap selects cells; Scatter selects original row identities.
Sankey selects rows matching **any** chosen adjacent-stage band. Several selected
bands do not mean that a row followed a complete path through every stage.

Presentation settings are saved. Hidden groups, selections and zoom are temporary.
Uncased clears hidden groups and category-based selections; interval/row identities
remain usable. Clear Selection preserves hidden groups.

## Add to Project and downloads

**Add to Project** creates an independent Table of original rows from the saved
snapshot. Select a name and metadata columns; execution columns remain required.
With no selection, all eligible rows are included. Hidden groups are excluded;
zoom never limits publication. Rows matching multiple selected Sankey bands appear
once. The dialog captures a readable selection/filter summary. Disjoint projections
also report the exact original-row count; Sankey reports selected bands without
adding overlapping band counts together. Source edits or deletion cannot change
the saved snapshot.

Use the download icon at the right of the chart toolbar to open the format dialog.
Choose PNG (the default), SVG or JPEG, then Download. Cancelling the save or a
failed save leaves the dialog open so you can retry. The same control is used
for Frequency and Concordance visualizations. Downloads
capture zoom, selections, source, the actual mode and its column names, measure,
interval/timezone and legend. Selected/total legend counts appear only when a
selection exists. They are
unavailable while a projection is unresolved. Clear results removes analysis output
but never removes a Data Block previously added to the project.

## Large charts

Saved data remains complete. Charts support up to 100,000 plotted values and 500 series, or 5,000 Sankey links. If a projection exceeds that budget, use wider intervals, fewer groups, case merging or a higher minimum group size where available. Otherwise refine the input in Preprocessing and Run again. Wordflow does not silently sample or truncate your chart. Very large charts may take several seconds to render or zoom.

Calendar groups form a responsive grid with the same date range and scale. Hover a date to inspect it in every group, or focus the chart and use left/right for days, up/down for weeks and Home/End for the range. Inspection does not select rows. Dense Trends markers hide automatically; lines and all observations remain. Wide Heatmaps and Sankey diagrams scroll inside the chart area. Downloads retain the viewport and selection but omit interactive controls.
