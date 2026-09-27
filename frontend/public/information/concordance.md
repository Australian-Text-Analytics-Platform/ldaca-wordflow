<!-- markdownlint-disable MD033 -->

<h2 id="info-concordance-overview">About Concordance Search</h2>

A concordance shows every match from the current source-document page with its
left and right context. It supports close reading, comparison, and dispersion
analysis without materializing a whole-corpus result in the browser.

- What do I select?
  Add one or two Data Blocks and choose a source text column for each. Document
  Column and Tokenizer Preferences initialize fresh selectors independently;
  reopening a tab restores its submitted Preview request or latest successful
  Run settings.

- Which search mode should I use?
  **Text** supports whole-word, regular-expression, and case-sensitive search
  over the selected source column. **Tokens** performs exact-token matching and
  requires a tokenizer for every selected Data Block before running. Fresh
  Concordance Analyses start in Text mode; selecting Tokens enables the
  tokenizer controls.

- How does punctuation affect context?
  Text mode starts with **Ignore punctuation** on. Punctuation and symbol-only
  tokens remain visible in the original context but do not consume the context
  count or become L1/R1. Search matching itself is unchanged. Tokens mode
  already filters punctuation through its tokenizer and therefore hides this
  Text-only option.

- How are Results paged?
  **Documents per page** controls how many source documents are evaluated for
  the current page. Documents without a match are omitted, while one document
  can produce several rows. Page, page-size, and source-metadata sort changes
  request only the needed Preview source page. Saved results query retained
  documents and matches independently of later Data Block changes.

- What can I sort?
  In separated Preview tables, selected source metadata is sortable and
  generated scalar headers explain that Run is required. After Run,
  separated saved tables also sort matched text, L1/R1, their frequencies and
  match offsets, with stable document/match tie-breaking. Full document and left/right
  context strings remain display-only, as do all combined-table headers.

- What are L1 and R1?
  **L1** is the token immediately left of a match; **R1** is the token immediately
  right. Their frequency columns count those values across the complete Run
  Result. Table View gives matched text strong source-colour emphasis, then
  highlights the last exact L1 occurrence in the left context and first exact
  R1 occurrence in the right context with a softer tint. Empty, missing, or
  case-mismatched anchors remain plain. **Highlight L1/R1 in context** is on by
  default and controls only those inline tints for the current tab session;
  direct L1/R1 cells remain plain.

- What do Preview and Run do?
  **Preview** calculates only the requested document page, without saving its request
  or output. Leaving the tab discards it. **Run** saves
  matching documents and occurrences privately in the project. **Saved results**
  reads those immutable outputs. Table pages matches; Dispersion pages documents.

- How do Dispersion controls work?
  Document bars and pagination appear above the matched-term legend and summary.
  Proportional is off by default. Turning it on scales bars by document length
  and hides the summary; legends and Clear selection remain available.
  Only saved Dispersion allows term hiding and point/bin selection. Preview
  supports inspection, zoom and downloads; KWIC Table remains unfiltered.
  Returning to Dispersion restores its selections. Add to Project captures the
  current presentation's filters and creates independently owned Data Blocks.

- Where can I get help?
  See the full Concordance tutorial in Help, or use the Feedback button in the
  sidebar to contact the Sydney Informatics Hub development team.
