# Local verification — 2026-09-05

## Implemented

Independent `ldaca-data-rs` 0.1.0 repository, native async/blocking ONI access,
optional Python bindings, offline RO-Crate conversion, Arrow output and native
exports. Wordflow delegates protocol and conversion through its explicit
compatibility profile. Old Python provider/tabulation modules and configuration
copies are removed. Existing package versions and HTTP schemas are unchanged.

The follow-up filename request uses the collection metadata title (including a
rewritten RO-Crate root), preserving spaces and Unicode. New imports no longer
append a hash unconditionally. Existing destination conflicts remain errors;
existing imports are not renamed. Backend `uv` source fingerprints now include
Python code to prevent stale non-editable wheels in desktop bundles.

## Passed

- Native-only build and 15 Rust tests; strict all-target/all-feature Clippy.
- 35 Python tests, Ruff and type checking, including captured Wordflow row/schema
  equality, Arrow buffer lifetimes and optional PyArrow/Polars consumers.
- Clean macOS arm64 Python 3.14 wheel installation without pandas, Polars or
  PyArrow. Metadata title lookup and Parquet/CSV/IPC exports work independently.
- Wheel rebuilt from the sdist; source/configuration completeness verified.
- Live anonymous ONI configuration and search smoke check.
- Backend Ruff/type checks and all 843 tests with the local quotation test model.
- Backend wheel/sdist and distribution verifier; removed runtime files are absent
  and `ldaca-data-rs` is required.
- OpenAPI export compared byte-for-byte with the existing frontend schema.
- Browser workflow against a synthetic loopback ONI server: featured collections,
  keyword search, public import, metadata-based folder name, access failure and
  cancellation. Runner-created temporary Data Roots protect user data.
- Packaged macOS UI: metadata-named folder/Parquet file, table preview with
  Unicode text, search, visible HTTP 403 failure and stopping an active import.
  Final isolated Data Root: `/tmp/ldaca-sdk-native-final`.
- Frontend lint, tooling type checks, docs drift and production build.
- macOS app and DMG build, with a bundled native SDK and no external Python/NLP
  installation requirement.
- Engineering documentation links and whitespace checks.

## Remaining acceptance and release gates

- Linux x86-64 and Windows x86-64 wheels and the complete Python 3.11–3.14 matrix
  have CI configuration but have not been executed locally. No remote CI was
  triggered because publication/pushing is outside this task.
- The full frontend suite has 1,389 passing tests and two existing failures in
  `src/tutorials/__tests__/registry.test.ts` (remote registry merge/cache tests).
- The local macOS build is ad-hoc signed, not notarized or released.
- The SDK has local commit `b83a38d`; its intended origin is the ATAP GitHub
  repository. No remote repository was created and nothing was pushed/published.
  Automatic approval review rejected local submodule registration because the
  referenced commit is unpublished. Wordflow's local path mappings work; shared
  submodule registration and published-wheel release remain deferred.

## Artifacts

- SDK wheel and sdist: `/tmp/ldaca-sdk-dist/`.
- Backend wheel and sdist: `/tmp/ldaca-sdk-backend-dist/`.
- Browser screenshot: `/tmp/ldaca-sdk-browser.png`.
- Native bundle: `frontend/src-tauri/target/aarch64-apple-darwin/release/bundle/`.
- Detailed local logs: `/tmp/ldaca-sdk-*.log`.

Synthetic fixture instructions are in the SDK README. No real corpus content or
credentials are included in fixtures or checked-in artifacts.
