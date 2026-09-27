# Paginated table editing

Implement the accepted paginated Edit Table dialog with final atomic Save and
confirmed Cancel. Reuse the table presentation and expose the controller for
future labeling panels. No stored identifiers, editing copies, format change,
annotation execution or editing history.

Row actions extend the same draft: delete existing rows or insert empty rows
above a snapshot anchor. Save applies row and cell changes atomically; Cancel
discards them. Placement above an anchor lasts only for the editing session.

Canonical contracts: [domain](../../../docs/domain/native-projects.md),
[API](../../../docs/reference/native-project-api.md),
[backend ownership](../../../docs/architecture/backend/native-projects.md),
[desktop ownership](../../../docs/architecture/frontend/desktop.md).
