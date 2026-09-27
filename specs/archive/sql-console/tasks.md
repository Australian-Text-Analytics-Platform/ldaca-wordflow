# Verification

- [x] Accepted SQL scripts finish after caller disconnection.
- [x] Script boundaries, quoted/comment semicolons, full rollback and statement-index errors.
- [x] Read-only rejection of writes and nextval, transaction release, full UPDATE effects despite returned-row limits.
- [x] 50,000-row truncation, empty results, exact BIGINT/DECIMAL Arrow types and duplicate field values.
- [x] Saved source survives failed execution and Save As; first-cell initialization is idempotent.
- [x] Serialized blur saves, newer draft retention, failed save blocking execution, and deletion of the last cell.
- [x] Live loading/duplication is inert; pending live requests coalesce; Default never retries automatically.
- [x] Browser formatting, drag/menu reordering, local pagination, reload persistence and light/dark contrast.
- [x] 1,408 frontend tests and three build-contract script tests; lint and build.
- [x] Locked backend tests (54 passed, one subprocess helper ignored), formatting and strict Clippy.
- [x] 20 Tauri tests and strict Clippy; Quick Look native tests.
- [x] Full Rust-preview E2E: 30 passed. Existing `objects.spec.ts:25` hover timeout waits for Data Block actions; no SQL-console failure.
- [x] Regular macOS app: SQL tab, ⌘Enter, saved source, captured-result pagination, duplicate without copied results, theme selection, and native Untitled save prompt.
- [x] Docs publication mirror, documentation checks and links.
- [x] Final regular app/DMG rebuild and native dark editor check.
- [x] Final diff check.

`pnpm dev:desktop` compiled, but the sandboxed process could not register with
macOS and the UI tool cannot attach to a bare executable. The authorized regular
app bundle was used for native interaction checks. Native screenshot capture
returns Stage Manager thumbnails in this environment; full-size browser images
and computed-color checks verify contrast and narrow-pane layout.
Windows native behavior and release notarization were not verified locally.
