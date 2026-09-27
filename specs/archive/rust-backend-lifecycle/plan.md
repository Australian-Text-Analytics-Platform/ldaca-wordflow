# Implementation Plan

1. Introduce one standalone Rust crate with a library and host binary; verify
   socket ownership, health responses, exact CORS, cancellation and draining.
2. Replace Tauri child supervision with an owned Tokio task and shared close/
   Quit draining; test state admission, failure and deadline behavior.
3. Select the desktop screen before browser router import; verify IPC discovery
   and HTTP readiness without mounting legacy application providers.
4. Remove the superseded Python desktop packaging pipeline, register versions,
   and update cross-platform CI and the canonical engineering documentation.
5. Run source checks, browser regression tests and local packaged macOS QA.
   Record unresolved baseline failures without changing unrelated features.
