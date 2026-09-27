# Native Annotation

Implement the approved native Annotation plan: numbered tabs with Manual and AI
modes, staged shared editing, fresh temporary AI Preview, atomic full-data Run,
live review, provider connections and host-owned OS credentials.

## Invariants

- Protect only edited Tables. Reads and independent work remain available.
- Keep explicit `rowid` values typed and lossless; never manufacture identifiers.
- Reconcile app-driven renames transactionally while preserving saved artifacts
  and dependent View output interfaces. Arbitrary SQL does not infer renames.
- Manual setup persists on Start; AI requests persist only on accepted Run.
- Preview clears old predictions immediately and calls the provider on every
  explicit page action. It never writes project data or restores automatically.
- Save/Cancel replaces archived autosave. Live Codebooks determine current
  choices and comparisons; captured run context remains immutable.
- Run writes successful labels atomically. Fatal failure/cancellation leaves
  source labels unchanged. Partial failures never become valid NULL predictions.
- Clear removes report/context, never committed source labels.
- No project-schema change, label history, post-save Table Undo, workers,
  persistent Preview or annotation-specific export system.

Preserve the archive and unrelated working-tree changes. Completion requires the
accepted feature inventory, focused regressions, required package checks,
browser/native scenarios and clean-release visual verification.
