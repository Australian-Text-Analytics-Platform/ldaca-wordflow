# Tasks

- [x] Implement shared foundations.
- [x] Implement request/model ownership.
- [x] Implement preview and rename handling.
- [x] Organize runtime/tool ownership.
- [x] Implement direct inputs and one-way visual-to-SQL transition.
- [x] Update canonical ownership and user guidance, archive four superseded specs without changing historical task checkboxes.
- [x] Complete focused behavior tests and frontend gates.
- [x] Complete runtime/backend gates and generated API drift check.
- [x] Complete documentation/source checks.
- [x] Complete browser and isolated native interaction checks.

## Verification evidence, 2026-10-01

- Frontend: 161 test files and 717 tests pass; 17 Node tooling tests pass. Lint, application/tooling types, production build, formatting and Knip pass. The source graph reports 329 reachable modules and no unused production modules. No dependency was added.
- Backend: locked tests pass with 187 library tests, 2 CLI tests and 57 API tests. Fifteen existing tests remain ignored. Formatting and Clippy with warnings denied pass. Vendored UDPipe C++ compiler warnings remain unchanged.
- Generated OpenAPI/client drift, bundled-document drift, internal Markdown links/Mermaid fences and `git diff --check` pass.
- Chrome: 9 Build cases, 10 preprocessing cases, the 2 new modularity cases and the complete five-format/ZIP/project-reopen export case pass. Destinations cover sole addition, duplicate rejection, both Join roles, keyboard activation and cancellation. The reset case checks automatic first-tab creation, original JSON retention, draft survival on navigation and persistence only on Run.
- macOS: 2 modularity cases, 2 preprocessing cases and Export navigation pass in the isolated `au.edu.ldaca.wordflow.test` debug bundle with instrumentation. Test-owned projects, caches and browser stores are cleaned up. The embedded driver does not synthesize `dblclick` or default keyboard button activation; native destination checks use actual toolbar/menu buttons, while Chrome covers both gestures. This is workflow verification, not uninstrumented release/packaging acceptance.
- Input registration regressions cover the valid relative browser API base and hidden visited preprocessing panels. Other focused tests cover fresh preview generations/cleanup, bounded stale pages, reset/model policy, rename receipts/cycles/project isolation, pagination and downloads. Existing runtime tests verify disconnect, cancellation, close completion and atomic publication.
- Pre-existing working-tree files are unchanged except the intentional architecture-overview update and API-owner import/contract updates in five existing E2E files. Historical task files in the four superseded specifications remain byte-for-byte unchanged. Still-relevant Topic acceptance remains open in its current record.
