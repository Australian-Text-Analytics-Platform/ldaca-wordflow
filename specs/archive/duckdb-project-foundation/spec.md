# DuckDB Project Foundation — Milestone Two

Source: the user-approved milestone plan in this task. No GitHub issue is
associated with this local implementation.

## Outcome

The Rust backend creates and opens ordinary `.wfpj` DuckDB files. Embedded
imports, logical graph metadata, nested-SQL edits and undo, source replacement,
materialization, and saved results share one transactional database boundary.
Standard SQL uses one batch endpoint; application-specific endpoints own only
query rewriting and project lifecycle. The frontend supplies SQL rather than
an expression language.

The graph retains logical relationships after materialization and distinguishes
live view dependencies. Downstream views follow current inputs; their errors
surface without automatic repair or analysis invalidation. Undo removes one
Wordflow wrapper and has no redo or version-table mechanism.

## Acceptance

- Metadata, embedded imports, views, results, and artifacts survive relocation.
- SQL batches and application mutations commit atomically or roll back.
- Query rewriting respects binding scopes and current catalogue definitions.
- Materialization preserves identity and logical edges while ending query undo.
- Close and shutdown interrupt active database work and release file ownership.
- Rust checks and native database tests run in the macOS/Windows CI matrix.

Desktop data UI, analysis engines, row-specific editing, redo, orphan cleanup,
Polars retirement in the Python server, and legacy conversion are deferred.

Canonical contracts: [project domain](../../../docs/domain/native-projects.md),
[API](../../../docs/reference/native-project-api.md), and
[runtime ownership](../../../docs/architecture/backend/native-projects.md).
