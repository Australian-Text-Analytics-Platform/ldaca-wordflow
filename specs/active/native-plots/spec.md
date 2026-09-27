# Native Plots

Implement the approved Plots tool with independent Trends, Compare, Scatter,
Heatmap and Sankey named tabs. All modes use Run-only native task ownership,
retained typed source snapshots, derived DuckDB projections and original-row
publication. No project-schema change or Preview.

## Accepted behavior

- Trends: Count/Sum/Mean/Median, continuous date/numeric intervals, complete
  interval grid, Monday weeks, explicit aware-timestamp timezone, daily Calendar.
- Compare: Count/nonnegative Sum, stacked bars and optional normalization.
- Scatter: individual row identities, linear axes and optional bubble area.
- Heatmap: raw Count/Sum/Mean/Median, categorical cell selection.
- Sankey: ordered stages, Count/nonnegative Sum, selected transition union.
- Exact-case default; Uncased recomputes aggregates from the snapshot. NULL,
  blanks and literal category labels remain distinct.
- Normalization includes eligible hidden groups. Selection and zoom are local;
  presentation settings are durable. Publication creates independent original rows.
- Offline signed ICU assets; no runtime extension downloads or CMake switch.
- Benchmark before display limits; no silent truncation, sampling or rebinning.

## Archived Trends parity

| Behavior | Decision | Verification |
| --- | --- | --- |
| Named tabs, input, Run/Cancel/Clear | Preserve native lifecycle | Shared lifecycle regressions and browser/native Plots suites |
| Date/custom/numeric intervals and three grouping columns | Preserve | Concrete decoder, DuckDB tests and Request UI |
| Count | Default; add Sum/Mean/Median | Aggregation and unequal-group mean/median regressions |
| Categorical axis spacing | Replace with continuous positioning | Numeric/date axis model and exact-coordinate tests |
| Line/Area/Bar | Preserve smoothing; stack eligible Bar | Concrete chart model and stack eligibility tests |
| Empty periods | Explicit zero Count/Sum, gap Mean/Median | Native empty-interval and missing-measurement regressions |
| Legend, Uncased, group minimum | Preserve; minimum defaults to zero | Native case merging/minimum and denominator tests |
| Click/Shift/range, zoom and keyboard | Preserve | Shared chart interactions; browser/native keyboard and measured zoom; drag/Shift combinations need broader automated coverage |
| Original-row publication | Preserve using retained snapshot | Source-deletion, metadata and selected-row publication tests |
| SVG/PNG/JPEG | Preserve with complete context | Real browser downloads and native chooser saves |
| Calendar and explicit timezone | Approved additions | Browser/native Calendar, bundled ICU and DST checks |

Distributions, networks, chord, hierarchies, profiles, geography, intervals,
pie/donut, word clouds, ThemeRiver and 3D remain unavailable.
