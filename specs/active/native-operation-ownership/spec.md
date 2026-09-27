# Native operation ownership

Approved in the implementation request on 2026-09-16; no GitHub issue assigned.
Implementation is complete. Native visual verification remains environment-blocked.

## Contract

Replace redundant coordination flags with owned work while preserving format 6,
DuckDB concurrency, editor protection and existing project-window interactions.

- Ordinary column changes and preprocessing submissions can overlap, with captured
  targets and no automatic retries.
- Explicit SQL runs can overlap within a cell. The latest successful completion
  owns its result; automatic Live previews still coalesce per cell.
- New SQL cells remain local until their first execution. Saved source and
  structural metadata changes remain ordered and transactional.
- Provisional Close and Quit ownership releases automatically on abandonment;
  final backend shutdown retains its outcome independently of callers.
- Disposable operation connections own failed-transaction rollback. Editor
  snapshots retain explicit cleanup.
- Browser primitives own menu collision placement, fetch cancellation and resize
  pointer events. Unused presentation capabilities are removed.

No migration, retries, shutdown deadline, recovery system, new task framework or
archived-source changes are included.

Current contracts are documented in [native projects](../../../docs/architecture/backend/native-projects.md),
[desktop ownership](../../../docs/architecture/frontend/desktop.md) and
[preprocessing and SQL](../../../docs/architecture/frontend/preprocessing.md).
