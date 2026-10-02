# Dependency upgrades, 2 October 2026

The registry scan covered 73 unique direct Rust dependencies across the five
active Cargo packages and 74 npm packages across the root/frontend manifests and
Vite+ catalog. The documentation submodule has no package dependencies. Retired
Python packages, vendored UDPipe source and the independently maintained
polars-text repository are outside this upgrade. Pinned CI actions and actionlint were checked
against their official releases and are current. CI continues to select Rust
`stable`; no repository compiler pin was added.

## Updated application dependencies

| Area | Before | Selected |
| --- | --- | --- |
| Node LTS / pnpm | 24.15.0 / 11.24.0 | 24.21.0 / 12.8.1 |
| React and React DOM | 19.2.8 | 19.3.0 |
| Tauri Rust, JS API and CLI | Rust 2.11.5, JS 2.11.1, CLI 2.11.4 | 2.12.1 |
| DuckDB engine | 1.5.5 | 1.5.6 |
| Hugging Face Hub | 0.5.0 | 1.0.0 |
| Lindera and downloaded dictionaries | 3.0.7 | 6.2.0 |
| Utoipa / Utoipa Axum | 5.4.0 / 0.2.0 | 6.0.0 / 0.3.0 |
| Zip | 6 and 7 | 8.6.0 |
| SHA-2 | 0.10 | 0.11.0 |
| Rusqlite | 0.38 | 0.40.2 |
| WebdriverIO runner packages | 9.30.1 | 9.32.0 |
| WebdriverIO assertions | 5.7.0 | 6.1.0 |

The [complete direct dependency inventory](2026-10-02-dependency-inventory.csv)
records registry versions, previous versions/requirements, selected versions and
consuming manifests. Lockfiles also update the resolvable transitive graph. New
explicit manifest minima preserve the existing caret, exact and tilde policies.
Registry values were checked through the official
[crates.io API](https://crates.io/data-access) and
[npm registry](https://registry.npmjs.org/). The Vite+ bundle is checked against
its [1.0.0 release](https://github.com/voidzero-dev/vite-plus/releases/tag/v1.0.0),
and runtime releases against the [Node distribution index](https://nodejs.org/dist/index.json).

## Compatibility boundaries

- Vite+ 1.0.0 remains the latest stable release. Its core alias and Vitest 5.0.1
  stay aligned with the tool pack; upstream Vitest is not upgraded separately.
- DuckDB 1.10506.0 requires Arrow 58, so Rust Arrow/Parquet remain at the latest
  compatible 58.4.0 instead of Arrow 60. Quick Look uses the same DuckDB 1.5.6
  engine, with a SHA-256 verified official universal macOS download.
- PaCMAP 0.2.6 requires ndarray 0.16, retained at 0.16.1. The rand08 alias stays
  on 0.8.8 for RSA's rand_core contract. ORT remains its existing exact
  2.0.0-rc.13 pin because no stable 2.0 release exists.
- Node uses the latest LTS 24.21.0, pnpm uses stable 12.8.1 and Node types use
  the latest 24.x release, 24.19.1. The native TypeScript 7 and legacy TypeScript 6 aliases are
  retained. openapi-typescript still declares a TypeScript 5 peer; generated
  contracts and the current compiler checks determine actual compatibility.
- The Vite+ Vitest mocker declares MSW 2 compatibility, so MSW stays at 2.15.0
  rather than 3.0.1. The latest WebdriverIO globals require assertions 6, so
  expect-webdriverio uses 6.1.0 rather than 7.0.1. Mocha stays at 10.8.2 to match
  WebdriverIO's current adapter and the test imports' shared context.
- A scoped override aligns the Tauri service's WDIO globals with the frontend's
  current globals and assertion contract. Dependency build permissions and
  the existing ECharts peer policy remain intact.

Hugging Face uses its new blocking client/repository API. Application hosts still
supply explicit cache roots and anonymous credentials. Cached branch snapshots
are resolved locally first, preserving warm-cache offline reuse. Embedding
artifacts remain pinned to one immutable snapshot. Lindera's core Segmenter
replaces the removed Tokenizer wrapper and downloads matching 6.2.0 dictionaries.
SHA-256 outputs retain their existing lowercase hexadecimal encoding through
hex. Utoipa-generated contracts are regenerated from the source annotations.

## Advisory scan

Scoped transitive overrides update Mocha's serialize-javascript to 7.1.2 and
get-uri's basic-ftp to 6.2.1. The npm audit then reports two high advisories for
extract-zip 2.0.1 in WebdriverIO's browser-download tooling; the latest published
extract-zip release has no fix. See
[GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) and
[GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3).
These dependencies are development tooling rather than bundled application code.

A version comparison against official RustSec records also found existing
upstream constraints: Linux Tauri/GTK still resolves glib 0.18.5
([RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html));
RSA 0.9.10 has no published stable fix for
[RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071.html).
The same versions are present in the original lockfile. The direct RSA private-key
usage is confined to mock OIDC signing in tests; production OIDC validates public
signatures. Unmaintained paste and
proc-macro-error also remain upstream transitive dependencies. This comparison
is not a cargo-audit run; cargo-audit is not installed in the local environment.

## Validation

Verified locally on macOS, using Rust 1.98.0 and the final Node 24.21.0/pnpm
12.8.1 pins:

- Frozen pnpm installation succeeds. Fresh repository shells and directory
  changes select the pinned runtime and package manager.
- The complete frontend `check` passes: 719 tests in 165 files, Node script tests,
  lint, compiler checks, Knip, theme checks, application build, build-contract
  verification, documentation drift and version consistency.
- Workspace locked Rust tests pass: 429 passed and 17 explicitly ignored across
  24 test/doc-test groups. The new network model acceptance case accounts for
  one ignore and was separately selected and passed; no existing tests were
  newly skipped or weakened.
- Strict workspace Clippy with all targets/features and Cargo formatting pass.
  All seven library feature-isolation configurations pass.
- The loopback Hugging Face test passes with an ambient sentinel token, verifies
  explicit cache ownership and anonymous requests, and reads the cached file
  after the mock server stops. The separate real-model case verifies exact BERT
  and Lindera Jieba tokens/offsets from both cold and warm cache loads.
- API drift checking and root development-script tests pass. Regenerated
  Utoipa contracts differ in representation; normalized nullable unions,
  single-element unions, empty descriptions and required-field ordering are
  semantically equivalent to the original generated schema.
- Quick Look builds against DuckDB 1.5.6 and its native harness passes, including
  catalog integrity, offline rendering, relocation and lock release.

Browser and native E2E each pass all 13 selected cases: dependency graphs,
Frequency and joint Topic Modelling, with native preference synchronization also
covered. The separate native preference-restart check passes across two real
processes with distinct fresh WebView stores. Browser E2E took 5m 20s; native E2E
took 1m 10s. These are acceptance-run durations, not a before/after performance
benchmark. No test assertions or existing skip policy were changed.

The standalone-server E2E suite passes all four cases, including same-file runtime
reuse, independent windows, shared close, preference propagation/restart and
saved-project reopening. The existing package verifier also passes after
extracting a temporary debug archive outside the checkout. That server was built
with `rust-embed/debug-embed`, so asset serving does not fall back to the source
checkout. It verifies UI assets, signed on-demand ICU and project persistence;
the temporary archive was removed afterward. This is runtime relocation
acceptance rather than signed release-package acceptance.

Before/after metadata for all eight deduplicated Production/Dev storage roots
matches. E2E launchers cleared only Test storage, credentials and fresh profiles,
retained cleanup locks, and completed their teardown. Markdown links and
`git diff --check` pass.
The local native application is an instrumented debug Test bundle, not release
packaging evidence. GitHub-hosted macOS/Windows release packaging and real Linux
worker deployment remain separate platform acceptance lanes; this upgrade does
not publish artifacts.
