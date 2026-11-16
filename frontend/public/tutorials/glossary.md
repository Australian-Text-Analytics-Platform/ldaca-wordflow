<!-- markdownlint-disable MD033 MD041 -->

[← Back to Help home](./index.md)

<h1 id="help-glossary-section">Glossary</h1>

Wordflow uses some words of its own, and some technical words that text
analysis cannot do without. This page says what each one means in a sentence or
two and links to the Help page that explains it in full.

The words are in three groups, each in alphabetical order:

- [Wordflow's own words](#help-glossary-wordflow): names Wordflow gives to its
  own parts, such as **Data Block** and **passage**.
- [Words from text analysis](#help-glossary-text-analysis): terms researchers
  in corpus linguistics and related fields use, such as **token** and
  **concordance**.
- [Words from AI and computing](#help-glossary-computing): terms you meet when
  a tool uses an AI model or another computer, such as **API key**.

<h2 id="help-glossary-wordflow">Wordflow's own words</h2>

<h3 id="help-glossary-analysis-tab">Analysis tab</h3>

One analysis inside a tool, with its own Data Blocks, settings and results. A
tool can hold several, named with the tool's letter and a number, such as
**F-1** in Frequency, so you can keep several analyses side by side.
See [Tool Interface](./ui.md#help-ui-tool-interface).

<h3 id="help-glossary-basic-advanced">Basic and Advanced</h3>

Some tools have an **Advanced** switch at the top right of their settings. With
it off (Basic), you see only the settings a first run needs, and every hidden
setting uses its standard value. See
[Using Wordflow](./ui.md#help-ui-tool-mode).

<h3 id="help-glossary-brief">Brief and Task context</h3>

Two short texts you can write for Annotation. The **Brief** tells the
AI Code Designer what your coding is for, so it can draft codes; it is not sent
when texts are annotated. **Task context** says what the texts are and what the
codes are for; it is saved with the Codebook and sent with every AI annotation.
See [AI Code Designer](./annotation.md#help-annotation-code-designer) and
[Set up the source and Codebook](./annotation.md#help-annotation-setup).

<h3 id="help-glossary-codebook">Codebook</h3>

The list of codes you want to apply in Annotation, each with a description
that says when it applies. In Wordflow a Codebook is a Data Block with a column
of codes and a column of descriptions, so it can be edited, exported and
reused. See
[Set up the source and Codebook](./annotation.md#help-annotation-setup).

<h3 id="help-glossary-contextual-hint">Contextual Hint</h3>

A short tip that shows you the next control to use as you reach a step for the
first time. Once you acknowledge it, it does not appear again until you reset
the hint history. See
[Contextual Hints](./settings.md#help-settings-contextual-hints).

<h3 id="help-glossary-data-block">Data Block</h3>

A table of data inside a Project, and the unit every tool works on. Each row is
one unit of text, such as a document, a post, a comment or a speech, and each
column holds the text or a piece of information about it, such as its date or
author. Every tool takes Data Blocks in, and its results can become new Data
Blocks, so the output of one tool can be the input of another.

A Data Block comes about in one of three ways:

- **From your files.** The Data Loader makes one from the files you upload or
  import, for example a corpus of texts or a spreadsheet. See
  [Add file to Project](./data-loader.md#help-data-loader-add-button).
- **From another Data Block.** The Data Builder makes a new one by filtering,
  grouping, joining, segmenting, sampling, deduplicating or stacking, and
  leaves its source unchanged. See [Data Builder](./preprocessing.md).
- **From a result.** **Add to Project** in an analysis tool turns a result into
  one, for example one row for each Concordance match or each quotation. See
  [How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

A Codebook is a Data Block too. See also [Data Blocks](./ui.md#help-ui-data-selection).

<h3 id="help-glossary-data-editor-builder">Data Editor and Data Builder</h3>

Two places to prepare data. The **Data Editor** shows a Data Block as a table
and changes its columns in place, for example cleaning text or converting a
date. The **Data Builder** makes a new Data Block and never changes its source.
See [Data Editor](./ui.md#help-ui-data-viewer) and
[Data Builder](./preprocessing.md).

<h3 id="help-glossary-juxtorpus">Juxtorpus</h3>

The word cloud that compares two Data Blocks in Frequency. It shows the words
used most distinctively by each one. See
[Juxtorpus](./token-frequency.md#help-token-frequency-unified-word-cloud).

<h3 id="help-glossary-ordered-scale">Ordered scale</h3>

A Codebook setting for codes that are levels from low to high, such as a
rating, rather than separate categories. The first code is the lowest; a code
such as **Not applicable** can sit outside the scale. AI annotation then rates
each text on the scale, and Compare to uses weighted Kappa and ordinal Alpha.
See [Ordered scales](./annotation.md#help-annotation-scale).

<h3 id="help-glossary-passage">Passage</h3>

A piece of a document that Topic Modelling reads as one unit: a paragraph, a
few short paragraphs together, or a sentence, depending on the **Passages**
setting, and never longer than **Max tokens**. Topics are groups of similar
passages, not of whole documents, so a long document can belong to several
topics. See
[Passages](./topic-modeling.md#help-topic-modeling-segmentation-method).

<h3 id="help-glossary-preview-run-result">Preview, Run and Result</h3>

**Preview** works out the first few pages so you can check your settings
quickly. **Run** works through all of your data. The **Result** is what a Run
produces; it stays with its tab until you choose **Clear results**, and
**Add to Project** makes a Data Block from it. See
[How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

<h3 id="help-glossary-project">Project</h3>

A saved container for your Data Blocks, analysis tabs and results: one piece of
research, kept together. See
[Project manager overview](./data-loader.md#help-data-loader-workspace-manager).

<h3 id="help-glossary-project-graph">Project Graph</h3>

The picture of a Project at the top right: each Data Block is a box, and lines
show which Data Block was made from which. See
[Project Graph](./ui.md#help-ui-workspace-graph-view).

<h3 id="help-glossary-study-reference">Study corpus and Reference corpus</h3>

The two sides of a comparison in Frequency. The **Study corpus** is the
collection whose key words you want to find; the **Reference corpus** is the
baseline it is compared against. See
[Study and Reference corpora](./token-frequency.md#help-token-frequency-reference).

<h3 id="help-glossary-suggestion">Suggestion</h3>

A reminder, marked with a lightbulb, that appears when a result or a run looks
off, and points to the settings that may help. See
[Suggestions](./settings.md#help-settings-suggestions).

<h3 id="help-glossary-topic">Topic</h3>

In Topic Modelling, a group of passages that are similar in meaning, shown as a
bubble with the words that set it apart. See
[Topic Modelling](./topic-modeling.md#help-topic-modeling-section).

<h3 id="help-glossary-ungrouped">Ungrouped and Joined</h3>

A passage is **Ungrouped** when it is not close enough to any group of similar
passages to belong to a Topic. A **Joined** passage was Ungrouped at first and
was then added to the topic it fits, because the **Ungrouped passages** setting
allowed it. See [Ungrouped](./topic-modeling.md#help-topic-modeling-ungrouped)
and
[Ungrouped passages](./topic-modeling.md#help-topic-modeling-ungrouped-passages).

<h3 id="help-glossary-view">View</h3>

One of the tools in the left sidebar, such as Frequency or the Data Builder.
See [Views](./ui.md#help-ui-tool-choice).

<h2 id="help-glossary-text-analysis">Words from text analysis</h2>

<h3 id="help-glossary-annotation">Annotation, code and coding</h3>

**Annotation** (also called coding) gives each text one **code**: a label from
your Codebook, such as *positive* or *about housing*. You can code by hand, or
let an AI model suggest the codes for you to review. See
[Annotation](./annotation.md#help-annotation-section).

<h3 id="help-glossary-concordance">Concordance</h3>

A list of every place a word or phrase occurs, each shown with the words before
and after it (its **context**), so you can read how the term is used. Also
called key word in context (KWIC). The context is counted in tokens. See
[Concordance](./concordance.md#help-concordance-section).

<h3 id="help-glossary-corpus">Corpus</h3>

A collection of texts gathered for study; the plural is *corpora*. In Wordflow
a corpus is a Data Block with a text column.

<h3 id="help-glossary-dispersion">Dispersion</h3>

Where in each document the matches of a search fall: near the start, spread
throughout, or bunched together. See
[Dispersion view](./concordance.md#help-concordance-dispersion-view).

<h3 id="help-glossary-document">Document</h3>

One text in a corpus: an article, a post, a transcript, a speech. In a Data
Block, one document is one row.

<h3 id="help-glossary-duplicate">Duplicate and near-duplicate</h3>

Rows are **duplicates** when they match in the columns you choose to compare.
With **Match near-duplicate text**, texts also match when they differ only in
capital letters, spacing or punctuation, and optionally in web links and
@mentions. Deduplicate keeps the first row of each set and saves every matched
row in a second Data Block, so you can check what was treated as the same. See
[Deduplicate](./preprocessing.md#help-preprocessing-dedupe-section).

<h3 id="help-glossary-frequency">Frequency and normalised frequency</h3>

**Frequency** is how often a token occurs. **Normalised frequency** is that
count for each million tokens (or words) of text, so collections of different
sizes can be compared fairly. See
[List view](./token-frequency.md#help-token-frequency-list-view) and, for
change over time, [Show as](./sequential-analysis.md#help-sequential-show-as).

<h3 id="help-glossary-reliability">Intercoder reliability: Kappa and Alpha</h3>

How far two coders, or a coder and an AI model, give the same texts the same
codes. **Percent Agreement** counts exact matches. **Cohen's Kappa** and
**Krippendorff's Alpha** also correct for the agreement chance alone would
give: 1 is perfect, 0 is no better than chance. On an
[ordered scale](#help-glossary-ordered-scale), **weighted Kappa** and
**ordinal Alpha** count a near miss, such as Medium against High, as a smaller
disagreement than a far one. See
[Reliability statistics](./annotation.md#help-annotation-reliability).

<h3 id="help-glossary-keyword">Keyword analysis and log-likelihood</h3>

**Keyword analysis** finds the words that are unusually frequent in one
collection (the Study corpus) compared with another (the Reference corpus).
**Log-likelihood** (LL) says how sure we can be that such a difference is not
chance: above 3.84 it is statistically significant (p < 0.05). **Overuse** says
which side uses the word relatively more. See
[Keyword Analysis](./token-frequency.md#help-token-frequency-statistical-measures).

<h3 id="help-glossary-metadata">Metadata</h3>

Information about each text rather than the text itself, such as its date,
author, source or speaker. In a Data Block, metadata are the columns beside the
text column. You can filter and group by them, or follow them over time in
Trends.

<h3 id="help-glossary-quotation">Quotation, speaker and speech verb</h3>

A **quotation** is what someone is reported to have said, in quotation marks or
as reported speech. Quotation Extraction finds each one with its **speaker**
and the **speech verb** that introduces it (*said*, *claimed*). The **quote
type** records the order of these parts in the sentence. See
[Quote types](./quotation.md#help-quotation-quote-types).

<h3 id="help-glossary-regular-expression">Regular expression</h3>

A short pattern that describes the text you are looking for, rather than the
exact text. One pattern can find both *colour* and *color*, or every year
written as four digits. See
[Regular expressions](./ui.md#help-ui-regular-expressions).

<h3 id="help-glossary-sample-seed">Sample and seed</h3>

A **sample** is a part of your data picked at random, used when the whole is
too large or too slow to work with. The **seed** is a number that fixes the
random choice: the same seed picks the same sample again, so a result can be
repeated. See [Sample](./preprocessing.md#help-preprocessing-slice-section) and
[Seed](./topic-modeling.md#help-topic-modeling-random-seed).

<h3 id="help-glossary-stop-words">Stop words</h3>

Words you choose to hide from results because they are very common and carry
little meaning for your question, such as *the* and *and*. They are still
counted; the list only changes what is shown. See
[Stop words](./token-frequency.md#help-token-frequency-stop-words).

<h3 id="help-glossary-token">Token</h3>

One unit that a text is split into for counting: usually a word, sometimes a
part of a word, a number or a symbol. Counts, context lengths and limits in
Wordflow are given in tokens, so the number of tokens in a text is usually
close to, but not the same as, its number of words.

<h3 id="help-glossary-tokeniser">Tokeniser</h3>

The rule or model that splits text into tokens. Different tokenisers split the
same text differently, so the tokeniser you choose changes the counts.

**Plain words**, Wordflow's standard choice for languages that put spaces
between words, splits at spaces and punctuation and ignores capital letters:
*high-school* becomes **high** and **school**, *don't* becomes **don** and
**t**, *father's* becomes **father** and **s**, *#climate* becomes **climate**,
and punctuation marks are not counted. The other tokenisers were made by other
groups: one is a model trained on English, and the others use dictionaries for
Chinese, Japanese and Korean. Each splits text in its own way, and the
**About** link beside the tokeniser list opens its makers' page. See
[Select your data](./token-frequency.md#help-token-frequency-data-block).

<h3 id="help-glossary-topic-modelling">Topic modelling</h3>

A way of finding recurring themes in a collection without deciding the themes
in advance: the computer groups pieces of text that are similar in meaning, and
you interpret and name the groups. See
[Topic Modelling](./topic-modeling.md#help-topic-modeling-section).

<h3 id="help-glossary-word-cloud">Word cloud</h3>

A picture of the most frequent tokens, with larger words for higher counts. It
gives a quick impression; use the frequency list when you need exact figures.
See [Cloud view](./token-frequency.md#help-token-frequency-cloud-view).

<h2 id="help-glossary-computing">Words from AI and computing</h2>

<h3 id="help-glossary-ai-provider">AI provider, model and API key</h3>

An **AI provider** is a service, or a server of your own, that runs AI language
**models**. An **API key** is the password that service gives you so that
Wordflow can use it on your behalf; use of a paid service is charged to that
key's owner. Texts you annotate with a provider are sent to it. See
[Generative AI](./settings.md#help-settings-servers-ai).

<h3 id="help-glossary-cache">Cache</h3>

Results of slow steps that Wordflow keeps so later runs on the same text are
faster. Clearing a cache frees disk space and changes nothing in your Projects.
See [Tool caches](./ui.md#help-ui-tool-caches).

<h3 id="help-glossary-embedding">Embedding model</h3>

The model Topic Modelling uses to read each passage and turn it into numbers,
so that passages about the same subject end up close together and can be
grouped. See
[Model](./topic-modeling.md#help-topic-modeling-embedding-model).

<h3 id="help-glossary-gpu">GPU and Remote GPU</h3>

A **GPU** is a kind of processor that runs AI models much faster than an
ordinary one. **Remote GPU** lets Topic Modelling read your text on a server
that has one, if you have access to such a server; most people do not, and
Topic Modelling works without it. See
[Remote GPU](./topic-modeling.md#help-topic-modeling-remote-gpu).

<h3 id="help-glossary-prompt">Prompt and thinking</h3>

The **prompt** is the instruction sent to an AI model with each request, such
as how to choose a code. **Thinking** lets a model reason step by step before
it answers, which helps with subtle codes and makes each request slower and
more costly. See [AI workflow](./annotation.md#help-annotation-ai) and
[Thinking](./annotation.md#help-annotation-thinking).

<h3 id="help-glossary-server">Desktop app and Wordflow server</h3>

Wordflow runs either as a **desktop app**, where your files and Projects stay
on your computer, or on a **Wordflow server** that you open in a web browser,
where they are kept on that server under your account. A few settings differ
between the two; the [Settings](./settings.md) page says which.
