# Production findings from the test audit

These findings are outside the test-only implementation. No production code has
been changed to resolve them.

## Missing left neighbour in text-mode concordance

For `the quick brown`, searching for `the` with two context tokens produces an
empty left context but `l1 == "the"` in the native expression. The token-based
backend implementation reports no left neighbour for this position. This can
inflate the left-neighbour frequency of a word that starts a document.

A focused strict expected-failure regression lives in
`polars-text/tests/test_concordance.py` as
`test_concordance_document_start_has_no_left_neighbour`. A fix will produce an
unexpected pass until that marker is removed. The backend cross-mode comparison
now compares all remaining fields, instead of its previous row-count-only check.

## Writer and inference investigation

The Parquet readback mismatch was a test-reader issue: file-level Arrow metadata
is available from the Parquet reader builder but omitted from its emitted batch
schemas. The writer test checks the recovered metadata and every batch value.

Five mutations of the SDK's numeric inference were tried in disposable copies.
The first strengthened fixture caught two; three survived because compatible
floating-point promotion and unsigned values were untested. Adding exact signed,
unsigned, fractional and null cases caught all five. No numeric production defect
was found by these checks.
