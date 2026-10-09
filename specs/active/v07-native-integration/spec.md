# Approved v0.7 native integration

Implement the user's approved review of V07-001–232 from split `aaea1c3b`,
v0.7 `3cd4deda4`, against native main `ffdc9609`. The decisions in
[the register](decisions.md) and this specification supersede v0.7 defaults.

## Behavior

- Extend existing native owners, ordinary DuckDB SQL, Arrow transport and
  Utoipa contracts. Preserve source rows and historical saved-result meaning.
- Present original errors at the responsible form/results, with bounded text,
  expandable Details, copy and feedback. Toasts are the fallback owner.
- New names trim outer whitespace only and reject case-insensitive collisions.
  Rename awaits confirmation and keeps the draft available after failure.
- Public data exports are CSV, XLSX, JSON and Parquet. CSV has a UTF-8 BOM and
  JSON nested values. XLSX has one Data worksheet and rejects worksheet limits.
- One native import plan handles files, workbooks, folders and ZIPs atomically.
  Mixed inputs yield one text Data Block plus separate table/sheet Data Blocks.
  All files/sheets start selected; skip hidden paths, links and nested ZIPs.
  Text documents retain relative paths, names, extensions and whole text.
- Server New creates a permanent Untitled-X.wfpj; Duplicate stays on the
  original. Idle Rename preserves shared runtime identity. Project switching
  preserves background work. Uploads use view-independent cards, no quota,
  cancellable byte progress and Finishing until acknowledgement. Uncertain
  late cancellation retains Refresh/Dismiss. Protect active destinations and
  ancestors with atomic mutation preflight.
- One Task per Run. Tab deletion cancels and purges associated Tasks; late
  completion cannot recreate them. Unassociated import/export history remains.
- In-place column tools occupy the graph area above a collapsible Data View.
  Successful Apply closes; failure retains settings. SQL powers Preview/Apply.
  Group and Deduplicate create atomic sets of live Views; Aggregate exposes
  optional ordering. Strict conversion validates all rows before changing data.
- Explicit Run recomputes all stages using only existing token/embedding
  caches. Retain non-embedding intermediates with analyses for downstream
  adjustments; Clear removes them. Preserve last valid results on failure and
  reject superseded completions. No automatic backfill of old analyses.
- Topics use paragraph-first Automatic, preserve short nonempty text and
  existing oversized-text fallback, expose a fixed native maximum (unlimited
  default), retain whole-document publication and unchanged uniform geometry.
  Colour by uses captured metadata summaries; own-group shares appear in all
  contexts and use sampled denominators in Preview.
- New Frequency comparisons measure Study against Reference. Keep explicit
  roles, presentation order, exact counts and historical result mathematics.
  Publication keeps original document/match order. Saved Concordance bands
  follow contiguous documents after whole-result filtering/sorting.
- Preserve current graph gestures, remove Overview and add box selection.
  Tabs reveal on activation/mount/target changes, never resize. Help is bundled
  only. Keep agreed wording, responsive controls, native feedback windows and
  the acknowledgement citation with DOI 10.5281/zenodo.20408328.
- Publishing promotes a prior successful production release build by run ID;
  validate actual built SHA/version/tag, complete artifacts, signatures and
  digests, then publish the original bytes without rebuilding. Retain hard links.

## Exclusions

No push or release publication. No retired Python infrastructure, automatic
legacy migration, parallel state/cache authority, extra stage Tasks, Segment,
interactive HTML exports, broad table-scrolling changes, analysis parameter
redesign, geometry displacement or global gamma changes. Reproduction remains
required for deferred Safari remount and cloud flashing workarounds.

## Acceptance

Each approved behavior must have focused native/component evidence or an
explicit manual acceptance record in the register. Run affected package checks,
generated API checks and Markdown links. Exercise Chromium/WebKit and native
macOS/Windows for platform behavior; report unavailable lanes honestly. Use
isolated test-owned projects and storage. Archive only after acceptance.
