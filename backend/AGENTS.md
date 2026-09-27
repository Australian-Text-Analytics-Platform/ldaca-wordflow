# Native backend

This crate owns the shared Axum runtime and native DuckDB projects. Tauri and the standalone binary own
their runtime, configuration, logging, signals, and graceful shutdown without a deadline. The
library must not initialize global state, read a Data Root, or install signal
handlers. Project I/O begins only after an explicit create/open request.

Keep the library independent of Tauri, Python, and the existing server storage.
Run `cargo fmt --check`, `cargo test --locked`, and
`cargo clippy --all-targets --all-features --locked -- -D warnings` here.
