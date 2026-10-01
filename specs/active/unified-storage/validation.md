# Migration validation

Validation date: 1 October 2026. This change remains active until its external
acceptance gates pass. No production cutover, push, release or image publication
has been performed.

## Baseline and checkout ownership

The implementation uses an isolated checkout. Commit `f0b0c8d9b` snapshots the
existing configuration and Dev/Test identity work for comparison; it is separate
from the migration commit. The original checkout's pending source changes remain
untouched. Builds initially reused the existing Cargo target directory. After that
shared directory was removed during native validation, this checkout switched to
its own generated build directory for subsequent checks.

Before migration, the frontend passed 708 tests in 160 files and 17 Node tests.
Root development scripts passed eight tests. Backend unit tests passed 187 with
14 existing ignored tests; the server passed two unit tests. Documentation links
passed across 334 Markdown files. A complete baseline E2E run was not recorded
before implementation; failing migrated workflows are compared against the
preserved baseline without changing its assertions.

## Package and contract checks

The complete frontend `check` command passes: 719 tests in 165 files, 17 Node
tests, three version tests, lint, formatting, tooling types, source discovery,
Knip, production build, theme checks and documentation drift. Root development
scripts still pass eight tests. The final project-route assertion and native
restart launcher also pass tooling checks; the launcher passes Knip.

Locked Rust checks pass:

| Package | Observed tests |
| --- | --- |
| Storage | Four unit tests |
| Backend | 188 unit tests, 57 integration tests and two CLI tests |
| Server | Nine unit tests and five lifecycle tests |
| LDaCA library | 106 unit tests and 21 integration tests |
| Tauri | 35 unit tests with default features |

Existing ignored tests remain unchanged: backend unit 14, backend integration
one and LDaCA unit one. The new Linux container test is explicitly opt-in and
cannot run on macOS. Strict Clippy with all targets/features passes for storage,
backend, server, LDaCA and Tauri. Rust formatting passes. LDaCA feature-isolation
checks pass for no features, data, cache, tokenization, embedding, topic modelling,
quotation and the full combination.

Generated OpenAPI/TypeScript drift checks and workflow syntax checks pass.
Internal documentation links pass. Final diff checks are repeated before commit.
No generated contract was edited by hand.

## GUI and process checks

The migrated browser suite completed all 36 spec files: 99 passing tests and six
failing tests, with no skips, in 27 minutes 28 seconds. Frequency, annotation,
concordance, quotation, Topic Modelling, plots, export/reopen, research workflows,
SQL, theme and layout scenarios ran with their existing assertions. The old
project test's request restriction is updated for the new preference API and
explicitly requires the preference read.

A six-spec comparison at `f0b0c8d9b` finished with 20 passing tests and four
matching failures in 5 minutes 43 seconds:

| Existing failure | Identical baseline and migrated observation |
| --- | --- |
| Graph interactions | Hover-expansion wait times out at `interactions.spec.ts:98` |
| Preview naming | Expected `renamed`, received `data.renamed` at `previews.spec.ts:87` |
| Restored Frequency request | Run remains disabled at `requestCompatibility.ts:122` |
| Live samples | Fixed four-checkbox expectation fails after the catalogue expanded |

These assertions remain unchanged. The sample screenshot shows five collections;
the request resolves the live repository before pinning a snapshot. The initial
migrated builder-dialog lookup failure did not reproduce in either the baseline
or migrated focused run. The migrated project and builder rerun passed all four
tests in 53 seconds, without changing the builder scenario. That first transient
failure remains part of the recorded full-run outcome.

The normal native Test build and bundle signing pass. Its complete suite ran all
23 specs in 5 minutes 45 seconds: 81 passing tests, one failure and one existing
conditional Apple Foundation Models skip. The failure is the restored Frequency
request assertion at `requestCompatibility.ts:122`, also observed in the baseline
browser comparison of that shared scenario. A baseline native run of that failing
scenario was not performed, so its native outcome is reported separately.

A named restart check
launches two separate Test processes with fresh WebView stores, saves preferences
in the first, and verifies the same preferences from disk and the UI in the
second. It passes and removes both stores. The final rebuilt Test bundle also
passes the two-window synchronization/reload scenario and the process restart
check. Native identities, instrumentation and the manifest's binary hash are
validated before launch. Test-owned WebView stores, including the earlier
interrupted launch's store, were removed through the validated Test binary.

The new standalone two-window test caught a preference refresh failure while
each window held three SSE connections. Preferences now share the user event
connection with registry subscribers. Frontend connection ownership and backend
preference/registry notifications have regression coverage. The complete rebuilt
server browser suite passes all four tests across two spec files in fourteen seconds:
independent windows, same-file runtime reuse, shared close, preference broadcasts,
reload, saved projects and preferences across a server process restart, and the
existing upload/import/library workflow. A project-switching regression exercises
different Join inputs in files with matching table names and restores each file's
inputs independently. Unit coverage also checks pins, preview, table views and
graph state. The new API helper handles the documented 204 close response without
attempting to parse an empty JSON body.

The extracted final debug server passes the relocation smoke procedure outside
the checkout: embedded assets, empty startup cache, first-use signed ICU download
and `admin/projects` persistence. This is an unoptimized debug binary, not release
packaging acceptance.

Both providers' fixture tests cover valid signed callbacks, key rotation, bad
issuer/audience/expiry/signature/nonce, callback binding and replay, login expiry,
session expiry/logout, Origin/CSRF rejection and stream revocation without
revoking another device. Public discovery documents confirm the configured
issuers and endpoints; this does not replace registered-client sign-in acceptance.

The optional ICU helper passes pinned download and explicit-source checks in
temporary directories. A missing explicit source fails without consulting the
home directory's DuckDB cache.

Gateway socket lookup rejects symlinks beneath a user root and holds the checked
socket inode for the request. A Linux unit test exercises actual Unix sockets,
replacement and parent symlinks; the real-container test includes a cross-user
socket substitution. These Linux-only checks have not run or compiled on this
macOS host and remain part of Linux acceptance.

Final cleanup finds no resolved Test storage roots, cleanup lock or owned test
processes. Eight protected production/Dev preference, provider-settings,
updater-settings and plist fingerprints are unchanged, including originally
absent files. All 50 original pending source paths still match the pre-migration
snapshot. These fingerprints cover the named files, not every production data
file or cache entry.

## Timing and environmental failures

These are individual validation timings, not a controlled performance benchmark.
The baseline frontend suite took 20.26 seconds; the final migrated suite took 23.45
seconds with eleven additional tests and five additional files. Backend unit and
integration tests took 8.89 and 4.04 seconds. The final server unit/lifecycle tests
took 18.63 and 0.43 seconds. Tauri unit tests took 0.81 seconds.

Intermediate disk exhaustion, loopback sandbox rejection, a shared pnpm modules
directory rejection and a stale removed DuckDB build output were environmental
failures. Repaired checks are recorded separately. Recovery removed generated
compiler caches/object files and retained application binaries and source/data.
No assertions were weakened to bypass these failures. New GUI fixtures were
corrected to select the native IPC transport and to use the server's typed SQL
adapter and source-defined Join tab ID. The cleanup lock correctly rejected one
overlapping launch; the subsequent serialized run completed normally.

## Remaining acceptance gates

- Real Linux rootless containers, effective delegated cgroups, protected-network
  listeners and cross-worker connection attempts, gateway adoption and shutdown.
- Live Google and CILogon clients, separate account profiles, logout/login and
  invalid/replayed callbacks through the actual deployment prefix.
- Account A/B cache downloads and reuse, secret-free persisted state and logs,
  and independent events in the real gateway/worker deployment.
- Uninstrumented production macOS and Windows packaging in isolated GitHub-hosted
  jobs, including updater/assets and Quick Look. Their existing runners provide
  the required VM isolation; no separate local macOS account is needed.
- The four confirmed browser baseline failures remain outside this storage change.
  The native shared Frequency scenario fails as reported above. Production
  acceptance must account for these existing workflow results without weakening
  assertions or silently excluding them.

The local Docker context points to an absent daemon, and only the macOS Rust
target is installed. No suitable Linux enforcement environment or registered
test-client configuration has been supplied. Follow the
[Linux acceptance procedure](../../../docs/runbooks/linux-multi-user.md) and
[manual cutover procedure](../../../docs/runbooks/storage-cutover.md) using copies.
