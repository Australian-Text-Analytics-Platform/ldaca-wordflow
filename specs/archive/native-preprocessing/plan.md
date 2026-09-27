# Restore preprocessing with DuckDB

Restore the existing Filter, Sample, Join, Stack, Find, Create and SQL interfaces
in project windows. Frontend SQL builders own transformations; the existing
transactional project API owns execution. Views are live and support query-layer
Undo. Stored Tables change directly. New results default to Views.

1. Implement and exercise pure SQL generation, previews and atomic result metadata.
2. Connect retained forms and input cards to project-owned state and Arrow schemas.
3. Enable the panel, preserve drafts, and cover paging, invalidation and errors.
4. Update help and architecture, run package gates and verify native interaction.

No project format change, migration, analysis runtime or operation-specific API.
