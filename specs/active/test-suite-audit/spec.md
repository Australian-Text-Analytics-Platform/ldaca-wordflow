# Test suite audit

Requested directly by the user on 2026-09-05; no GitHub issue or remote action was
requested. The one-time ledger remains at this explicitly requested active path.

Assess every original authored test in the backend, polars-text,
polars-source-utils and ldaca-data-rs, including Python bindings and native tests.
Prune low-value declarations and duplicate boundaries, strengthen ineffective
oracles, and organize tests by real responsibility. Preserve meaningful rare
failure coverage, versions, public APIs, production behavior and unrelated work.

The baseline contains 869 authored tests and 1,063 collected cases. Frontend,
Tauri and third-party vendored tests are excluded. There is no deletion quota,
permanent inventory guard, assertion-count rule or coverage/mutation score gate.

Acceptance is a traceable decision for every original test/case, complete local
package checks, representative deliberately broken behavior caught by improved
assertions, installed-wheel/source-distribution checks and explicit reporting of
skips, defects and platform checks unavailable on this host.

See the [audit report](audit.md), [implementation plan](plan.md),
[verification status](tasks.md) and [production findings](findings.md).
