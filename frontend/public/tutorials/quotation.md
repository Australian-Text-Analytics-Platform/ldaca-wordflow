<!-- markdownlint-disable MD033 MD041 -->

[← Back to tutorial index](./index.md)

<h1 id="help-quotation-section">Quotation Extraction tutorial</h1>

Quotation Extraction identifies quoted speech, speakers, and speech verbs in
English news-style text. The built-in rule-based engine is based on the
[Gender Gap Tracker](https://github.com/sfu-discourse-lab/GenderGapTracker)
work from Simon Fraser University's Discourse Processing Lab.

The rules were developed for Canadian news. Results may be less accurate for
social media, fiction, historical documents, or other English varieties.
Review a representative sample before drawing conclusions from the output.

<h2 id="help-quotation-parameters">Parameter panel</h2>

<h3 id="help-quotation-data-block">Step 1: Select your data</h3>

Add one Data Block and choose the source text column. A fresh selector uses the
Data Block's saved Document Column Preference when available. The Analysis
records the exact Data Block and column used for the run.

<h3 id="help-quotation-engine">Step 2: Choose the engine</h3>

The engine is an Analysis parameter in the Quotation panel:

- **Built-in** is the default and runs the bundled local quotation engine. It
  needs no separate service, URL, or user configuration.
- **Remote** sends the work to an endpoint configured by the deployment
  operator. Enter the operator-provided **Engine id**. Wordflow does not accept
  arbitrary service URLs from the browser, and an unknown ID is rejected.

![Quotation engine set to Remote, with the Engine id field](tutorials/assets/quotation/engine_remote.png)

Use Remote only when the administrator of your Wordflow deployment has given
you a valid engine ID and its data-handling policy is appropriate for the text.
Each result records `Built-in` or the remote engine ID it used, never a server
address.

<h3 id="help-quotation-context-length">Step 3: Set display context</h3>

**Context** (words per side), in the Result panel header beside **Show
metadata**, controls how much source text the Result table displays around the
highlighted quotations. It only changes what is shown, so changing it never
needs a new Preview.

- Default: 5 words per side.
- Range: 0–2000.
- Use 0 to keep the display close to the extracted speaker, quote, and verb.

<h2 id="help-quotation-run">Step 4: Preview</h2>

Choose **Preview** to see the first pages of quotations. Each page is worked out
when you open it, from the data as it was when you chose Preview. After a
Preview, the button turns on again when you change the Data Block, text column
or engine. See [How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

<h2 id="help-quotation-results">Result panel</h2>

The table pages through source documents and omits documents with no extracted
quotation. A source document can contribute several quotation rows.

![Quotation Preview: each row marks the speaker, verb, and quote, with its quote type at the end](tutorials/assets/quotation/results.png)

| Colour | Entity | Meaning |
|---|---|---|
| Blue | Speaker | The person attributed as speaking |
| Green | Quote | The quoted text |
| Violet | Verb | The speech verb, such as *said* or *argued* |

To see more rows at once, drag the table's bottom-right corner down
(double-click the corner to let it fill the space again).

Click a row to inspect the full source document in Row Details, which opens
scrolled to the highlighted quote. The metadata selector (**Show metadata**)
can add source columns and generated quotation columns to the table. Date and
date-time columns are shown as dates. The
`QUOTE_extraction` document header sorts by the selected text column. Other
metadata headers can be sorted too. Generated quotation headers cannot be
sorted in Preview, because Preview finds quotations one page at a time.

![Row Details for a quotation: quote type, speaker, verb, quote, and the document scrolled to the quote](tutorials/assets/quotation/row_details.png)

Changing the page, **Documents per page**, or sort order works out that page
again from the same Preview. It does not change the Preview.

<h3 id="help-quotation-run-all">Run and Quotation Results</h3>

Choose **Run** at any time to find every quotation in the Data Block. Later
edits to the Data Block do not change the result, and Run does not add a Data
Block to the Project. After Run, **Quotation Results** shows the complete
result and pages by quotation: each row is one quotation with its `QUOTE_*`
columns, so a page never grows unexpectedly long. Click a row to open **Row
Details**, where the document scrolls to the quotation and the metadata below
it shows which document the extract comes from. After Run, the results do not
show the Preview page summary.

Use **Add to Project** to publish selected Result columns as a new Data
Block. The document column is required, metadata columns start unselected, and
analysis columns start selected. You can run Quotation on that Data Block again:
the new run replaces its Quotation columns (`QUOTE_extraction`, `QUOTE_speaker`,
`QUOTE_quote`, `QUOTE_verb`, `QUOTE_quote_type` and the other `QUOTE_` fields)
with its own, so it keeps one set; a column of yours with one of these names is
treated the same way. If the text you search is itself one of them, for example
`QUOTE_extraction`, the Result keeps it as `QUOTE_source` (or `QUOTE_source_2`
if that name is taken).

![Add to Project after running Quotation on the QUOTE_extraction text of a Data Block made from a Quotation Result: the text is kept as QUOTE_source, with one fresh set of Quotation columns](tutorials/assets/quotation/run_again.png)

<h3 id="help-quotation-quote-types">Quote types</h3>

Each extract has a **Quote type** (`QUOTE_quote_type`), which Row Details also
explains in words. Most types are letter codes that list the parts of the quote
in the order they appear in the sentence: **Q** a quotation mark, **C** the
quoted content, **V** the speech verb, and **S** the speaker.

| Quote type | Example | Meaning |
|---|---|---|
| QCQVS | "We will act," said the minister. | Quote in quotation marks, then verb, then speaker |
| QCQSV | "We will act," the minister said. | Quote in quotation marks, then speaker, then verb |
| SVQCQ | The minister said, "We will act." | Speaker, then verb, then quote in quotation marks |
| SVC | The minister said the government would act. | Reported speech: speaker, then verb, then quote, with no quotation marks |
| CSV, CVS | The government would act, the minister said. | Reported speech with the quote first |
| QCQ | A quoted sentence straight after another quote | A floating quote: it continues the previous quote and takes its speaker, so it has no verb |
| AccordingTo | According to the minister, the government will act. | The speaker is introduced with "according to" |
| Heuristic | Any other text in quotation marks | Found by a fallback rule for quotation marks; the nearest verb and speaker are used and may be missing |

Other orders of the same letters follow the same pattern.

The exported columns `QUOTE_speaker`, `QUOTE_verb`, and `QUOTE_quote` hold the
text of each part, and their `_start_idx` and `_end_idx` columns give its
character positions in the document, so each part can be located or marked up
in other software.

<h3 id="help-quotation-clear-results">Clear results</h3>

The tab keeps its results when you move to another tool or reopen the Project.
**Clear** removes them. Settings are locked while Preview or Run is working,
and **Stop** cancels it. After a failure or a stop, Preview and Run stay off
until you choose **Clear**. See [How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

<h2 id="help-quotation-troubleshooting">Troubleshooting</h2>

| Symptom | Likely cause | What to try |
|---|---|---|
| Remote engine is rejected | The ID is empty or not configured by the operator | Use **Built-in** or ask the deployment administrator for a valid ID |
| No quotations are shown on one page | The current source-document batch has no extracted quote | Continue to the next page |
| Precision is low | The text differs from the news style targeted by the rules | Review the disclaimer and validate a representative sample |
| A generated header does not sort | Preview finds quotations one page at a time | Sort by the document header or metadata |
| Preview does not show a later edit to the Data Block | Preview keeps the data as it was when you chose it | Choose **Preview** again after changing a setting |

<h2 id="help-quotation-defaults">Quick-reference defaults</h2>

| Setting | Default | Notes |
|---|---|---|
| Engine | Built-in | Remote requires an operator-configured engine ID |
| Context length | 5 words per side | Display only, range 0 to 2000 |
| Preview data | The data when you chose Preview | Each page is worked out when you open it |

## Practice exercise

1. Select a news Data Block and Preview with the built-in engine.
2. Inspect highlighted speaker, quote, and verb spans in several rows.
3. Change the display context length.
4. Sort by the virtual document header and a source metadata column.
5. Run, inspect **Quotation Results**, and use **Add to Project** if you need a new
   Data Block.

[← Back to tutorial index](./index.md)
