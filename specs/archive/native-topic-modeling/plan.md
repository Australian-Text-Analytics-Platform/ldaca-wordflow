# Implementation sequence

1. Extend the native fitting engine with cooperative progress/cancellation and
   independent word/document projections. Verify parity against native fixtures.
2. Integrate typed capture, durable ownership and atomic publication. Test sampling,
   cleanup, rollback, immutable source metadata and output recovery.
3. Add a narrowly scoped SSE Preview owner. Test disconnect, replacement, Run,
   Clear, project close, idle ownership and expired handles.
4. Restore the interface through the existing named-tab, request decoder, progress,
   stopword, publication and download components. Verify archived interactions.
5. Exercise repository-owned input files in browser and native release builds,
   benchmark model/projection/cancellation behavior, then update canonical docs.

Models prepare outside database connections. Immutable model context is never
sent to the browser. Runtime operations retain active work until cleanup; idle
Preview memory belongs to the connection and does not count as running work.
