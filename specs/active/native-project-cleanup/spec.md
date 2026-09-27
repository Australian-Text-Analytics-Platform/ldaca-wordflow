# Independent native project windows

Implement the accepted native cleanup without changing Python server workflows or the
shared desktop interface. The database file identifies a project. Each document window
owns one backend and one project runtime in the same Tauri process. Format 4 is a clean
cutover without migration.

The canonical contracts are [project semantics](../../../docs/domain/native-projects.md),
[HTTP operations](../../../docs/reference/native-project-api.md),
[backend ownership](../../../docs/architecture/backend/native-projects.md), and
[desktop ownership](../../../docs/architecture/frontend/desktop.md).

Acceptance requires independent projects, immediate persistence, native save/close
coordination, cancellation without forced shutdown, preserved graph/table interactions,
and no native authentication, Data Root, catalogue or task-stream bootstrap.

Signed-artifact verification is deferred to release CI at the user's request. Local
verification uses the ordinary `pnpm dev:desktop` application, never a separate QA app.
