# Topic Modelling: why so much text is Ungrouped, and what was measured

11 November 2026. A one-time measurement behind the **Ungrouped passages**
setting. The harness was temporary and is not in the repository.

## The problem

Monika ran Topic Modelling on several corpora and found more than half of the
documents Ungrouped. Her reading: a result that leaves out half of the text
does not represent the corpus, and 10 to 20% would be acceptable. Chao agreed,
and noted that the two settings on offer do not help: **Max topic size** is
unrelated, and a smaller **Min topic size** only makes very many tiny topics.

## Why passages are Ungrouped

Topics are found by HDBSCAN on a five-dimension PaCMAP map of the passage
embeddings. HDBSCAN leaves a passage out when it sits in a thinner area at the
moment a topic separates from its neighbours. That is a statement about how
strict the grouping is as much as about the text: most such passages lie
between topics or beside one, not far from all of them. The same default in
BERTopic is known for the same outcome, and BERTopic ships outlier reduction
for it.

The strictness has its own HDBSCAN setting, `min_samples`, which Wordflow
leaves tied to **Min topic size** (the earlier
[best-practice audit](topic-modeling-best-practice-audit.md) recorded that as
an open risk). So there were two things to measure:

1. **Relax the density requirement** (`min_samples` below Min topic size).
2. **Let Ungrouped passages join a topic after grouping**: each one is
   compared with the topic whose centre it is most similar to and joins it
   when similar enough. A centre is the mean embedding of the passages
   grouping put in the topic, taken before any passage joins. "Similar
   enough" was tried two ways: one cosine similarity for every topic, and a
   bar set per topic from how similar its own passages are to its centre.

## Method

- **Comments:** 85,727 news comments (`ADO/reddit/newstalk_comments.parquet`
  in the sample data, column `comment_body`), 87,116 passages. Short texts,
  almost always one passage each. This is the kind of corpus Monika reported.
- **Articles:** 26,163 news articles about obesity, 107,551 passages. This is
  the corpus of the informal benchmark in the Topic Modelling help. It is
  restricted and is not in the repository; only counts are recorded here.
- English model, Automatic passages, Max tokens 256, Min topic size 10, seed
  0, Auto Max topic size, no Topic sampling, unless a row says otherwise.
- **Passages Ungrouped** is the share of passages in no topic. **Documents
  with no topic** is the share of documents with no passage in any topic,
  which is what the Ungrouped bubble counts.
- The last two columns compare each document's embedding with topic centres
  made from the documents whose main topic it is: the mean cosine similarity
  to the document's own topic, and the share of documents that are closer to
  their own topic's centre than to any other. For the articles a document
  embedding covers only its first 256 tokens, so those two columns are rough
  there. Passages that join a topic are by construction close to it, which
  favours the last column; read it as "no worse", not as an improvement.

## Results

### Comments

| Configuration | Topics | Passages Ungrouped | Documents with no topic | Median documents per topic | Topics under 20 documents | Mean similarity to own topic | Closest to own topic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| As shipped (0.7.19) | 271 | 59% | 58% | 23 | 121 | 0.63 | 76% |
| Density 5 (`min_samples`) | 474 | 56% | 56% | 18 | 256 | 0.63 | 73% |
| Density 3 | 815 | 49% | 49% | 16 | 524 | 0.63 | 69% |
| Density 1 | 1,162 | 44% | 44% | 15 | 779 | 0.64 | 67% |
| Min topic size 20 | 99 | 53% | 53% | 66 | 0 | 0.59 | 79% |
| Min topic size 20, density 5 | 207 | 55% | 55% | 44 | 2 | 0.62 | 76% |
| Join at similarity 0.6 | 271 | 36% | 36% | 76 | 22 | 0.65 | 78% |
| Join at similarity 0.5 | 271 | 18% | 18% | 119 | 8 | 0.63 | 79% |
| Join at similarity 0.4 | 271 | 7% | 7% | 144 | 3 | 0.61 | 78% |
| Join at similarity 0.3 | 271 | 1% | 1% | 166 | 3 | 0.60 | 78% |
| Join when as similar as the topic's median passage | 271 | 53% | 53% | 29 | 95 | 0.63 | 77% |
| As similar as its lowest quarter | 271 | 44% | 44% | 43 | 59 | 0.63 | 78% |
| As similar as its lowest tenth | 271 | 33% | 32% | 72 | 43 | 0.63 | 79% |
| As similar as its lowest twentieth | 271 | 25% | 25% | 93 | 36 | 0.62 | 80% |
| **Join a topic they fit** (as similar as its least similar passage) | 271 | 18% | 18% | 101 | 36 | 0.61 | 79% |
| **Always join the nearest topic** | 271 | 0% | 0% | 168 | 2 | 0.59 | 77% |

### Articles

| Configuration | Topics | Passages Ungrouped | Documents with no topic | Median documents per topic | Topics under 20 documents | Mean similarity to own topic | Closest to own topic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| As shipped (0.7.19) | 806 | 65% | 39% | 4 | 590 | 0.79 | 93% |
| Density 5 (`min_samples`) | 1,261 | 57% | 29% | 4 | 968 | 0.80 | 92% |
| Density 3 | 1,893 | 51% | 23% | 4 | 1,484 | 0.81 | 92% |
| Join at similarity 0.5 | 806 | 11% | 1% | 16 | 441 | 0.71 | 73% |
| Join at similarity 0.4 | 806 | 2% | 0% | 17 | 416 | 0.69 | 71% |
| Join at similarity 0.3 | 806 | 0% | 0% | 18 | 411 | 0.69 | 71% |
| Join when as similar as the topic's median passage | 806 | 59% | 31% | 5 | 604 | 0.78 | 91% |
| As similar as its lowest quarter | 806 | 50% | 21% | 7 | 578 | 0.77 | 87% |
| As similar as its lowest tenth | 806 | 37% | 13% | 9 | 557 | 0.75 | 82% |
| As similar as its lowest twentieth | 806 | 28% | 8% | 11 | 519 | 0.73 | 79% |
| **Join a topic they fit** (as similar as its least similar passage) | 806 | 22% | 6% | 12 | 500 | 0.72 | 77% |
| **Always join the nearest topic** | 806 | 0% | 0% | 18 | 411 | 0.69 | 71% |

A run took 40 to 110 seconds with embeddings cached; joining adds no
measurable time.

## Findings

1. **The reported outcome reproduces.** 58% of the comments and 39% of the
   articles have no topic as shipped.
2. **Relaxing the density requirement is not the remedy.** It lowers the
   Ungrouped share a little (58% to 44% of the comments at its lowest value)
   while multiplying topics (271 to 1,162) and small ones in particular (121
   to 779 under 20 documents). A larger Min topic size with a relaxed density
   gains nothing either. This is the "too many tiny topics" outcome the
   request set out to avoid.
3. **Letting passages join a topic works.** The topics do not change in number,
   and the Ungrouped share falls as far as the bar allows.
4. **One similarity number does not carry between corpora.** 0.5 leaves 18% of
   the comments Ungrouped but only 1% of the articles' documents, because the
   articles are all about one subject and every passage is fairly similar to
   some topic. A researcher would have to tune it per corpus without a way to
   know what the number means.
5. **A bar set per topic carries.** "At least as similar as the topic's own
   least similar passage" leaves 18% of the comments and 22% of the articles'
   passages (6% of documents) Ungrouped. It needs no number, and it has a
   property that can be stated plainly: no topic becomes looser than it
   already was. Similarity to the own topic falls slightly on the comments
   (0.63 to 0.61) and more on the articles (0.79 to 0.72, a rough figure
   there), which is the expected cost of including passages from the edge of
   each topic.

## Decision

- **Ungrouped passages**, an advanced setting of Topic Modelling, with three
  choices: **Stay Ungrouped** (the default, unchanged behaviour), **Join a
  topic they fit** (the per-topic bar above), and **Always join the nearest
  topic**. The request field is `ungrouped_passages`: `keep`, `fit`,
  `nearest`.
- Topic words stay those of the passages grouping put in each topic, so a
  topic's description does not shift with what joins it.
- The run reports how many passages joined and how many stayed Ungrouped.
- The suggestion shown when 30% or more of the documents are Ungrouped now
  points to this setting instead of Min and Max topic size.
- `min_samples` is available in polars-text for future measurement and is not
  offered in Wordflow.
- The default stays **Stay Ungrouped**. Changing it would change every
  existing user's results, and is a separate decision.

## Not measured

- Topic quality as judged by a reader. The two similarity columns say that
  joined passages sit near their topic; they do not say the topic still reads
  as one theme. A reading of examples on a known corpus should precede any
  change of default.
- The Multilingual model, Paragraph and Sentence passages, and Topic sampling
  combined with joining.
- Seeds other than 0.
