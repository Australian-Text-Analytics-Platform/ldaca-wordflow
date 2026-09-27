# Native server and browser file management

Approved scope: native Linux x86-64, macOS arm64 and Windows x86-64 release
archives with embedded UI and on-demand optional resources. Desktop follows the
same lightweight policy, including ICU and language model/WASM assets. Single user and one active project.
`DATA_DIR/data` and `DATA_DIR/projects` are independent libraries; future accounts
will resolve beneath `DATA_DIR/<username>` without changing project contents.

Start Untitled. Graph drops upload to the data library before import. Library
uploads alone never import. Project download preserves a checkpointed database;
portable materialization remains Export. Server replaces runtimes on project
switch, rejects obsolete session URLs and retains ordinary Tauri behavior.

Binder downloads the latest stable GitHub release, verifies checksums, starts a
loopback process, and uses a stripped public proxy prefix. Python only launches
and stops the process. No Docker/PyPI release, authentication, schema migration,
persistent session registry or shared-project collaboration.

Binder verification is deferred to the actual website; no local Binder test.
