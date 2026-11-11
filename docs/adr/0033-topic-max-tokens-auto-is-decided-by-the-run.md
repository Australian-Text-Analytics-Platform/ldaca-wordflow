---
status: accepted
---

# Topic Modelling Max tokens Auto is decided by the run

## Context

Max tokens caps the length of a passage. Too large a cap on short texts merges
unrelated sentences into one passage; too small a cap splits most paragraphs.
Until 0.7.19 the request always carried a number (256 by default), and a
Suggestion offered a smaller one after measuring the first 200 texts in the
client. Chao and Monika agreed that most people should not have to set this,
so Max tokens became an advanced setting with an **Auto** default
([design](../reviews/ui-modes-and-maximise-2026-11-11/DESIGN.md)).

Two places could choose the size. The client could send the size its
200-text sample suggests. That sample is the head of each Data Block, so a
corpus sorted by date or source can be measured from unrepresentative texts,
and a saved request would hold a number that no longer says the researcher
asked for Auto. The run, in contrast, reads every text it is about to
segment.

## Decision

`TopicModelingAnalysisRequest.max_segment_tokens` is nullable. A missing or
null value means Auto and is left out of the saved request, so the saved
Project records that Auto was asked for.

For Auto the worker decides before segmenting. It counts the tokens of every
unit the segmentation method keeps whole (a paragraph, line or sentence), in
every text the run reads, without splitting any unit. It takes the smallest of
32, 64, 128 and 256 within the embedding model's limit that keeps at least 9
in 10 units whole, or the model's limit when none does, then segments once at
that size. Counting does not split,
so no text is measured or split twice. With two Data Blocks one size is chosen
from all their texts together.

The Result records `max_segment_tokens`, the size the run used, whether set by
hand or chosen by Auto. The client shows it as "Auto (64)" after a run, like
Max topic size. Before a run the control shows the client's 200-text estimate,
which decides nothing.

## Consequences

- A request that names a size behaves exactly as before.
- Releases 0.7.16 to 0.7.19 read a missing field as 256. A Project saved with
  an Auto run still opens in them for the English model (limit 256). With the
  Multilingual model (limit 128) those releases refuse the request, so such a
  Project does not open after a downgrade. Chao accepted this on 11 November
  2026.
- The suggestion that offers a smaller size shows only for a size set by hand,
  since Auto has already chosen.
- Counting adds one tokenisation pass over the units before segmenting.
