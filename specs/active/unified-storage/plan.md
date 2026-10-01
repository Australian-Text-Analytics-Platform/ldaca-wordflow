# Implementation plan

1. Snapshot the existing reviewed identity/configuration work in an isolated checkout.
2. Add explicit directory values and update model/cache/temp consumers and launchers.
3. Add typed preference adapters, startup loading and cross-window synchronization.
4. Replace global browser project selection with per-user runtime registries.
5. Add gateway OIDC/session protection, request-only worker credentials and rootless workers.
6. Verify interfaces, source, tests, packaging and effective Linux deployment controls.
7. Complete durable docs and manual cutover instructions, then create local commits.

External provider registrations, Linux enforcement and production-identity
packaging acceptance require their actual environments. Report unavailable
checks separately and retain this active record until acceptance is complete.
