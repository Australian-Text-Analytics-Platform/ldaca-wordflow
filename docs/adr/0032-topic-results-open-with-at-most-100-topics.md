---
status: accepted
---

# Topic Results open with at most 100 Topics

This decision supersedes the clause of
[ADR 0024](0024-adjustable-topic-cluster-projections.md) that a Result query
with a null `cluster_count` selects the stored natural fit.

## Context

HDBSCAN's natural Topic count follows Min topic size and the corpus. A low Min
topic size on a large corpus finds thousands of Topics: a run on 85,727
comments at Min topic size 4 found 2,238, and the Obesity sample corpus finds
782 at the default of 10. Every Topic becomes a bubble and a list row. Opening
the 2,238-Topic Result froze the desktop app on macOS and Windows, and because
the Result opened at its natural count every time, the Project could not be
used. No bubble map of that many Topics is legible in any case.

## Decision

A Result query with a null `cluster_count` applies the starting count:
the natural count, capped at 100 (`TOPIC_STARTING_COUNT_LIMIT`). Above the cap
the query projects from the immutable clustering context, exactly as an
explicit count does. Without a readable context file the query falls back to
the natural count.

Every Result response reports the starting count as `default_cluster_count`,
whatever count it applies, so the client's existing "at the default" checks
(remembered Topics slider selection, result Suggestions) keep their meaning.
`max_cluster_count` remains the natural count, so the Topics slider still
reaches every Topic the run found, and the stored Result, Artifacts, and
Workspace data are unchanged. Results saved by earlier versions open at the
starting count without migration.

## Consequences

- A Result with more than 100 natural Topics opens merged, after one
  projection (0.4 s for 2,238 natural Topics), and shows a Suggestion naming
  how many Topics the run found.
- Results with at most 100 natural Topics behave as before.
- The stored Result's `clustering.default_cluster_count` keeps the natural
  count; only query responses report the starting count.
