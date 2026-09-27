# Implementation and parity

1. Shared request/inspection/writer and native snapshot ownership.
2. Desktop destination safeguards and generic native save command.
3. Sidebar modes and shared source/format controls.
4. Regression, visual, performance and release verification; canonical docs.

| Archived behavior | Native implementation / approved adjustment |
|---|---|
| Search/Add/remove/Clear selections | Shared NodeInputsPanel; Add all respects search/scope |
| Add preset | Use graph selection |
| CSV/JSON/NDJSON/Parquet/IPC | Retained, IPC restored to standard file encoding |
| One file or selected-files ZIP | Retained; ZIP generated natively with bounded copy buffers |
| Project archive ZIP | Replaced by native portable schema-1 `.wfpj` |
| Complete project | Retained with saved native analyses/private artifacts |
| Selected project | Added with Table definition preservation and explicit FK blockers |
| Busy/export messages | Existing task authority, single error observer and native chooser |
| Tooltip/help | Updated bundled Export tutorial and existing help navigation |
| Local form choices | Retained across tool navigation, reset on reload |

Archive remains unchanged. Package gates and independent browser/native visual
inspection are recorded in tasks.md; automated E2E is not native visual evidence.
