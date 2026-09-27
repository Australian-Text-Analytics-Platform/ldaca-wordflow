# Native exports

`project/exports.rs` owns data-file, selected-project and complete-project exports.
HTTP and Tauri submit the same concrete request. Export writes staging files, not
Analysis records. Inspection reads the catalogue without evaluating Views or
counting source rows. Execution resolves the captured selection again inside its
own transaction; inspection is an explanation, not an authorization token.

## Snapshot and destination ownership

Data files use one read-only source transaction, including all members of a ZIP.
Project export attaches a fresh destination and starts one transaction. Its first
write claims the destination database. DuckDB permits writes to only one attached
database per transaction, preventing source writes even from side-effecting View
expressions. All source reads use that transaction's committed snapshot. Ordinary
editing and independent tasks may continue; unsaved editor patches are excluded.
External files/services are not frozen by the database snapshot.

The attached database is checkpointed and detached before the output is returned.
Rollback/detach precedes removal of its temporary path on failure or cancellation.
Native installation uses a destination-adjacent staging file, sync, cancellation
check and atomic installation. Open/Save As and final export installation share
the desktop document registry gate. Every open project, including the exporting
window's own project, is protected from replacement. Existing destinations also
use DuckDB-compatible process locking. Generation does not hold the registry gate.
A new file appearing after destination selection is not silently overwritten.

Accepted exports remain runtime-owned if their initiating panel closes. Task
Centre supplies progress/cancellation and the window observer owns failure
notifications. Export completion changes neither graph selection nor project
identity, and emits no database-change event.

## Data files

One selected object produces one file. Multiple objects produce a ZIP containing
one file per object in captured selection order. Filenames are independently
sanitized and made globally unique, including case and suffix collisions.
Native DuckDB COPY writes CSV, JSON arrays, NDJSON and Parquet. Arrow IPC exports
use the standard **file** encoding with recursively enriched field annotations;
query/page HTTP responses continue using Arrow **streams**. IPC uses bounded
batches. ZIP writing retains one intermediate data file at a time and copies in
64 KiB chunks with cancellation checks. No row limit or sampling is applied.
Parquet preserves the serializer's physical values/types; Wordflow annotation
round-trip fidelity is promised by IPC and project files, not every interchange
format.

## Project contents

Selected export builds a fresh schema-1 project and copies only selected source
rows. It retains Table catalogue definitions, constraints, defaults, generated
columns, indexes and required types/sequences, plus applicable registrations, colors,
document columns, tokenizer preferences and Arrow annotations. Foreign-key
parents must be explicitly selected. Only logical edges whose endpoints are
included survive. Tabs, analyses, private artifacts and SQL cells are excluded.
No full project data copy followed by deletion is used.

Selected Tables whose definitions depend on SQL macros are blocked with an
explanation to use Complete project. DuckDB's function catalogue omits macro
parameter defaults, so reconstructing those definitions would lose semantics.
Complete project uses DuckDB's native catalogue copy and retains those defaults.

Complete export uses DuckDB's native schema and data copy to retain all persistent
catalogue elements, user data and Wordflow records. Analysis requests/results are
opaque JSON: export never decodes them or changes an unsupported result payload.
Defaults are rebased between schema and data copying so insert binding cannot
refer to a sequence in the source database. Both steps share one transaction.
An accepted but incomplete analysis remains a request without output. Tasks,
Preview state, local drafts, credentials and host model caches are not database
contents and are not exported.

Both modes inspect Views before copying. A View is preserved only when all its
understood local relation dependencies are included. Excluded, external, dynamic,
macro-dependent or uninspectable boundaries are materialized from the source
snapshot. Preserved descendants then bind to the resulting destination Tables.
Required materialization failures abort the entire output. Structured SELECT
rewriting rebases original catalogue qualifiers while retaining schemas, aliases
and literal values. Catalogue DDL/default rebasing handles qualified sequence
references without unrestricted text replacement. SQL cells are retained as
written, never executed: arbitrary future SQL is not guaranteed to be offline.

Saved projects remain subject to the ordinary read-only schema preflight on open.
This adds no migration, project format version, export history or task recovery.

Local measurements and test boundaries are recorded in
[native Export performance](../../reference/native-export-performance.md).
