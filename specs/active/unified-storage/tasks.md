# Acceptance tracking

- [x] Isolated checkout and preserved baseline configuration/identity work
- [x] Explicit storage and asset contexts, directory JSON launcher
- [x] Typed preference persistence and startup loading
- [x] Independent browser projects and generated contract replacement
- [x] OIDC/session, worker credential and rootless deployment implementation
- [x] Full package-required tests, lint, formatting, API and documentation checks
- [ ] Browser and native E2E, preference restart and window synchronization
- [ ] Effective Linux filesystem/network/resource isolation and gateway restart
- [ ] Both external OIDC provider registrations and real sign-in acceptance
- [ ] macOS/Windows production packaging acceptance in isolated GitHub-hosted jobs
- [x] Final source/contract/doc agreement and local migration commits

Baseline observed: frontend 708 tests in 160 files, 17 Node tests, 8 development
script tests and 2 server unit tests passed. Migration-specific checks and timing
are recorded separately as they complete. Installed production storage remains
untouched. No production cutover is performed by this change.

All browser/native spec files ran. The standalone server suite and preference
window/restart scenarios pass. Four browser failures reproduce in the preserved
baseline; the native Frequency request scenario also fails, and its unchanged
Apple Foundation Models check remains conditional. E2E acceptance stays open.
See [validation](validation.md) for complete outcomes and external gates.
