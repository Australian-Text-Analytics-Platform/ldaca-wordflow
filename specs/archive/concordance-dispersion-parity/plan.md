# Implementation

- Results owns shared display controls, transient filters and exact-case native
  density queries at 100 bins per immutable result/source.
- A pure dispersion model reaggregates supported display bins, groups case
  variants, assigns consistent term colors and builds chart options.
- Document rows, legends, charts and generated-byte downloads consume that model.
- A scoped ECharts component restores complete-dataset point/range hit testing,
  incremental zoom, keyboard access and SVG cleanup. Keep native synchronous SVG
  flushing and current theme tokens rather than restoring archived runtime code.
- Reuse existing query, publication, inspection and export boundaries.

Canonical behavior is documented in the frontend overview and Concordance tutorial.
