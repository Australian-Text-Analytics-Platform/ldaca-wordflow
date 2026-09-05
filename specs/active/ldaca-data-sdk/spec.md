# LDaCA data SDK

Implement the approved standalone `ldaca-data-rs` 0.1.0 SDK: native ONI data access,
RO-Crate conversion to Apache Arrow, optional thin Python bindings, and direct
Parquet/CSV/IPC export. Wordflow uses the explicit `wordflow_v1` compatibility
profile. Its HTTP contract, credentials, import lifecycle, quotas and publication
remain application-owned. No OAuth/admin/write endpoints or mandatory DataFrame
libraries are introduced. Repository target is the ATAP organisation; publication
and remote repository creation are separate actions.

## Acceptance

Native and Python tests cover protocol encoding, credential isolation, bounded
streaming, cancellation, metadata validation, selectable types, companion tables,
source ordering, schema inference, Arrow lifetimes and file export. Captured Python
fixtures are the Wordflow compatibility oracle. Verify backend integration and
isolated browser/native imports. Build wheels on Linux x86-64, macOS arm64 and
Windows x86-64 and rebuild from the sdist. Record unavailable checks explicitly.
