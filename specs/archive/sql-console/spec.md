# Persistent SQL console

Replace preprocessing's SQL transformation form with independently saved SQL cells.
Use ordinary DuckDB SQL, Default script execution and debounced read-only Live
preview. Keep at most 50,000 output rows per cell in memory and paginate locally.
Save text on blur and before Run; persist cell mode and ordering. Include insertion,
drag/menu reordering, duplication, deletion, formatting and cell-scoped shortcuts.

Format 5 adds `wordflow.sql_cells`; older formats are rejected without migration.
Remove console input aliases and simplify generated joins/subqueries while
preserving the private visual View-edit and Undo contract.

No result-paging service, persistent results, automatic dependency execution,
metadata inference, background jobs or native draft-flush protocol is included.

Canonical contracts: [SQL API](../../../docs/reference/native-project-api.md),
[project semantics](../../../docs/domain/native-projects.md), and
[frontend ownership](../../../docs/architecture/frontend/preprocessing.md#sql-console).
