# ldaca-rs

This library owns native text algorithms and ONI/RO-Crate data operations.
Keep text inputs/results independent of Polars, Python, HTTP and Arrow. The
`data` feature owns Arrow interchange; hosts own runtimes, credentials and project
persistence. `polars-text` owns its Polars/PyO3 conversion and lazy expression ABI.

Keep feature dependencies narrow. Do not introduce DuckDB SQL registrations or
public HTTP/IPC APIs here. Model loading and cache paths are explicit I/O
boundaries. Never use a project database as a disposable computation cache.

Run formatting, locked tests, strict Clippy, feature-isolation checks and affected
adapter/backend tests. Use loopback mock servers for network tests and explicitly
provisioned models for model acceptance. Preserve licences and model notices.
