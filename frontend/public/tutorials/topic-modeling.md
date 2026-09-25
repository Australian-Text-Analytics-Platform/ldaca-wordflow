<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-topic-modeling-section">Topic modelling tutorial</h1>

![Topic modelling parameter panel](tutorials/assets/topic_modelling.png)

Topic modelling discovers recurring themes in a collection. Wordflow divides
each document into **Topic Segments**, embeds those segments, groups similar
segments, and rolls their topic assignments back up to each source document.

<h2 id="help-topic-modeling-parameters">Parameter panel</h2>

<h3 id="help-topic-modeling-data-block">Step 1 — Select your data</h3>

Choose one or two Data Blocks and select the text column for each. A two-block
run fits one shared model and shows how each topic is distributed between the
two corpora.

<h3 id="help-topic-modeling-sampling">Step 2 — Choose a sample</h3>

Each Data Block has an independent sampling percentage. The default is 100%.
Lower sampling makes exploratory runs faster but can hide rare themes or make
small topics less stable. The label reports the effective document count.

<h3 id="help-topic-modeling-options">Step 3 — Configure the model</h3>

<h4 id="help-topic-modeling-segmentation-method">Segments (segmentation method)</h4>

This setting controls which spans become Topic Segments. The same method is
used for every selected Data Block.

| Method | Starting unit | Oversized unit |
| --- | --- | --- |
| **Automatic** | Each paragraph: a blank-line block when the text has blank lines, otherwise each non-empty line | Split into its sentences, then as below |
| **Paragraph** | Each trimmed, non-empty line, treated as a paragraph | Split into its sentences, then as below |
| **Sentence** | Each Unicode UAX #29 sentence | Split as below |

A unit that fits the token cap is always one segment; short units are never
merged together. A sentence that is still too long is split at the clause
punctuation (commas, semicolons, colons, dashes) nearest its middle, repeatedly,
so the pieces stay similar in size and end at natural pauses. Only a stretch with
no usable punctuation is cut at the token cap, and a leftover of fewer than four
tokens from such a cut is dropped. Segments with no letters or digits (a stray
quotation mark or full stop) are dropped in every mode.

For text whose paragraphs are separated by single line breaks, Automatic and
Paragraph produce the same segments. They differ for text that uses blank lines
between paragraphs: Automatic keeps each blank-line block together, while
Paragraph starts a new segment at every line break. Sentence uses a language-independent Unicode boundary
algorithm, so abbreviations may occasionally form a short segment.

<h4 id="help-topic-modeling-max-segment-tokens">Max tokens (maximum tokens per segment)</h4>

Sets the maximum size of a Topic Segment in model tokens. The default is 256
and the allowed range is 32–256. Tokens may be complete words or parts of
words, and the cap includes special tokens added by the embedding model. A
smaller cap gives more local observations; a larger cap gives each observation
more context.

All modes split over-cap text into non-overlapping source spans. Apart from the
tiny leftovers and letterless segments described above, no text is discarded.
Very small caps (such as 32 tokens) produce many short, fragment-like segments,
which can make the number of topics unstable; 128–256 tokens usually gives more
stable topics.

<h4 id="help-topic-modeling-min-cluster-size">Topic size: minimum (Min topic size)</h4>

Sets the smallest number of Topic Segments that can form a natural HDBSCAN
Topic. The default is 10 and the minimum is 2. Smaller values can produce more,
finer natural Topics but may be noisier; larger values require more supporting
segments per natural Topic. Changing this value requires a new run.

<h4 id="help-topic-modeling-max-cluster-size">Topic size: maximum (Max topic size)</h4>

Limits the largest number of Topic Segments one Topic can hold. Topic size
counts segments, not documents. Leave it empty for **Auto**: HDBSCAN sometimes
picks one huge Topic that swallows most of the corpus, especially with short
segments, so Auto re-clusters only when one Topic holds more than half of all
segments. It then splits that Topic into its sub-topics, and keeps the split only
if most of that Topic's segments stay in Topics rather than becoming outliers.
A fixed value must be larger than Min topic size. The number of segments is only
known after a run, so after each run the field shows the segment count and
whether Auto applied a cap, to help you choose a fixed value.

<h4 id="help-topic-modeling-random-seed">Seed (random seed)</h4>

Controls stochastic dimensionality reduction. The default is 0. Keep the same
seed to reproduce a configuration, or compare several seeds to assess topic
stability.

<h2 id="help-topic-modeling-run">Step 4 — Run the analysis</h2>

Choose **Run**. The native pipeline constructs Topic Segments, embeds
them with the configured sentence-transformer model, reduces the embeddings
with PaCMAP, clusters them with HDBSCAN, calculates c-TF-IDF representative
words, and saves the Result. The first run can be slower while model resources
are loaded or downloaded.

Every mode uses this same downstream pipeline. Each Topic Segment is one equal
clustering observation. When assignments are rolled back to documents, each
segment is weighted by the Unicode-character length of its owned source span.
Outlier coverage remains part of normalized Topic Coverage and can be dominant.

The **Run** label never changes. Parameters lock while the Analysis is
submitting, queued, or running, then unlock after success. Changing an
execution parameter enables Run again; reverting exactly to the submitted
request disables it. Words per topic, stop words, search, selection, and chart
controls are presentation-only and do not enable Run. After failure or
cancellation, Run stays disabled until **Clear Results** removes the Analysis;
your segmentation method, token cap, and Min topic size stay selected.

<h2 id="help-topic-modeling-results">Result panel</h2>

![Topic modelling results](tutorials/assets/topic_modelling/results.png)

<h3 id="help-topic-modeling-number-of-clusters">Topics (number of topics)</h3>

The Result starts at HDBSCAN's natural number of real Topics. Use **Number of
topics** to merge that fit down to one Topic without rerunning embedding or
dimensionality reduction. Topic −1 is an outlier group, remains unchanged, and
does not count toward the displayed number. Results with zero or one real Topic
show a fixed disabled control.

The lower bound appears to the left of the slider. Change the topic count with
either the slider or the number field on its right; both stay synchronized.
Wordflow requests one projection after you commit either control. The current
chart remains visible with
**Updating topics…** until the new representative words, coordinates, sizes,
and document assignments arrive. A failed request restores the previous value.
Changing the count clears Topic selection and chart hover or zoom state. Search,
stop words, and Words per topic remain in place.

A successfully applied non-default projection is remembered for the same
Analysis. If a lower cluster count cannot support the current Top topics per
row, Wordflow sends one update with that value clamped to the new count.
Rerunning creates a new Analysis at its natural count and Top 2. Export and Add
to Project use the displayed successful projection and are unavailable while
an update is pending.

<h3 id="help-topic-modeling-top-topics-per-row">Per document (top topics per document)</h3>

**Top topics per document** controls how many of each source row's strongest
positive real-topic shares contribute to bubble counts. The default is 2. Topic
−1 and zero shares never count. If several Topics tie at the cutoff, all tied
Topics count, so one row may contribute to more than this number and to several
bubbles. The question-mark tooltip beside the control summarizes this counting
behaviour.

Enter a value and press Enter or leave the input to request one update. Partial
input and the already-applied value make no request. Changing only this value
updates bubble sizes, corpus composition, Topic lists, tooltip counts, CSV, and
publication membership without moving the Topic layout or clearing selection,
search, lasso filters, pan, zoom, or an open Add to Project dialog.

<h3 id="help-topic-modeling-color-by">Colour by</h3>

For a single-corpus result, **Colour by** colours the bubbles by a metadata
column instead of the Data Block colour, so you can see, for example, which
topics each party or decade talks about most. The list offers every column
(other than the text column) with 2 to 8 distinct values among the analysed
documents: text, true/false, or numbers. Each name is followed by its number of
values, for example *Country (3)*. A column with a single value is not listed,
because every bubble would get the same colour. Values are read from the Data Block
when you choose them, so columns added after the run, such as annotation
columns, are included. Empty values form a grey **(missing)** group.

Each value counts the documents whose Top topics per document include the
topic, the same rule as bubble size. To stop common values dominating, each
count is divided by how many documents have that value, and the bubble blends
the two values most over-represented in the topic, as in a two-corpus run. The
hover card and topic list show every value's count, a legend under the graph
maps colours to values, and a downloaded graph includes that legend. Choose
**Data Block colour** to return to the usual colouring. The choice is not
saved and resets when you run the analysis again. No re-run is needed.

<h3 id="help-topic-modeling-words-per-topic">Words (words per topic) and stop words</h3>

**Words per topic** controls how many representative words appear in the topic
list, search, and hover cloud. The default is 15 and the range is 3-100. Enable
the stopword filter to apply the Tab's saved list. You can choose a language or
edit that list while filtering is off; the switch controls filtering only.
The dropdown's **From other tabs** group lists stop words saved in your other
Frequency or Topic Modeling tabs; **Wordflow classic lists** offers the built-in
lists earlier Wordflow versions used; **Languages (stopword library)** offers
default lists from the open-source `stopword` package: it shows the language
detected from the first selected Data Block, marked **(Detected)**, and **Show
all languages** reveals the rest. Any choice appends its words to the
saved list (duplicates are skipped, so you can combine lists and keep custom
words), copied tab lists stay independent afterwards, and **Clear stop words**
empties the list. The menu returns to **Saved list (N words)** after a choice.
These controls change presentation without rerunning or refetching the
Result.

<h3 id="help-topic-modeling-bubble-chart">Bubble chart</h3>

Each bubble is a discovered topic. Bubble size reflects source rows whose
positive share for that Topic is within the displayed Top topics per document; in a
two-corpus run, colour composition compares the Topic's share of each analyzed
corpus, then normalizes those two shares for the colour blend. This prevents a
larger corpus from dominating the colour solely because it has more rows. A row
may count in multiple bubbles, so bubble totals need not equal the source-row
count. Nearby bubbles have more similar topic representations. Topic −1 remains
an outlier group and is not a real-Topic bubble membership. Topics with a total
bubble count of zero are omitted from the graph but remain available in the
Topic lists and Result data.

Hover for a representative-word cloud. Word order reflects c-TF-IDF
distinctiveness, while word size reflects occurrences in assigned Topic
Segments. Because segments do not overlap, source tokens are not counted twice. These are
not source-document frequencies.

Drag empty graph space to pan and scroll or pinch to zoom. The graph initially
fits every bubble; use **Fit view** to restore that complete view after moving
around. Select topics directly, or enable the lasso control and draw around
several Topic centres. Lasso mode remains active and later strokes add to the
filter shown in **All Topics**; use **Clear filter** in the graph toolbar to
remove that accumulated filter without changing manually selected Topics.
Search further narrows the filtered list. Choose **Add to Project** to publish
manually selected topic data and linked topic meanings as Derived Data Blocks.
For a two-source result, **Sync columns** applies exact, case-sensitive shared
source-column selections to both checked Data Blocks. Enabling it combines the
currently selected shared names; individual choices and **Select all** or
**Select none** then update both sources. Source-only columns are disabled while
sync is active, and an unchecked source keeps its independent selection.
`TOPIC_top1` remains required and is not synchronized. If fewer than two sources
remain checked, Sync columns turns off automatically.

The **Rows** choice in the dialog sets how rows are formed:

- **Per document** (default): one row per source document, with its dominant
  topic (`TOPIC_top1`) and full topic coverage (`TOPIC_coverage`).
- **Per topic**: one row per document and topic. The document column holds only
  the segments assigned to that topic, joined by line breaks in source order, so
  a document with three topics becomes three rows. Each row also carries the
  topic (`TOPIC_topic`), its share of the document's text (`TOPIC_share`), and how
  many segments it joined (`TOPIC_segment_count`). Outlier segments are left
  out. Use this when you are interested in particular topics rather than whole
  documents.

The suggested name for each new Data Block includes the selected topic numbers,
for example _Corpus topic 5_ or _Corpus topics 3, 7_ (with more than three
topics selected, _Corpus 8 topics_). You can edit the name before adding it.

Both modes use the topics as currently shown, including any merging from
**Number of topics**. Per topic needs a result from this version of Wordflow;
for older results, re-run the analysis first.

The download control exports the current panned and zoomed graph viewport. Its
header records Data Block, cluster count, Top topics per document, random seed, and
Topic count. CSV output continues to contain the complete projected Topic
result and its current counts.

<h3 id="help-topic-modeling-clear-results">Clear results</h3>

**Clear Results** removes the retained Analysis and Result. The selected
segmentation method, maximum-token value, and minimum cluster size remain
available for the next run.

<h2 id="help-topic-modeling-troubleshooting">Troubleshooting</h2>

| Symptom | What to try |
| --- | --- |
| Almost all documents are outliers | Increase sampling, try another segmentation method, or check whether the corpus has shared themes |
| Topics change substantially between runs | Increase sampling and compare runs with fixed seeds |
| Representative words describe formatting rather than subject matter | Clean boilerplate or choose a segmentation method that better matches the document structure |
| A structural unit becomes many segments | Increase Maximum tokens per segment or choose a coarser segmentation mode |
| Run time is very long | Reduce the per-Data-Block sampling percentage |

<h2 id="help-topic-modeling-defaults">Quick-reference defaults</h2>

| Setting | Default |
| --- | --- |
| Sampling | 100% per Data Block |
| Segments | Automatic |
| Max tokens | 256 |
| Topic size | 10 to Auto |
| Seed | 0 |
| Per document | 2, or the available Topic count when smaller |
| Words | 15 |

## Practice exercise

1. Run a corpus with Automatic segmentation.
2. Change Top topics per document and compare bubble membership without moving the map.
3. Move Number of topics down and compare the merged representative words.
4. Clear the Result, choose Paragraph or Sentence, and run again with the same
   sample and seed.
5. Compare the topic map, representative words, and outlier coverage.

[← Back to tutorial index](./index.md)
