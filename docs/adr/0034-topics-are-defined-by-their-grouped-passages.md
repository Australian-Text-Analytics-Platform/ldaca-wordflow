---
status: accepted
---

# Topics are defined by their grouped passages

## Context

HDBSCAN leaves out the passages that sit in thinner areas when Topics
separate. On real corpora that was often most of the text: 58% of 85,727 news
comments and 39% of 26,163 articles had no Topic
([measurement](../reviews/topic-modeling-ungrouped-2026-11-11.md)). Relaxing
the density requirement (`min_samples`) lowered the share a little and
multiplied small Topics (271 to 1,162 on the comments), so it was rejected.
Letting left-out passages join the Topic they are most similar to keeps the
Topics and places the text, and became the advanced setting **Ungrouped
passages** (`ungrouped_passages`: `keep`, `fit`, `nearest`).

The first build stored joined passages as ordinary members. They then moved
each natural Topic's saved centre, and with it the merge tree behind the
Topics slider and the map, so the same run showed different merged Topics
with and without joining, and a passage's "Top n%" in the examples changed
because of passages that grouping never chose.

## Decision

A Topic is defined by the passages clustering put in it. Its Representative
Words, its centre, its map position and the merge tree are computed from those
passages only.

Joining is decided once, after clustering and against the natural Topics.
`fit` admits a passage that is at least as similar to the nearest Topic's
centre as that Topic's own least similar grouped passage; `nearest` admits
every passage. The decision is stored per passage as a `joined` mark in the
clustering context and is not made again when Topics are merged: a merged
Topic is broader, so deciding again would change who joins as the slider
moves.

A joined passage counts towards its Topic's coverage, bubble size and
examples. In the examples it is marked **Joined** and ranked on the grouped
passages' scale, measured from their centre, so grouped passages keep the
"Top n%" they would have without joining. A joined passage less similar than
every grouped passage of the Topic shown reads **Joined · Outside**, which a
merged Topic or `nearest` can produce.

The default stays `keep`. Changing it would change every existing user's
results and needs a reading of example passages on known corpora first.

## Consequences

- A run with joining shows the same natural and merged Topics, words and map
  as the same run without it (checked on 3,000 comments at 31, 12 and 5
  Topics).
- No Topic becomes looser than its own least similar grouped passage under
  `fit`, which needs no number from the researcher and carries between
  corpora, unlike one similarity threshold.
- Contexts written before this decision have no `joined` mark and read as
  having no joined passages.
- The options and the mark live in polars-text 0.7.3
  (`outlier_member_quantile`, `outlier_similarity`); `min_samples` is exposed
  there for measurement and is not offered in Wordflow.
