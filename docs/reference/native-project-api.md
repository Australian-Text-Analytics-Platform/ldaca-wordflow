# Native Project API

Rust serialization types and annotated handlers own these routes. The
[generated OpenAPI document](../../backend/openapi.json) is the exact wire reference. See [lifecycle](native-backend.md) for listeners, readiness and
host ownership, and [project semantics](../domain/native-projects.md) for graph
and persistence behavior.

## Project Lifecycle

| Method and path | Request | Success |
|---|---|---|
| `GET /api/project` | None | `{"project": null}` or a project descriptor |
| `POST /api/project/create` | Optional `path`; `{}` creates Untitled | 201 project descriptor |
| `POST /api/project/open` | `{"path":"/absolute/example.wfpj"}` | 200 project descriptor |
| `POST /api/project/save` | Optional `path`; `{}` checkpoints a named project | 200 project descriptor |
| `POST /api/project/close` | `{}` | 204, including concurrent/repeated closes |

A descriptor contains `path` (null for Untitled), `title`, and
`schema_version` (1). The title comes from the filename or is Untitled. No UUID,
name, or path is persisted in metadata. There is no modification indicator;
successful operations commit immediately. Every Untitled close prompts for a
permanent destination, including an untouched project.
Create refuses an existing destination. Open requires an existing supported
Wordflow database. Create/open bind an unbound runtime once. Closing retires it;
opening another file requires another runtime. Save with a path atomically
publishes at that destination, honoring native Replace approval, and retains
the same runtime and backend URL. Another window or external DuckDB owner must
close the destination first; replacement failure leaves the source usable. Older formats are rejected without migration.

## Expression parsing

`POST /api/project/expressions/parse` accepts `{"expression":"lower(\"text\")"}`.
It uses an ordinary read-operation connection and read-only transaction, including
while the table editor owns write protection. DuckDB parses one SELECT expression;
no supplied expression is bound or executed. Lists of expressions, aliases,
outer clauses and scripts are rejected through the structured error envelope.

The JSON response is a recursive syntax DTO. Every node includes faithful `sql`
and a `kind`: `column` (`names`), `literal` (`literal_type`, string `value`),
`function` (`name`, `children`, `distinct`, `window`), `operator` (`name`, `children`),
`cast` (`target`, `child`, `try_cast`), `scalar_query` (`source`, `child`), or `sql`
for an opaque fragment. Only a plain scalar SELECT from one relation exposes
`scalar_query`; other subqueries remain opaque. Only an unpartitioned, unordered
`OVER ()` exposes a window function. The internal DuckDB AST is never public.

Literal text and canonical SQL retain large-integer and decimal precision. Explicit
casts and unknown function variants remain available through faithful SQL.
Frontend catalogue recognition controls visual editing; Rust contains no Build
operation catalogue. This interface changes neither project data nor project format.

## SQL

`POST /api/project/sql` accepts:

```json
{
  "statements": [
    {"sql": "CREATE TABLE data.documents AS SELECT * FROM read_csv(?)", "parameters": ["/absolute/input.csv"]},
    {"sql": "SELECT * FROM data.documents LIMIT 100", "parameters": []}
  ]
}
```

Alternatively, pass `script: "SELECT ...; SELECT ...;"` instead of `statements`.
Exactly one representation is required. The backend lexer splits raw scripts,
preserving quoted strings, dollar quoting and comments, and validates the whole
batch before preparing anything. There is no frontend semicolon splitting.

Optional `task_label` opts a request into native task tracking. The HTTP boundary
consumes this label; it does not change SQL execution. The console supplies it for
Default runs only. Ordinary SQL calls, including previews and cell persistence,
remain untracked when it is omitted.

`mode` controls access and defaults to `execute`:

| Mode | Transaction and input |
| --- | --- |
| `execute` | Normal transaction when mutation permission is available; read-only while editor protection is pending or held. Complete batches are allowed. |
| `read` | Always read-only; complete batches and request-local setup are allowed. |
| `preview` | Always read-only; exactly one complete query accepted by DuckDB's parsed-query machinery. |

The permission is acquired atomically and held through execution and cleanup.
No statement-effect classification, permission upgrade or retry occurs. DuckDB
rejects persistent writes and sequence changes in read-only transactions, while
allowing supported temporary objects and file exports. Read-only access is not a
filesystem sandbox. Invalid or incomplete Preview syntax returns `not_previewable`;
execution errors keep the regular structured SQL error. Every transaction is
released after failure or interruption.

Optional `max_rows` (1–50,000) caps returned Arrow rows. For `mode: preview`,
the validated query is wrapped with DuckDB LIMIT `max_rows + 1` to detect truncation.
Parameters and Arrow types are preserved. Live preview may skip errors in unvisited
rows; aggregates and sorting can still require substantial work.

For `execute` and `read`, all statements and streamed batches finish before commit.
Fallible batch fetching detects late errors and checks cancellation between batches;
the display cap never limits mutation effects or hides late Default execution errors. Without a limit, existing callers receive their
full result. Arrow responses include `X-Wordflow-Statements-Completed` and
`X-Wordflow-Result-Truncated` (`true`/`false`), exposed to allowed browser origins.

Each entry contains one complete statement. `parameters` defaults to `[]` and
accepts JSON scalar values. Pass JSON, decimal/large-integer text, UUIDs, dates,
and encoded binary as strings with explicit SQL casts or decoding functions.
For example `from_hex(?)` accepts a bound hexadecimal string for a BLOB.

A batch commits once or rolls back. The final statement's result is an Arrow
IPC stream (`application/vnd.apache.arrow.stream`) by default. Set `response`
to `"command"` for `{ "statements_completed": N }`, or `"arrow"` explicitly for IPC.
Completion counts statements, not affected rows. Earlier query results are discarded. Statements are
executed once; the backend does not probe by executing and retrying another API.
Physical Arrow types and nulls are preserved. Explicit semantic descriptors are
available through `wordflow.arrow_metadata`; arbitrary SQL does not infer or
reattach those descriptors to computed columns.

The connection's default schema is `data`. `SET VARIABLE`,
`RESET VARIABLE`, explicit `SET SESSION` / `RESET SESSION`, and `USE` are allowed
within any SQL mode that accepts the supplied statements. Each request receives a fresh connection; later
requests retain neither variables nor session settings. DuckDB rejects settings
that cannot be session-local. Transaction control, PREPARE/EXECUTE, global or
unqualified configuration changes, ATTACH/DETACH, INSTALL/LOAD and PRAGMA remain
reserved for runtime ownership. Each batch entry is validated before preparation because
the DuckDB Rust client can execute intermediate statements during prepare.
Database atomicity does not turn SQL file exports into transactional filesystem
operations. No automatic graph registration or metadata repair follows raw SQL.
Application-driven column changes and View creation use the concrete operations
below so metadata policy lives in Rust. The preprocessing controller still uses
read-only SQL for paginated previews; those create no objects or metadata.

## Application mutations

`POST /api/project/views` accepts `name`, a single SELECT `sql`, `mappings`
(`[{source, column, output}]`, with registered source names), and optional
`computed_columns`. It creates a new View, registers it and applies mapped metadata
in one transaction. It returns `200 {"table_name":"name"}`. Existing names fail;
no logical edge rows are inferred or written.

`POST /api/project/nodes/{table_name}/columns` and
`POST /api/project/objects/{schema}/{table_name}/columns` accept a tagged operation
and return 204:

| Operation | Fields |
| --- | --- |
| `cast` | `column`, `target`, optional `format` |
| `rename` | `column`, `name` |
| `delete` | `column` |
| `transform` | `column`, one SQL `expression` |

A cast target is a shortcut (`string`, `categorical`, `integer`, `float`,
`datetime`) or `{"sqlType":"DECIMAL(18,4)"}`. Rust parses an ordinary
`CAST(NULL AS input)` and uses DuckDB-rendered type syntax. Parameters, nested
and named types are accepted; extra expressions/statements are rejected.
The datetime shortcut first captures up to 200 rows of the selected column in
its transaction. With no `format`, it tests the direct TIMESTAMP cast, then only
on failure generates rule-based format candidates and validates them against the
same sample. NULLs are ignored; blanks are not. Ambiguous or unsupported layouts
return `datetime_format_required` without mutation. The frontend then requests
an explicit format. Manual formats bypass inference and are checked against the
same bounded sample; errors retain the dialog draft and use Sonner.
Successful direct casts retain their native behavior. Parsed formats retain
DuckDB's output type, including TIMESTAMPTZ for timezone-aware formats.
Casting a View changes its SQL definition without evaluating the entire column.
The committed object notification invalidates dependent schema and row queries;
subsequent read errors use Sonner and do not roll back the committed definition.
Table casts still use DuckDB's full, atomic ALTER COLUMN conversion. Other cast
targets do not use datetime inference.
Transform adds a missing VARCHAR
column to a Table or adds a View expression, replacing an existing column when
its name matches. Table assignment rules remain DuckDB's responsibility.

All operations resolve canonical catalogue names in the transaction. Metadata
preservation/cleanup and saved column-reference reconciliation commit with the
change. View edits wrap the previous definition and retain query-layer Undo.
They preserve normal editor protection, cancellation, conflict errors and
commit-driven refresh; they do not create task summaries.

## Stopword membership

A stopword reference is `{"source":{"schema":"data","name":"words"},"column":"word"}`.

| Method and path | Request | Success |
| --- | --- | --- |
| `POST /api/project/stopwords/read` | Stopword reference | 200 normalized `string[]` in source occurrence order |
| `POST /api/project/stopwords/prepare` | `selected` reference or null, `inputs` reference array | 200 writable reference |
| `POST /api/project/stopwords/save` | `selected` reference, `before` and `after` string arrays, optional `sort` boolean | 204 |

Read shares normalization and the 100,000-word limit with Frequency projections
and exports. It accepts Tables and Views and runs read-only. Prepare returns an
existing Table, copies the selected View column, or creates an empty `word VARCHAR`
Table. New tables, names, registration and captured logical parents commit together.
Save requires a Table. Its JSON body is exempt from Axum's default 2 MiB cap
because complete memberships can exceed it; the backend enforces the normalized
100,000-word limit. Rust computes membership changes, preserves unchanged cell
values and unrelated columns, and supplies only the selected column for inserts.
Removal deletes single-column rows or sets matching multi-column cells to NULL.
Types/defaults/constraints and the final membership limit are enforced atomically;
failure leaves data unchanged and the caller retains unsubmitted input. Live additions send an empty `before` and just the new words in `after`; removals send just the removed words in `before`. `sort: true` reorders complete rows by normalized word, retaining the existing Table and its constraints/defaults. Sorting shares the membership transaction and rolls back on any failure. There is no stopword
snapshot or second persistent store.

## Data Block Operations

| Method and path | Request | Success |
|---|---|---|
| `GET /api/project/graph` | Optional `mode=logical` (default) or `mode=dependencies` | Metadata-only graph, described below |
| `GET /api/project/nodes/{table_name}/schema` | None | Empty Arrow IPC with authoritative fields and semantic metadata |
| `POST /api/project/nodes/{table_name}/page` | `page`, `page_size`, optional `sorting` | Enriched Arrow IPC with one lookahead row |
| `POST /api/project/nodes/{table_name}/edit` | `{"sql":"SELECT x::VARCHAR AS x FROM __wf_current"}` | 204 |
| `GET /api/project/nodes/{table_name}/definition` | None | 200 `{"sql":"<current SELECT>"}` for a View |
| `POST /api/project/nodes/{table_name}/definition` | `{"sql":"<complete SELECT>"}` | 204 |
| `POST /api/project/nodes/{table_name}/rename` | `{"name":"new_table_name"}` | 200 `{"table_name":"new_table_name"}` |
| `POST /api/project/nodes/{table_name}/clone` | `{}` | 200 `{"table_name":"unique_copy_name"}` |
| `POST /api/project/nodes/{table_name}/export` | `{"format":"csv"}` | 200 full-object bytes |
| `POST /api/project/nodes/{table_name}/undo` | `{}` | 204 |
| `POST /api/project/nodes/{table_name}/replace-source` | `{"old_source_name":"<table_name>","new_source_name":"<table_name>"}` | 204 |
| `POST /api/project/nodes/{table_name}/materialize` | `{}` | 204, also for an existing table |

Graph nodes expose registration fields from `wordflow.nodes`, `kind` (table/view/missing),
`column_count` (catalogue count, or null when unavailable), `can_undo`, and an optional
structured `diagnostic`. Graph loading never executes row counts or stored View
definitions. Unavailable registered objects retain their cards and diagnostics. Edges
contain `source_name`, `target_name`, and `dependency`: true for a live direct view
reference and false for a stored virtual relationship. The response is the union
of both sets, with visible endpoints only. Duplicate pairs appear once with
`dependency: true`; stored virtual rows are not deleted. SQL references come from
parsed View definitions, including relationships absent from `wordflow.edges`.
Existing edge rows remain valid virtual relationships without migration.

With `mode=dependencies`, the response has `nodes` containing `object: {schema, name}`,
`kind`, `column_count`, `registered`, `visible`, `color`, `can_undo` and optional
`diagnostic`. Edges contain `source` and `target`, each a `{schema, name}` reference.
The catalogue includes persistent Tables and Views in the current database's user
schemas, including hidden registrations and unregistered objects. System objects
and the `wordflow` metadata schema are excluded. Direct View references are
resolved against catalogue names using DuckDB's ASCII-insensitive identifier rules,
the View's own schema, the default schema and the managed connection search path.
CTEs shadow unqualified relation names. Repeated references produce one edge;
missing sources produce diagnostics without guessing an object in another schema.
Inspection runs in one read-only transaction without evaluating Views or contacting
remote sources. It does not expand macros, dynamic table functions or external files.

Materialize captures direct registered sources as virtual parent links in its
existing transaction before replacing a registered View with a Table. Failed
materialization rolls back both the object and lineage. Source replacement and
ordinary View creation do not synchronize `wordflow.edges` with SQL.

Catalogue objects expose the same operations under
`/api/project/objects/{schema}/{name}/`: `schema` (GET), `page`, `columns`, `edit`, `definition`
(GET/POST), `rename`, `clone`, `export`, `undo`, `materialize`, `delete`, and
`cell-edit` (POST). Request and response bodies match their Data Block counterparts.
`POST /api/project/objects/{schema}/{name}/replace-source` returns 204 and accepts
`{"old_source":{"schema":"first","name":"source"},"new_source":{"schema":"second","name":"replacement"}}`.
It shares the registered-node implementation, replacing every direct reference to
that source in the target View. A stale source or invalid binding fails the
transaction. Preparing the rewritten View before commit rejects cycles without
executing its rows. Virtual links remain unchanged.

Logical links use parameterized `POST /api/project/sql` to insert registered
source/target names into `wordflow.edges`. Duplicate pairs are ignored; missing
registrations and self-links fail database constraints. Only graph metadata is
refreshed after adding a logical link.

Path components are independently URL encoded. Both routes share the Rust mutation,
transaction, editor and task implementations. The catalogue resolves object identity;
only registered objects in `data` receive registration/metadata reconciliation.
An object-route Clone creates a plain object in the same schema using the copy-name
convention, without registration, preferences or virtual links. Viewing, editing and
exporting never register objects. Delete is non-cascading. Editor sessions return
`schema` alongside `table_name`, retaining that target through Save/Cancel. Native
`save_node_export` accepts optional `schema` to address the same object directly.

Graph cards display column counts only. There is no row-count endpoint or hover
count request. Data View uses lookahead pagination; the editor owns its snapshot count.
Schema and page reads resolve the node, query data and attach column metadata
in one read-only transaction. Pages are 1-indexed, with sizes 1–1000. Sorting
entries contain `column` and `descending`; identifiers are quoted by the backend.
The page contains at most `page_size + 1` rows. These reads remain available
during table editing. Their Arrow output is committed before transport begins.

Edit also accepts optional `before` and `after` arrays with the same complete
SQL statement and positional-parameter shape as SQL batches. All accompanying
statements and the view edit share one transaction. Standard frontend column
actions use the typed column-change operation instead.

Local and LDaCA imports register a hidden raw Table and a visible View over it,
with SQL-derived source dependencies, without writing virtual edge rows. Returned
table names identify the visible Views.
Sample imports offer remote Views or embedded Tables. Registered Clone copies incoming virtual links; its SQL dependencies are inspected.

### Export utility

| Route | Request | Response |
|---|---|---|
| `POST /api/project/exports/inspect` | Export request below | Catalogue-only `objects` actions/classifications, metadata `summary` counts and structured `blockers` |
| `POST /api/project/exports` | Same captured request | File bytes, Content-Disposition and accepted task header |

Requests are tagged by `kind`:

- `{"kind":"files","objects":[{"schema":"data","name":"documents"}],"format":"csv"}`
- `{"kind":"selected_project","objects":[{"schema":"data","name":"documents"}]}`
- `{"kind":"complete_project"}`

Selections are ordered, nonempty and duplicate-free. Explicit user-schema
objects need no registration; private Wordflow relations cannot be selected as
ordinary data objects. Inspection reports `copy_table`, `preserve_view`,
`materialize_view` or `write_file`, with reasons and dependency blockers.
Execution revalidates the catalogue. It returns one data file, one multi-object
ZIP or a schema-1 `.wfpj`. The UTF-8 filename is carried in the exposed
`Content-Disposition` header. No partial archive is returned after failure.
The existing per-node/per-object export routes delegate to this service.
Tauri `save_export` accepts the same `request`, shows the native chooser and
returns a saved path or null on chooser cancellation; it transfers no file Blob
through the frontend. See [snapshot and portability rules](../architecture/backend/native-exports.md).

Export formats are `csv`, `json` (array), `ndjson`, `parquet`, and `ipc` (Arrow
file). Exports include the entire object regardless of UI pagination. IPC exports
enrich the Arrow schema from column metadata inside the export transaction,
preserving supported extension metadata with exact physical types and values.

Edit accepts Views only. The column-change operation resolves Table/View kind and
uses native ALTER TABLE or wrapped View SQL accordingly. No automatic Table-to-View
conversion occurs. Both paths keep metadata changes in the same transaction.

Edit requires a SELECT with the sole outer FROM reference `__wf_current`.
Unqualified column expressions and `__wf_current.column` are accepted. The
reserved `__wf_previous` alias marks generated wrappers; clients must not forge
it in direct SQL. Undo stops at the original query, even when that query itself
contains subqueries. Redo has no endpoint. Column-change and View-creation
operations reuse these query-layer helpers.

The catalogue is authoritative: direct SQL replacement of a view is reflected
by the next helper operation. Source replacement changes all bindings to the
selected old source in the target, including repeated join inputs. It does not
replace that source in other consumers. SQL-only changes do not restore or
infer independent column or presentation metadata.

The definition endpoints power **More → Edit SQL Definition** in the shared
node menus. GET reads the current catalogue and preserves explicit view column
aliases in the returned SELECT. POST accepts exactly one SELECT and atomically
replaces that View's definition, keeping its name, registration, and logical
edges. Tables do not support these endpoints. Invalid SQL leaves the previous
definition committed. This replacement does not add an Undo layer or repair
column metadata or downstream Views. Existing generated query layers can still
be undone if they remain in the saved definition. Cancel in the editor writes
nothing. Tables expose More → Edit Table instead.

## Table Cell Editing

| Method and path | Request | Success |
|---|---|---|
| `POST /api/project/nodes/{table_name}/cell-edit` | `{}` | Session descriptor |
| `POST /api/project/cell-edits/{session_id}/page` | `page`, `page_size`, optional `sorting` | Arrow IPC stream |
| `POST /api/project/cell-edits/{session_id}/save` | `changes`, optional `deletions` and `insertions` (below) | `{"saved":true}` |
| `POST /api/project/cell-edits/{session_id}/cancel` | `{}` | `{"saved":false}` |

The descriptor contains `session_id`, the canonical `table_name`, `row_count`, and `columns`
with `name`, DuckDB `data_type`, `editable` and `identifier`. It also includes a
runtime-local `mutation_stamp`. Each session owns a frozen reader; independent
Tables may have separate sessions in the same runtime. `row_count` is counted once in that snapshot and enables exact page
bounds, including the last page. Draft additions and deletions do not change it.
Session identifiers and row references expire when it finishes.
Pages are 1-indexed; sizes are 1–1000. Sorting entries contain `column` and
`descending`; `rowid ASC` breaks ties. Results include at most one lookahead row.

The Arrow schema retains original physical types and registered semantic
metadata. Schema metadata `wordflow:cell-edit` contains JSON with `column_count`,
a `row_ref` field index, and `values` mapping editable column names to canonical
text field indices. Transport fields follow the original columns and must not
be displayed or exposed as Data Block columns. They are query projections, not
database columns. Row references are strings; scalar editing values are exact
DuckDB text or NULL, avoiding JS numeric and timestamp rounding.

Save accepts the following draft. Scalar values are lossless text or explicit NULL:

```json
{
  "changes": [{"row_ref":"0","column":"text","value":"edited"}],
  "deletions": ["1"],
  "insertions": [{"values":{"text":"new row","amount":null}}]
}
```

Deleted row references must be unique and cannot also appear in `changes`.
Insertion keys must name editable columns or the identifying column. An explicit
identifying column requires a non-NULL, unique value on every inserted row. Values undergo the same strict casts
as cell changes; omitted columns use DuckDB defaults. An empty `values` object
uses `INSERT DEFAULT VALUES`. Inserts carry no row reference or saved position.

Save validates all columns and existing-row references against the snapshot
before writing. It deletes rows, updates each changed row once, then inserts
new rows in one transaction. Successful changes commit immediately.
Failed writes roll back and retain the session for retry. Repeated
successful Save or Cancel calls return the same completion while that outcome is
among the runtime's latest 100 editor completions. These endpoints do not change generic SQL transaction boundaries.

While editor protection is pending or held, mutations to that Table and project
Save/Save As return `editing_active` (409). Unrelated Table operations, new imports,
settings and independent analyses remain available. SQL `execute` acquires
read-only permission while any editor is active; DuckDB rejects persistent writes.
Dedicated reads and SQL `read`/`preview` remain available. Ended sessions return
`editing_closed` (409); an obsolete source precondition returns `editing_stale`
(409). Runtime/webview teardown releases readers, including pending startup. An
accepted Save finishes before cleanup releases its resources. Failed Save retains
the snapshot and its protection.

## Errors and Limits

Application errors use `{"error":{"code":"...","message":"..."}}`.
DuckDB failures retain their diagnostic in `sql_error` (400). Invalid batches
and unsupported formats return 400; closed/busy projects and unavailable
undo return 409; missing registrations return 404; shutdown returns 503.
Malformed JSON, content-type and body-size rejections use the same error envelope.
SQL failures may include a zero-based `statement_index`. The default JSON body limit is 2 MiB.

Each operation gets an independent connection to the same embedded database.
Reads and writes may overlap; DuckDB conflicts use the normal structured error
envelope and are never automatically retried. Arrow and export output is written to a temporary file,
committed before a successful response, then streamed. Temporary output is
removed after completion or disconnect.
Transformed previews use caller SQL for pagination; registered node pages use
the concrete page endpoint. Engine expression limits and JSON parser
limits can reject deep query nesting; there is no compaction or hidden history
fallback. Dynamic table-function SQL is not interpreted as a static relation
binding by graph inspection or source replacement. Use explicit table/view
references for reusable pipelines.

## Desktop Imports

`POST /api/project/ldaca/search` accepts `method` (`keyword` or `identifier`),
`query`, and optional session `token`. It returns up to 25 normalized Oni `items`.
`POST /api/project/ldaca/import` accepts `identifier` and optional `token` and
returns `{"table_names":["created_name"]}` after embedding the selected corpus. The
existing `ldaca-rs` adapter owns ONI requests and RO-Crate conversion.
Conversion and temporary Parquet writing finish in task-owned blocking preparation
before database permission is acquired. The write stage rechecks permission; staging
is deleted on success, cancellation or failure.
Imports belong to their runtime throughout and cancel network work on interruption.
Tokens are never written to project metadata.

Local imports use `POST /api/project/import` with `sources`: objects containing
`table_name`, a SELECT `sql`, and optional `parameters`. The runtime allocates
unique names and atomically creates tables and registrations, returning `table_names`.
The Local files UI submits immediately without a schema preflight or staging step. `POST /api/project/nodes/{table_name}/delete` removes the registered
object and its associated edges/column metadata/tokenizer preferences atomically; the desktop
exposes this operation through node menus and batch deletion.


`POST /api/project/files/metadata` accepts `{paths: string[]}` and returns
`[{path: string, size_bytes: number | null}]` in request order. Sizes come from
filesystem metadata only; missing, unreadable and non-file paths return `null`.
This read creates no task and opens no database connection. It uses the same
Origin checks as the other project routes.


### Sample projects

`GET /api/project/samples` resolves the sample repository's current `main` SHA
and returns `commit`, `schema_version`, and `collections` (ID, name, description,
total size, and file paths).

`POST /api/project/samples/import` accepts `{file_paths: string[], as_views: boolean}`.
Paths must identify Parquet files in the catalogue; README and unknown paths are rejected.
It resolves the latest `main` again at import time and reads that commit's catalogue.
With `as_views: true`, each selected file becomes a `read_parquet` View using an
immutable URL. With `false`, `CREATE TABLE AS SELECT` materializes its rows into
an embedded Table directly, without a hidden backing object or intermediate View.
All selected objects and their registrations commit together. Success returns
`{commit, table_names}`. Failed scans abort the entire import; a runtime with close protection or retained shutdown rejects new work. Duplicate paths in a request are imported once.
GitHub catalogue errors, including rate limits, are reported with retry in the UI.

## Analysis tabs and results

These resources are stored in schema-version-1 projects. Tab metadata and completed
results are independent of the in-memory task history. Frequency, Concordance, Quotation and the five Plots modes are supported; storage helpers are shared.

| Method and path | Request | Success |
| --- | --- | --- |
| `GET /api/project/tabs` | Optional `kind` query parameter | Ordered array of saved tabs, filtered by kind when supplied |
| `POST /api/project/tabs` | `kind: "frequency"`, `"concordance"` or `"quotation"`, optional `name` | Created tab |
| `POST /api/project/tabs/reorder` | `{"kind":"frequency","ids":["tab-uuid", "other-tab-uuid"]}` | Ordered tabs; every ID of that kind must occur exactly once |
| `POST /api/project/tabs/{id}` | Optional `name`, optional `settings` object | Updated tab |
| `DELETE /api/project/tabs/{id}` | None | 204; removes owned results and requests cancellation of active work |
| `DELETE /api/project/tabs/{id}/result` | None | 204; clears completed result, retaining tab settings and analysis request |
| `POST /api/project/tabs/{id}/frequency` | Captured Frequency request below | Saved result manifest after task completion |
| `GET /api/project/analyses/{id}` | None | Analysis with nullable completed output |
| `POST /api/project/analyses/{id}/frequency/query` | Frequency projection below | Arrow IPC and `X-Wordflow-Total-Rows` |
| `POST /api/project/analyses/{id}/frequency/export` | `query` and `format` (`csv` or `markdown`) | Full matching table bytes |
| `GET /api/project/tokenizers` | None | Native catalogue entries with `model_id`, `label` and `languages` |

A tab contains `id`, `kind`, `name`, `position`, `settings` and nullable
`analysis: {id, request, has_result}`. These summary fields are derived from the
child analysis; listing tabs never decodes its result payload. Requests remain
untrusted JSON at the frontend boundary. Names contain 1–200 trimmed characters;
creation chooses the first unused numbered name within the kind.

Only an admitted Run replaces the analysis: the initial transaction claims the
tab, deletes the previous analysis and owned output, and saves a new UUID and
request. Rerun uses the same endpoint, with no recovery flag. Initial failure
preserves existing data; subsequent failure or cancellation retains the new request
without output. Clear retains the analysis ID and request and removes its output.
Preview and local edits write neither requests nor results. Settings updates have
no access to the analysis request. Clear returns `analysis_busy` during active work.

A Frequency request supplies one or two distinct sources in role order: input 0
is Reference, input 1 is Study when comparing. Each input carries a schema/name
target, selected text column and tokenizer model:

```json
{
  "inputs": [
    {
      "source": {"schema": "data", "name": "reference"},
      "column": "text",
      "tokenizer": "native:plain_words_en"
    },
    {
      "source": {"schema": "data", "name": "study"},
      "column": "text",
      "tokenizer": "native:plain_words_en"
    }
  ]
}
```

Submission checks writable admission, and the task rechecks permission after
tokenizer preparation. One active Frequency task is allowed per tab; independent
tabs may overlap. The request remains awaiting its typed completion, but caller
disconnection does not cancel the task. Accepted success and failure responses
include `X-Wordflow-Task-Id`. Rejected admissions have no accepted-task header.

An analysis response contains `id`, `tab_id`, derived `kind`, submitted `request`,
`created_at` and nullable `result: {version, payload, finished_at}`. Reading an
analysis without output succeeds; its output-specific routes return the structured
`result_unavailable` error. Unknown/deleted IDs do not resolve to newer analyses.
All three tools use payload version 1. Frequency's payload contains ordered
`corpora` and nullable `comparison_artifact_id`; its comparison artifact is a
private View over saved count Tables, including Overuse and Signed LL.
Corpus descriptors retain captured source details, artifact IDs and counts as
decimal strings for exact unsigned 64-bit values. Arrow retains native integer
and special floating-point values. Saved reads require no live source.

Projection requests accept `view` (`corpus`, `comparison` or `juxtorpus`), optional
`corpus_index`, `filter`, `stopword_source`, `page`, `page_size`, `sort`, `descending` and
`limit`. Corpus index defaults to 0. Pages start at 1; page size defaults to 50
and accepts 1–5000. Sort keys must name columns in the selected projection. Token
ordering breaks ties. `stopword_source` contains `{source: {schema, name}, column}`;
the backend resolves its current values, with a 100,000-word maximum. Stopwords match case-insensitively, and filter patterns use
`*` for any sequence and `?` for one character. Filtering precedes display limits
and never changes stored totals or other token statistics. Corpus pages include `rank`, assigned after stopword exclusion and before wildcard filtering. Unknown counts are
not substituted with zero.

The query's `X-Wordflow-Total-Rows` describes the selected projection before page
pagination and ordinary display limits (Juxtorpus still counts its selected ranking ends) and is exposed through CORS. Table exports ignore pagination/display
limits and include every matching row. Optional `include_stopwords: true` returns
`multipart/form-data` with `table` (CSV/Markdown) and `stopwords` (UTF-8 text) parts
from one snapshot. An omitted source produces empty stopword text. Browser reads
and exports are ordinary operations. Tauri invokes the concrete runtime export
method after destination selection and owns its task through final installation.

Replacing an analysis removes its previous ID. Clear retains the ID but removes
output. Clients reconcile the tab's derived summary and discard obsolete output caches. Unknown
payload versions are unavailable rather than decoded as current Frequency data.

Comparison query rows also expose `overuse` (`Reference`, `Study` or `Equal`) and
`signed_ll`, with direction determined by relative frequency. Both can be used as
sort keys. The saved comparison View derives them from immutable count Tables. Juxtorpus excludes
combined counts of ten or less and selects both ranking ends with overlap removed.
CSV and Markdown comparison exports label corpus-specific columns with the saved
Reference/Study names; the underlying numeric values remain unrounded.

No generic result-SQL endpoint, source revision tracker or task-result cache is
provided. [Native analyses](../architecture/backend/native-analyses.md) owns the
storage and transaction design.

## Tasks

| Route | Contract |
| --- | --- |
| `GET /api/project/tasks` | Current active tasks and up to 100 finished summaries. |
| `GET /api/project/events` | SSE `tasks` snapshots, committed `change` scopes and `reset` after connection or overflow. |
| `POST /api/project/tasks/{task_id}/cancel` | JSON `{}`; idempotently request cancellation and return the current snapshot. |
| `DELETE /api/project/tasks/{task_id}` | Dismiss a finished summary and return the snapshot; a missing summary is already dismissed. |

Snapshots contain `revision` and `tasks`. Each summary contains `id` (execution
UUID), `label`, optional
`tab_id`, `state`, `created_at`, nullable `started_at` and `finished_at`
(Unix milliseconds), nullable `progress` (`message` and nullable fraction from 0
to 1), and nullable structured `error`. States are `queued`, `running`,
`cancelling`, `succeeded`, `failed` and `cancelled`. Unknown progress is
indeterminate. Active summaries come first and finished ones are newest first.
Invalid task IDs use `invalid_request`; cancelling a missing task uses
`task_not_found` (404); dismissing active work uses `task_active` (409).

Streams coalesce changes to at most ten snapshots per second per subscriber,
with bounded latest-state delivery and no event replay. They are outside work
accounting and end on backend shutdown. All routes enforce the same Origin
boundary as other project routes. There is no generic task submission endpoint:
typed Rust consumers use `ProjectRuntime::submit_task`.

Local (`/import`), sample and LDaCA imports, node Materialize and Clone create one
task per request. SQL creates a task only when `task_label` is supplied. Existing
success bodies and status codes remain unchanged. Accepted responses, including
structured failures, contain `X-Wordflow-Task-Id`, exposed through CORS. Rejection
before task acceptance has no task header and uses ordinary request error reporting.
Native exports use a direct Rust task after destination selection, through final
file installation. Their IPC failures carry `code`, `message`, optional
`statement_index` and `task_id`. Browser exports retain the HTTP route.
The Task Centre owns failure notifications for accepted tasks. Dropping the HTTP
caller does not cancel accepted work or release its database resources early.
No task result-retrieval endpoint is provided; result bodies still reach the
original caller. Analysis result routes read durable project-owned results, not
task output caches. History contains summaries only. Refresh comes from successful database commits,
not task labels or summaries. A `change` payload has `all`, `objects` (schema/name
pairs including SQL dependants), affected `analysis_ids`, and `resources` (`graph`, `tabs`,
`sql_cells`, `project`, `sql_types`). A `reset` requires broad database-query
invalidation; no replay history is stored. Known SQL writes accept an optional
`changes` field with that shape. Omission means broad refresh for Execute;
Read/Preview ignores it. Application-generated SQL must provide a concrete scope.
Exports and failed/rolled-back transactions emit no database change.


## Concordance interfaces

All paths below are under `/api/project`. Run and publication use native
task admission and preserve `X-Wordflow-Task-Id` on accepted success/failure.
Preview is a cancellable temporary read and has no task ID or saved result.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /tabs/{id}/concordance/preview` | `input`, `search`, `page`, `page_size`, nullable metadata `sort` | Arrow page of original rows and nested matches |
| `POST /tabs/{id}/concordance` | Ordered `inputs` (one or two), `search` | Saved result manifest |
| `POST /analyses/{id}/concordance/query` | `source_index`, `projection`, `filter`, `page`, `page_size`, nullable `sort` | Arrow page |
| `POST /analyses/{id}/concordance/density` | `source_index`, `bin_count`, `uncased` | Complete saved term/bin counts as Arrow |
| `POST /analyses/{id}/concordance/publish` | `projection`, selected `sources` | Created schema-qualified objects |

An input contains `source: {schema,name}`, `column`, and optional `tokenizer`.
Search contains `mode` (`text` or `tokens`), `query`, `whole_word`, `regex`,
`case_sensitive`, `ignore_punctuation`, `left_context` and `right_context`.
Defaults are Text, whole word, case insensitive, no regex, punctuation ignored,
and ten tokens of context on either side. Context is limited to 0–50. Token
mode requires a native tokenizer and supports exact alternatives separated by
spaces, commas or pipes; regex is a Text-mode option.

Pages start at 1; page sizes are 1–1000. Preview sort contains `column` and
`descending`. Saved sort contains `field`, `metadata` and `descending`;
metadata columns and supported native match fields are validated. Document
projections support metadata sorting only. Stable document/occurrence ordering
breaks ties. Arrow pages include `X-Wordflow-Total-Rows`,
`X-Wordflow-Document-Count`, `X-Wordflow-Match-Count` and
`X-Wordflow-Has-Next`; Preview summaries describe only the captured page.

Saved `projection` is `matches` or `documents`. A filter contains
`excluded_terms`, `uncased`, selected zero-based `bins`, `bin_count` and
optional decimal-string `document_id`. Bin counts are 1–1000. Filtering
precedes pagination; L1/R1 frequencies remain based on the whole saved result.

Each publication source contains `source_index`, output `name`, selected
original `metadata` columns, generated `fields`, and captured `filter`.
The document column is required. Document outputs additionally require
`CONC_extraction`. Match field keys are `left_context`, `matched_text`,
`right_context`, `start_idx`, `end_idx`, `l1`, `r1`, `l1_frequency`,
`r1_frequency` and `extraction`; outputs use the established `CONC_` names
(`CONC_l1_freq` and `CONC_r1_freq` for frequencies). All selected Tables
commit together. Existing objects are never overwritten.


## Quotation interfaces

All paths are under `/api/project`. Run and publication use native task
admission and `X-Wordflow-Task-Id`. Preview is a request-cancellable read with no
task or saved result. The built-in English extractor is the only accepted engine;
requests contain no engine selector or remote URL.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /tabs/{id}/quotation/preview` | `input`, `page`, `page_size`, nullable metadata `sort` | Arrow original rows with nested `quotes` |
| `POST /tabs/{id}/quotation` | `input` | Saved result manifest |
| `POST /analyses/{id}/quotation/query` | `projection`, `page`, `page_size`, nullable `sort`, optional `document_id` | Arrow page |
| `POST /analyses/{id}/quotation/publish` | `projection`, output `name`, selected `metadata` and `fields` | Created schema-qualified object |

`input` is `{source: {schema, name}, column}`. Pages start at 1 and sizes are
1–1000. Preview sorts by `{column, descending}` before source-document pagination.
One lookahead row supplies Next without counting the full source. Page summaries
use the same `X-Wordflow-Total-Rows`, `X-Wordflow-Document-Count`,
`X-Wordflow-Match-Count` and `X-Wordflow-Has-Next` headers as Concordance.

Saved `projection` is `matches` (default) or `documents`. Sort is
`{field, metadata, descending}`; document projection accepts metadata only.
`document_id` is an optional unsigned decimal string for full-document inspection.
Stable document ID and quotation order break ties. No live source is read.

Generated fields are `quote`, `speaker`, `verb`, their `*_start_idx` and
`*_end_idx` character offsets, `quote_type`, `quote_token_count`,
`is_floating_quote` and `quote_row_idx`. Missing speaker/verb spans are NULL.
Publication requires the original document column. Match outputs prefix selected
fields with `QUOTE_`; document outputs additionally require `QUOTE_extraction`,
joining retained quotation text with newlines. Existing objects and conflicting
column names are rejected. The result descriptor has payload version 1 and owns
three private relations; its counts include total source documents, matching
documents and quotations. Context length and colors are not execution parameters.

### Plots

The concrete tab kinds `trends`, `compare`, `scatter`, `heatmap` and `sankey`
use `POST /api/project/tabs/{id}/{kind}` for Run, and
`POST /api/project/analyses/{id}/{kind}/query` and `/publish` for saved output.
Run and publication use existing accepted-task response ownership. Query returns
Arrow IPC. There is no Plots Preview endpoint.

All requests identify one `source: {schema, name}`. Trends selects `axis`, up to
three `groups`, `measure`, nullable `value`, `interval` and `timezone`. Numeric
intervals use decimal strings for `width` and optional `origin`; time intervals
use `unit` and positive integer `step`. Month, quarter and year require step 1.
Compare selects `category`, optional `stack`, Count/Sum and optional `value`.
Scatter selects `x`, `y`, optional `color`, `size` and `label`. Heatmap selects
`row`, `column`, a measure and optional `value`. Sankey selects two or more
ordered `stages`, Count/Sum and optional `value`.

Queries accept `uncased` and `minimum_rows`. Publication accepts `name`, selected
`columns`, a captured `query`, and `selection` arrays: `hidden` group keys,
`intervals`, `cells`, `rows` or `transitions`. These opaque keys come from the
saved projection. Publication always emits original rows, with required
execution columns retained. It never emits an aggregate table.

`GET /api/project/timezones` returns the runtime ICU timezone catalogue. The host
must supply the version/platform-matched signed extension path; the runtime
never installs or downloads ICU.

## Topic Modelling

- `GET /api/project/embedding-models`: curated identifiers, labels and token limits.
- `POST /api/project/tabs/{id}/topic-modeling`: native Run task, all source rows.
- `POST /api/project/tabs/{id}/topic-modeling/preview`: POST SSE stream with
  `preparing` (stage/fraction), `ready` (handle/summary) or structured `failed` events.
- `POST /api/project/tabs/{id}/topic-modeling/preview/{preview_id}/query`: temporary projection.
- `DELETE /api/project/tabs/{id}/topic-modeling/preview/{preview_id}`: cancel and await cleanup.
- `POST /api/project/analyses/{id}/topic-modeling/query`: saved projection.
- `POST /api/project/analyses/{id}/topic-modeling/publish`: atomic publication task.

Execution request: ordered `inputs` (`source`, `column`), `embedding_model`, shared
`tokenizer`, `segmentation` (`automatic`, `line`, `sentence`), `max_segment_tokens`,
`minimum_topic_size`, `seed`. Sampling is absent. Preview wraps this as `request`
and `sampling`: one ordered `{mode:"count",count}` or
`{mode:"percentage",percentage}` per input. Positive percentages are at most 100.

Saved and Preview queries share a tagged `projection`: `map` with `topic_count`,
or `words` with `topic_count` and optional `stopword_source`.
The `documents` projection accepts `source` (zero-based source index), `topic`,
`topic_count`, `top_n`, one-based `page`, `page_size` and original `metadata`
column names. It returns an Arrow document page with the standard total/next-page
headers, `document_id`, fractional `coverage` and a nested `source` struct. The
document field is always included. Positive Top-N memberships include cutoff
ties; ordering is coverage descending then result-local identity. Saved reads
use owned artifacts; Preview reads sampled typed Arrow rows retained by its
connection owner. Neither reads the live source or refits the model. Compact JSON carries
coordinates/membership activations or representative words, not source documents
or the native projection context. Expired handles return `preview_expired` and
never trigger another fit. Run/publication retain standard task headers, Origin
protection, editor protection and structured errors.

Publication captures `topic_count`, `top_n`, `selected_topics`, ordered `sources`
(each `source` index, `name`, original `columns`, `coverage` boolean),
`dictionary_name`, and the complete filtered `words` per topic. Dominant topic is
required; generated field names avoid source collisions. Only saved results can
publish. Source rows remain distinct even when their text is identical.

## Annotation and host AI connections

| Method and path | Request / response |
|---|---|
| `GET /api/ai/providers` | Safe connection metadata, credential presence/error, revision and built-in flag; never keys |
| `POST /api/ai/providers` | Name, provider, Custom endpoint and credential action; returns safe connection |
| `POST /api/ai/providers/{id}` | Name and credential action; provider/endpoint identity is immutable |
| `DELETE /api/ai/providers/{id}` | Removes saved configuration and credential |
| `GET /api/ai/providers/{id}/models` | Model identifiers, cached per configuration revision |
| `POST /api/project/annotation/codebook` | Qualified source and code/description fields; returns validated live codes |
| `POST /api/project/annotation/codebooks` | Name; creates and registers an empty Codebook |
| `POST /api/project/tabs/{id}/annotation/edit` | `manual`, `corrections` or `codebook` setup; returns the shared cell-edit session |
| `POST /api/project/tabs/{id}/annotation/preview` | `{request,page,page_size}`; Arrow page with predictions, diagnostics, lossless row references and mutation stamp |
| `POST /api/project/tabs/{id}/annotation` | Concrete execution request; existing accepted-task response headers and Analysis completion response |
| `POST /api/project/analyses/{id}/annotation/query` | `view: rows`, `context` or `diagnostics`; Arrow rows/diagnostics or JSON captured context |

Provider identifiers are `openai`, `openrouter`, `anthropic`, `google`, `custom`
and the host-supplied `apple`. Credential actions are `keep`, `session` with key,
`remember` with key, and `remove`. Apple is built in, cannot be edited/deleted,
and uses model identifier `system`. Unavailability is explicit; no substitute
provider is chosen. Custom accepts HTTP(S) endpoints without embedded credentials.

The execution request has `setup`, `inference`, optional `examples`, and
`processing` (`all` or `missing`). Setup identifies source, document, annotation,
optional correction and Codebook. Inference captures connection UUID, model,
prompt, optional temperature, reasoning, batch size (1–100), retries (0–10) and
concurrency (1–10). Examples capture source, text/label fields, selection
(`random`, `first`, `last`), per-code limit (1–10), and seed. No key is accepted
in a project execution request. Preview permits an empty annotation destination.

Corrections require the displayed page's `expected` mutation stamp. Shared
`/cell-edits/{session_id}/page`, `/save` and `/cancel` routes retain staged changes
and typed row references. Save validates changed labels against the current
Codebook. Live review queries carry comparison/filter settings and optional
correction column; draft changes are accepted only through an editor. Filtering
and metrics precede pagination. Review page sizes are 10, 20, 50 and 100.

Report payloads contain processed/preserved/skipped/failed counts and artifact
references. Context includes the actual Codebook/examples and excluded-example
count. Diagnostics hold only failed row references and errors. Clear retains the
submitted request and source labels. Normal Origin checks, structured errors,
Arrow metadata and runtime cancellation apply throughout.


## Contract generation

The running router and exporter share `utoipa-axum` registrations. Handler
annotations explicitly describe `InputJson` bodies, success/error media types
and headers. `utoipa` derives schemas beside serialization types; backend
transport DTOs keep the analytics library independent of HTTP tooling.

Run from the repository root:

```sh
pnpm api:generate
pnpm api:check
```

Generation runs the locked Rust `export-openapi` executable, then the installed
`openapi-typescript` and formatter. Commit both `backend/openapi.json` and
`frontend/src/api/generated/native.ts`. Check mode compares deterministic
in-memory output without changing tracked files. No project, listener, credentials,
model download or schema endpoint is required. Ordinary frontend builds use the
committed declarations. The Rust-preview CI lane checks drift.

The frontend transport accepts a literal path template, method and generated
path/query/body parameters. JSON return types derive from that operation. It
retains dynamic runtime URLs, cancellation, task headers and detailed errors.

The following boundaries remain explicit adapters:

| Boundary | Responsibility |
|---|---|
| Arrow | IPC bytes, exact values, extension metadata, page headers and decoded rows |
| SSE | Event framing, generated payloads, cancellation and connection ownership |
| Downloads | Bytes, filenames, browser/native saves and cancellation |
| Saved analyses | Unknown request/settings/payload JSON and kind/version recovery |
| Form drafts | Filled defaults derived from generated request fields |
| Shared Plots paths | Mode-to-request association using generated contracts |
| Graph response | Select the generated projection associated with the requested graph mode |
| LDaCA search | External, heterogeneous search records narrowed into display items |
| Tauri | Desktop-only commands/events, reusing generated payloads where identical |

Type generation does not validate old project JSON. Compatibility decoders,
warnings and recovery retain their existing ownership. JSON numeric counts remain
numbers unless Rust explicitly serializes exact decimal strings. JSON Schema
composition needs special care with closed flattened objects: their fields are
derived from the existing serializer while allowing sibling fields in that
flattened context. Contract tests cover this exception and recursive expressions.
