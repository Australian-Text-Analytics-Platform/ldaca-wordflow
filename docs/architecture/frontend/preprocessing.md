# Data Editor and Data Builder

Native windows and the Rust browser preview use the same Data Editor, Data Builder
and project connection. Builder tools appear as Filter, Group, Join, Aggregate,
Sample, Deduplicate, Stack, Build and SQL. The former Builder Find form is removed.

`features/tools/preprocessing/DataPreprocessingFeature.tsx` connects the retained
forms to small SQL builders in `sql.ts`. `projectPreprocessing.ts` owns preview,
schema inspection, result registration and execution. No generated FastAPI request
model, authentication state, project UUID or Polars expression crosses this path.
The shared input picker receives explicit presentation props. Join owns separate left and right roles, including independent columns for self-joins. Graph/sidebar additions use the active tool's registered input destinations. One area receives an addition immediately; multiple areas open a labelled chooser. Duplicate and capacity checks stay with the picker. No pending stack or pointer carrier remains. Rename/deletion reconciles selected inputs.

## State and preview ownership

Each webview owns its QueryClient and preprocessing input store. Table names are
input identities. Rename/deletion reconciles those inputs alongside graph selection.
Each visited tool remains mounted so its local draft survives tool and Data Loader
navigation. Hidden tools do not request previews. The feature and SQL editor load
lazily without mounting an analysis provider.

Schemas load independently through the read-only node schema endpoint with explicit
column metadata. Visual forms
share the same generated transformation between Preview and Apply. Debounced,
abortable preview queries fetch one page plus a lookahead row through the exact
Arrow decoder. Preview caches are discarded when unused; they never count the full
result or invalidate graph state. The independent SQL console is described below.
Superseded HTTP responses do not replace the current preview. Aborting HTTP does
not promise interruption of already accepted database work. Preview loading, failure
or an empty result never disables a complete Apply request; DuckDB validates its
transaction. Filter statistics and missing-value hints remain automatic.

## Applying a result

Filter, Group, Join, Aggregate, Sample, Deduplicate, Stack and Build create new Views through the shared View-creation
operation. The frontend supplies SELECT SQL and column mappings; Rust creates the View,
registers its name and copies applicable metadata in one transaction. The graph
calculates dependencies from the resulting SQL; creation does not write virtual
edge rows. Repeated references in self-joins produce one dependency arrow. Empty
results are valid.
DuckDB checks duplicate names; neither source objects nor existing outputs are
replaced. There are no preprocessing destination modes, Table-creation branches,
or general update-input framework. Materialize remains an explicit graph action for fixed rows.
The [project API](../../reference/native-project-api.md) exposes shared View-creation
and column-change contracts, without one endpoint per preprocessing tool.

## In-place Data Editor

The existing window-local preview store owns the active Editor target, tool and draft.
Opening a tool replaces the graph area with its form; the collapsible Data View stays
below it. Ratios last only until reload. Closing the form restores the graph and
retains the open Data View. Successful Apply closes its captured form; failure keeps
an editable draft and an inline original diagnostic with Retry. Pending Apply prevents
repeat submission. Completion cannot close another tool or target opened meanwhile.

Find/Replace, Extract, Combine, Duplicate, Clean, Split and Count compile ordinary
DuckDB SQL through `data-editor/expressions.ts`. Preview and Apply share those
expressions. The Data View uses the existing debounced, abortable preview hook and
retains the last valid preview, visibly marked outdated. Changed-row and malformed-XML
counts describe the complete input. Affected headers are highlighted and
revealed once after a fresh settings preview without moving focus. Pagination,
resizing and manual horizontal scrolling do not trigger repeated settling. Preview sorting affects only the preview.

Literal matching is the default. `$1` stays literal outside Regex. Whole-word literal
boundaries relax only at unspaced-script edges through the shared native Concordance
matcher. Regex is explicit and retains capture replacement. Combine uses a small
brace scanner, exact column references and an explicit missing-input policy; nonempty
constant templates still select from the source, including zero source rows. Split
uses longest-first literal delimiters, optional newlines, either direction, 2–50
outputs, preserved empty parts and remainder, and NULL padding. Count preserves NULL
and distinguishes words, Unicode characters, non-whitespace characters and matches.
XML uses a native parser for entities and CDATA, retaining malformed values and reporting
affected rows. A preview-only malformed-row filter exposes those rows without
changing Apply membership. HTML remains a separate cleaning choice. Title case preserves
in-word apostrophes. Native scalar text functions register on every project database
owner and remain available when saved Views reopen.

The native `transform_many` operation binds all expressions against the original
schema. Tables add columns with DuckDB's inferred exact physical types and update
all outputs in one transaction; existing types and constraints remain authoritative.
Views receive one ordinary query layer. Direct column copies preserve nested Arrow
annotations; computed columns discard semantic annotations. `delete_many` removes all
selected columns atomically, retaining at least one. Tables show a permanent-change
warning; Views offer one SQL-layer Undo. Neither operation creates a Data Block or
child task. New names trim outer whitespace, preserve internal whitespace and reject
case-insensitive collisions; replacing the exact source retains its original name.
Generated suggestions use the shared guarded Tab interaction, excluding composition
and modified keys. Native validation remains authoritative for Preview/Apply races.

## Multiple Builder outputs

Group discovers at most 51 categories to enforce a 50-output limit. Values, calendar
periods and numeric intervals use the same expression for counts, previews and saved
View predicates. Missing and blank text share the empty category. All discovered
groups start selected; more than 50 requires a narrower source or wider period/range.

Aggregate creates a live View with selected grouping keys, a row count and type-appropriate
summaries. The source document defaults to joined text and dates to earliest/latest;
other summaries are opt-in. First, Last and joined text use incoming order unless an
explicit sort is selected. Count distinct excludes NULL. Output names receive unique
suffixes. Deduplicate compares selected columns and optionally normalises text URLs,
punctuation, symbols, whitespace and case without rewriting source values. It creates
first-occurrence rows and all duplicate-group members with a unique kept-flag column.
Incoming row order determines the first occurrence.

Group and Deduplicate submit every output to `POST /api/project/views/batch` once.
The native View owner validates 1–50 outputs, creates and registers them with metadata
in one transaction, and emits one committed change. A failure leaves no output behind.
Validation remains schema-only and lazy; later source changes flow through saved Views.
Join offers six matching joins, Left first; Cross remains available in SQL. Right-column
collisions use the right Data Block name and unique suffixes. Preview and Apply share
the same projection, including merged keys. Stack delegates compatibility to DuckDB
UNION BY NAME.

Unchanged mapped columns retain descriptors only if catalogue types match. Stack
and a full join's merged key require agreement among all contributing mapped columns.
A right join's merged key takes its preferences from the right input. Computed columns lose
semantic descriptors. Document and tokenizer preferences survive only when the
mapped column remains a compatible text type. Generic user SQL remains responsible
for its own metadata. No semantic propagation through arbitrary SQL is attempted.

After a successful commit, the window observer invalidates graph metadata and queries
that depend on the affected object, including dependent Views. Failures appear beside the responsible form or preview with original diagnostics and
preserve the draft. Native runtime cell-edit guards and transaction rollback remain
authoritative. No project format, task system, shutdown or window ownership changes
are part of preprocessing.

The [user tutorial](../../../frontend/public/tutorials/preprocessing.md) owns the
operation controls, SQL examples, NULL rules, regex syntax and sampling caveats.

Creating a Builder result leaves existing previews and graph selection unchanged.
Editor commits refresh the open Data View through the existing change observer.

## Build operation ownership

`build/operations.ts` is the finite frontend catalogue shared by the operation
popover and SQL builder. Each entry defines eligible input families, parameters,
its next result family and native DuckDB expression. `buildExpression` resolves
column tokens against current Arrow fields, including decimal, dictionary,
temporal and list element types. Tokens never retain a duplicate dtype string.
Explicit semantic metadata prevents physical-shape inference. DuckDB and returned
Arrow fields remain authoritative for exact types.

Build requests distinguish a recursive visual expression from SQL text. Columns,
typed Text/Number/Boolean/NULL values, combinations and opaque SQL fragments share
one tree. Each expression owns its operation chain; a combination owns ordered
children. Text and numeric inputs remain lossless strings. No automatic combination
or separate final-operation list remains.

The searchable column palette copies leaves into the focused container (root by
default). Internal moves preserve a complete subtree. Pointer capture owns internal
dragging so it also works alongside Tauri's native file-drop handler. Drop targets
are overlays identifying the parent and insertion slot, so they occupy no layout
space. A pointer-transparent floating preview preserves the pickup offset; the
original stays dimmed until a successful drop. Containers use compact label/count
previews. Space picks up from a drag handle, arrows traverse valid slots, Enter
drops, and Escape cancels. The same tree functions implement moves and reject cycles. A second root opens the combination chooser. Cancelling keeps
both roots as an incomplete draft. Containers wrap within the pane and expose
function settings, operations and Add function. A direct × removes an entire
expression. Only the last operation can be removed; every operation retains
parameter editing, including edits that invalidate later steps.

Each independent branch may contain a summary, but a visual summary cannot wrap another summary. New visual summaries use window expressions. Handwritten SQL retains its explicit casts, scalar subqueries and other expression semantics.

Draft rendering uses the same operation catalogue as validated SQL, retaining unfinished subtrees and explicit missing-input/function markers. Incomplete visual trees cannot preview or Apply, but their displayed Draft SQL can be opened for editing. Entering SQL mode copies the displayed expression once. **New visual expression** confirms discarding edited SQL and starts an empty builder, retaining the output column name. No frontend SQL reconstruction runs.

The read-only [expression parsing endpoint](../../reference/native-project-api.md#expression-parsing) remains public. DuckDB serializes a SELECT containing exactly one expression without executing or binding it. Backend expression validation and exact cast handling remain independent of the UI transition.

Invalid SQL stays in the editor with an inline preview diagnostic. The last successful preview remains visibly outdated, and a failed Apply preserves the draft.

The shared preview hook owns one 350 ms debounce, AbortSignal propagation,
request-key isolation and pagination reset. Build retains only its last successful
display snapshot while a replacement is pending, invalid or failed, marking it
outdated. Automatic SQL preview errors appear beside the editor without typing-time
toasts. Apply captures the current draft and output name independently of preview
success; failures retain the draft and appear beside the Builder form.

Drafts survive application-tab navigation but have no persistence or recovery.
There is no discovery endpoint, backend operation catalogue or serialized Polars
expression. The tutorial owns the user-facing operation inventory.

## SQL console

The SQL tab mounts `sql/SqlSubTab.tsx` independently of the visual tool controller:
there is no input picker, destination selector or `__wf_current` binding. Cells
use the window's managed project connection and ordinary table names. Direct SQL
creates ordinary database objects; registering nodes and additional virtual relationships remains
explicit SQL. Default execution publishes a broad committed change; Read/Preview
publishes none. The window observer owns refresh without changing selection or
opening previews. Application-owned source saves invalidate only SQL-cell metadata.

TanStack Query owns persisted cell records. Window-local component state owns the
ordered membership list, unsaved drafts and latest Arrow result per cell. If loading
finds no cells, the console creates one empty local draft. Add, Insert and Duplicate
also create local drafts; typing, mode selection and blur do not persist them.
First execution (including automatic Live preview) inserts the captured source and
mode before running. After that, blur and Run save source separately from execution.
A failed script stays saved, while failed persistence preserves the draft and prevents
execution. Deleting the last cell leaves this activation empty.

Metadata mutations share one TanStack mutation scope, serializing source saves and
structural edits. Each save checks current membership and persistence at execution
time; ordering/deletion changes only update existing records and cannot insert other
drafts. Unchanged positions are not written. Source completion updates the submitted snapshot without clearing newer
text or restoring old order. Known changes update the cell cache directly. Pending
source saves do not disable unrelated controls; structural controls wait for their
own structural operation. There is no native flush or recovery protocol. Never-run
local cells are discarded on reload, and edits to saved cells must reach blur or Run
to be guaranteed persistent.

Default runs are independent, including repeated Play within one cell. Each captures
its SQL and executes exactly once after its source save succeeds. The latest
successful completion supplies the displayed result, even when submitted earlier;
failed or cancelled runs retain that result. Pending counts are independent of result
ownership. Live preview waits 600 ms after editing or explicitly choosing Live.
Automatic previews coalesce per cell, with one running and only the newest waiting
draft. Explicit Play does not share that gate. Loading or duplicating a Live cell
never runs it automatically. Incomplete automatic syntax keeps the previous result;
explicit failures use the single expandable Sonner owner. Table editing still protects
writes, including console source persistence; source schemas and visual previews
remain readable.

The backend returns at most 50,000 rows and a truncation flag. Default execution
drains the complete script before committing. Live preview applies a DuckDB LIMIT
of 50,001 for truncation detection; it may not encounter errors in unvisited rows.
Sorting and aggregates can still process the full input. Each cell retains that Arrow table and its executed SQL
snapshot in memory. Only the displayed page is normalized for the shared preview
table and pagination control. Paging never executes SQL. Duplicate Arrow field
names receive unique presentation keys while their original fields and values
remain intact. Text changes label the captured result outdated. Tab navigation
retains cells and results; reload clears results. There are no result tables,
result-paging endpoints or persistent execution history.

Ordering and deletion affecting saved records persist transactionally; local drafts
are never inserted as a side effect. Formatting
loads `sql-formatter` on demand with its DuckDB dialect, preserves identifier case,
and uses the CodeMirror selection or full cell. Format errors leave source intact.
Run and format shortcuts are cell-scoped; move shortcuts belong only to the drag
handle so editor cursor navigation remains unchanged.

Generated joins use ordinary `a`/`b` aliases for disambiguation and self-joins.
Pagination and output normalization retain alias-free subqueries. Explicit View
column lists use an ordinary `definition` alias. The internal `__wf_current` and
`__wf_previous` contract remains exclusively for visual View layers and Undo;
existing user SQL and transient table-edit transport fields are not rewritten.

## Concurrent visual actions

Independent Builder Apply submissions may overlap. The Editor and multi-output forms
disable their current submission until it settles. The controller captures input nodes, transformation and output name before asynchronous preparation. Pending TanStack mutations
drive informational activity; they do not disable inputs or pause table reads. DuckDB reports conflicts
without queuing, retries or automatic output renaming. Validation and the runtime's
editor protection remain in force.


## Temporal controls and shared interaction primitives

Casts explicitly select TIMESTAMP (wall-clock) or TIMESTAMPTZ (instant), compared
against authoritative Arrow temporal types. Blank format uses strict CAST; an
explicit format uses strptime followed by conversion to the selected target. No
sample inference or offset guessing runs in the frontend.

Numeric ranges accept either inclusive bound, including zero, without converting exact
text through JavaScript numbers. Filter prefilling only seeds untouched fields while
the captured source, column, operator and request remain current. Is empty covers NULL,
NaN and whitespace-only text without rewriting data. A date-only timestamp upper bound
uses less than the next calendar-day start; explicit times retain exact comparisons.

Filter owns exact temporal text. Its shadcn Calendar uses Radix Popover; dates and
timestamps expose date selection, timestamps also expose a precise time text field,
and times/intervals use text. Calendar selection replaces only the date; time edits
preserve the timezone suffix. Opening/closing never rewrites values. JavaScript Date
is only the Calendar adapter, not a timestamp conversion mechanism.

Pagination delegates popup focus, dismissal and positioning to Radix. Stacked
sidebar resizing uses pointer capture, releasing on pointer up, cancel, capture
loss or unmount. Preview tables retain controlled pagination without unused sorting
or filtering state; Data View and editor interactions remain separate.
