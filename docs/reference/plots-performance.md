# Plots display capacity

Plots retains the complete typed source snapshot. Display budgets apply only to
chart projections; they never truncate or sample saved data. A rejected
projection leaves the refinement controls available and chart export disabled.
Trends checks its interval grid before expanding or sorting it.

The initial SVG display budgets are **100,000 plotted values**, **500 series**,
and **5,000 Sankey links**. A point, interval/group value, bar segment or Heatmap
cell counts as one plotted value. These are upper operational budgets, not a
promise of smooth interaction at every combination of limits. More modest
projections remain preferable for everyday exploration.

Users can increase Trends interval width, reduce grouping, merge case variants,
or increase minimum rows per group. For modes without a suitable result-level
refinement, prepare a narrower input in Preprocessing and Run again. Original-row
publication remains independent of the display budget.

## Local measurements, 25 September 2026

Controlled synthetic fixtures ran through the native DuckDB backend and ECharts
SVG rendering on the local Apple Silicon macOS host. Chrome 153 and the actual
Tauri WebKit 605.1.15 webview were measured separately at the normal three-pane
layout. Timings include driver overhead and are indicative, not isolated
microbenchmarks. The reproducible scenarios live in
`frontend/e2e-native/scenarios/plots.ts`; enable `PLOTS_BENCHMARK=1` and
`PLOTS_PROJECTION_BENCHMARK=1` when running the Plots browser/native suites.

| Projection | Chrome query/render | Tauri query/render |
| --- | ---: | ---: |
| Trends, 100 series and 100,000 interval values | 4,423 ms | 3,940 ms |
| Compare, 500 series and 10,000 segments | 936 ms | 369 ms |
| Heatmap, 100,000 cells | 4,260 ms | 2,830 ms |
| Sankey, 5,000 links | 796 ms | 257 ms |

Native SQL projection times for these fixtures ranged from 20–355 ms in the
Tauri run; source capture and successful Run took 42–170 ms. Browser measurements
were similar (24–361 ms for queries, 57–180 ms for Run).

| Scatter points | Chrome Run/reload/query/render | Tauri Run/reload/query/render | Chrome zoom | Tauri zoom |
| --- | ---: | ---: | ---: | ---: |
| 10,000 | 3,218 ms | 870 ms | 256 ms | 151 ms |
| 50,000 | 5,035 ms | 2,203 ms | 1,251 ms | 629 ms |
| 100,000 | 12,781 ms | 7,919 ms | 3,675 ms | 2,835 ms |

The 100,000-point case is a capacity ceiling with noticeable interaction latency.
No automatic sampling is applied. Limits may be revised only with measured
rendering and interaction evidence. A separate native million-row fixture retained three typed columns, projected
1,000 interval/group values and published 10,000 selected original rows. Capture
took 2.998 s, projection 0.915 s and publication 0.418 s; macOS reported a maximum
resident set of 343,883,776 bytes (328 MiB) for the isolated test process. This
includes fixture creation and DuckDB, not the browser/webview. Run the ignored
`million_row_snapshot_projection_and_publication` test under `/usr/bin/time -l`
to reproduce. Browser/webview peak memory and Windows/Linux rendering remain
unmeasured.

See [native analyses](../architecture/backend/native-analyses.md) for ownership
and [the native API](native-project-api.md) for typed projection interfaces.
