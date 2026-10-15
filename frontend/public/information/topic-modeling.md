<!-- markdownlint-disable MD033 -->

<h2 id="info-topic-modeling-overview">About Topic Modelling</h2>

Topic modelling is an exploratory way to find recurring language patterns in a
large collection without reading every document first. Wordflow groups similar
text and summarises each group with statistically representative words.

The unit processed by the model is a **Topic Segment**. Depending on your
segmentation setting, one source document can contribute one or many Topic
Segments. Wordflow embeds and clusters the segments, then combines their topic
assignments into source-character Topic Coverage for the source document.

<h3 id="info-topic-modeling-pipeline">How the result is produced</h3>

1. Automatic, Line, or Sentence segmentation creates non-overlapping Topic Segments.
2. A sentence-transformer model converts each segment into an embedding.
3. PaCMAP reduces the embeddings and HDBSCAN discovers natural clusters and
   outliers.
4. Wordflow builds a deterministic cosine average-linkage tree over real Topics.
5. Class-based TF-IDF (c-TF-IDF) ranks representative words for each topic.
6. Segment assignments are rolled up to document-level Topic Coverage, weighted
   by the Unicode-character length owned by each segment.

For keyword extraction, c-TF-IDF combines all Topic Segments assigned to a
topic into one class-level text. The shared representative-word tokenizer tokenises that text. Stopword Tables
or Views filter the complete ranking without changing its original scores. A term receives a high score when it occurs
often within that topic but is less common across the other topics. The highest
scoring terms become the representative words. They describe distinctive
vocabulary, not necessarily the topic's meaning or an author's intent.

<h3 id="info-topic-modeling-segmentation">Why segmentation matters</h3>

Automatic segmentation packs neighbouring whole paragraphs within the model
budget, without cutting a paragraph to fill spare space. Line begins from each non-empty physical
line, and Sentence begins from Unicode sentence boundaries. Oversized semantic
units are split further. Every source span is owned by at most one segment, so
coverage is neither repeated nor silently discarded.

<h3 id="info-topic-modeling-what-you-can-do">What you can do</h3>

- Fit temporary sampled Previews before committing to a complete Run of distinct
  exact texts within each input.
- Explore prominent and niche language patterns.
- Compare the contribution of two corpora to the same discovered topics.
- Adjust a requested Topic count through the retained hierarchy, subject to the
  optional hard maximum size.
- Count each row in bubbles for its strongest one or more positive Topics.
- Inspect representative words, topic sizes, similarity, and outliers.
- Pan and zoom the fitted Topic graph, or cumulatively lasso Topics to filter
  the All Topics list.
- Publish selected topic data and meanings as Derived Data Blocks.

<h3 id="info-topic-modeling-interpretation">Interpret with care</h3>

Topic modelling is not a classifier or a definitive account of what a corpus
is “about”. Clusters can reflect subject matter, genre, author, boilerplate,
document length, or data-cleaning artefacts. Topic −1 is the expected outlier
group rather than an error. Sampling, segmentation, maximum Topic size, the
displayed number of topics, and the random seed can all affect the result, so
compare configurations and return to the source documents when naming or
interpreting a topic.

HDBSCAN uses the fixed internal minimum size of 10 and default density settings.
Maximum Topic size defaults to unlimited; a finite cap must be above 10 and is a
hard segment limit. Requested number of Topics is a target; Wordflow reports the
achieved count when the cap makes that target unreachable. There is one fit,
without automatic retries or a silently increased cap.

Count-only adjustments reuse the retained hierarchy. Maximum-size changes reuse
reduced vectors for one HDBSCAN fit. True −1 outliers have a separate grey footer,
without map coordinates or contribution to the real Topic count. Successful
adjustments replace owned outputs atomically; failure preserves the last valid
result. Older analyses missing intermediates ask for Rerun.

Top topics per document defaults to two or the available real-topic count when smaller. A bubble counts a source row when that
Topic has a positive share among the row's strongest N real-topic shares.
Outlier −1 and zero shares do not count; ties at the cutoff all count. A row can
therefore contribute to several bubbles, and bubble totals can exceed the
number of source rows. Count chips show dominant-document counts and each Data
Block's or metadata group's own share. Changing only Top N updates bubble sizes
and publication membership without changing the map layout or clearing graph
interactions. New results derive counts and metadata from current source rows
matching checked exact texts; metadata edits never change fitted assignments or
coordinates. Historical results keep their original meaning until Rerun.

The term *topic* is technical rather than authorial. A critical overview is
available in [this open-access article](https://doi.org/10.1177/14614456241293075)
and its expert commentaries. A notebook using a different stochastic block
model approach is available in [topsbm](https://github.com/Australian-Text-Analytics-Platform/topsbm).
