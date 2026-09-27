# Implementation

1. Extract the existing shared pane geometry and titlebar presentation.
2. Keep native database state and document IPC separate from server providers.
3. Reuse import dialogs and ONI Rust conversion, embedding selected data in DuckDB.
4. Verify browser isolation, persistence, native lifecycle and screenshots.

Canonical ownership: [desktop architecture](../../../docs/architecture/frontend/desktop.md).
Canonical operations: [runtime runbook](../../../docs/runbooks/desktop-runtime.md).
