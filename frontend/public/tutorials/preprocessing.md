<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-preprocessing-section">Data Editor and Data Builder</h1>

Data Builder creates live Views from selected inputs. Data Editor changes columns
in the selected Data Block and shows its form above the collapsible Data View.

| Builder tool | Purpose |
|---|---|
| Filter | Keep matching rows |
| Group | Create one live View per selected value, date period or numeric range |
| Join | Combine two inputs using keys |
| Aggregate | Summarise rows by grouping keys |
| Sample | Slice, sample, or shuffle rows |
| Deduplicate | Create first-occurrence rows and duplicate-group members together |
| Stack | Combine inputs by column name |
| Build | Build a column from columns and literals |
| SQL | Run scripts in saved SQL cells |

<h2 id="help-preprocessing-common-section">Common controls</h2>

<h3 id="help-preprocessing-common-node-selection">Data Block selection</h3>

Use **Data Builder inputs** to select inputs. Double-click a graph card, or use its
add button or the sidebar's add button, to add that Data Block to the active tool.
When a view has more than one input area, choose its labelled destination from the **Add to tool** menu. A single area receives the Data Block immediately. Escape closes the menu.

Inputs are independent of graph selection and opened data previews. New results leave existing previews and graph selection unchanged. Filter, Group, Aggregate, Sample, Deduplicate and
Build accept one input; Join accepts two; Stack accepts two or more. SQL uses actual
table names without an input picker. Each tool retains its inputs and draft when you change
tabs or return to Data Loader. Reloading the window may reset drafts.

<h3 id="help-preprocessing-common-preview">Preview table</h3>

You can submit Apply again or change inputs while earlier operations run. Each
submission uses the inputs and output settings captured when you clicked Apply.
Conflicts are reported by DuckDB without automatic retries.

Visual tools preview automatically after a short pause. The shared pagination controls show a page and whether another
page exists; previewing does not count the complete result. Column names and types
are shown even when no rows match. A preview does not create or modify a Data Block. Complete requests can be applied
while previews load, fail, or return no rows; DuckDB validates Apply.

Preview and Apply evaluate separately. Remote data or random sampling can therefore
produce different rows when applied. Errors appear beside the responsible form or preview, with original details, Copy
and feedback actions. Failed requests keep the draft available to correct.

Temporal Filter values remain exactly as typed. Use the shadcn calendar to change
the date portion and the time text field for seconds or fractional seconds. Explicit
timezone text is preserved. Opening the picker does not change a value; DuckDB
validates it. Date, time and interval columns show controls appropriate to their type.

<h3 id="help-preprocessing-common-apply-button">Add to Project</h3>

For Filter, Sample, Join, Stack and Build, accept the short numbered suggestion or choose an unused Data Block name and
click **Add to Project**. The result is
always a View: it stores the query and follows changes to its sources. Its inputs
appear as SQL dependencies in the graph. Existing names are never silently overwritten.
There is no result-type or update-input selector. Data Editor uses **Apply** to
change the selected Data Block in place. Successful Apply closes its form; failure
leaves the editable draft open with Retry.

To store fixed rows afterward, choose **Materialise** in the result's graph menu.
Table cell-edit sessions must finish before preprocessing can apply changes;
schema reads and previews remain available. The SQL console remains independent
and executes the SQL you write.

<h2 id="help-preprocessing-filter-section">Filter</h2>

<h3 id="help-preprocessing-filter-conditions">Filter conditions</h3>

Add column conditions, choose **AND** or **OR**, and optionally negate individual
conditions. Available controls follow the column type: text matches and regex,
numeric and temporal comparisons, ranges, categorical checklists, string-list
membership, and explicitly registered Topic Coverage fields.

SQL conditions keep only rows where the complete predicate is true. NULL does not
match an ordinary comparison; choose **is empty** or select missing in a checklist when
needed. Negating a comparison does not automatically include NULL. An empty result
is valid; the new View applies the predicate through its WHERE clause.

Categorical choices load in pages. Search narrows the available choices; **Select
loaded** selects the currently loaded values. Existing choices persist across
searches. Numeric filter values are sent as exact text, preserving large integers
and decimal precision. Ranges accept either bound, include exact endpoints and
accept zero. Suggested bounds never overwrite edits or arrive for another source.
**Is empty** matches NULL, NaN and blank/whitespace text without changing values.
A date-only timestamp upper bound includes the whole calendar day; an explicit
time keeps its exact comparison.

<h3 id="help-preprocessing-filter-new-node-name">New Data Block name</h3>

The short suggested name uses the source and `flt`, for example `speeches_flt_1`. Change it to any unused name. The
result reads the selected input, producing a SQL-dependency arrow.

<h2 id="help-preprocessing-slice-section">Sample</h2>

<h3 id="help-preprocessing-slice-offset">Slice — offset and length</h3>

Offset is zero-based. Offset 100 and Length 100 returns rows 101–200 of the current
query order. SQL does not promise an enduring row order without ORDER BY.

<h3 id="help-preprocessing-slice-length">Length</h3>

Leave Length blank to take all rows after the offset.

<h3 id="help-preprocessing-sample-fraction">Random sample — fraction or count</h3>

DuckDB reservoir sampling accepts a fraction between zero and one, or a whole-row
count. An oversized count returns all available rows. **Shuffle** samples the full
input. No user-defined random sampling algorithm runs in Wordflow.

<h3 id="help-preprocessing-sample-seed">Random seed</h3>

The default seed is **0**; **No Random Seed** omits it. A seed alone does not promise
identical results across repeated parallel executions. DuckDB guarantees seeded
repeatability with single-threaded execution, while Wordflow keeps the runtime's
normal threading. To preserve one evaluated sample, **Materialise** the resulting
View from its graph menu. This stores the rows evaluated during materialization,
which may differ from the preview.
The preview is illustrative. See [DuckDB sampling](https://duckdb.org/docs/stable/sql/samples).

<h3 id="help-preprocessing-slice-new-node-name">Sample output name</h3>

Sample always creates a new View. The short name uses `slc` for slices, `smp` for random samples and `shf` for shuffles; parameters are not included.

<h2 id="help-preprocessing-join-section">Join</h2>

<h3 id="help-preprocessing-join-column-picker">Join column picker</h3>

Choose a **Left input** and **Right input**, each with its own key. The same Data
Block can fill both roles for a self-join. Double-click a graph card, then place
the Data Block into the labelled desired role. Matching key names use USING; different names
use ON. DuckDB decides type compatibility. Colliding right columns use the right Data
Block name and a unique suffix; a shared matching key appears once. The preview shows the same column names that the new result will use.

<h3 id="help-preprocessing-join-type">Join type</h3>

| Type | Rows retained |
|---|---|
| Inner | Matches from both inputs |
| Left | All left rows, with matching right values |
| Right | All right rows, with matching left values |
| Full | All rows; unmatched values become NULL |
| Keep matches (Semi) | Left rows with a match |
| Keep non-matches (Anti) | Left rows without a match |

<h3 id="help-preprocessing-join-node-name">Join output name</h3>

Join creates a new View with SQL-dependency arrows from its distinct inputs.
Empty outputs are allowed; a live View can gain matching rows later. Check the
preview before creating a result. Cross joins remain available in SQL.

<h2 id="help-preprocessing-concat-section">Stack</h2>

<h3 id="help-preprocessing-concat-schema-status">Schema alignment</h3>

Stack combines rows with **UNION ALL BY NAME**. Inputs can have different columns:
DuckDB aligns names, fills missing values with NULL, and chooses compatible types.
Inspect the resulting preview schema. Incompatible types produce an error; there
is no requirement to manually make every input schema identical.

<h3 id="help-preprocessing-concat-deduplicate">Drop duplicate rows after stacking</h3>

Enable this option to use **UNION BY NAME**, removing duplicate complete output
rows after name alignment and type coercion.

<h3 id="help-preprocessing-concat-new-node-name">Stack output name</h3>

Stack always creates a new View; its referenced inputs appear as SQL dependencies.

<h2 id="help-preprocessing-find-replace">Data Editor</h2>

Open a Data Block's Data View and choose **Find/Replace**, **Extract**, **Combine**,
**Duplicate**, **Clean**, **Split**, **Count**, **Map values**, **Category order**,
**Corpus overview** or **Delete columns** from its Editor
strip. The form occupies the graph area. Collapse Data View when more form space
is useful. Preview reveals affected columns once without moving keyboard focus.
Counts describe the complete current input; previews remain paged.

Map values creates a new text column. Search or page through the values, enter
only the changes you need, and use **Set missing** for a missing output or
**Reset** to keep a value unchanged. Missing, empty text and blank text are
distinct. Category order uses the column's native category order; move values
with drag or the arrow buttons, or use A–Z, Z–A and Reverse. Apply validates the
complete value set together. Corpus overview reads row/column totals, empty and
duplicate documents, character totals and document lengths only when opened.
Delete columns shows a bounded first displayable value beside each column;
failure to read examples does not prevent deletion.

Find/Replace and Extract use literal matching by default. Enable **Regex** for
patterns and `$1`, `$2` capture replacements. Outside Regex, `$1` is literal text.
Literal Whole word preserves boundaries for spaced scripts and allows adjacent
characters at Japanese, Chinese and other unspaced-script edges. Regex patterns
supply their own boundaries. Ignore case changes matching, not stored source text.

Find/Replace and Clean can replace their own source column or write to a new one.
Extract joins all matches or a chosen maximum with a connector. New names trim
outer whitespace only, preserve internal whitespace and reject case-insensitive
collisions. Press Tab in an untouched empty name field to accept its suggestion;
press Tab again to move focus.

Combine accepts `{column}` references, `{{` and `}}` literal braces, and either
blank or missing output when a referenced value is missing. A nonempty constant
is allowed and produces no rows when the source has none. Duplicate retains the
source's physical type and nested metadata.

Split uses literal delimiter chips, with Space, Tab and optional newline controls.
Choose 2–50 columns and a direction. Longer delimiters match first; the final part
(or first part when splitting from the right) retains the unsplit remainder.
Count offers words, Unicode characters, non-whitespace characters and matches;
missing inputs remain missing.

Clean offers whitespace, case, punctuation/symbols, digits, URLs, HTML and XML
operations. Title case keeps apostrophes inside words. XML cleaning parses entities
and CDATA; malformed rows stay unchanged and are counted. **Show malformed XML rows only**
filters the preview for inspection; Apply still cleans all valid rows. HTML is a separate tool.

The Data Block keeps its identity. A **Table** stores the complete change atomically
and retains existing column types and constraints. Table deletion is permanent.
A **View** adds one live query layer, including multi-column changes or deletion;
**Undo** removes that layer. A failed Apply rolls back the whole change and keeps
the form editable. Successful Apply closes the form.

<h2 id="help-preprocessing-group-section">Group</h2>

Choose selected values, date periods or numeric ranges. Missing, empty and blank
text share one empty category. Every group starts selected; clear those you do not
need. At most 50 outputs can be created together. Wider ranges or periods can reduce
the number of groups. Each output is a live View, created in one atomic request.

<h2 id="help-preprocessing-aggregate-section">Aggregate</h2>

Choose grouping keys and type-appropriate summaries. Every result includes row
count. Count distinct excludes missing values. First, Last and Join text follow
incoming order unless you choose a sort column. Date summaries offer earliest,
latest or both. Output names are made unique without renaming source columns.

<h2 id="help-preprocessing-deduplicate-section">Deduplicate</h2>

Choose columns to compare and optional URL, punctuation, symbol, whitespace and
case normalisation. This explicitly creates two live Views in one transaction:
first-occurrence rows, and every member of duplicate groups with a **kept** flag.
Original values and incoming order are retained. No platform-specific removal runs.

<h2 id="help-preprocessing-build-section">Build</h2>

<h3 id="help-preprocessing-build-builder">Column and literal builder</h3>

Build creates or replaces **one column**. Search the column bubbles and drag them
into the builder, or click a palette bubble to add it. The palette always copies;
dragging a placed expression moves it, including any nested contents. A floating
bubble follows your pointer and the original stays dimmed until you drop it.
Dropping outside a highlighted destination leaves it unchanged. Click a
container to make it the destination for palette clicks, or choose **Expression
root** to add at the top level.

**Add value** offers **Text** (default), **Number**, **Boolean** and **NULL**.
Text stays exactly as entered, so `00123` remains text; numeric input preserves its
precision. Click a placed value to edit it.

Click a placed column to open its operations. Steps run in displayed order and
appear as attached chips. Click any chip to edit its parameters. Only the last
operation has a removal ×; removing it exposes the previous step. If editing an
earlier step makes a later one invalid, it stays visible with its reason. Menus
follow the preceding operation's output, so **Split** offers list operations.

The separate × on a bubble removes the whole expression, including its children.
For keyboard movement, focus its drag handle: **Space** picks up, **arrow keys**
choose a valid insertion position, **Enter** drops and **Escape** cancels. The
destination is highlighted, announced and scrolled into view.

A single root expression needs no combination. Adding a second opens **Choose how
to combine**. Cancelling keeps both bubbles and leaves the draft incomplete until
you choose a function. A function bubble contains its ordered arguments:

| Group | Choices | Behavior |
|---|---|---|
| Text | Join text | Set a separator, including a space, or leave it empty. NULL parts are skipped. |
| Numeric | Add, Subtract in order, Multiply, Divide in order, Greatest, Least | Subtract and Divide evaluate from the first part to the last. Arithmetic propagates NULL; Greatest/Least skip NULL arguments. |
| Values | First non-NULL, Make list | First non-NULL uses the first available value. Make list keeps separate elements, including NULLs. DuckDB determines compatible types. |
| Lists | Concatenate lists | Joins list contents, skipping NULL lists while retaining NULL elements. |
| Boolean | AND, OR | Uses SQL three-valued Boolean logic. |

Choices follow the parts' types after their operations. A previously chosen
combination that becomes invalid remains visible until corrected; Wordflow never
silently substitutes another choice.

Use **Add function** inside a container to nest another combination. For example,
put `first_name` and `last_name` inside **Join text**, click each column to add
**Trim both ends**, then click **Join text** to add **Lowercase** to the combined
result. The same label opens function settings, including the text separator.
You can also apply **Round** to **Add**, or **List length** to **Concatenate lists**.
Borders show containment; drop indicators show the exact insertion position.

The SQL stays visible while you build. **Needs input** marks an empty function;
**Choose a function** marks an unresolved combination; **Incomplete input** points
to an unfinished child. **Check operation** identifies an invalid chain.
**Draft SQL** preserves all bubbles and marks missing pieces explicitly, for example
`concat_ws(' ', "first_name", concat_ws(' ', /* add input */))`. It is not sent to
the database until the visual expression is complete. You can choose **Edit SQL
expression** to complete the displayed draft directly. **New visual expression** starts an empty builder after confirming that the edited SQL will be discarded. The previous successful preview remains visible and marked outdated.

The menu follows the preceding step's result type. For example:

- **Trim both ends → Lowercase → Count distinct** counts normalized text values.
- **Split → List length → Mean** computes the average number of list elements.
- **Mean → Round** rounds a column's average.

| Input | Available operations |
|---|---|
| All types | Is NULL, Is not NULL, Count non-NULL, Count NULL |
| Supported scalar types | Fill NULL, Count distinct, Minimum, Maximum |
| Numeric | Absolute value, Sign, Round, Truncate, Floor, Ceiling, Square root, Power, Natural logarithm, Base-10 logarithm, Exponential |
| Numeric summaries | Sum, Mean, Median, Sample standard deviation, Sample variance |
| Text and categorical | Lowercase, Uppercase, Trim both ends/left/right, Strip accents, Character length, Reverse text, Substring, Replace literal text, Contains, Starts with, Ends with, Split, Parse datetime |
| Date/time | Extract applicable parts; truncate dates/timestamps; format dates/timestamps as text |
| Boolean | NOT, Is true, Is false, Count true, Count false, All true, Any true |
| Lists | Length, Non-NULL element count, Distinct elements, Sort, Reverse, Element at index, Slice, Contains element; Join text elements; Sum/Mean/Minimum/Maximum of numeric elements |

Date parts follow the source type: dates expose calendar parts, times expose
hour/minute/second, and timestamps expose both. **isodow** uses Monday=1; **week**
is the ISO week number; **second** returns whole seconds. Datetime parsing and
formatting use DuckDB formats: `.%f` for fractional seconds and `%z` for a UTC
offset. Invalid input or out-of-domain numeric operations produce native errors.

List indices are 1-based and negative indices count from the end. Slice endpoints
are inclusive. List length includes NULL elements; non-NULL element count does
not. Distinct elements removes NULLs and can change order. Joining text elements
skips NULLs. Empty lists and NULL lists retain DuckDB's normal behavior.

Explicit semantic types and unsupported structures expose only NULL checks and
counts; Wordflow does not guess semantic operations from their shape. Exact
result types appear in the preview. Numeric parameters retain their entered
precision. If a removed step or changed source schema invalidates a chain, the
draft remains visible with the step identified; correct it before Preview or Apply.

See DuckDB's [text](https://duckdb.org/docs/current/sql/functions/text),
[numeric](https://duckdb.org/docs/current/sql/functions/numeric),
[date/time](https://duckdb.org/docs/current/sql/functions/datepart), and
[list](https://duckdb.org/docs/current/sql/functions/list) references for native semantics.

<h3 id="help-preprocessing-build-expression">Column summaries and SQL</h3>

Independent branches can each have a column-wide summary. A summary on a
container is available only when none of its children already contains a summary. Scalar operations can run before
or after it. The summary uses the entire input, before preview pagination, and
broadcasts its result to each row. A summary does not create a row for an empty
input. Count ignores NULLs unless explicitly labeled Count NULL; sample standard
deviation and variance require enough non-NULL values and follow DuckDB's rules.
Use **Edit SQL expression** for arithmetic with mixed operators, nested functions
or `CASE` expressions. It renders the current expression in the themed editor. For example:

```sql
CASE WHEN "score" >= 50 THEN 'Pass' ELSE 'Review' END
```

**Insert column** searches the input schema and inserts a correctly quoted name
at the cursor. Write an expression, not a complete SELECT or script; use the SQL
console for full statements, grouping or row expansion.

Adding a summary in the builder produces a window expression for the new View.
Handwritten SQL, including explicit scalar subqueries and casts, keeps its meaning during Preview and Apply.

**New visual expression** asks before discarding your SQL draft. **Keep SQL** cancels the transition. **Start new expression** opens an empty visual builder and retains the output column name. SQL is not converted back to bubbles. Malformed SQL stays in the editor for correction.

Drafts survive application-tab changes. Reloading may discard them.

Both modes preview after a **350 ms** pause. Pagination resets when the expression
changes. The last successful table stays visible while a replacement loads or fails,
with an **Outdated** notice. Automatic SQL errors appear beside the editor without
repeated notifications while typing. Apply remains available for complete requests
regardless of preview success; failed Apply reports one expandable error and keeps
your draft.

<h3 id="help-preprocessing-build-column-name">Output column name</h3>

An existing column name replaces that column only in the new View; the input
is unchanged. DuckDB determines the output type from the expression. Unchanged, explicitly
mapped columns retain applicable metadata; computed columns do not inherit semantic
descriptors. Document and tokenizer preferences remain only for compatible columns.

<h2 id="help-preprocessing-sql-section">SQL</h2>

The SQL console contains independently saved cells. Write ordinary DuckDB SQL
against actual table names; the default schema is `data`:

```sql
SELECT * FROM "documents" WHERE length(text) > 100;
```

The Play button executes the cell (**⌘/Ctrl+Enter**). Its menu offers:

- **Default:** explicitly run the complete script. Statements execute in order in
  one transaction, showing the last statement's result. A failure rolls back the
  database changes. File effects from SQL such as COPY cannot be rolled back.
- **Live preview:** after a 600 ms pause in typing, run one complete query in a
  read-only transaction. Multiple statements and writes require Default. Opening
  the console or duplicating a Live cell never automatically runs it. DuckDB limits
  this query to 50,001 rows to detect truncation; only 50,000 are displayed. Errors
  in unvisited rows may not appear. Aggregates and sorting can still scan all input.

Explicit runs can overlap, including repeated Play in the same cell. The latest
successful completion supplies its result, even if that run was submitted earlier.
Failed or cancelled runs keep the previous result. Automatic Live previews run one
at a time per cell and keep only the latest pending edit. Conflicting writes report DuckDB
errors without automatic retries.

Variables, explicit session settings and `USE` apply only within the current
Run. For example, `SET VARIABLE minimum = 10; SELECT * FROM documents WHERE
length(text) > getvariable('minimum');` works in Default mode. Another cell or
a later Run starts with a fresh connection and the `data` schema.

Use **Add Cell**, or the plus between cells, to insert a cell. Drag its handle to
reorder, or use **Move cell up/down** in the menu. **⌘/Ctrl+↑/↓** moves a focused
handle without changing editor cursor keys. The menu also offers Duplicate,
Delete and **Format selection/cell** (**⌘/Ctrl+Alt+O** in the editor). Formatting
preserves identifier casing and leaves unsupported syntax unchanged.

New cells stay local until their first run, including Live preview. Typing, changing
mode and blur do not save a never-run cell. First Run saves its SQL and mode before
execution; after that, text saves on blur and before Run. A failed script remains saved.
Ordering and deletion changes to saved cells are also saved. Unsaved/Saving/Saved indicates
source persistence. Drafts and results survive switching application tabs. Text
in never-run cells is discarded on reload. Later edits to saved cells must reach blur
or Run to be guaranteed saved before closing.
Results are kept only in memory and are never executed automatically on reopening.

Each cell displays up to **50,000 rows**, with a notice when truncated. Paging reads
that captured result and does not rerun SQL. Editing SQL marks its previous result
outdated. The display cap does not limit INSERT, UPDATE, DELETE or COPY effects.
For full output, use DuckDB SQL, for example:

```sql
COPY (SELECT * FROM documents) TO '/absolute/path/documents.parquet' (FORMAT PARQUET);
```

SQL-created objects appear with **Show Dependencies** enabled. They do not automatically
appear in the logical graph or preprocessing inputs. Register them
and additional virtual relationships explicitly when desired; View SQL dependencies
are calculated automatically:

```sql
CREATE VIEW long_documents AS SELECT * FROM documents WHERE length(text) > 100;
INSERT INTO wordflow.nodes (table_name) VALUES ('long_documents');
INSERT INTO wordflow.edges (source_name, target_name) VALUES ('documents', 'long_documents');
```

Direct SQL owns its metadata and constraints. The console does not infer graph
relationships, repair downstream Views or add Undo layers. Successful Default
runs refresh existing graph/data displays without changing selection or previews.
Finish table editing before saving or executing SQL cells. Runtime transaction
control, connection settings, attachments and extension management are unavailable
in cells because the project owns the shared connection.

[← Back to tutorial index](./index.md)

New Stack requests preserve duplicate rows. **Remove identical complete rows after stacking** is optional and compares whole rows. A Join can produce multiple output rows when a key has multiple matches.

Build suggests an unused `col`, `col_2`, etc. for a new column. You can enter a
meaningful name instead; entering an existing column name deliberately replaces it.
Automatic names never rename existing Data Blocks or imported columns.
