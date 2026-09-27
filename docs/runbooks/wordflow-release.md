# Wordflow release runbook

## Responsibilities and platform matrix

[CI](../../.github/workflows/ci.yml) owns tests and quality checks. The manually
started [release workflow](../../.github/workflows/desktop-release.yml) compiles,
signs, packages and optionally publishes production artifacts. It does not run
unit tests, Clippy, Quick Look tests, E2E scenarios or application smoke tests.
Version/tag validation, native dependency audits, signatures and notarization
checks remain part of producing valid release artifacts.

| Platform | Runner | Desktop | Server |
| --- | --- | --- | --- |
| macOS Apple Silicon | `macos-15` | Notarized DMG and signed updater archive | `aarch64-apple-darwin` tar.gz |
| Windows x86-64 | `windows-2022` | MSI and updater signature | `x86_64-pc-windows-msvc` zip |
| Linux x86-64 | `ubuntu-22.04` | Not currently supported | `x86_64-unknown-linux-gnu` tar.gz |

The reusable [desktop build](../../.github/workflows/desktop-build.yml) and
[server build](../../.github/workflows/server-build.yml) are build-only workflows.
They use locked dependencies. Each package contains its matching production UI;
optional ICU and language/model resources download on first use, not during
packaging. See [server operation](native-server.md) for archive contents and
[desktop runtime](desktop-runtime.md) for desktop identity and resources.

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

CI artifacts are verification evidence; publication builds fresh release artifacts
from the selected source commit. Binder validation remains on the actual Binder
website and is not simulated in this workflow.

## Prepare and build

1. Update versions with `pnpm bump-version <semver>` and run `pnpm check-versions`.
   The version registry includes frontend, backend, server, Tauri and Cargo lock entries.
2. Require CI to pass on the intended release commit. The manual release workflow
   does not rerun CI or automatically enforce its status.
3. Create/review the corresponding `vX.Y.Z` tag before publication.
4. Dispatch **Manual Wordflow Release**, supplying the source ref. Leave
   `publish_release` disabled for a build-only run.

```bash
gh workflow run desktop-release.yml --ref main -f ref=v8.0.0
```

The preparation job resolves the requested ref once to a commit SHA. Both build
workflows receive that immutable SHA, so a branch moving during the run cannot
mix application source versions. Publication additionally requires the supplied
tag to identify that exact commit and match the version registry.

## Sign and publish

Desktop builds retain the existing updater signing keys, Apple Developer ID and
notarization credentials. Server macOS packages use the configured Developer ID.
Secrets are supplied only through GitHub Actions secrets. CI uses local/ad-hoc
signing where needed and requires no release credentials.

Enable `publish_release` and supply `release_tag` when ready to publish:

```bash
gh workflow run desktop-release.yml --ref main \
  -f ref=v8.0.0 -f publish_release=true -f release_tag=v8.0.0
```

The publisher waits for every desktop and server build. It downloads those exact
artifacts, assembles `server-SHA256SUMS`, builds `latest.json` from updater
signatures and release notes, and uploads without rebuilding. Only publication
has repository write permission. Uploads replace matching owned filenames;
unrelated release assets remain. The release becomes latest only after all
intended assets upload successfully.

## Stable download names

Release asset names contain the platform, not the software version:

- `ldaca-wordflow_windows-x86_64.msi` and `.msi.sig`
- `ldaca-wordflow_darwin-aarch64.dmg`
- `ldaca-wordflow_darwin-aarch64.app.tar.gz` and `.app.tar.gz.sig`
- `wordflow-server-x86_64-unknown-linux-gnu.tar.gz`
- `wordflow-server-aarch64-apple-darwin.tar.gz`
- `wordflow-server-x86_64-pc-windows-msvc.zip`
- `server-SHA256SUMS` and `latest.json`

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
- Verify the tools repository launcher against the actual Binder site, reporting
  its result separately from local or CI package tests.

The retired Python/PyPI/uvx publisher is not part of the native release process.
