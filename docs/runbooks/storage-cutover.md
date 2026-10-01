# Manual storage cutover and rollback

Perform acceptance with copies under Test identities first. Development and
migration checks must not touch installed production storage. Production-identity
packaging validation uses the isolated GitHub-hosted macOS and Windows jobs, or a
dedicated OS account or VM for local acceptance. Production cutover is
an operator action after acceptance, not an application startup operation.

1. Stop the old application/server and wait for tasks and database cleanup.
2. Back up complete application storage, project files and provider configuration.
   Record the prior binary/version and credential namespace. Keep the backup offline.
3. Resolve the new identity's directories using Tauri or the shared headless
   resolver. Consult the [exact storage contract](../reference/application-storage.md).
   For browser single-user hosting, move old uploaded originals and projects into
   `DATA_DIR/admin/data` and `DATA_DIR/admin/projects`. Move provider metadata to
   `DATA_DIR/admin/config/ai-providers.json` and disposable caches to `admin/cache`.
4. Move complete model cache trees, including relative internal links. Preserve
   HF's hub tree under `cache/huggingface/hub`, Lindera under `cache/lindera` and
   the pinned UDPipe model under `cache/udpipe`. Do not copy isolated symlink targets
   or merge incomplete cache trees. Cache databases belong under `cache/`.
5. Browser-local theme/layout/recent files reset unless manually entered in the
   documented version-one preferences object. Do not copy localStorage as a legacy
   reader. Desktop updater state remains separately owned.
6. Preserve connection UUIDs when retaining OS credential entries. If a server
   identity/namespace changes, explicitly re-enter the key in the correct OS store;
   relocating metadata alone does not relocate an OS credential. Multi-user keys
   must instead be entered into each account's browser credential storage. Never
   export them into worker metadata or project files.
7. Start the new binary against a copy, verify preferences, reopen/save/download
   projects and exercise cold/warm model resources. Compare backup canaries before
   applying the same reviewed sequence to production.

There is no automatic migration, legacy reader or dual write. Do not point Dev or
Test defaults at production-owned roots. Explicitly selected project files can be
opened by different desktop identities, so use copies for verification.

Rollback: stop the new binary, restore the complete backup and previous binary,
and restart using its former configuration and credential namespace. No project
schema migration is required. Keep new validation files separate from the backup.
