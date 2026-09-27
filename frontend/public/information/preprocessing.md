<!-- markdownlint-disable MD033 -->

<h2 id="info-preprocessing-overview">About Data Preprocessing</h2>

Filter, Sample, Join, Stack and Build create new live Views using DuckDB.
Their input Data Blocks stay unchanged. Find adds or replaces a column in its
selected Table or View, preserving the Data Block’s identity. Tables store values;
Views stay live and support query-layer Undo. To store fixed rows, materialize the resulting
View from its graph menu. Sampling previews are illustrative and may differ from
later evaluations. The independent SQL console runs ordinary DuckDB scripts.

See the [preprocessing tutorial](../tutorials/preprocessing.md) for each tool and
its NULL, sampling and regex behavior.
