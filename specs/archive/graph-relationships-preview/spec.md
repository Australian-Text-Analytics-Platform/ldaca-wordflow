# Graph relationships and Quick Look summary

Current View SQL owns direct dependencies. `wordflow.edges` owns additional virtual
relationships; existing format-6 rows remain intact. Normal graph mode merges both
for visible Data Blocks, while dependency mode stays SQL-only. Solid/filled and
dashed/open arrows plus an accessible legend distinguish the relationships.
Materialize records registered direct sources transactionally as virtual parents.

Quick Look becomes an offline project summary with filesystem details, visible Data
Blocks, saved SQL-cell counts and expandable catalogue column names/types. Remove
its graph, edge reads and Dagre usage. Keep no data values, scripts or network I/O.
