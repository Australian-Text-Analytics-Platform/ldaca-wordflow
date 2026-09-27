# Native Export restoration

Approved scope: Data files (CSV default, JSON, NDJSON, Parquet, Arrow IPC file)
and Wordflow project (Selected Data Blocks default, Complete project).
Reuse source selection and native saving. One selection is one file; multiple
selections are one native ZIP. Project export keeps self-contained Views and
materializes external/excluded/uncertain boundaries. Selected Tables retain
constraints/defaults/indexes; missing foreign-key parents block rather than
silently broadening scope. All modes capture committed data without waiting for
editing or tasks, and never modify source identity or source data.

No named export tabs, persisted requests/results, task history in project copies,
legacy project archive import, schema change, sampling or silent truncation.
See the [canonical design](../../../docs/architecture/backend/native-exports.md).
