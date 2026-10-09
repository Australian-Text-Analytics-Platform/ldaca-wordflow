# Wordflow release runbook

## Responsibilities and platform matrix

[CI](../../.github/workflows/ci.yml) owns tests and quality checks. The manually
started [production build](../../.github/workflows/release-build.yml) compiles,
signs and packages production artifacts. A separate
[promotion workflow](../../.github/workflows/desktop-release.yml) publishes a
previously successful production build without rebuilding. Neither workflow runs
unit tests, Clippy, Quick Look tests, E2E scenarios or application smoke tests.
Version/tag validation, native dependency audits, signatures and notarization
checks remain part of producing valid release artifacts.

| Platform | Runner | Desktop | Server |
| --- | --- | --- | --- |
| macOS Apple Silicon | `macos-15` | Notarized DMG and signed updater archive | `aarch64-apple-darwin` tar.gz |
| Windows x86-64 | `windows-2022` | MSI and updater signature | `x86_64-pc-windows-msvc` zip |
| Linux x86-64 | `ubuntu-24.04` (glibc 2.39, matching the current Binder host) | Not currently supported | `x86_64-unknown-linux-gnu` tar.gz |

The reusable [desktop build](../../.github/workflows/desktop-build.yml) and
[server build](../../.github/workflows/server-build.yml) are build-only workflows.
They use locked dependencies. Each package contains its matching production UI;
optional ICU and language/model resources download on first use, not during
packaging. See [server operation](native-server.md) for archive contents and
[desktop runtime](desktop-runtime.md) for desktop identity and resources.

The shared backend enables liblzma's static feature for Arrow Avro's XZ reader.
This compiles the bundled codec instead of selecting a build machine's system
library. Server packaging audits actual native linkage and rejects unexpected
non-system libraries, including Homebrew paths; keep this audit enabled.

## Continuous integration

CI runs on pushes, pull requests and manual dispatch:

- Workflow syntax, expressions and shell checks with checksum-verified actionlint.
- Full frontend tests, lint, types, formatting, build, unused-source and documentation checks.
- Backend and server locked tests, formatting and strict Clippy on all three server targets.
- Extracted release-server package tests on each target, including first-use ICU,
  embedded assets and project persistence. These reuse the frontend CI artifact.
- Generated OpenAPI drift checks, browser research E2E and direct server browser
  file/project-management E2E.
- Tauri Rust checks and full debug native E2E on macOS/Windows, with representative
  optimized native scenarios on both platforms.
- A clean macOS release bundle, Quick Look tests and runtime smoke checks,
  including on-demand ICU and HTTPS Parquet, without release credentials.

CI artifacts are verification evidence; only a separate production build can
produce packages eligible for promotion. Binder validation remains on the actual Binder
website and is not simulated in this workflow.

## Prepare and build

1. Update versions with `pnpm bump-version <semver>` and run `pnpm check-versions`.
   The version registry includes frontend, backend, server, Tauri and Cargo lock entries.
2. Require CI to pass on the intended release commit. The manual release workflow
   does not rerun CI or automatically enforce its status.
3. Create/review the corresponding `vX.Y.Z` tag before publication.
4. Dispatch **Production Wordflow Release Build**, supplying the source ref.
   This workflow only builds and retains production packages. It cannot publish.

```bash
gh workflow run release-build.yml --ref main -f ref=v8.0.0
```

The preparation job resolves the requested ref once to a commit SHA. Both build
workflows receive that immutable SHA, so a branch moving during the run cannot
mix application source versions. Each package records the actual checked-out
source commit, version, production identity, release profile, workflow commit,
run ID/attempt and every file's size and SHA-256 digest in `release-package.json`.
The workflow's own head may differ from the requested source ref; it is never
substituted for the source commit. Record the successful run ID and perform
acceptance against its retained packages before promotion.

## Sign and publish

Desktop builds retain the existing updater signing keys, Apple Developer ID and
notarization credentials. The macOS server executable uses the same Developer ID
and is submitted to Apple in a temporary ZIP before its tar.gz is published.
Apple serves a standalone executable's notarization ticket online; it cannot be
stapled to the executable.
Secrets are supplied only through GitHub Actions secrets. CI uses local/ad-hoc
signing where needed and requires no release credentials.

Supply the previously successful production build run ID and existing release
tag when ready to publish:

```bash
gh workflow run desktop-release.yml --ref main \
  -f build_run_id=123456789 -f release_tag=v8.0.0
```

Promotion requires a previous completed, successful manual run of
`release-build.yml` in this repository. Ordinary CI, individual desktop builds,
debug/instrumented builds, failed runs, incomplete packages and expired artifacts
are rejected. Production artifacts are retained for 14 days. If they expire,
create and accept a new production build separately; promotion never rebuilds.

Before any public release mutation, the publisher verifies that the existing tag
identifies the recorded source commit, every registered source/lock version
matches it, all five desktop/server artifact sets are complete, every file still
matches its recorded digest, server checksums agree, and both updater signatures
verify with the tagged application's public key (including trusted comments).
The promotion validator comes from the selected workflow checkout; tagged source
is read separately for identity, versions and the public key.

Original package bytes are copied without repacking and checked again. Promotion
derives `SHA256SUMS`, `server-SHA256SUMS` and `latest.json` from those bytes and
signatures, and includes `release-build.json` as build evidence. Only publication
has repository write permission. Uploads replace matching owned filenames;
unrelated release assets remain. The release becomes latest after all intended
assets upload successfully. This process preserves the existing manual
[cutover and rollback](storage-cutover.md) procedure.

Run the nonpublishing fixture checks with
`node --test scripts/release-artifacts.test.mjs`. They exercise identity and
expiry rejection, incomplete/changed packages, cryptographic signature checks,
and byte-for-byte equality after preparation. They create no public release.

## Stable download names

Release asset names contain the platform, not the software version:

- `ldaca-wordflow_windows-x86_64.msi` and `.msi.sig`
- `ldaca-wordflow_darwin-aarch64.dmg`
- `ldaca-wordflow_darwin-aarch64.app.tar.gz` and `.app.tar.gz.sig`
- `wordflow-server-x86_64-unknown-linux-gnu.tar.gz`
- `wordflow-server-aarch64-apple-darwin.tar.gz`
- `wordflow-server-x86_64-pc-windows-msvc.zip`
- `server-SHA256SUMS`, `SHA256SUMS`, `latest.json` and `release-build.json`

For example, the Linux server has this stable latest-release URL:

```text
https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/latest/download/wordflow-server-x86_64-unknown-linux-gnu.tar.gz
```

The version remains in the release tag, executable metadata and updater manifest.
The Binder launcher resolves latest once, then fetches the archive and checksum
from that exact release to avoid a latest-release change between downloads. Its
local cache remains versioned even though filenames are stable.

## Post-release

- Confirm the MSI, DMG, updater archives/signatures, `latest.json`, all three
  server archives and `server-SHA256SUMS` are present.
- Verify update/restart from a previous signed desktop version on macOS and Windows.
- Download and verify the server archive/checksum on each supported platform.
- On macOS, verify the extracted server executable with
  `codesign -vvvv -R='notarized' --check-notarization <binary>` while online,
  then start it outside the checkout. `spctl --type execute` assesses apps and
  can reject a notarized command-line binary as "not an app".
- Verify the tools repository launcher against the actual Binder site, reporting
  its result separately from local or CI package tests.

The retired Python/PyPI/uvx publisher is not part of the native release process.
