<!-- markdownlint-disable MD033 -->

<h2 id="info-preprocessing-overview">About Data Builder</h2>

Filter, Group, Join, Aggregate, Sample, Deduplicate, Stack and Build derive Data
Blocks using DuckDB SQL. Their input Data Blocks stay unchanged. Column tools in
Data Editor add or replace columns in the selected Table or View, preserving its
identity. Map values edits exact text values and preserves unedited values.
Tables store values; Views stay live and support query-layer Undo. To store fixed rows, materialise the resulting
View from its graph menu. Sampling previews are illustrative and may differ from
later evaluations. The independent SQL console runs ordinary DuckDB scripts.

See the [preprocessing tutorial](../tutorials/preprocessing.md) for each tool and
its NULL, sampling and regex behaviour.
