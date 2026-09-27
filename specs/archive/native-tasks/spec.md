# Native tasks and concurrent DuckDB execution

Implement the user-approved native task infrastructure without integrating production
imports, console execution or analysis as task consumers. Each runtime owns one
embedded database and clones a connection per operation. DuckDB owns concurrency
conflicts. Format 6 removes the shared modification timestamp; runtime Untitled
state is marked only after successful mutating commits.

Task submission is typed Rust work, retained through cooperative cleanup regardless
of caller lifetime. TaskTracker owns completion, CancellationToken owns cancellation,
and watch owns current snapshots. Retain active tasks and 100 finished summaries.
Expose project task snapshots, SSE, cancellation and dismissal with no job dispatcher.
Reuse the Task Centre presentation. Preserve Save As exclusion, editor snapshot
exclusion, independent windows, native close prompts and no shutdown deadline.

Canonical contracts: [runtime](../../../docs/architecture/backend/native-projects.md),
[project](../../../docs/domain/native-projects.md),
[API](../../../docs/reference/native-project-api.md#tasks).
