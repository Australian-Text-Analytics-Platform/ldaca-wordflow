# Backend Overview

`backend/` is the shared Rust/Axum crate. Tauri embeds its library in each
project window. The dedicated `server/` package supplies browser storage,
project switching and embedded production assets; see [server ownership](server.md).
`wordflow-api-dev` remains the API-only Vite/test host. There is no backend implementation selector or Python sidecar.

The host owns logging, its Tokio runtime, listeners and shutdown signals.
`ProjectRuntime` owns one DuckDB project and serialized database work off Tokio
workers. The HTTP layer uses concrete request types and structured errors;
project operations own transactions and metadata changes. DuckDB owns its
catalogue, file locking and WAL recovery. Text and data-access algorithms live
in `ldaca-rs` rather than in HTTP handlers.

- [Project runtime](native-projects.md): execution ownership, transactions and imports.
- [Lifecycle and settings](../../reference/native-backend.md): listeners, host
  configuration, active application settings and IPC.
- [Project API](../../reference/native-project-api.md): exact HTTP contracts.
- [Project semantics](../../domain/native-projects.md): file identity, Save,
  transformations and table editing.

The retired FastAPI source lives under `archive/backend/`. Its
[architecture](../../../archive/docs/architecture/backend/overview.md) and
[settings](../../../archive/docs/reference/backend-settings.md) are historical
references and do not configure the current application.
