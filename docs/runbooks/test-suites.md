# Test suites

Tests protect observable results, caller boundaries and recoverable state. Prefer
exact values, error categories and persisted effects over implementation-name,
field-inventory or container-type snapshots. Keep rare failure cases when their
consequence is data loss, cross-user access or work continuing after cancellation.

## Ownership and fixtures

The backend uses `tests/unit/domain`, `tests/unit/analysis` and
`tests/unit/services` for isolated logic. Integration tests are grouped under
`tests/integration/api`, `persistence`, `runtime` and `workers`. A test belongs
where its most consequential real boundary is exercised: a temporary filesystem,
SQLite connection or child process makes it an integration test even without HTTP.

`tests/support` contains setup reused by more than one module. Keep one-off
helpers beside their tests, and mutable runtimes, credentials and Data Roots
function-scoped. Preserve an ordered workflow when ordering itself is the
behavior; otherwise use independent scenarios and named parameter cases.

Backend asynchronous tests use AnyIO's plugin with its asyncio backend.
`pytest-asyncio` does not own backend tests. Keep the backend's default pytest
import mode: spawned test workers must be importable in fresh child processes.
The standalone package suites use importlib discovery so tests can run against
installed wheels without importing package source from the checkout.
`ldaca-data-rs` retains pytest-asyncio for its Python asynchronous bindings.

The small source-utils suite stays in one Python module plus its native atomic
write tests. SDK Python tests live in `ldaca-data-rs/tests/python`; Rust integration
tests live directly under `tests`, and both use `tests/fixtures` for compatibility
data. Native tests prove conversion and persistence behavior; binding tests prove
exception translation, public call behavior and Arrow ownership/lifetimes.

Frontend Vitest tests stay beside the owning feature or component. Shared MSW
handlers provide typed transport fixtures; scenario-specific lifecycle changes
belong in the test's local handlers. Begin event tests in a different state from
their expected result so ignoring the event cannot pass the test. Restore spies,
timers and temporary files even when an assertion fails.

JSDOM can exercise measurement decisions with supplied bounds, but CSS class
inventories do not prove clipping, spacing or native window appearance. Preserve
real interaction, accessibility and data transformation checks. Browser tests live
under `frontend/e2e`; use their shared Workspace setup instead of reusing a
previous scenario's active Workspace. Include retry and repetition identity in
uploaded filenames because User Files are shared across Workspaces.

## Ordinary checks

Run package commands from the indicated directory, without setting `PYTHONPATH`.
The [development runbook](development.md) covers environment setup.

| Directory | Checks |
|---|---|
| `backend` | `uv run ruff check .`, `uv run ty check`, `uv run pytest -q -m 'not model'` |
| `polars-text` | `cargo test --locked`, `cargo clippy --all-targets --all-features --locked -- -D warnings`, `uvx ty check`, `uv run pytest -q -m 'not model and not network'` |
| `polars-source-utils` | `cargo test --locked`, `cargo clippy --all-targets --locked -- -D warnings`, `uvx ty check`, `uv run pytest -q` |
| `ldaca-data-rs` | `cargo test --locked`, `cargo clippy --all-targets --all-features --locked -- -D warnings`, `uv run ruff check .`, `uv run ty check`, `uv run pytest -q` |
| Repository root (frontend) | `pnpm -C frontend test`, `pnpm -C frontend lint`, `pnpm -C frontend typecheck:tooling`, `pnpm -C frontend build`, `pnpm -C frontend docs:check` |

Run browser checks with `pnpm -C frontend test:e2e`. Its wrapper creates and
removes a temporary Data Root and starts the real backend and Vite server. Pass
ordinary Playwright selectors or `--repeat-each=2` through this command; do not
point browser tests at a developer Data Root. Portal SDK acceptance is explicitly
provisioned with `WORDFLOW_SDK_ACCEPTANCE`; a skipped portal scenario is not portal
acceptance evidence. Native macOS behavior requires separate packaged-app checks.

Native polars-text CI executes base, tokenization, embedding,
tokenization-plus-embedding, topic-modeling, quotation and full configurations.
Compilation alone does not execute Rust assertions. Source-utils CI also executes
its native atomic-write failure tests.

Use event/notification handshakes to prove a request or competing operation has
started. Bound waits and cleanup, release blocked fixture requests in `finally`,
and repeat changed cancellation/concurrency cases. Do not introduce a parallel
runner just to hide an unnecessarily slow fixture.

## Model and network checks

Quotation model tests require a separately provisioned pinned UDPipe model. The
[polars-text development runbook](polars-text-development.md#quotation-verification)
contains the download and native/Python commands. `--require-models` makes an
explicit Python model job fail if its required model file is unavailable; the
ignored native model test similarly fails if explicitly selected without its
model. Missing/corrupt-model tests remain offline and run normally.

From `backend`, after setting `WORDFLOW_TEST_UDPIPE_MODEL` to the same model:

```sh
uv run pytest -q -m model --require-models
```

Live Hugging Face and dictionary tests remain opt-in via
`POLARS_TEXT_RUN_HF_TESTS=1`, `POLARS_TEXT_RUN_LINDERA_TESTS=1` and
`POLARS_TEXT_RUN_LINDERA_JIEBA_TESTS=1`. Run the applicable `-m network` tests only
when intentionally testing downloads and model predictions. Schema, null and
empty-input tests use the native tokenizer and need no such downloads.

## Installed artifacts

Build wheels with Maturin, install the exact artifact into a fresh environment,
change to a directory outside the checkout, then run pytest with the absolute
path to the package's tests. Do not use an editable installation as wheel evidence.

Full polars-text wheels run the binding suite and provisioned quotation cases.
Reduced base/tokenization/quotation wheels run `test_installed_features.py` to
exercise available calls and missing-feature errors. Source distributions are
rebuilt into wheels and exercised again, including quotation native source.
Platform CI covers Linux x86-64, macOS arm64 and Windows x86-64; a local macOS run
cannot substitute for the other platform jobs.

The SDK has two fresh-wheel environments: core tests with only the SDK, pytest
and pytest-asyncio, and interoperability tests with optional PyArrow/Polars.
Run `-m 'not interop'` in the first. This verifies that normal access/conversion
and file writers do not require DataFrame packages without adding a source-import
denylist. Writers require real Parquet/IPC/CSV readback, including exact values,
nulls, schema where supported, and preservation of preexisting files.

## Targeted audit tools

Use [Coverage.py measurement contexts](https://coverage.readthedocs.io/en/latest/contexts.html)
when investigating execution overlap. Set `dynamic_context = test_function` in a
temporary coverage configuration; shared executed lines do not prove duplicate
assertions. Keep coverage measurements separate from ordinary suite timings.

Bounded [Proptest](https://proptest-rs.github.io/proptest/intro.html) properties cover
Unicode offset/source mapping and tabular value preservation alongside readable
fixed regressions. Preserve useful generated counterexamples as fixed cases.

Use [cargo-mutants](https://mutants.rs/) selectively against the production
function whose assertions were strengthened. Record surviving changes and inspect
whether they are equivalent or expose a gap. Do not add a mutation score, coverage
percentage, deletion quota or test-count gate.
