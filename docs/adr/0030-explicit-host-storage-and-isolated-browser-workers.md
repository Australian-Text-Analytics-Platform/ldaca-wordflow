---
status: accepted
---

# Explicit host storage and isolated browser workers

Wordflow's native and browser hosts share analysis behavior but have different
filesystem and credential boundaries. Resolve application directories once in
the host and pass explicit values to the runtime and model loaders. Tauri owns
native directory resolution. Browser hosts map the same categories beneath an
immutable user root. Analysis libraries must not choose identities or depend on
production environment overrides.

Application preferences belong to a versioned host file, separately from project
settings, updater state and provider metadata. The renderer loads them before
rendering and applies successful field patches against the host's latest state.
Invalid files are preserved and require explicit repair or reset. This replaces
renderer localStorage ownership for theme, layout and recent import paths.

Single-user browser storage uses `admin`; multi-user accounts use verified OIDC
issuer and subject, associated with a generated UUID. Each Linux user has a
restricted rootless Docker worker with its own project registry and mounted
storage. A browser window selects a project; selecting a different file does not
close another runtime. Explicit Close affects every window sharing that runtime.
Gateway sessions and account state remain outside worker mounts.

Desktop and single-user provider keys use identity-scoped OS credentials.
Multi-user workers store connection metadata only; browser credentials are
partitioned by account and connection UUID and supplied at the operation boundary.
No provider key enters project files, stored requests or query persistence.

This is a clean cutover without legacy readers, automatic relocation or dual
writes. Operators validate copies and manually relocate data before separately
approving production cutover. Exact directories, schema and interfaces have one
canonical reference: [application storage](../reference/application-storage.md).
Linux deployment constraints and acceptance are in the
[deployment runbook](../runbooks/linux-multi-user.md).

This decision replaces the storage and persistence clauses of
[ADR 0009](0009-mode-specific-provider-credential-ownership.md),
[ADR 0013](0013-multi-instance-annotation-provider-configurations.md),
[ADR 0020](0020-stable-annotation-provider-configuration-identity.md), and the
localStorage bootstrap/persistence clauses of
[ADR 0027](0027-pinned-vscode-2026-theme-runtime.md). Their stable connection UUID,
request snapshot and pinned theme palette decisions remain applicable.
