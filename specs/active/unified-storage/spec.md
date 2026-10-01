# Unified storage and Linux multi-user hosting

Implement the accepted clean-cutover storage, preference, independent-browser-
project and rootless Linux worker design. Desktop paths come from Tauri and
browser categories map beneath immutable per-user roots. Preserve Dev/Test
identities, production storage, explicit project selection, application behavior,
project schema and graceful task ownership. Add no automatic migration or dual
writes. Create local commits only, without publishing deployment artifacts.

The resulting contract is documented in
[application storage](../../../docs/reference/application-storage.md),
[server ownership](../../../docs/architecture/backend/server.md) and
[manual cutover](../../../docs/runbooks/storage-cutover.md).
