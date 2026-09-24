---
status: accepted
---

# Data Block Edits never change the number or order of rows

A Data Block Edit replaces a Data Block's plan in place, and many things refer
to that Data Block's rows by position: annotation results, analysis results
that map documents to source rows, and descendants created earlier. If an edit
could filter, sort, select, or aggregate rows, those references would silently
point at different rows. ADR 0007 allowed Filter and Expression edits, which
made this possible.

Each tool therefore has one fixed result destination:

- **Row-changing tools always create a Derived Data Block**: Filter, Sample
  (Slice, Random Sample, Shuffle), Join, Stack, Workspace SQL Query, and every
  analysis Add to Workspace.
- **Column tools always edit in place**: Find (Replace, Extract), Create,
  cast, column rename and delete, `set_cell`, and annotation columns.

The backend enforces the rule rather than trusting the UI. `NodeEditRequest`
no longer accepts `filter`; an `expression` edit accepts only the
`with_columns` context; and annotation Run All publication rejects output
whose row count differs from the Data Block's. The Expression tool and Create's
aggregation operations (count, mean, sum) are removed from the UI because they
could not honour the rule.

**Exception:** `annotation_classes` edits the codebook Data Block owned by an
annotation, whose rows are the class list itself. Adding or removing a class
must change its row count, and nothing else refers to codebook rows by
position.

Older Workspaces are not checked or migrated: edits applied under ADR 0007
remain as they were.
