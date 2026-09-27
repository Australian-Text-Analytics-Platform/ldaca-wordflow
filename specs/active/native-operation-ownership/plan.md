# Implementation approach

1. Capture frontend mutation arguments before asynchronous preparation. Derive
   pending presentation from actual mutations rather than blocking other actions.
2. Keep the SQL console's local ordered membership separate from persisted Query
   records. Serialize metadata changes, while explicit executions remain independent.
3. Replace backend admission booleans with scoped close protection and a retained
   shutdown receiver. Native Close/Quit coordination owns prompt and completion
   lifetime; pending opens own their accounting guard.
4. Remove disposable-connection transaction cleanup wrappers. Verify rollback and
   destruction before permission release, including error and panic paths.
5. Use Radix collision boundaries, AbortController and pointer capture, then remove
   the corresponding estimates, cancellation flags and duplicate listeners.

The principal risks are stale captured targets, first-save/deletion races,
misreported overlapping progress, and premature release of close protection.
Regression coverage exercises those boundaries. See [validation status](tasks.md).
