# Rust Backend Lifecycle — Milestone One

## Accepted outcome

The desktop embeds a new Axum library in Tauri and opens a minimal lifecycle
screen immediately. The browser application and FastAPI server retain their
existing functionality. The Rust binary shares only the lifecycle library.

No Data Root, Workspace catalogue, User File area, authentication bootstrap,
DuckDB database, project migration, or analysis engine is initialized by the
new desktop. `.wfpj` is reserved for the next project-lifecycle milestone.

The standalone prototype is not merged. Existing stored data remains intact.
Version 0.8.0 is retained; no release publication is part of this change.

## Acceptance

- Health endpoints and orderly shutdown work without storage configuration.
- Desktop starts without Python, displays verified HTTP readiness, and exits
  cleanly on main-window close and Quit, including startup interruption.
- Browser startup remains independent and retains the existing server routes.
- Local macOS bundle and Windows CI no longer stage a Python runtime.
- Source checks and native QA are recorded with any unrelated failures.

Canonical contracts: [native reference](../../../docs/reference/native-backend.md),
[desktop architecture](../../../docs/architecture/frontend/desktop.md), and
[desktop runbook](../../../docs/runbooks/desktop-runtime.md).
