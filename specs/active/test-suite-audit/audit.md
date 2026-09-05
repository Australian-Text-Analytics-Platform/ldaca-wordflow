# Backend and Rust test suite audit

The audit accounts for all **869 original authored tests and 1,063 original
collected cases**. The resulting suites contain **832 authored tests**, with
stronger behavioral assertions and more independently addressable parameter cases.
There was no deletion target. Versions, public APIs, production behavior and
unrelated migration work were preserved.

The [complete ledger](test-ledger.csv) records the original identifier and parameter
cases, execution status, responsible production imports/module, failure scenario,
consequence, reachability, assertion evidence, overlap, fixture/cost assessment,
decision, rationale and replacement identifiers. JSON-valued cells retain every
parameter case and final replacement outcome. Original assertions are evidence for
the assessment, not a requirement to retain those assertions. The
[new-coverage ledger](new-tests.csv) records additional tests not already named as
replacements. These are one-time audit records; no inventory checker was added.

## Decisions and results

| Decision on original test | Count | Meaning |
|---|---:|---|
| Keep | 129 | Retain the original scenario/assertions in place |
| Move | 565 | Same function body under its actual ownership boundary |
| Rewrite | 113 | Strengthen or simplify assertions/setup, split scenarios, or adjust runner ownership |
| Delete | 34 | No additional useful boundary beyond declarations, mechanics or retained stronger coverage |
| Merge | 28 | Retain original scenarios through named cases or a stronger common test |

Formatting-only changes do not count as a rewritten scenario. Changes to a shared
fixture can improve unchanged test bodies; those fixture improvements are described
below. A replacement may serve several original tests, and a split original test
may have several replacements.

| Package | Authored Python before → after | Authored Rust before → after | Final Python execution | Final native execution |
|---|---:|---:|---|---|
| Backend | 650 → 633 | — | 825 passed | — |
| polars-text | 73 → 60 | 91 → 87 | 72 passed, 14 live-download skips, 1 strict expected failure | 86 passed, 1 ignored by default; the ignored model case passed separately |
| polars-source-utils | 9 → 7 | 2 → 2 | 9 passed | 2 passed |
| ldaca-data-rs | 29 → 22 | 15 → 21 | 46 passed | 21 passed |

Parametrization accounts for the difference between authored functions and executed
cases. For comparison, the original Python results were backend 833 passed,
polars-text 64 passed/14 skipped, source-utils 9 passed and SDK 35 passed. Every
original Rust test passed in the provided baseline.

Backend elapsed time was **27.63 seconds**, compared with approximately **27 seconds**
before the audit. An intermediate run during concurrent native builds took 55
seconds; it is not used as a speed comparison. The final full polars-text wheel
rebuilt from its sdist ran in **2.32 seconds**. SDK editable tests took **0.73
seconds**, its rebuilt interoperability wheel **3.77 seconds**, and source-utils
editable tests **0.41 seconds**, rebuilt wheel **3.02 seconds**. Non-backend baseline
elapsed times were not captured consistently, so no speedup is claimed. Native
assertion execution took 0.65 seconds for polars-text full, approximately 0.29
seconds across SDK modules and 0.01 seconds for source-utils, excluding compilation.

## Backend changes

OpenAPI checks now share one module and operation traversal. Operation-ID
uniqueness, discriminators, media types, authentication and secret-exposure
contracts remain. Historical route-name prohibitions, `_api_` spelling, exactly
one domain tag, repeated health inventories and broad response-field snapshots
were removed. Real HTTP responses retain status/body/value checks.

The SSE test exercises actual ASGI HTTP event framing, Unicode data, event IDs,
retry metadata, media type and finite-stream termination under a deadline. A
function being an async generator was insufficient evidence. Liveness/readiness
now uses the real RuntimeManager shutdown boundary.

Credential consumption races four separate database connections and requires one
winner. Quota tests now hold competing reservations concurrently and prove that
transient requests do not consume a finite durable quota. Corrupted-schema and
archive fixtures start from otherwise valid state, so column, collision, CRC,
encryption and resource-limit checks reach the intended failure stage.

Token schema and cache-orchestration tests use native tokenization without
irrelevant Hugging Face downloads. The backend's seven-column DuckDB snapshot is
gone; native tests own cache persistence/recomputation. Concordance comparisons,
frequency tables, multi-block exports, quotation Arrow output and sequential
publication compare actual values. Quotation Preview/Run All requires nonempty
expected detections before equality. Explicit Polars explode options remove the
test-owned warning without changing expected output.

The annotation, Data Block editing and grouped-analysis workflows now have
independently runnable scenarios, with one ordered chain retained where order is
the behavior. HTTP tests live under `integration/api`, disk/database tests under
`integration/persistence`, lifecycle/process tests under `integration/runtime`
and real worker tests under `integration/workers`. Pure logic lives under
`unit/domain`, `unit/analysis` and `unit/services`. Reused helpers moved to narrow
`tests/support` modules; one-off setup stayed local.

AnyIO owns backend asynchronous execution using asyncio. `pytest-asyncio`, unused
markers and the ineffective `.pytestignore` were removed. The ineffective root
pytest discovery section was removed. An attempted backend importlib mode broke
fresh-process imports in four supervised-worker tests; restoring its original
import mode fixed the failures, and the complete suite was rerun successfully.

## polars-text changes

Removed import/dependency denylists, retired exports, literal signatures,
extension-filename checks, immutable-container mechanics and literal model IDs.
The catalogue test validates usable records and dispatch. Dictionary cache
separation remains because loading the wrong language dictionary is consequential.
Installed full and reduced wheels exercise public calls and missing-feature errors.

Token schema, null/blank/zero-row cases share named input cases. Null/blank model
IDs exercise application validation; repeated omitted-keyword Python mechanics
were removed. Unicode offsets and meaningful chunk/input boundaries stay distinct.
The Python warm-cache equality test was removed: identical results do not prove a
cache hit. Native tests still observe recomputation, and the retained Python test
compares real cached versus uncached token output.

Native cache assertions inspect all persisted values and execute JSON SQL with
extension auto-install/load disabled. Topic tests now verify all cluster members,
ranked terms, embedding vectors, pooling dimensions, weighted coverage and complete
projection roundtrips. Schema checks inspect actual constructed Polars output.

Quotation corpus cases have descriptive IDs, explicit detection/category/speaker
expectations and original-text slice assertions. Corrupt-model handling is a
separate offline native case. Real-model parsing is explicitly ignored by default
and run with provisioned assets; selecting it without assets fails instead of
silently returning success. Both Python model jobs also fail when required assets
are missing. Bounded Proptest properties cover Unicode byte/character boundaries
and normalization projection alongside fixed regression cases.

The audit exposed a real document-start concordance error. It is preserved as a
strict expected failure and described in [production findings](findings.md).
No production fix was folded into the test cleanup.

## source-utils and SDK changes

Source-utils keeps its small layout. Named scan/filter/sample cases share setup.
Rewritten plans are checked against complete DataFrames and schemas, and multi-scan
mappings use source identity rather than incidental traversal order. Pivot,
merge-sorted and both native atomic-write failure stages remain distinct.

The SDK consolidates corpus-profile and overlapping captured search cases while
retaining identifier, filter and pagination differences. Wide-reference/scalar
cases verify every source ID, ordinal, target/value and null at the numbered-column
thresholds. Numeric inference checks exact signed, unsigned, floating and fallback
string values and late columns. Bounded generated Unicode values cross the same
numbered/companion boundary.

Each writer has independent real Parquet, IPC or CSV readback. Tests verify values,
Arrow schema/metadata where supported, quoting/Unicode, existing file contents and
portable export filename/manifest collisions. Python bindings retain compatibility
fixture equality, Arrow lifetime/repeated consumption, exception translation and
optional interoperability. Rust integration tests and Python tests are separated,
with shared compatibility fixtures in one location.

SDK cancellation uses request-start/release signals and bounded deadlines. Tests
verify unfinished-file cleanup, event-loop progress and subsequent client usability.
Loopback server teardown is guaranteed on assertion failure, with prompt shutdown
and native RAII task cancellation. Python and Rust cancellation, backend credential
consumption and quota cases each passed five repeated runs.

## Evidence and limitations

[Run evidence](run-evidence.json) records suite outcomes and artifact checks.
Native polars-text feature executions passed with base 1, tokenization 22,
embedding 18, tokenization-plus-embedding 33, topic 74, quotation 13 plus one
explicitly provisioned ignored test, and full 86 plus that same model test.
Strict Clippy passed in all three native packages. Backend/SDK Ruff and type checks,
polars-text/source-utils type/lint checks, SDK rustfmt, documentation links and
`git diff --check` passed.

All three macOS arm64 CPython 3.14 wheels were installed and exercised from outside
the checkout. Base/tokenization/quotation reduced wheels each passed four feature
call cases. All three sdists rebuilt into wheels and passed their corresponding
installed suites. The SDK core wheel passed **42 tests without Polars or PyArrow**;
a separate environment passed all 46 cases with optional consumers. Build artifacts
and raw logs are under `/tmp/wordflow-test-audit/`; compact results are retained here.

Coverage.py dynamic contexts measured backend execution across 175 production
files. Shared quota/storage/workspace code appeared in many test contexts; that
was not treated as redundancy. The supporting run measured 85% statement and 66%
branch coverage, with no coverage threshold introduced. Measurements preceded the
final moves and are not a final coverage claim. Remaining unexecuted branches
require scenario-specific review rather than blanket tests.

[Mutation evidence](mutation-evidence.json) records five targeted changes to SDK
`lossless_float`. The first fixture caught two and missed three. Those survivors
were genuine coverage gaps for compatible signed/unsigned float promotion, not
classified as equivalent. Exact additional values/nulls then caught all five.
This demonstrates stronger assertions for that function, not a repository-wide
mutation score or guarantee.

Linux x86-64 and Windows x86-64 wheel execution, and SDK Python 3.11–3.13 wheel
execution, are configured in CI but were unavailable on this host. Fourteen live
Hugging Face/Lindera cases remain explicit skips; a matching original skip count
does not mean the same cases, because the HF-offset case is now opt-in and a
catalogue-only skip was removed. No new live provider/model-download acceptance
was claimed. The one backend warning comes from Google's SDK using a deprecated
Python typing alias. UDPipe emits two preexisting vendor compiler warnings; its
vendored source was not edited.

The durable procedures are in the [testing runbook](../../../docs/runbooks/test-suites.md).
No publishing, pushing, version changes or user-data changes were performed.
