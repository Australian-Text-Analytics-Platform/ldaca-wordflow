# Analysis UI parity

Implement the reviewed Frequency, Concordance and Quotation changes while retaining native result ownership, on-demand Preview and the established Request/Results layout.

## Accepted behavior

- Preview is a step before Run All for a captured execution request. Run All disables Preview while active; success displays saved results and prevents Preview of the same request. Changed execution drafts enable Preview. Clear Results retains drafts and removes only saved artifacts. Failed work retains the previous display. No Clear Preview action.
- Bounded, sticky-header result tables support row inspection without interfering with text selection or embedded controls. Full-document inspection stays minimal.
- Invalid numeric input reverts with a Sonner reminder; blocked actions explain why when attempted.
- Frequency preserves rank after stopword filtering and before wildcard filtering, restores filter clear/count feedback, and exposes clickable clouds and counts accessibly. Independent display limits, reset-on-presentation-switch and corrected statistics remain.
- Stopword bubbles read Table order. Add, remove, preset merge and confirmed Clear commit immediately through atomic membership changes. Sort reorders complete Table rows without replacing its schema. Close replaces Save/Cancel. View editing continues to prepare a registered column copy.
- Concordance restores Preview L1/R1 and offsets, visible Text/Tokens controls with retained options and help, grouped metadata, Combined row identification, accurate page summaries and per-source paging labels. One publication menu offers Matches/Documents. Existing Dispersion parity stays intact.
- Quotation offers Documents/Matches in Preview and Saved results; Preview expands the current document page locally. Restore inline role/type cues, metadata selection shortcuts, saved numbered pagination, task progress and one publication menu.

No migration, result history, new execution framework, external Quotation engine, or inspector summary fields.
