# Archived Annotation parity

The reference is `archive/frontend/src/features/views/annotation/`, its common
Annotation filter component, and `archive/backend/src/ldaca_wordflow/` Annotation
services/provider adapters. Archived source remains unchanged.

| Archived capability | Native owner / approved behavior | Evidence |
|---|---|---|
| Source, document/destination/correction columns, source color | Shared setup in `AnnotationFeature`; explicit column creation/materialization | Manual browser/native scenarios, frontend feature tests |
| Manual Start/Close | Shared cell editor; Save/Cancel replaces autosave | Editor, HTTP and navigation regressions |
| Codebook create/add/rename/delete | Shared restricted editor preserves unrelated columns; live choices and Save validation | `project::annotation` tests |
| Numbered tabs and restored setup | Existing Tabs shell; most recent successful Start/accepted Run initializes setup | Frontend restoration tests and Manual browser scenario |
| Compatibility and newer drafts | Shared request decoder, local draft ownership, no write on open | Request decoder/Annotation tests |
| Model discovery, wildcard/manual names | Shared searchable selector and explicit model name; host configuration revisions | Provider adapters and existing wildcard-selector tests |
| Five provider families and keyless custom | Native adapters; OS/session credentials replace browser-owned secrets | Credential and deterministic local HTTP tests |
| Prompt placeholder and Tab completion | `AnnotationAi` instruction control | Source review; visual acceptance pending |
| Provider inference controls | Explicit Provider default, validated supported settings; no silent parameter omission | Adapter payload/validation tests |
| Examples, random/first/last, per-code limits/seed | Captured context; invalid examples excluded and counted | Native context tests |
| Preview | Approved change: fresh page inference, no saved snapshot or cache; clearing predictions retains correction patches | HTTP and frontend tests; browser scenario |
| Full Run and missing-only mode | Atomic direct label updates, bounded concurrent requests, retries/splitting | Native lifecycle and provider tests |
| Partial failures and valid NULL predictions | Separate states; old labels retained only on failed/skipped rows | Execution and HTTP regressions |
| Progress, cancellation, Clear | Existing task authority; clear report/context rather than source labels | Lifecycle tests and browser scenario |
| Masked comparisons, κ/α/agreement, matrices | Live Codebook, full-Table or Preview-page scope; unsaved patches included | Native statistics/filter and page comparison tests |
| Difference/existence filters | Filter before count/page; Empty disables Differs, removing comparison clears filter | Native draft review tests and UI source review |
| Metadata, pagination, bounded scrolling and height | Shared table components and `ReviewViewport`; common window-local height | Browser/native screenshots pending independent review |
| Correction editing / Use as Example | Explicit protection; shared draft and Save-and-use workflow | Browser Preview → correction → Clear → Save → Run scenario |
| Historical context versus live labels | Saved report/context/diagnostics; current source and Codebook for review | HTTP source-deletion/context tests |
| Undo | Approved deferral: no committed Table-label Undo; View Undo retained | Shared editor/domain tests |
| Renames and editor protection | Approved change: table-scoped shared leases, typed identities, transactional recognized-reference reconciliation | Shared runtime, row-ID, rename and saved-Plot regressions |
| Apple on-device provider | Added by user request: macOS 26+ framework, guided schema, cancellation; `fm` is macOS 27+ | Live adapter smoke and native Preview/Run journeys passed; independent visual review pending |

Independent browser/native visual acceptance, clean release packaging and
cross-platform coverage must be reported separately from the automated evidence.
See [delivery status](tasks.md); this checklist does not mark pending gates passed.
