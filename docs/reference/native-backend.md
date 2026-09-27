# Native Backend Lifecycle

`backend` provides the `wordflow-backend` library. `server` provides the
`wordflow-server` binary and [browser host](../architecture/backend/server.md). Tauri embeds the library. The retired FastAPI service and its
[settings reference](../../archive/docs/reference/backend-settings.md) remain
in `archive/` for reference.

## Host Configuration

| Host | Listener | Configuration and ownership |
|---|---|---|
| Desktop | `127.0.0.1:0` | Each project window binds once and retains its listener, exposes its actual URL through IPC |
| Rust binary | `127.0.0.1:8002` | `WORDFLOW_BIND_ADDR` accepts a socket address, including port zero |

Both hosts use `RUST_LOG`, defaulting to `info`, and write diagnostics to stderr.
The library reads no environment variables. The packaged server starts Untitled. The API-only `wordflow-api-dev` test host
starts unbound unless `--untitled` is passed.
Tauri initializes its project before publishing ready.
The binary handles Ctrl-C and Unix SIGTERM. Tauri uses close and Quit events.
Both hosts interrupt current work and await graceful completion without a deadline. There is no HTTP shutdown route.

## Application Settings

The embedded backend has no machine settings JSON file, backend selector,
stored backend URL, or Data Root setting. Project data and preferences belong
in the open `.wfpj`; its path is owned by the document window.

Tauri owns `updater-settings.json` in its application-data directory
(`~/Library/Application Support/au.edu.ldaca.wordflow/` on macOS). It contains
`automaticChecks`, `lastCheckAt`, and `skippedVersion`. Renderer-local theme
and recent-import preferences use webview local storage. These stores have
separate owners and are not an experimental backend configuration.

Old experiment/QA application identifiers and their preferences or caches are
not read or migrated. Removing those local artifacts needs no application
startup cleanup code. Keep active updater preferences, model caches and project
files separate from such cleanup.

## HTTP

| Route | Success body | Shutdown behavior |
|---|---|---|
| `GET /health/live` | `{ "status": "live", "version": "<application version>" }` | Liveness while the connection remains served |
| `GET /health/ready` | `{ "status": "ready", "version": "<application version>" }` | HTTP 503 with status `stopping` once cancelled |

Axum stops accepting connections on cancellation and drains accepted requests.
After draining, the listener closes. Readiness has no project, storage, user,
or Data Root prerequisite. The [native project API](native-project-api.md) adds explicit file operations.
The project interface uses generated OpenAPI types with its existing native
transport. [Contract generation](native-project-api.md#contract-generation)
requires neither a running listener nor a project. The archived FastAPI client
is not a startup dependency.

The desktop permits only its packaged origins and the fixed debug Vite origin.
The standalone binary reads `CORS_ALLOWED_ORIGINS` as a JSON array of exact
origins (default `[]`). Supplied unapproved browser Origins are rejected before
route execution; CORS headers alone are not the mutation boundary.

## Desktop IPC

`get_backend_status` returns one tagged value:

- `{ "status": "starting" }`
- `{ "status": "ready", "url": "http://127.0.0.1:<port>" }`
- `{ "status": "failed", "error": { "code": "<code>", "message": "<diagnostic>" } }`
- `{ "status": "stopping" }`
- `{ "status": "stopped" }`

`get_backend_status` includes the owning window's URL when ready; there is no
separate URL-discovery command.
Discovery resolves the invoking document window. Tauri publishes window-targeted
`backend-status`, `project-changed` and `project-error` events. React reads an
initial snapshot and subscribes, without polling or lifecycle acknowledgements.

## Project Boundary

`.wfpj` is an ordinary DuckDB database with Wordflow metadata. The shared
runtime owns at most one explicitly opened project; readiness requires none.
See [project semantics](../domain/native-projects.md) and the
[project API](native-project-api.md). Native data loading and graph/table operations use this runtime. Server
catalogues and Data Roots remain outside the native project runtime, and
existing Python users' stored data is unchanged.
