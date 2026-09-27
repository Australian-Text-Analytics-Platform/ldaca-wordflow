# Frequency statistics View

Status: completed on 19 September 2026. Requested directly in the local development task; no GitHub
issue was created.

Replace newly published Frequency comparison Tables with private SQL Views over
saved count Tables if measurements show no serious interactive slowdown. Preserve
saved-result independence from source data, exact counts and existing formula
semantics. Keep old results readable, sortable, exportable and deletable.

Acceptance: compare View calculations with the native implementation; benchmark
10,000–1,000,000 tokens; exercise sorting, filtering, clouds, complete exports,
reopening and transactional ownership. Do not change project format, rerun or
convert previous results, expose artifacts in graphs, or add a caching framework.
