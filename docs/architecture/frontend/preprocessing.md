# Project preprocessing

The current project application enables Data Loader and Preprocessing while
analysis execution remains disabled. Both native windows and the Rust browser
preview use the same six visual preprocessing panels and SQL console and project connection.

`features/tools/preprocessing/DataPreprocessingFeature.tsx` connects the retained
forms to small SQL builders in `sql.ts`. `projectPreprocessing.ts` owns preview,
schema inspection, result registration and execution. No generated FastAPI request
model, authentication state, project UUID or Polars expression crosses this path.
The shared input picker receives explicit presentation props. Join owns separate left
and right roles, including independent columns for self-joins. Graph additions stay
carried until the user chooses a role; rename/deletion reconciles both references.

Graph double-click and graph/sidebar add buttons share the scoped input-request
bridge. The active tool's sole input area consumes additions immediately through
the same validation as its picker. Multi-area owners defer consumption and expose
the shared pointer carrier and placement targets. Right-click discards the latest
carried block and Escape clears the stack. Native scopes use the window's backend
connection and active tool, with no server project provider or project UUID. Renaming
or deleting a node reconciles pending additions as well as selected inputs.

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

Filter, Sample, Join, Stack and Build create new Views through the shared View-creation
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

Find uses the column-change operation's expression variant. It captures the selected object
name and kind, source/output columns and regex settings at submission. Blank output
names replace the source column; existing names are resolved with DuckDB identifier
matching. Tables use `ADD COLUMN IF NOT EXISTS … VARCHAR` followed by `UPDATE` in
one transaction. Existing column types and constraints remain authoritative; failure
rolls back added columns as well as values. Tables gain no Undo or backing object.
Rust wraps a View’s previous definition through the existing query-layer implementation with
`SELECT * REPLACE` or an added expression. Repeated edits retain live behavior and
SQL-layer Undo without self-references. Both paths clear transformed-column
descriptors and keep document/tokenizer preferences only for compatible text types
in the same transaction. New columns receive no inferred metadata. No node or edge
is created, and native dependency/conflict errors are reported without retries.

Unchanged mapped columns retain descriptors only if catalogue types match. Stack
and a full join's merged key require agreement among all contributing mapped columns.
A right join's merged key takes its preferences from the right input. Computed columns lose
semantic descriptors. Document and tokenizer preferences survive only when the
mapped column remains a compatible text type. Generic user SQL remains responsible
for its own metadata. No semantic propagation through arbitrary SQL is attempted.

After a successful commit, the window observer invalidates graph metadata and queries
that depend on the affected object, including dependent Views. Failures have one expandable Sonner owner and
preserve the draft. Native runtime cell-edit guards and transaction rollback remain
authoritative. No project format, task system, shutdown or window ownership changes
are part of preprocessing.

The [user tutorial](../../../frontend/public/tutorials/preprocessing.md) owns the
operation controls, SQL examples, NULL rules, regex syntax and sampling caveats.

Creating a result or applying Find leaves existing previews and graph selection unchanged.
Find refreshes an already-open preview without opening a closed one.

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

Each independent branch may contain a summary, but a visual summary cannot wrap
another summary. New visual summaries use window expressions. SQL-to-bubble
conversion preserves explicit scalar-subquery summaries and never rewrites their
meaning; both forms execute as part of the new View.

SQL and bubbles represent the same expression. Draft rendering uses the same
operation catalogue as validated SQL, retaining unfinished subtrees and explicit
missing-input/function markers. Neutral labels distinguish missing inputs from
invalid operations, which expose the step and reason. Incomplete visual trees
cannot preview or Apply, but their displayed Draft SQL can be opened for editing.
Entering SQL mode copies the displayed expression;
returning uses the read-only [expression parsing endpoint](../../reference/native-project-api.md#expression-parsing).
DuckDB serializes a SELECT containing exactly one expression without executing or
binding it. Its internal AST stays native. The transport carries syntax nodes,
faithful SQL, and string-valued literals; it never transports decimal constants as
JavaScript numbers. The frontend catalogue recognizes operation shapes and
parameters. Unsupported subtrees retain DuckDB-rendered SQL in editable bubbles.
Arithmetic grouping and explicit casts retain their meaning; formatting and
comments need not survive conversion. Unknown SQL result families do not enable
guessed type-specific menu entries. Unsupported physical/semantic Arrow fields
remain restricted to their applicable NULL checks and counts.

Invalid SQL stays in the editor with an inline diagnostic and leaves the last
valid tree intact. Obsolete parse requests are aborted and cannot replace a newer
draft. There is no restoration prompt or arbitrary-SQL expression parser in the
frontend. Insert column uses the CodeMirror cursor and central identifier quoting.
Local drafts survive tab switches, but reloading may discard them.

The shared preview hook owns one 350 ms debounce, AbortSignal propagation,
request-key isolation and pagination reset. Build retains only its last successful
display snapshot while a replacement is pending, invalid or failed, marking it
outdated. Automatic SQL preview errors appear beside the editor without typing-time
toasts. Apply captures the current draft and output name independently of preview
success; failures retain the draft and use the existing notification owner.

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

Column mutations and visual Apply submissions may overlap, including repeated Apply
from the same tool. The controller captures input nodes, transformation and output name before asynchronous preparation. Pending TanStack mutations
drive informational activity; they do not disable inputs or pause table reads. DuckDB reports conflicts
without queuing, retries or automatic output renaming. Validation and the runtime's
editor protection remain in force.


## Temporal controls and shared interaction primitives

Casts explicitly select TIMESTAMP (wall-clock) or TIMESTAMPTZ (instant), compared
against authoritative Arrow temporal types. Blank format uses strict CAST; an
explicit format uses strptime followed by conversion to the selected target. No
sample inference or offset guessing runs in the frontend.

Filter owns exact temporal text. Its shadcn Calendar uses Radix Popover; dates and
timestamps expose date selection, timestamps also expose a precise time text field,
and times/intervals use text. Calendar selection replaces only the date; time edits
preserve the timezone suffix. Opening/closing never rewrites values. JavaScript Date
is only the Calendar adapter, not a timestamp conversion mechanism.

Pagination delegates popup focus, dismissal and positioning to Radix. Stacked
sidebar resizing uses pointer capture, releasing on pointer up, cancel, capture
loss or unmount. Preview tables retain controlled pagination without unused sorting
or filtering state; Data View and editor interactions remain separate.
