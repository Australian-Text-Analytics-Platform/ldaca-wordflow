<!-- markdownlint-disable MD033 -->

<h2 id="info-quotation-overview">About Quotation Extraction</h2>

Quotation Extraction identifies quoted speech, speakers, and speech verbs in
English news-style text. The built-in rules are based on the
[Gender Gap Tracker](https://github.com/sfu-discourse-lab/GenderGapTracker)
and were developed for Canadian news, so validate a representative sample when
working with another genre or English variety.

- **What do I select?**
  Add one Data Block and choose its source text column. A fresh selector uses
  the Data Block's document column preference when available, while a reopened
  result keeps the exact column it was made with.

- **Which engine should I use?**
  **Built-in** runs the bundled local quotation engine and requires no service
  configuration. **Remote** uses an engine ID configured by the deployment
  operator; it does not accept an arbitrary service URL. Ask the operator for a
  valid ID and confirm that the service's data-handling policy is suitable.

- **What do Preview and Run do?**
  **Preview** works out each page you open, from the data as it was when you
  chose Preview. **Run** can be started directly and finds every quotation.
  **Quotation Results** then shows the complete result and pages by quotation,
  one per row; click a row to open Row Details scrolled to the quote. **Add to Project** publishes selected
  columns as a new Data Block only when you request it.

- **How does sorting work?**
  The `QUOTE_extraction` header sorts by the selected source text column, and
  source metadata columns remain sortable. Generated quotation columns are
  display-only.

- **Where can I read more?**
  See the [open access article](https://doi.org/10.1515/cllt-2023-0104), the
  [ATAP overview](https://www.atap.edu.au/posts/quotation-tool/), or the full
  Quotation tutorial in Help.

- **Where can I get help?**
  Use the Feedback button in the sidebar to contact the Sydney Informatics Hub
  development team.
