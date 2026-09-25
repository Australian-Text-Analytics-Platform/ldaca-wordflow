<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-preprocessing-section">Data Builder tutorial</h1>

![Data Builder screenshot](tutorials/assets/preprocessing.png)

The Data Builder makes new Data Blocks from existing ones. Its tools change which rows are present: every sub-tab creates a new Derived Data Block, and the source is never altered.

Tools that add or change columns (Find & replace, Extract text, Combine columns, Duplicate column, Split column, Clean text) live in the [Data Editor](./ui.md#help-ui-data-viewer) below the Project Graph. They update the selected Data Block in place and never change the number or order of rows.

There are currently eight sub-tabs:

| Sub-tab | What it does | Apply behavior |
|---|---|---|
| Filter | Keep only the rows that match one or more conditions | New Data Block |
| Sample | Extract a contiguous slice or a random subset of rows | New Data Block |
| Join | Combine two data blocks side-by-side on a shared column | New Data Block |
| Stack | Vertically concatenate two data blocks that share the same columns | New Data Block |
| Segment | One row per sentence, paragraph, line, or pattern-led segment, such as speaker turns | New Data Block |
| Split by group | One data block per value, date period, or number range of a column | One new Data Block per group |
| Group & summarise | One row per group, such as one document per speaker, with a summary of each column | New Data Block |
| Remove duplicates | Keep the first of each duplicate, and save the duplicate groups separately | Two new Data Blocks |

The general workflow for any sub-tab is:

1. Select one or more data blocks from the project.
2. Configure the transformation.
3. Review the **Preview** table to check the expected output.
4. Click **Create Data Block**.

<h2 id="help-preprocessing-common-section">Common controls</h2>

These controls appear across multiple sub-tabs and work the same way throughout.

<h3 id="help-preprocessing-common-node-selection">Data block selection</h3>

Select one or more data blocks from the project graph or the data block list. Each sub-tab requires a specific number of data blocks (two or more for Join and Stack; one for the other tools).

<h3 id="help-preprocessing-common-preview">Preview table</h3>

The preview pane shows the result of the current configuration in a paginated format with an estimated row count. Check the preview before applying to confirm the output looks as expected. No data block is created until you click the action button.

<h3 id="help-preprocessing-common-apply-button">Result destination</h3>

Every Data Builder tool creates new Data Blocks and never changes its sources: one for Filter, Sample (including Slice, Random Sample, and Shuffle), Join, Stack, Segment, and Group & summarise; one per ticked group for Split by group; and two for Remove duplicates. The source is preserved and the new block records its creation lineage.

To add or change columns on the selected Data Block instead, use the Data Editor. Its edits keep the Data Block's identity, graph edges, and rows unchanged, and each one can be undone from the Data Editor header.

<h2 id="help-preprocessing-filter-section">Filter</h2>

![Filter screenshot](tutorials/assets/preprocessing/filter.png)

The Filter sub-tab keeps only the rows that match defined conditions. Use it to remove noise, focus on a subset, or create a clean working dataset before analysis.

<h3 id="help-preprocessing-filter-conditions">Filter conditions</h3>

![Filter conditions screenshot](tutorials/assets/preprocessing/filter_conditions.png)

Define one or more column-based filter conditions. The behaviour of each condition depends on the data type of the selected column. All conditions are combined using either AND or OR logic (mixed logic chains are not supported).

- Click **Add Condition** to add more conditions.
- Select **AND** or **OR** to control how conditions are combined.
- Check **Negate** on any individual condition to invert it.
- When a selected column contains missing values, a warning reports how many.
  Ordinary filter conditions do not match those rows; choose **is null** to
  target them explicitly.
- The preview shows how many rows the current condition set would keep. An empty result is possible if no rows satisfy the conditions or if conditions conflict.
- Categorical values load in ordered pages. Scroll to load more, use search to
  filter on the server, and use **Select loaded** to select only the values
  currently available. Existing selections remain selected across searches.

<h3 id="help-preprocessing-filter-new-node-name">New data block name</h3>

![Filter new data block name screenshot](tutorials/assets/preprocessing/filter_new_node_name.png)

Give the filtered output a descriptive name so it is easy to find in the project. The new block is a child of the selected source block.

**Practice exercise**

1. Select a dataset with a clear category column.
2. Add a condition that keeps only one category.
3. Add the filtered result as a new data block and confirm the row count in the preview.

<h2 id="help-preprocessing-slice-section">Sample</h2>

![Sample screenshot](tutorials/assets/preprocessing/sample.png)

The Sample sub-tab extracts either a contiguous range or a randomly selected set of rows. A small representative subset makes exploring and debugging quicker than working with the full dataset.

<h3 id="help-preprocessing-slice-offset">Slice — Offset and length</h3>

![Slice screenshot](tutorials/assets/preprocessing/sample_slice.png)

The slice option extracts a contiguous chunk of rows. **Offset** sets the starting row (0-indexed) and **Length** sets how many rows to include. Leave Length blank to slice to the end of the data block. For example, to extract rows 101–200 set Offset = 100 and Length = 100.

<h3 id="help-preprocessing-slice-length">Length</h3>

The number of rows to include in the slice. Leave blank to slice from the offset to the end of the data block.

<h3 id="help-preprocessing-sample-fraction">Random sample — Fraction or count</h3>

![Random screenshot](tutorials/assets/preprocessing/sample_random.png)

The random sample option extracts a randomly selected set of rows.

- **Fraction** — enter a decimal between 0 and 1 (e.g. 0.3 for 30 % of rows).
- **Count** — enter a whole number of rows to extract (e.g. 500). If the count exceeds the data block size, all rows are returned in shuffled order.

<h3 id="help-preprocessing-sample-seed">Random seed</h3>

The random seed controls reproducibility. Using the same seed on the same data always produces the same rows.

- Use any non-negative integer (e.g. 0).
- Check **No Random Seed** to draw a truly random sample — note that this makes the sample irreproducible and the randomness propagates to all derived child data blocks.

<h3 id="help-preprocessing-slice-new-node-name">New data block name</h3>

The pre-populated name includes the sampling parameters. Edit it if you need a more descriptive label. Sample is create-only.

**Practice exercise**

1. Select a dataset with at least 200 rows.
2. Try Slice with Offset 50 and Length 25, then try Random Sample with Fraction 0.2 and a fixed seed.
3. Add each result as a new data block and compare the row counts.

<h2 id="help-preprocessing-join-section">Join</h2>

![Join screenshot](tutorials/assets/preprocessing/join.png)

The Join sub-tab combines two data blocks side-by-side using matching columns. Use it when your text data is in one block and metadata is in another, or when you need to enrich a block before analysis. The result includes all columns from both blocks, making it wider than either source.

<h3 id="help-preprocessing-join-column-picker">Join column picker</h3>

![Join column picker screenshot](tutorials/assets/preprocessing/join_column_picker.png)

Choose which column to match in each data block. The app pre-populates the most likely shared columns, but you are responsible for selecting the correct joining columns. Use clean, consistent identifier columns for the best results.

<h3 id="help-preprocessing-join-type">Join type</h3>

Join type controls how unmatched rows are handled:

| Type | Keeps |
|---|---|
| Inner | Only rows with a match in both blocks |
| Left | All rows from the left block; matched rows from the right |
| Right | All rows from the right block; matched rows from the left |
| Full | All rows from both blocks; unmatched values become nulls |
| Semi | Left-block rows that have at least one match in the right |
| Anti | Left-block rows with no match in the right |
| Cross | Cartesian product of both blocks (can be very large) |

<h3 id="help-preprocessing-join-node-name">Join output name</h3>

Give the joined output a clear name. Leave it blank to use the auto-generated suggestion. Join is create-only.

**Practice exercise**

1. Select two datasets that share an identifier column.
2. Pick that column in both column pickers and run an Inner join.
3. Compare the row count in the preview against both source blocks.

<h2 id="help-preprocessing-concat-section">Stack</h2>

![Stack screenshot](tutorials/assets/preprocessing/concat.png)

The Stack sub-tab vertically concatenates two or more data blocks. Use it when you want to merge data blocks with identical column structures into one longer block.

<h3 id="help-preprocessing-concat-schema-status">Schema status</h3>

![Schema status screenshot](tutorials/assets/preprocessing/concat_schema_status.png)

The schema status panel tells you whether all selected data blocks share the same column structure and highlights any mismatches. Resolve mismatches (e.g. by renaming or removing columns) before stacking.

<h3 id="help-preprocessing-concat-deduplicate">Drop duplicate rows after stacking</h3>

Tick **Drop duplicate rows after stacking** to remove exact duplicate rows from the stacked result. Two rows count as duplicates only when every column matches. Useful when stacking sources that may share overlapping records (e.g. partial dumps of the same dataset).

<h3 id="help-preprocessing-concat-new-node-name">New data block name</h3>

Provide a label for the stacked output. Leave it blank to use the auto-generated suggestion. Stack is create-only.

**Practice exercise**

1. Select two datasets with the same column structure.
2. Review the schema status to confirm no mismatches.
3. Add the stacked result and confirm the row count equals the sum of both sources.

<h2 id="help-preprocessing-segment-section">Segment</h2>

Segment makes a new data block with one row per segment of the text column chosen in the inputs panel. Each segment keeps its source row's other columns, and a **segment** column counts the segments within each source row from 1, so you can trace every segment back.

- **Sentences** end at `.`, `!`, `?`, or `…` followed by a space. A sentence keeps its own punctuation. This is a simple rule, so abbreviations such as "Dr. Smith" also end a sentence, and it can differ slightly from Topic Modelling's sentence option.
- **Paragraphs** are separated by a blank line.
- **Lines** split at every line break.
- **A pattern** is a regular expression marking where each segment starts; `^` means the start of a line. For a transcript written as `JOHN SMITH: Hello`, the pattern `^[\w\s]+:` starts a segment at each speaker. Choose whether the matched text **goes into its own column** (for example *speaker*, with the trailing colon removed) or **is dropped, like a delimiter**. Text before the first match becomes segment 1.

Separators are not kept, segments are trimmed, and empty segments are skipped.

<h2 id="help-preprocessing-split-group-section">Split by group</h2>

Split by group makes one data block per group of a column, so analyses that compare data blocks need one step instead of several filters.

- For **text** and other categorical columns, each value is a group. Values are listed with their row counts, most frequent first.
- For **dates**, group by year, year and month, or day.
- For **numbers**, use ranges of a fixed size from a start value, or split the full range into a number of equal ranges.

Every group starts ticked; untick any you don't need. Each data block is a Filter of the source, named like `speeches · Labor`, with a name prefix you can change. At most 50 data blocks are made at a time. If a column has more groups, narrow the data first, for example with Filter.

<h2 id="help-preprocessing-summarise-section">Group & summarise</h2>

Group & summarise makes a new data block with one row per group, for example one document per speaker. Choose one or more **group by** columns, then a summary for each other column:

- Text: **Join text**, **Count distinct**, **Distinct values**, **First**, **Last**
- Numbers: **Sum**, **Mean**, **Minimum**, **Maximum**, **Count distinct**, **First**, **Last**
- Dates: **Earliest & latest**, **Earliest**, **Latest**, **Count distinct**, **First**, **Last**

The defaults are cautious. The text column chosen in the inputs panel is joined, with a blank line between texts. Dates keep their earliest and latest values. Every other column starts as **Leave out**, so ids are never joined or summed by surprise. A **rows** column always counts the rows in each group. Groups appear in the order they first occur.

<h2 id="help-preprocessing-dedupe-section">Remove duplicates</h2>

Remove duplicates makes two data blocks and never changes the source:

1. `…_deduplicated` keeps the first row of each set of duplicates, in the original order.
2. `…_duplicates` holds every row that has a duplicate, including the kept one, with a **duplicate_group** number and a **kept** column, so you can check what matched.

Rows are duplicates when they match on every column, or on the columns you choose. Tick **Match near-duplicate text** to compare the text column from the inputs panel after ignoring case, spacing, and punctuation. You can also ignore web links and @mentions, so a re-post such as `RT @user: Save the reef!` matches `save the reef`. The preview reports how many rows would be removed.

