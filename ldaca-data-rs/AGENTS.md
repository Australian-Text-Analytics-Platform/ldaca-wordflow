# ldaca-data-rs

Keep ONI access, metadata conversion and exports in the native Rust library.
Python contains bindings and ergonomic call wrappers only. Native builds must not
require Python, pandas, Polars, SQLite or PyArrow. Preserve ordering, explicit
credentials, bounded I/O and the documented wordflow_v1 compatibility profile.

Run cargo test, strict Clippy, Python tests/type checking and wheel/sdist checks.
Mock-server tests must use loopback ephemeral ports; live tests are opt-in reads.
Never include API keys, personal data or downloaded corpus contents in fixtures.
Do not publish or push without explicit user authorization.
