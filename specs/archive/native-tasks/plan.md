# Implementation

1. Split file ownership from per-operation connections and lifecycle leases.
2. Remove timestamp writes, mark successful commits in runtime state and cut format 6.
3. Add typed task ownership, cancellation, snapshots and HTTP interfaces.
4. Reuse Task Centre rows with native Query/SSE state and one failure observer.
5. Verify concurrent transactions, editor exclusion, Save As, disconnects, panics,
   task retention/reconnection, frontend behavior and native rendering.

No task database, pool, replay queue, automatic retry or shutdown deadline.
