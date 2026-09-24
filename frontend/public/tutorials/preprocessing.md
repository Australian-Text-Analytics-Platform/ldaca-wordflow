<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-preprocessing-section">Preprocessing tutorial</h1>

![Preprocessing screenshot](tutorials/assets/preprocessing.png)

The Preprocessing tools transform and prepare raw text data blocks into analysis-ready datasets. Each sub-tab performs a specific type of transformation, and each has a fixed result:

- Tools that change which rows are present (Filter, Sample, Join, Stack) always create a new Derived Data Block. The source is never altered.
- Tools that add or change columns (Find, Create) always update the selected Data Block in place. They never change the number or order of rows.

There are currently six sub-tabs:

| Sub-tab | What it does | Apply behavior |
|---|---|---|
| Filter | Keep only the rows that match one or more conditions | New Data Block |
| Sample | Extract a contiguous slice or a random subset of rows | New Data Block |
| Join | Combine two data blocks side-by-side on a shared column | New Data Block |
| Stack | Vertically concatenate two data blocks that share the same columns | New Data Block |
| Find | Match text patterns with Regular Expressions, then remove, replace, or extract matches | Updates the selected Data Block |
| Create | Build a new column by combining the contents of existing columns | Updates the selected Data Block |

The general workflow for any sub-tab is:

1. Select one or more data blocks from the workspace.
2. Configure the transformation.
3. Review the **Preview** table to check the expected output.
4. Check the **Result** line beside the action button: it says whether the tool creates a new Data Block or updates the selected one.
5. Click **Create Data Block** or **Update Data Block**.

<h2 id="help-preprocessing-common-section">Common controls</h2>

These controls appear across multiple sub-tabs and work the same way throughout.

<h3 id="help-preprocessing-common-node-selection">Data block selection</h3>

Select one or more data blocks from the workspace graph or the data block list. Each sub-tab requires a specific number of data blocks (one for Filter, Sample, Find, Create; two for Join, Stack).

<h3 id="help-preprocessing-common-preview">Preview table</h3>

The preview pane shows the result of the current configuration in a paginated format with an estimated row count. Check the preview before applying to confirm the output looks as expected. No data block is created until you click the action button.

<h3 id="help-preprocessing-common-apply-button">Result destination</h3>

Each tool has one fixed destination, shown as **Result** beside its action button. There is no choice to make.

- **New Data Block** (Filter, Sample including Slice, Random Sample, and Shuffle, Join, Stack): the source is preserved and the new block records its creation lineage.
- **Updates the selected Data Block** (Find, Create): the new or changed column is added to the selected block. Rows are never added, removed, or reordered, so everything that refers to those rows (annotations, analyses, descendants) stays aligned.

An update keeps the selected Data Block's identity, graph edges, parents, descendants, and creation provenance unchanged. Descendants keep their existing independent plans and are not recomputed. Undo/Redo stores only plans for the current open Workspace session, up to 50 edits per Data Block. Closing and reopening the Workspace, importing it, or restarting the backend preserves the latest data but clears Undo/Redo history.

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

Give the filtered output a descriptive name so it is easy to find in the workspace. The new block is a child of the selected source block.

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

<h2 id="help-preprocessing-find-replace">Find</h2>

![Find screenshot](tutorials/assets/preprocessing/find.png)

The Find sub-tab performs text manipulation on a selected column using Regular Expressions (RegEx). It supports two operations, **Replace** and **Extract**, and the transformation can overwrite the source column or write an output column. The result always updates the selected Data Block in place.

**Replace**

![Replace screenshot](tutorials/assets/preprocessing/find_replace.png)

Match a pattern and replace each match with a fixed string. To delete matched text, replace with an empty string. For example, to remove all URLs from a column, match `https?://\S+` and replace with an empty string.

**Extract**

![Extract screenshot](tutorials/assets/preprocessing/find_extract.png)

Match a pattern and extract all captured matches into a new column. For example, to extract all @-mentions from a tweet column, match `@\w+` and save to a new column named *mentioned*.

**Practice exercise**

1. Select a dataset with a text column that contains noise (e.g. XML tags, URLs).
2. Write a RegEx pattern to match the noise and replace it with an empty string.
3. Review the preview, then click **Update Data Block**.

<h2 id="help-preprocessing-aggregate-section">Create</h2>

![Create screenshot](tutorials/assets/preprocessing/create.png)

The Create sub-tab builds new columns by combining the contents of existing columns as text. Use it when you need to analyse multiple columns together — for example, concatenating a title and a body into a single full-text column for topic modelling.

<h3 id="help-preprocessing-aggregate-builder">Basic builder</h3>

Drag column tokens and custom text blocks into the builder to assemble the expression without typing.

- Drag column bubbles into the builder to add them to the expression.
- Add a **Custom Text** bubble for separators or literals, then click it to edit the value.
- Reorder bubbles by dragging them to a new position.

<h3 id="help-preprocessing-aggregate-column-name">New column name</h3>

Set a clear label for the new column so it is easy to find downstream. The column is added to the selected Data Block.

**Practice exercise**

1. Select a dataset with a title column and a body or abstract column.
2. Use the Basic builder to drag both columns into the expression with a space separator.
3. Preview the combined column, then click **Update Data Block**.

