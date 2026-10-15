# Wordflow 8.0.0

Wordflow uses a native Rust runtime, DuckDB projects and the familiar three-column
workspace on desktop and the server.

- Result Views attach retained Topics, Concordance and Quotation outputs to current
  source rows by exact text. Published outputs remain independent of analysis tabs.
- Ordered categories, Map values and on-demand Corpus overview extend SQL editing.
- Topics supports a hard maximum size, a requested count and retained adjustments.
- Annotation commits completed batches directly; Quotation retains partial results
  and supports explicit Resume.
- Transcript imports, reusable-cache maintenance and shared result downloads are
  available through their existing tools.
- Desktop Help uses bundled content, with native menu navigation and macOS search.

This installation keeps historical native analyses until an explicit Rerun.
The first new live-result publication upgrades a native project to format 2 and
requires this newer runtime. Legacy Python project migration is not provided.
