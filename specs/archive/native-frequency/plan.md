# Implementation plan

1. Add format-7 analysis tabs, result descriptors and table/BLOB ownership, with
   transactional replacement/deletion and matching Quick Look validation.
2. Extend native task association and add a Frequency operation that loads models,
   reads a consistent read-only transaction snapshot and accumulates native
   counts/statistics. Retain the same operation's connection and lifecycle/write
   leases while a fresh short transaction first claims the existing tab with
   UPDATE RETURNING, then atomically publishes results. A late update inside the
   original input snapshot is insufficient protection against tab deletion.
3. Restore the active Frequency pane using TanStack Query server state and local
   drafts, bounded Arrow projections, explicit tab creation and persisted display
   preferences. Keep named EditorTabs fixed above one scroll area containing the
   Token Frequency Analysis and Token Frequency Results cards. The tab close ×
   deletes its analysis; no duplicate Delete action or inner request/results tabs.
   Keep graph and preview selection independent.
4. Bundle language assets and restore generated-chart/full-table exports through
   the existing destination-staging/install ownership.
5. Verify storage/lifecycle races, actual browser/native workflows and packaging;
   update canonical docs/tutorials and regenerate the publication mirror.

No worker subprocess, persisted scheduler, source-version tracker, run history,
new database mutation permission or other analysis restoration is included.
