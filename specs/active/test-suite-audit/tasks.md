# Verification status

- [x] Account for all 869 original tests and 1,063 original collected cases.
- [x] Record deletion/merge/rewrite/move rationale and replacement identifiers.
- [x] Strengthen native numeric, Unicode, quotation, cache and source-rewrite assertions.
- [x] Split backend workflows and move tests to ownership-appropriate directories.
- [x] Standardize backend async ownership on AnyIO; retain SDK pytest-asyncio.
- [x] Run complete local backend and Python binding suites.
- [x] Run native Rust tests, seven polars-text feature configurations and strict Clippy.
- [x] Run Python Ruff/type checks and repeat synchronized cancellation/concurrency cases.
- [x] Kill five targeted numeric-inference mutations after closing observed assertion gaps.
- [x] Exercise macOS full and reduced wheels outside their checkouts.
- [x] Exercise SDK core wheel without DataFrame dependencies and optional interoperability separately.
- [x] Rebuild and exercise all three source distributions as wheels.
- [x] Confirm explicit Python model jobs fail when their model is absent.
- [x] Update testing documentation and validate Markdown links and whitespace.
- [ ] Execute Linux x86-64 and Windows x86-64 wheel jobs (configured in CI; unavailable on this macOS host).
- [ ] Execute opt-in live Hugging Face/Lindera dictionary download tests (not part of the offline local run).

The native document-start concordance defect is recorded as a strict expected
failure and remains outside this test-only change. No publication, push, version
bump, production fix or user-data change was performed.
