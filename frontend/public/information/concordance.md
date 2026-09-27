<!-- markdownlint-disable MD033 -->

<h2 id="info-concordance-overview">About Concordance Search</h2>

A concordance shows every match from the current source-document page with its
left and right context. It supports close reading, comparison, and dispersion
analysis without loading a whole-corpus result into the browser.

- What do I select?
  Add one or two Data Blocks and choose a source text column for each. Document
  column and tokeniser preferences fill in new selectors; reopening a result
  shows the exact values it was made with.

- Which search mode should I use?
  **Text** supports whole-word, regular-expression, and case-sensitive search
  over the selected source column. **Tokens** performs exact-token matching and
  requires a tokeniser for every selected Data Block before running. Fresh
  Concordance Analyses start in Text mode; selecting Tokens enables the
  tokeniser controls.

- How does punctuation affect context?
  Text mode starts with **Ignore punctuation** on. Punctuation and symbol-only
  tokens remain visible in the original context but do not consume the context
  count or become L1/R1. Search matching itself is unchanged. Tokens mode
  already filters punctuation through its tokeniser and therefore hides this
  Text-only option.

- How are Results paged?
  **Documents per page** controls how many source documents are evaluated for
  the current page. Documents without a match are omitted, while one document
  can produce several rows. Changing the page, page size or a metadata sort
  reuses the same result and the data as it was when the result was made; it
  does not read later edits to the Data Block.

- What can I sort?
  In separated Preview tables, selected source metadata is sortable and
  generated scalar headers explain that Run is required. After Run,
  separated tables also sort the matched text, L1/R1, their
  frequencies, and match offsets. Text ordering is case-sensitive and equal
  values have no guaranteed secondary order. Full document and left/right
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
  **Preview** works out only the page you open. **Run** can be started
  directly and finds every match in each selected Data Block. **Concordance
  Results** then shows the complete result. Table View pages matches.
  Dispersion View pages the documents that contain matches and charts one
  series per exact, case-sensitive term. After Run, hidden terms and selected
  bins also decide which documents, markers and counts are shown, and what
  **Add to Project** saves. From Table View it saves one row per match; from
  Dispersion View it saves one row per document, with the matches in
  `CONC_extraction`. With two Data Blocks, you can include either or both.

- Where can I get help?
  See the full Concordance tutorial in Help, or use the Feedback button in the
  sidebar to contact the Sydney Informatics Hub development team.
