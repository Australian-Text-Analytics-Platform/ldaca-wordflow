# Repository cleanup audit — 27 September 2026

This maintenance pass checked active application packages, development scripts,
CI/editor configuration, documentation, public assets and nested repositories.
It preserved existing unrelated changes and intentionally retained historical
source, migration evidence, licences, model notices and published sample data.

## Removed from active use

- Removed 30 image assets (5,020,204 bytes) with no filename references in active
  code, configuration, documentation or archived source. These were mainly old
  preprocessing, Frequency and Concordance screenshots. Regenerated the
  publication mirror from the canonical frontend content.
- Moved 14 retired FastAPI/Polars architecture, domain, API and deployment pages
  into `archive/docs/`, preserving historical links. Current documentation
  indexes now point to native project ownership instead of retired contracts.
- Removed the VS Code Python-backend preparation task. Corrected desktop build
  task names and replaced the retired backend pytest command with workspace
  Rust tests in the Test All task.
- Moved the obsolete `polars-text` Quotation sanitizer harness to
  [the archive](../../archive/scripts/smoke_quotation_sanitizers.py). It expected
  bridge/build files no longer present in that package. The historical report
  explicitly retains its unresolved finding; cleanup does not claim a fix.

## Retained after inspection

- The three production frontend entry graphs reach all 303 production modules;
  no unused module deletion was justified. Knip also passes.
- Module-declaration/include checks found no orphan candidates among 104 Rust
  source files across the backend, desktop, native library and Polars adapter.
  Public APIs and feature-gated code are not unused merely because the desktop
  does not call them.
- Root and adapter lockfiles belong to separate supported workspaces. Type
  declaration companions, provisioning scripts and vendored/model assets have
  active compiler, build or packaging roles.
- The sample-data repository's historical demo snapshots remain published
  reference material. The archive and historical specifications are retained.
- Local build caches, installed dependencies, test evidence and saved review
  projects were not treated as obsolete source or swept. Editor integration and
  installed skills were not removed solely for having no application imports.

## Verification

- Frontend: 154 test files, 677 tests and 16 Node tooling tests passed.
- Production frontend build, source graph, Knip, lint and tooling types passed.
- Bundled documentation and generated publication registry passed validation.
- Internal Markdown links, Mermaid fences and `git diff --check` passed.

No application algorithm, API, database format or native executable source was
changed. This cleanup does not claim a fresh native UI or cross-platform run.
