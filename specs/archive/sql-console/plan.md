# Implementation

1. Extend the existing lexer and transaction executor for exclusive scripts or
   statement arrays, read-only queries, bounded returned Arrow rows and response
   metadata. Validate the complete batch before any preparation.
2. Add format-5 cell metadata and update backend/Quick Look validation together.
3. Replace the SQL form with the existing CodeMirror/table presentation. Use
   TanStack mutation scopes for serialized metadata writes, local source drafts
   and captured Arrow results, and one window-local execution queue.
4. Remove unnecessary generated aliases without changing authored SQL or Undo.
5. Exercise database behavior, frontend races, browser/native interactions,
   packaging and documentation. Keep existing graph-hover failures separate.
