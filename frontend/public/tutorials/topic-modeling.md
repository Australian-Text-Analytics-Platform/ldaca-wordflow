<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-topic-modeling-section">Topic modelling tutorial</h1>


Topic modelling discovers recurring themes in a collection. Wordflow divides
each document into **Topic Segments**, embeds those segments, groups similar
segments, and rolls their topic assignments back up to each source document.

<h2 id="help-topic-modeling-parameters">Parameter panel</h2>

<h3 id="help-topic-modeling-data-block">Step 1 — Select your data</h3>

Choose one or two Data Blocks and select the text column for each. A two-block
run fits one shared model and shows how each topic is distributed between the
two corpora.

<h3 id="help-topic-modeling-sampling">Step 2 — Choose a sample</h3>

Choose **Preview** to open the sampling dialog. Each input can use a document
count (default 1,000) or a percentage (initially 10%). Sampling uses the random
seed, keeps distinct duplicate rows and restores original row order. Counts are
clamped to available rows; a positive percentage of a nonempty source keeps at
least one row. The result reports sampled and total counts.

Preview is temporary and cannot publish Data Blocks. Leaving the tab, reloading,
Clear results, Run or another Preview releases it. Source edits mark it outdated;
click Preview explicitly to sample again. Sampling may scan the source even
though only sampled text is fitted. Preview topics can differ from a full Run.
**Run always uses every row**, regardless of dialog choices.

<h3 id="help-topic-modeling-options">Step 3 — Configure the model</h3>

<h4 id="help-topic-modeling-segmentation-method">Segmentation method</h4>

Choose the English MiniLM embedding model (default) or multilingual MiniLM.
Model assets download on demand; documents remain on your computer. Both input
cards share one representative-word tokenizer: changing either changes both.
The embedding model uses its own tokenizer independently.

This setting controls which spans become Topic Segments. The same method is
used for every selected Data Block.

| Method | Boundary behavior | Oversized text |
| --- | --- | --- |
| **Automatic** | Packs neighbouring whole paragraphs within the token budget, retaining short text | Split oversized paragraphs without overlap or lost tail text |
| **Line** | Starts from each trimmed, non-empty newline-delimited line | Recursively split within the token cap |
| **Sentence** | Starts from each Unicode UAX #29 sentence | Split at token boundaries within the cap |

Line means a physical non-empty line, not a blank-line block. Sentence
uses a language-independent Unicode boundary algorithm, so abbreviations may
occasionally form a short segment.

<h4 id="help-topic-modeling-max-segment-tokens">Maximum tokens per segment</h4>

Sets the maximum size of a Topic Segment in model tokens. The default is 256
for English MiniLM (128 for multilingual MiniLM). The minimum is 4 and the
maximum follows the chosen model. Switching models visibly lowers an excessive value. Tokens may be complete words or parts of
words, and the cap includes special tokens added by the embedding model. A
smaller cap gives more local observations; a larger cap gives each observation
more context.

All modes split over-cap text into non-overlapping source spans. No mode silently
discards the tail of an oversized semantic unit.

<h4 id="help-topic-modeling-min-cluster-size">Topic size and count</h4>

HDBSCAN uses an internal minimum of 10 segments and its default density settings.
**Limit maximum topic size** sets a hard segment limit above 10; it defaults to
unlimited. **Request a number of Topics** sets a target for merging the fitted
hierarchy; the default is the natural Topic count. Wordflow fits once, respects
the hard maximum during merges and reports the achieved count when the target
cannot be reached. It never silently increases the maximum or retries fitting.

<h4 id="help-topic-modeling-random-seed">Random seed</h4>

Controls Preview sampling and stochastic dimensionality reduction. The default is 0. Keep the same
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

Run saves the submitted request and clears previous owned output before fitting.
Failure or cancellation retains that request without a completed result. Newer
form edits remain local. Run and Preview remain available after success. Run explicitly processes current
Data Blocks through every stage; exact text/embedding caches can still be reused. Broken saved output offers Retry and
**Rerun**. Unrecognized saved settings appear above the actions without stopping
valid settings from loading.

The progress card shares Run status with Task Centre. Preview has cancellable
progress but no task-history entry. Cancellation between embedding batches is
cooperative; an in-progress PaCMAP or HDBSCAN stage must finish before cleanup.

<h2 id="help-topic-modeling-results">Result panel</h2>


<h3 id="help-topic-modeling-number-of-clusters">Requested number of Topics</h3>

The Result starts at the requested target, or HDBSCAN's natural count by default.
Use **Requested number of Topics** to adjust the retained hierarchy without
embedding or clustering again. A hard maximum can prevent further merges; the
display shows the achieved count. Outliers remain separate and do not count as
Topics. A zero-Topic result has no hierarchy to merge.

The lower bound appears to the left of the slider. Change the topic count with
either the slider or the number field on its right; both stay synchronized.
Wordflow requests one projection after you commit either control. The current
chart remains visible with
**Updating topics…** until the new representative words, coordinates, sizes,
and document assignments arrive. A failed refresh keeps the previous chart marked outdated and offers Retry.
Changing the count clears Topic selection and chart hover or zoom state. Search,
stop words, and Words per topic remain in place.

A successfully applied non-default projection is remembered for the same
Analysis. If a lower cluster count cannot support the current Top topics per
row, Wordflow clamps that value to the achieved count.
Rerunning creates a fresh Analysis using its requested target and up to Top 2. Export and Add
to Project use the displayed successful projection and are unavailable while
an update is pending.

<h3 id="help-topic-modeling-top-topics-per-row">Top topics per document</h3>

**Top topics per document** controls how many of each source row's strongest
positive real-topic shares contribute to bubble counts. The default is 2. Topic
−1 and zero shares never count. If several Topics tie at the cutoff, all tied
Topics count, so one row may contribute to more than this number and to several
bubbles. Bubble area shows these memberships. Count chips instead show
**dominant documents** and each Data Block’s or metadata group’s own share.

Enter a value and press Enter or leave the input to request one update. Partial
input and the already-applied value make no request. Changing only this value
updates bubble sizes and publication membership without moving the Topic layout or clearing selection,
search, lasso filters, pan, zoom, or an open Add to Project dialog.

### Adjust retained stages and Colour by

The Results controls for maximum topic size and representative-word
tokenizer reuse saved intermediates after a short delay. Clustering reuses reduced
vectors; tokenizer changes reuse assignments. Successful adjustments replace the
result atomically. Failure keeps the last valid chart with the original diagnostic
and Retry. Older results without required intermediates ask for Rerun; Wordflow
does not silently rebuild them.

True outliers appear in a grey footer with dominant-document counts and each
source or metadata group's own share. **View outlier documents** opens inspection
and direct downloads. Processed empty texts remain eligible for the population
but are not presented as outliers. Selected Topic cards stay visible but faded
when search or lasso excludes them; the newest selection appears first.

New Runs fit distinct exact texts independently within each Data Block. Outputs
attach to current source rows by exact processed text, preserving duplicate rows.
Source metadata and document counts update live without changing fitted assignments
or map coordinates. Unprocessed new texts are absent; edited/removed texts stop
matching. Processed empty outcomes remain part of the eligible population. A
missing source produces the normal database error. Historical results keep their
snapshot meaning until Rerun.

For one Data Block, **Colour by** offers current fields with 2–8 nonmissing groups.
Missing values are grey. Legend counts and count chips use current matching source
rows for Run and only the sampled population for Preview. Shares use each group’s
own denominator: whole percentages from 10%, one decimal below, and `<0.1%` for tiny
positive shares. Tooltips give exact counts and populations. Colours blend the two
strongest population-adjusted groups; opacity ranges from 0.25 to 0.8 with
concentration. Source colours, legends, counts and captions carry into figures.

<h3 id="help-topic-modeling-words-per-topic">Words per topic and stop words</h3>

**Words per topic** controls how many representative words appear in the topic
list, search, and hover cloud. The default is 15 and the range is 3-100. Enable
the stopword filter to apply a project stopword Table or View, using the shared
picker and editor. Filtering happens against the complete ranking before keeping
up to 100 candidates. The visible word limit is applied afterward; search uses
those displayed words. Stopword changes refresh only words, never assignments,
ranking scores or map coordinates. CSV and the published dictionary contain the
complete filtered candidate set, not just visible words.

<h3 id="help-topic-modeling-bubble-chart">Bubble chart</h3>

Each bubble is a discovered topic. Filled bubble area is proportional to the number of source rows whose
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
**Select none** then update both sources. Source-only columns retain their independent selection, as does an unchecked source.
`TOPIC_top1` remains required and is not synchronized. Sync affects checked sources that contain the same column.

The download icon opens a PNG/SVG/JPEG dialog (PNG by default), with an optional
representative-word CSV ZIP enabled by default. Failed or cancelled saves keep
the dialog open. Preview downloads are explicitly labelled sampled.

The download control exports the current panned and zoomed graph viewport. Its
header records Data Block, cluster count, Top topics per document, random seed, and
Topic count. CSV output continues to contain the complete projected Topic
result and its current counts.

<h3 id="help-topic-modeling-clear-results">Clear results</h3>

**Clear results** releases Preview and removes saved output, retaining the
submitted request and Analysis identity. Published outputs remain independent. The selected
segmentation method, maximum-token value, maximum Topic size and count target remain
available for the next run.

<h2 id="help-topic-modeling-troubleshooting">Troubleshooting</h2>

| Symptom | What to try |
| --- | --- |
| Almost all documents are outliers | Increase sampling, try another segmentation method, or check whether the corpus has shared themes |
| Topics change substantially between runs | Increase sampling and compare runs with fixed seeds |
| Representative words describe formatting rather than subject matter | Clean boilerplate or choose a segmentation method that better matches the document structure |
| A structural unit becomes many segments | Increase Maximum tokens per segment or choose a coarser segmentation mode |
| Run time is very long | Try a sampled Preview first; Run always uses all rows |

<h2 id="help-topic-modeling-defaults">Quick-reference defaults</h2>

| Setting | Default |
| --- | --- |
| Run scope | Every row |
| Preview sampling | Up to 1,000 documents per Data Block |
| Embedding model | English MiniLM |
| Representative tokenizer | Plain words (English), shared |
| Segmentation method | Automatic |
| Maximum tokens per segment | 256 |
| Internal minimum Topic size | 10 segments |
| Max topic size | Unlimited |
| Requested Topic count | Natural count |
| Random seed | 0 |
| Top topics per document | 2, or the available Topic count when smaller |
| Words per topic | 15 |

## Practice exercise

1. Run a corpus with Automatic segmentation.
2. Change Top topics per document and compare bubble membership without moving the map.
3. Move Number of topics down and compare the merged representative words.
4. Clear the Result, choose Line or Sentence, and run again with the same
   seed.
5. Compare the topic map, representative words, and outlier coverage.

[← Back to tutorial index](./index.md)

Use **View documents** beside a topic to inspect its saved or sampled documents. Select a source, optional metadata and a page. Coverage is ordered highest first and Top-N cutoff ties are included. Expand text to read it in full. This dialog is read-only and never retrains the model. **Download** exports all
matching source documents across pages as CSV, XLSX, JSON or Parquet; **Download
sample** uses all matching sampled documents without refitting. Document text can
be omitted from downloads. Figure downloads include a topic ID/word/count key.

New Add to Project outputs are live Views with independently copied generated
assignments. The original document is always retained and source metadata stays
live. Clear, Rerun and tab deletion cannot alter published outputs. A missing source
retains its SQL reference and normal database error; deleting the published Data
Block cleans up its hidden generated outputs.

The shared Stopwords section places its selector beside an inline word editor, stacking them in narrow panes. Add/remove words, paste lists, sort and add language presets directly there. Changes save immediately to the shared Table. Views require **Create editable copy** before editing. Turning stopwords off hides the content but retains the selected list.

The map’s icon toolbar stays compact. Hover or focus a control to see its name immediately in a tooltip, without expanding the toolbar.
