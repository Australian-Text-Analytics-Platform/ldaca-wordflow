# Quotation migration verification

Status: implementation present locally, acceptance incomplete. Nothing published,
pushed or released. The separate quotation service was not modified.

## Implementation

polars-text 0.8.0 adds the quotation-only feature, CXX bridge to checksum-pinned
unmodified UDPipe 1.4.0, source mapping and all five quotation categories. Wordflow
acquires the pinned external English EWT model, delegates local computation, and
retains the existing remote/API/artifact contracts. spaCy and the old local Python
runtime are deleted. Its MIT reporting verbs and attribution moved to polars-text.
A necessary Run All worker fix supplies the already-required source document count.

## Checks

| Check | Outcome |
| --- | --- |
| Real-model quotation Python contracts | 6 passed, including all categories, Unicode, NULs, chunks and concurrency |
| Quotation Rust rules, ranges, lifecycle with real model | 12 passed |
| Full Rust unit suite | 91 passed (optional external models not provisioned there) |
| Strict full Clippy | Passed |
| Base, tokenization, embedding, combined, topic, quotation Cargo checks | Passed |
| Full package Pytest | 64 passed, 14 optional non-quotation model tests skipped |
| polars-text Python type check | Passed |
| Backend Ruff and type check | Passed |
| Backend tests | 857 passed, including real-model worker equality and permission failures |
| Backend wheel/sdist and removed-runtime verifier | Passed |
| Full macOS arm64 wheel | Built, installed outside checkout and extracted a real quotation |
| Sdist native source inventory and wheel rebuild | Passed |
| ASan native bridge/model lifecycle smoke | Passed, 4 independent threads with 8 load/parse/drop cycles each |
| Combined ASan/UBSan | Failed in unmodified upstream model loader; details below |
| OpenAPI | Identical to checked-in contract except existing 0.7.6 versus 0.7.7 info.version drift |
| Frontend lint and tooling type check | Passed |
| Frontend suite | 1390 passed, one existing shared lifecycle failure, reproducible in isolation |
| Help content and engineering Markdown links | Passed |
| Local macOS app and DMG | Built with source packages and ad-hoc signing; native file picker, Preview, Run All, both Review modes and derived Data Block creation verified; signature verification passed after extraction |
| Linux x86-64 / Windows x86-64 wheels | CI configured for real-model tests, not executed here |

## Comparison evidence

The fixed synthetic corpus contains 16 documents. Both engines detected 17
quotations. The baseline is in polars-text/tests/fixtures/quotation_spacy_baseline.json;
[native-comparison.json](native-comparison.json) records complete native output.

| Single-process run on macOS arm64 | spaCy 3.8.16 / core_web_md 3.8.0 | UDPipe 1.4.0 / EWT UD2.5 |
| --- | --- | --- |
| Cold extraction, 16 documents | 1.047 s | 0.985 s |
| Warm extraction, same documents | 0.042 s | 0.069 s |
| Peak process RSS | 496,762,880 bytes | 274,137,088 bytes |

These are single samples, include different runtime imports, and do not establish
a speedup. Downloads are excluded. Native warm extraction was slower in this run.
According-to boundaries exclude adjacent punctuation; one heuristic loses the
speaker “sign”; José/café retain accents. Floating multi-sentence text retains the
original intervening space. Every native non-null span passes source slicing.

## Unresolved acceptance findings

1. UBSan reports a misaligned float load in UDPipe's GRU tokenizer model loader:
   `gru_tokenizer_network_implementation<64>::load`, vendor/udpipe/udpipe.cpp:13013,
   through libc++ `copy_n` from the binary decoder's packed data. This occurs
   while loading the valid pinned model, before document parsing. The bridge
   surfaces no Rust unsafety, but CXX exception translation cannot cure native
   undefined behavior. The pinned vendor source remains unmodified. Reproduce:

   ```sh
   WORDFLOW_TEST_UDPIPE_MODEL=/path/model.udpipe python scripts/smoke_quotation_sanitizers.py
   ```

   The combined check remains failing; ASan-only is a separate diagnostic via
   `QUOTATION_SANITIZERS=address`, not an acceptance substitute. Resolving this
   requires an upstream fix or revising the unmodified-source constraint.

2. Browser actions complete Preview, Run All, both Review modes, reload, and
   creation of the derived quotation Data Block. The strict Playwright test
   fails because the existing shared event lifecycle requests the retired
   Preview once after replacement and receives 404. The assertion is retained;
   console failures are not suppressed. The unchanged frontend unit test
   `useAnalysisFeature > keeps Run All active from click until the canonical
   forest adopts it` also fails (isSubmittingRunAll becomes false too early).

3. Cross-platform wheel execution remains pending. No remote CI dispatch or
   publishing was performed. Automated cancellation and forced local failure
   presentation in the live application remain unverified; model failure and
   worker lifecycle unit/contract coverage passes.

## Operational observations

First-use model acquisition succeeded through the browser on this OS account.
Verified model reuse is covered with network disabled in the acquisition test.
The model is outside the Data Root and signed bundle. Existing user caches and
Workspace files were not removed. Temporary browser workspaces use the project's
isolating runner; the native test workspace is under /tmp/quotation-native-desktop.

A rebuild initially reused a stale uv local backend wheel. Touching the backend
manifest invalidated its build fingerprint and the packaged worker was then
inspected for source_document_count before repeating native acceptance. The user's
running development server was not stopped.

## Version bump

Wordflow and polars-text now target 0.8.0. The migration build and runtime
measurements above were recorded before this metadata bump, with Wordflow 0.7.7
and polars-text 0.7.0. Those existing artifacts are not 0.8.0 release artifacts.
