# Approved v0.7 native integration

Implement the user's approved review of V07-001–232 from split `aaea1c3b`,
v0.7 `3cd4deda4`, against native main `ffdc9609`. The decisions in
[the register](decisions.md) and this specification supersede v0.7 defaults.
The [remaining-commit audit](commit-audit.md) accounts for all 53 commits outside
the numbered entries without introducing additional runtime features.

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

## Approved v0.7.12–v0.7.13 extension

Review V07-233–312 covers all 204 commits from `3cd4deda4` through `e8c247959`,
including the late v0.7.11 gap, against native main `4ad0c6d925`.
The extended decision register and [commit audit](v0713-commit-audit.md) record
adoption, existing behaviour, deliberate departures, deferred work and reproduction gates.

New Topics, Concordance and Quotation results process distinct exact texts per
input and retain generated outputs plus completed-text records, including empty
outputs. Live source rows join by exact text, retain duplicate source rows and
exclude unprocessed/removed texts. Source positions are query-time ordering keys,
never join identities or stored processing-order fields. Presentation excludes
empty matches; publication includes completed empty outcomes. Current matching
source rows own metadata and population summaries. Preview uses its temporary
sample, not all source duplicates. Historical analyses retain their format until Rerun.

Publication copies fixed outputs into independently Data Block-owned hidden
relations and creates live Views. Upgrade native ownership metadata atomically
on first new publication, never on opening. Missing sources yield ordinary SQL
errors; retain references so compatible same-name restoration can resolve again.
No source-metadata snapshots, automatic detach or legacy project migration.

Topics retain native HDBSCAN with internal minimum 10, a hard optional maximum
segment size and a target count through constrained retained-hierarchy merges.
No automatic retries. Automatic packs neighbouring whole paragraphs; oversized
units use the existing native splitter. True outliers appear in a separate grey
footer; shared search/lasso predicates retain faded selected cards.

Annotation commits completed distinct-text batches directly to protected source
Tables. Quotation uses parallel native workers and durable private batches with
checked-text records; Stop preserves progress and Resume is explicit. Preserve
fresh AI Preview, fatal timeouts, manual drafts and one task per Run.

Recurring Suggestions, Topic examples/typicality, persistent Topic names,
approximate Run, expanded conversions, custom elapsed-time parsing and structured
progress/ETA remain excluded. Existing platform acceptance gates remain open.
