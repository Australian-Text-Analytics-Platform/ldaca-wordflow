# Verification

- [x] Benchmark the production SQL with 10,000, 100,000 and 1,000,000 tokens.
- [x] Add version-2 View publication and preserve version-1 result reads.
- [x] Compare fields against native statistics, including NaN/infinity and u64 limits.
- [x] Verify filtering, complete exports, source deletion and Save As/reopening.
- [x] Verify replacement, deletion, cancellation and panic cleanup.
- [x] Run locked backend tests, formatting and strict Clippy.
- [x] Run affected browser WebdriverIO scenarios (two passed).
- [x] Run lint, unused-code and documentation checks; regenerate publication mirror.
- [x] Native build and two affected native WebdriverIO scenarios passed.
- [x] Frontend rerun passed all 501 tests and eight script tests after native compilation finished.
- [x] Production build, tooling types, final documentation and diff checks passed; change record archived.

Locked backend validation: 118 tests passed; one subprocess helper is intentionally ignored. Browser and native scenarios each verified comparison View storage, sorting, exports, independent tabs, narrow panes and both themes. No user project was used. Native chooser/Finder, signed packaging and other platforms were outside this backend change.
