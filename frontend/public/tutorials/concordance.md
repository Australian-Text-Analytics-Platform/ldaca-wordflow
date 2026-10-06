<!-- markdownlint-disable MD033 MD041 -->

[← Back to Help home](./index.md)

<h1 id="help-concordance-section">Concordance</h1>

Concordance searches one or two Data Blocks for a word or phrase and shows each
match in context. It is useful for comparing how terms are used and where they
appear within documents.

<h2 id="help-concordance-parameters">Parameter panel</h2>

<h3 id="help-concordance-data-block">Step 1: Select your data</h3>

Add up to two Data Blocks and choose the source text column for each one. A
fresh selector initialises that choice from the Data Block's saved Document
Column Preference when it has one.

<h3 id="help-concordance-search-term">Step 2: Enter a search term</h3>

Enter the word, phrase, or token alternatives to find. Each result includes the
left context, matched text, right context, and any source metadata columns you
choose to display.

![Search term, context window, and search options](tutorials/assets/concordance/search_options.png)

<h4 id="help-concordance-search-mode">Search mode</h4>

- **Text** searches the original text column. Whole-word, regular-expression,
  and case-sensitive options apply in this mode.
- **Tokens** finds each term as one whole token, exactly as the tokeniser wrote
  it. A space, comma, or `|` between terms means *any of them*, not a phrase:
  `cat dog` finds every *cat* and every *dog*. A different word form is a
  different token (*went* does not find *go*). For a phrase or several word
  forms, use Text mode with a regular expression. The tokeniser lowercases
  tokens and drops punctuation, so Tokens mode always ignores capitals
  (*apple* also finds *Apple*) and has no **Case sensitive** or **Ignore
  punctuation** option.

Running Tokens mode requires a tokeniser model for every selected Data Block.
The selector saves each model as that Data Block's Tokeniser Preference,
separately from its Document Column Preference. A fresh Concordance Analysis
always starts in Text mode, including when every selected Data Block already has
a saved model or you arrive from Frequency. Select Tokens mode explicitly
to enable the tokeniser selectors, then choose or confirm a model for each
source. As in Frequency, each tokeniser in the list shows the language it is
for, and the link icon beside the selected tokeniser opens its project page.

Preview and Run keep the source columns, tokenisers, and search mode they were
started with, even if you later change a Data Block's tokeniser preference.

<h5 id="help-concordance-regex-toggle">Regular expressions</h5>

In Text mode, tick **Use regular expression** to search for a pattern instead of the exact text. This lets you find word variants, several terms at once, or more complex patterns. For example, `child\w*` finds any word starting with *child* followed by **zero** or more characters, such as *child*, *children*, and *childhood*. To find all the hashtags in your data, use `#\w+`: a hashtag followed by **one** or more characters. [Regular expressions](./ui.md#help-ui-regular-expressions) explains what a pattern is, with more examples and a cheat sheet.

| Pattern | What it matches |
|---|---|
| `child\w*` | Any word starting with *child* followed by zero or more characters |
| `child(ren)?` | *child* or *children* |
| `tax\|budget\|welfare` | Any one of the three words |
| `#\w+` | Any hashtag |
| `\w{2}-\d{4,6}` | IDs such as *SA-3988* or *id-4589* |

Use [regex101.com](https://regex101.com/) (choose the **Rust** flavour) to test unfamiliar patterns. **Whole
word** excludes partial-word matches, and **Case sensitive** keeps letter case
distinct: with it ticked, *Apple* finds *Apple* but not *apple*. It also decides
how the words just before and after a match (L1 and R1) are counted, and how
the matched text, L1 and R1 sort: with it off, the default, *The* and *the*
count as one word and sort together; their text keeps its own capitals. You can also
ask a generative AI tool to write a pattern for you, but carefully review and
test it before relying on the results. Whole word relies on spaces between words, so it does not apply to
Japanese, Chinese, Thai, or other text written without them: there it matches
anywhere, as if it were off.

<h5 id="help-concordance-unspaced-text">Japanese, Chinese, and other text without spaces</h5>

In Tokens mode, a tokeniser such as UniDic for Japanese splits an expression
into several short tokens. For example, *発表させていただきます* becomes
発表 / さ / せ / て / いただき / ます, so *させていただく* typed as one term
finds nothing, and *いただく* does not find *いただき*.

To find an expression with all its spellings and forms, use Text mode, tick
**Use regular expression**, and list the variants separated by `|`. For
example, `せていただ|せて頂|していただ|して頂` finds the expression written in
kana or with kanji, including the して variant. Check a few results by hand to
make sure the pattern finds nothing unrelated.

In Text mode, the context and **L1** / **R1** count stretches of text between
spaces or punctuation, and Japanese and Chinese have no spaces, so one "token"
can be a whole clause. For context counted in words, use Tokens mode.

<h3 id="help-concordance-context">Step 3: Set the context window</h3>

**Left context** and **Right context** control how many tokens appear around a
match. Both default to 10 and accept values from 0 to 50. In Text mode,
**Ignore punctuation** is on by default: punctuation and symbol-only tokens do
not consume those counts or become L1/R1, but the original punctuation and
whitespace remain visible in each context. This option does not change which
text or regular-expression matches are found. Tokens mode already applies its
tokeniser's punctuation filtering and does not show this option.

<h3 id="help-concordance-batch-size">Step 4: Choose documents per page</h3>

Concordance Preview is document-paged. **Documents per page** controls how many
source documents the current page evaluates: 10, 20, 50, 100, 200, 400, or
800. A page can contain fewer visible rows because documents without a match
are omitted, while a document with several matches contributes several rows.

The footer reports the matches and matching documents found after processing
the current source-document batch. An empty page does not mean later pages are
empty.

![Preview footer: matches found so far and Documents per page](tutorials/assets/concordance/documents_per_page.png)

<h2 id="help-concordance-run">Step 5: Preview</h2>

Choose **Preview** to see the first pages of matches. Each page is worked out
when you open it, from the data as it was when you chose Preview. See
[How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

<h2 id="help-concordance-results">Result panel</h2>

In separated Preview tables, selected source metadata headers are sortable.
Generated scalar headers such as the left and right contexts, matched text,
L1/R1 and frequencies show **Run to enable sorting** because Preview has not
processed the whole Result. The full document stays unsorted.

<h3 id="help-concordance-views">Table and dispersion views</h3>

<h4 id="help-concordance-table-view">Table view</h4>

Table view shows one row per match. Click a row to inspect the full source
document and its metadata. Use the metadata selector to add source columns to
the table.

![Table view after Run: the matched text is highlighted, and L1 and R1 are in the source colour](tutorials/assets/concordance/table_view.png)

**L1** (`CONC_l1`) is the token immediately left of the match and **R1**
(`CONC_r1`) is the token immediately right. Their frequency columns count each
value across the complete Run Result. The matched-text cell always uses
strong source-colour emphasis. The last L1 occurrence in the left context and
the first R1 occurrence in the right context are shown in bold text in the
source colour. An exact match is used when there is one; otherwise capitals are
ignored, because in Tokens mode L1 and R1 are lowercased tokens (*australian*
marks *Australian* in the context). Empty or unmatched anchors remain plain. The direct L1/R1
cells remain plain and available for sorting, frequencies, export, and
**Add to Project**.

**Highlight L1/R1 for sorting** is on by default and sets two things for the
current tab session: the L1/R1 colouring in the contexts, and how the context
headers sort.
While it is on, clicking the left context header sorts by L1 and clicking the
right context header sorts by R1, the usual way to read a concordance; each
header's tooltip says so. Turn it off to show the contexts in plain text and sort each context
alphabetically by its own text. With **Ignore punctuation** on, R1 can differ
from the first word of the right context, so the two sorts can give different
orders.

The table leaves out where each match starts and ends in the document
(`CONC_start_idx` and `CONC_end_idx`, character positions). A Data Block made
with **Add to Project** from Table view still includes both columns.

<h4 id="help-concordance-dispersion-view">Dispersion view</h4>

Dispersion view groups the current page by source document. Vertical marks show
the relative position of each match within the document. **Bar length
proportional to text length** scales bars by document length; with it off, all
bars use the same width for easier positional comparison.

![Dispersion view: one bar per document, with a mark at each match](tutorials/assets/concordance/dispersion_view.png)

Match markers and dispersion series use the colour assigned to their exact,
case-sensitive matched text. Colours come from the sorted union of term labels
for the Result and remain stable when terms are hidden.

<h4 id="help-concordance-tooltip">Hover details</h4>

![Hover tooltip on a dispersion bar](tutorials/assets/concordance/dispersion_tooltip.png)

Hover over a match line to see its immediate left context, matched text, and
right context.

<h3 id="help-concordance-summary-plot">Dispersion summary</h3>

When proportional bar length is off, the chart shows one series for each exact
matched term across relative-position bins. Preview derives its static legend
from the current page. After Run, the chart uses whole-Result density, so changing the table
page does not change the chart.

<h4 id="help-concordance-chart-type">Chart type</h4>

The chart, **Where matches occur in the documents**, has **Position in document
(%)** along the bottom and **Matches** up the side. Choose **Line**, **Bars**,
**Area**, or **Running total** from the **Chart** menu; **Running total** adds
up the matches from the start of the document to each position. This presentation choice applies to the
dispersion blocks in the current session. Bar charts use side-by-side series
with alternating section backgrounds at 4, 5, or 10 sections. At 20, 25, 50, or 100
sections, the series stack into one bar per section so the bars remain visible. Other
chart types are unchanged by the number of sections.

![The Chart menu](tutorials/assets/concordance/chart_type_menu.png)

<h4 id="help-concordance-bin-count">Sections</h4>

**Sections** divides each document, from start (0 %) to end (100 %), into 4,
5, 10, 20, 25, 50, or 100 equal parts. Changing the number clears the selected
sections, because the old ones no longer line up with the new boundaries.

<h4 id="help-concordance-bin-selection">Selecting bins</h4>

After Run, click anywhere inside the plot to select the bin nearest the vertical
axis pointer, and click it again to deselect it. **Shift-click** another bin to
select every bin between them; a reminder sits under the chart. As in Trends,
use the zoom buttons beside the chart or hold ⌘ on a Mac (Ctrl elsewhere) while scrolling over the chart. A plain scroll scrolls the page. Selected bins are shaded with a soft band across the chart, as in
Trends: in Line and Area charts their points become large solid dots while the
other points stay small hollow circles, and in Bar charts the unselected bars
are dimmed. **Clear selection** removes the bin filter. Click a legend term to
hide or show it. Visible terms intersected with selected bins control the
displayed documents, match markers, legend counts, and the documents that
**Add to Project** saves.
Each document row shades the selected range, so its match markers line up with
the selection (positions count characters, so emoji and other symbols count once).
Documents without a surviving match disappear. Preview has a static legend and
does not apply these filters. Select **Ignore capitals** beside a chart legend to merge
case variants into one series, colour, and summed legend count; for example,
`jobs (35)` and `Jobs (2)` become `jobs/Jobs (37)`. This checkbox is shared by
all separated charts and Combined view. Changing it restores all hidden legend
terms while preserving selected bins.

![Two bins selected: the legend shows selected / total matches for each term](tutorials/assets/concordance/dispersion_summary.png)

<h4 id="help-concordance-download">Download the plot</h4>

![Plot download dialog](tutorials/assets/concordance/download_dialog.png)

Download the current chart as PNG, SVG, JPEG or **Interactive HTML**. An image
download includes the visible term series, complete legend with hidden-state
indication, and active bin and term-filter summary.

**Interactive HTML** saves the chart as one web page that opens in any browser, offline: it shows the chart exactly as it is on screen (the same groups, selected bins, zoom and theme colours), and keeps its tooltips, a legend whose entries hide or show groups, and the zoom slider (hold Command on a Mac or Control on Windows while scrolling to zoom; plain scrolling moves the page). Its last line links to the Wordflow home page. It is a picture you can explore, not a copy of Wordflow: it cannot change the search or the terms, or add anything to a Project.

<h3 id="help-concordance-metadata">Show metadata</h3>

Open **Show metadata** and tick the source columns to display beside matches; the
number in brackets shows how many are shown.
With two Data Blocks, common columns and source-specific columns are grouped
and colour-coded. Generated Concordance columns are already part of the Result
and do not become source-metadata sort keys.

![Show metadata list with party and gender ticked](tutorials/assets/concordance/show_metadata.png)

<h3 id="help-concordance-display-mode">Separated and combined display</h3>

With two Data Blocks, **Separated** gives each source its own Result block and
sort state. **Combined** interleaves the current pages and colours rows by
source. Combined headers are display-only because one sort order cannot be
applied to two Data Blocks at once.

<h4 id="help-concordance-sources-mode">Combined filters</h4>

In Separated mode, each source has independent hidden terms and selected bins.
In Combined mode, one frontend-only filter is applied separately to both
source Results before their pages are interleaved. Terms, rather than sources,
remain the chart series: each line counts its term in both Data Blocks together,
which keeps the chart readable with several terms and works for area and bar
charts. A note under the chart title names the combined Data Blocks, and
downloads list them as combined. For one chart per Data Block, choose Separated
view.

<h3 id="help-concordance-run-all">Run and Concordance Results</h3>

**Run** can be started before or after Preview. It finds every match in each
selected Data Block and keeps the complete result for each. Run does not add
Data Blocks to the Project.

After Run, **Concordance Results** shows the complete result. Table view always shows **Matches per page**. Dispersion
view always shows qualifying **Documents per page**; filtering occurs before
sorting, counting, and paging, and the selected page size applies independently
to each source. After Run, there is no page-local Found summary.

![Concordance Results footer after Run: Matches per page and the whole-Result summary](tutorials/assets/concordance/review_footer.png)

After Run, separated Table view can sort selected metadata, the left and right
contexts (by L1 and R1 while **Highlight L1/R1 for sorting** is on), matched
text, L1/R1 and their frequencies across the complete Result. Sorting is
case-sensitive, except that the matched text, L1 and R1 (and the contexts
sorted by them) ignore capitals unless **Case sensitive** was on for the
search, so *The* and *the* sort as one word. Empty values (missing or blank)
come last in either direction. Rows with equal values keep their order in the Data
Block: by document, then by position in it, so matches of one word from one
document stay together in reading order. Rows are shaded in alternate bands by
source document, so consecutive matches from one document read as a group.
Clicking a header again reverses the order; **Original order** in the source's
header returns to the Data Block order. The document header remains plain, and
the combined table remains unsorted.

What you see is what you get: **Add to Project** from Table view writes the
matches in the order each source's table shows, sorted or in Data Block order.
Combined view is never sorted, so its Data Blocks keep the Data Block order, as
do Data Blocks added from Dispersion view.

After Run, the density chart always summarises the complete result, not only
the visible page.

Use **Add to Project** to create new Data Blocks after reviewing the
result. From Table view, **Add Concordance Matches to Project** creates a Data
Block with one row per match and the columns you select. From Dispersion view,
**Add Concordance Documents to Project** creates a Data Block with one row per
qualifying original row. It contains the required original document, required
`CONC_extraction` (surviving KWIC extractions joined with plain newlines), and
optional metadata. The document and extraction columns are locked on and
metadata starts off. Every source is checked by default; unchecking a source
hides but retains its controls, and at least one source must remain checked.
For multiple sources, enable **Sync columns** to limit optional choices to exact,
case-sensitive column names shared by every checked source. Existing shared
selections are combined when Sync columns is enabled, and individual changes or
**Select all** and **Select none** then apply to every checked source. Unchecked
sources keep their independent selections. Required document and extraction
columns remain locked on and are not synchronised. If fewer than two sources
remain checked, Sync columns turns off automatically.
Submitting the checked sources is atomic, including when a source has no
qualifying rows and therefore creates a schema-only Data Block.

You can search a Data Block made this way again. The new search replaces its
Concordance columns with its own, in the usual order, so the Data Block keeps
one set however many times you repeat this. The Concordance columns are
`CONC_left_context`, `CONC_matched_text`, `CONC_right_context`,
`CONC_start_idx`, `CONC_end_idx`, `CONC_l1`, `CONC_r1`, `CONC_l1_freq`,
`CONC_r1_freq` and `CONC_extraction`; a column of yours with one of these names
is treated the same way. If the text you search is itself one of them, for
example stacked `CONC_extraction` text, the Result keeps it as `CONC_source`
(or `CONC_source_2` if that name is taken).

![Add to Project after searching the CONC_extraction text of a Data Block made from a Concordance Result: the searched text is kept as CONC_source, with one fresh set of Concordance columns](tutorials/assets/concordance/search_again.png)

![Add Concordance Documents to Project, from Dispersion view](tutorials/assets/concordance/add_to_project.png)

<h3 id="help-concordance-clear-results">Clear results</h3>

**Clear** removes this tab's Preview and Run results. Settings are locked while
Preview or Run is working, and **Stop** cancels it. After a failure or a stop,
Preview and Run stay off until you choose **Clear**. See [How Preview, Run and Clear work](./ui.md#help-ui-preview-run-clear).

<h2 id="help-concordance-troubleshooting">Troubleshooting</h2>

| Symptom | Likely cause | What to try |
|---|---|---|
| No results on one page | The current source-document batch has no match | Continue to the next page |
| Tokens mode is unavailable | At least one selected Data Block has no source column | Select a source text column for every input |
| Too many partial matches | Whole word is off in Text mode | Tick **Whole word** (not for Japanese or Chinese, which have no spaces between words) |
| Tokens mode finds nothing for a phrase, or finds unrelated hits | Tokens mode matches one token at a time, and a space means *any of* | Use Text mode with a regular expression; see [text without spaces](#help-concordance-unspaced-text) |
| A regular expression fails | Invalid pattern syntax | Test the pattern on regex101.com with the Rust flavour |
| A generated Preview header does not sort | Sorting generated columns needs every match, which only Run processes | Run, then sort the separated table |
| Run is disabled | Inputs are incomplete or another Run is active | Complete the inputs or wait for the active Analysis |
| Preview does not show a later edit to the Data Block | Preview keeps the data as it was when you chose it | Choose **Preview** again after changing a setting |

<h2 id="help-concordance-defaults">Quick-reference defaults</h2>

| Setting | Default | Notes |
|---|---|---|
| Search mode | Text | Select Tokens explicitly to enable tokeniser selection |
| Left / Right context | 10 tokens each | Range 0–50 |
| Whole word | On | Text mode only; off while Use regular expression is ticked |
| Regular expression | Off | Text mode only |
| Case sensitive | Off | Text mode only (Tokens mode always ignores capitals); also decides whether L1/R1 counts and sorting ignore capitals |
| Ignore punctuation | On | Text mode only; punctuation remains visible but does not consume context tokens or become L1/R1; it never changes what the search or a regular expression matches |
| Documents per page | 20 | Controls source documents evaluated per Preview page |
| View | Table | Returning to Concordance starts in Table view |
| Highlight L1/R1 for sorting | On | Local table-display state: L1/R1 shown in the source colour, and context headers sort by L1/R1; off, the contexts are plain text (matched text stays emphasised) and sort by their text |
| Sections | 20 | 4, 5, 10, 20, 25, 50, or 100 |
| Chart | Line | Line, Bars, Area, or Running total |
| Term visibility after Run | All terms | Exact, case-sensitive labels |

## Practice exercise

1. Select a Data Block and Preview a Text-mode search with **Whole word** ticked.
2. Compare two source-metadata sort orders.
3. Switch to Preview Dispersion and compare the per-term series.
4. Run, open Dispersion view, hide a term, and select a bin range.
5. Compare **Add to Project** from Table view (one row per match) with
   Dispersion view (one row per document).
6. Change a setting, then choose **Preview** again and compare the new matches
   with the earlier ones.

[← Back to Help home](./index.md)
