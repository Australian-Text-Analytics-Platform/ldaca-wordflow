# Frontend test audit — manual pass

Status: in progress. This record describes the manually reviewed areas and local
changes so far. It is not an assessment of every frontend test. The backend/Rust
ledger does not include these tests and must not be presented as doing so.

Review used direct reading of test bodies, fixtures and relevant implementations,
followed by hand-written patches. No review, classification or rewrite scripts
were used. Existing Vitest, Playwright, lint, build and documentation commands
provide execution evidence, not review decisions. Native Tauri Rust tests are
outside this pass; frontend-owned desktop configuration tests are included.

## Changes and practical reasons

| Area | Decision and practical consequence |
|---|---|
| WorkspaceShell / viewRegistry | Remove duplicated tab classification and the static label/order inventory. Retain workspace gating and tab ownership; browser navigation actually opens each view. |
| Button | Replace six disabled CSS variants and a geometry snapshot with disabled/enabled clicking. A class string cannot prove the action is blocked. |
| ScrollArea | Remove the CSS-only scrollbar visibility test and obsolete lint suppression. Retain the viewport ref contract used for controlled scrolling. |
| ResizeHandle | Remove grip/highlight styling inventories. Exercise both separator orientations, callback forwarding and disabled keyboard navigation. |
| DataBlockName | Exercise overflow-to-fitting rename behavior and vertical overflow. Remove fixed height/position class inventories; JSDOM supplies measurements, not visual-layout evidence. |
| Right panel | Start with a saved ratio different from the default before collapsing and expanding. The old test could pass if collapse incorrectly reset the user's ratio. |
| Tokenizer selector | Replace height/rounding checks with actual model selection and the resulting callback. Retain lazy catalogue loading and explicit clearing. |
| Documentation registry | Derive cache/URL expectations from the running application minor version, fixing two baseline failures. Remove three weaker lookup duplicates while retaining remote override, cache fallback, stale schema and concurrent fetch behavior. |
| Guidance registry | Remove the literal requirement for 50 hints and uniform placement. Retain unique persisted identities and sequence reachability, plus enabled-target/fallback resolution. |
| Token Frequency results | Replace fifteen exact tooltip-copy cases with one actual hover explanation. Retain virtualization, final-row scrolling, full exports, filtering and Reference/Study identity. |
| Quotation | Remove the literal highlight palette snapshot. Require a nonempty exact span before Preview/Run All equality assertions. Retain Unicode offsets, native Int64s, overlapping spans and metadata projection. |
| Concordance Review | Replace group-shape-only assertions with exact occurrence values, offsets and source identity. Copying the first match into every group must fail. |
| Typed expressions | Replace the historical raw-code rejection case with malformed JSON, non-object input and missing-expression/operation cases. Compare exact edited sources rather than checking for one substring. |
| Display limits | Replace the default-value declaration test with missing, nonfinite, zero, negative, fractional and valid input cases. |
| Simple array helpers | Remove the string-array repetition of the numeric selection case and duplicated intrinsic tab-width case with no viewport input. Retain bounds, ordering and empty selection. |
| Schema cache | Exercise a real failed query and absence of fabricated cached columns. Fix a beforeEach callback that returned a mock: Vitest interpreted it as teardown and invoked it after the test. |
| Lazy stopwords / language choices | Assert exact repeated values, the original import error cause and complete remaining model records, rather than definedness or lengths alone. |
| Task Inbox | Start the SSE fixture queued, then require a refresh to succeeded with revision 2. Previously the initial resource already succeeded, allowing an ignored event to pass. |
| Provider persistence | Verify the exact restored configuration and secret, including ignored incompatible storage events. Restore UUID spies between tests. Persisted-version coverage stays because it protects existing user data. |
| Downloads / external drops | Check browser filename, href, URL revocation and anchor removal; restore mocks/timers. Dispatch real dragover/drop events before and after listener disposal rather than only inspecting registration calls. |
| Shared HTTP fixtures | Return typed UserFileImport resources from import routes, use 202 and Location for submission, and clear completion timestamps on queued Analyses. Remove the fixture-only demand for page_size=100. |
| Desktop configuration | Remove icon-file, default zoom and traffic-light declaration snapshots. Retain application identity, updater/runtime packaging and permission/CSP boundaries because failures affect upgrades, startup or access. |
| Tooling fixtures | Ensure documentation-sync and runtime-staging temporary directories are removed after failures as well as passes. Retain relocation, corrupt paths, ABI/provenance and stale-file replacement cases. |
| Browser setup | Share explicit Workspace creation across three scenarios. Unload an existing Workspace instead of silently reusing it; make upload names unique across repeats/retries. |
| Browser assertions | Require four concordance matches in four documents and exact CSV readback. Remove fixed /tmp success screenshots; configured failure artifacts remain. |
| Organization | Rename ServerPaginationFooter.repro.test.tsx to an ordinary regression-test filename. Keep feature ownership and small suites in place; avoid a new hierarchy for cosmetic consistency. |

## Retained coverage reviewed

The reviewed areas also include backend URL discovery and CSRF/error translation,
Arrow decoding, auth bootstrap and logout, provider credential boundaries, theme
bootstrap/storage synchronization, navigation history, transient selection and
new-Data-Block stores, upload traversal/conflicts, quotation projection/preferences,
Concordance grouping/pagination, annotation label and SQL-filter rules, preprocessing
request conversion, chart selection and topic-projection lifecycle.

These cases have plausible consequences: stale data after an event, cross-account
credential use, lost preferences, clipped or misidentified occurrences, incorrect
exported rows, inaccessible navigation, or silent partial uploads. Their rarity
does not justify deletion. Security and persisted-data checks remain separate
from static naming/appearance inventories.

## Verification

| Check | Evidence |
|---|---|
| Baseline Vitest | 277 files, 1,382 cases: 1,380 passed and two stale documentation-version expectations failed; 29.40 seconds. |
| Current Vitest | 276 files, 1,359 cases passed; 26.95 seconds. This is a net reduction of 23 cases, with new behavioral cases also added. |
| Build verifier | Three Node cases passed. |
| Runtime staging | Five Node cases passed, including temporary-directory teardown. |
| Frontend build | TypeScript, theme checks, Vite and artifact verification passed. |
| Lint / tooling types / docs | Passed; engineering links and git diff --check passed. |
| Browser | Navigation and strengthened core workflow passed. Quotation reached its final UI state but the console-error check recorded a 404 for a superseded Analysis. Two further isolated repetitions with unique upload names reproduced that same failure. |
| Portal / native desktop | Portal test was skipped without its separately provisioned fixture. No packaged macOS or other-platform acceptance was performed. |

Vitest still emits existing Canvas getContext warnings from chart imports. This
pass did not silence those globally or install a Canvas implementation to conceal
the boundary. Timings are observations, not a speedup claim.

## Remaining work

- Complete the manual file-by-file review of the remaining component, hook and
  feature suites. The passing full runner does not mean every test was reviewed.
- Finish per-test accounting for the complete frontend ledger; do not
  synthesize rationale from test names or automated inventory output.
- Review the largest mixed component suites for focused scenario groups, without
  splitting meaningful end-to-end ordering or replacing integration with mocks.
- Audit remaining query-key snapshots and query-client/timer cleanup. Prefer
  observable cache isolation/invalidation where literal arrays add little value.
- Investigate the quotation activity refresh after supersession separately from
  test pruning. The console-error assertion remains intact; no production change
  or broad exception for 404 responses has been introduced.
- Provision portal browser acceptance and evaluate whether expected HTTP failure
  diagnostics need scenario-owned assertions. Do not disable runtime checks just
  to permit an import-failure test.

No package versions, production APIs or user data were changed by this pass.
Existing unrelated checkout changes remain. No commits, pushes or publication
were performed.

Local run logs are under `/tmp/wordflow-frontend-*`: `tests-before.log`,
`tests-final.log`, `audit-build.log`, `audit-lint-final.log`, `audit-tooling.log`,
`audit-types-final.log`, `audit-docs.log`, `audit-links.log`, `audit-e2e.log` and
`audit-quotation-final.log`. These are ephemeral execution artifacts, not a
permanent inventory guard.
