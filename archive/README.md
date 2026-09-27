# Retired application architecture

Reference source only. These files are excluded from active development,
release version updates, and CI. They are preserved for comparison while the
Rust implementation replaces the old architecture; this is not a runnable or
supported compatibility distribution.

| Location | Preserved material |
| --- | --- |
| `backend/` | FastAPI application, analyses, workspace persistence, tests and packaging |
| `polars-source-utils/` | Independent Git submodule for serialized Polars-plan source paths |
| `pyproject.toml`, `uv.lock`, `.python-version` | Former root Python environment definition |
| `scripts/`, `tests/` | Python distribution/runtime checks and old development/staging helpers |
| `frontend/` | FastAPI shell, authentication, Data Root, project catalogue, task streams, inactive analysis controllers, generated contracts, exclusive tests/utilities, old tutorials and browser/build tooling |
| `.github/workflows/` | Previous Python release workflow and complete pre-archive CI snapshot |
| `legacy-overview.md` and `docs/` | Former architecture, FastAPI settings and development instructions |

Paths and commands inside archived files describe their former locations. They
are intentionally not repaired into a second supported build. The deleted data
SDK Python bindings are not restored. Ignored local virtual environments and
caches, when present, were moved alongside their sources and remain untracked.

Active packages remain at the repository root: `backend`, `ldaca-rs`,
`frontend`, and the supported `polars-text` adapter. Shared semantic rendering
and native libraries remain in the active frontend. Its desktop, updater and
Quick Look entry graphs are checked by `pnpm -C frontend check:source`;
archived imports are rejected, and test-only references do not keep retired
production modules active.
