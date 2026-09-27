# Desktop workspace restoration

Reuse the server's existing presentation with separate native controllers. Keep
analysis execution disabled and the native Task Centre empty. No migration code.

## Parity checklist

- [x] Sidebar section collapse/resize, view visibility, selection, pinning, row actions.
- [x] Contextual Help, tutorial viewer and Feedback.
- [x] Empty Task Centre without server connection or cancellation controls.
- [x] Graph expanding rail, counts, zoom/fit, overview, selection and batch delete.
- [x] Original node hover menu and compact/expanded cards, drag positions retained.
- [x] Ordered multi-selection, active tabs, tab close/reorder and deletion cleanup.
- [x] Original paginated/sorted table, pinned/resized columns and row details.
- [x] Column casts (including native ENUM), rename/drop and SQL-layer Undo.
- [x] Node rename with dependent views, clone semantics, full-node exports.
- [x] One expandable error toast; native import/drop/file lifecycle retained.
- [x] No desktop authentication, Data Root, server catalogue or SSE requests.
- [x] Native visual verification through pnpm dev:desktop, plus package checks.

Native node identity and label both use table_name. Clone copies tables or view
SQL definitions. Redo remains disabled. ENUM dictionaries retain unused allowed
values in Arrow; the database owns the named type and its constraint.

## Verification

Native integration tests cover dependency-aware rename, table/view clone
independence, preferences, rollback, ENUM dictionaries, reopening and full
exports. Native E2E exercises imported and generated multi-page data, ordered
selection, page state, sorting, pinning, casts, Undo, column rename, node
rename/clone, tab reorder/close, continuous hover expansion, compact cards,
export, batch deletion and Help. Startup asserts only project API requests.

The normal `pnpm dev:desktop` session was inspected in light and dark themes
with ADO remote views and a disposable local 55-row CSV. No QA bundle was built.
The existing browser quotation E2E still reports an analysis 404 console failure;
the other two browser workflows pass and one is skipped. An intermittent
analysis unit test failed once, passed alone, and passed in the final full run.
Windows database and lifecycle checks are configured in CI but were not run
locally; no Windows result is claimed.
