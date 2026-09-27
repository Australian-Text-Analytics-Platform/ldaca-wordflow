# Native Frequency restoration

Status: completed 2026-09-19. See [delivery checks](tasks.md) for verification
results and platform limitations.

Restore one/two-corpus Frequency, ranked lists, clouds, Juxtorpus, statistics and
exports on native tasks. Each named analysis tab owns only its latest successful
result. Successful submitted inputs and display preferences persist; unfinished
parameter edits are local drafts. Other analysis functions remain unavailable.

The Frequency pane restores the historical tabbed layout: a fixed named
`EditorTabs` strip above one scrolling content area containing the **Token
Frequency Analysis** and **Token Frequency Results** cards. Keep the request and
results together without a second tab system or oversized feature heading. The
named tab's close × deletes the analysis via the existing API, including active
task cancellation; remove the separate Delete analysis action.

Project format 7 stores tabs, immutable result descriptors and privately owned
table/BLOB artifacts. Older projects are rejected without migration. Graphs and
public object controls exclude analysis artifacts.

Use existing editor protection, connection-per-operation execution, native
tokenizers/statistics and cooperative task cancellation. One task per tab may
run; independent tabs/projects may overlap. One runtime-owned operation retains
its connection and lifecycle/write permissions across a read-only input snapshot
and a subsequent short publication transaction. Publication first claims the
existing tab with an UPDATE RETURNING statement, then publishes artifacts and
removes the superseded result atomically. A deleted tab is never recreated.
Failure retains the previous result. No source files, retries or queue bridge
the two transactions.

MediaPipe recommendations and stopword assets run locally. Task summaries are
transient; saved results do not depend on retained task history or live sources.

Canonical design: [native analyses](../../../docs/architecture/backend/native-analyses.md).
