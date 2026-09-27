# Implementation plan

1. Prototype DuckDB SQL calculations and benchmark against stored statistics.
2. Store the definition with each successful result. Keep count Tables immutable,
   capture unfiltered totals, and support legacy materialized artifacts.
3. Generalize tabular-artifact cleanup to remove Views before Tables in the same
   publication/clear/delete transaction. Preserve cancellation and task ownership.
4. Compare all statistics with the native library, including non-finite values
   and exact unsigned counts. Exercise lifecycle and browser/native scenarios.
5. Update canonical ownership/API documentation and the tutorial, regenerate its
   publication mirror, and record reproducible benchmark evidence.

The conditional performance gate was met. The [benchmark record](../../../docs/releases/2026-09-19-frequency-statistics-view.md)
records method, measured costs and limits. No extra runtime calculation engine,
cache, schema migration or general artifact-query interface is introduced.
