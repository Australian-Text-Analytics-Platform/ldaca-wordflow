-- Frequency result version 2. CREATE VIEW stores this definition with the result;
-- later application changes must not rewrite an existing result's mathematics.
-- Keep numerical parity with ldaca-rs::text::frequency_stats (covered by tests).
WITH counts AS (
    SELECT coalesce(a.token, b.token) AS token,
           coalesce(a.frequency, 0::UBIGINT) AS freq_corpus_0,
           coalesce(b.frequency, 0::UBIGINT) AS freq_corpus_1
    FROM wordflow.{reference} a FULL OUTER JOIN wordflow.{study} b USING (token)
    WHERE coalesce(a.frequency, 0::UBIGINT) > 0 OR coalesce(b.frequency, 0::UBIGINT) > 0
), floating AS (
    SELECT *, freq_corpus_0::DOUBLE AS f0, freq_corpus_1::DOUBLE AS f1,
           {n0}::UBIGINT AS corpus_0_total, {n1}::UBIGINT AS corpus_1_total,
           {grand}::UBIGINT::DOUBLE AS grand
    FROM counts
), expected AS (
    SELECT *, (f0 + f1) * corpus_0_total::DOUBLE / grand AS expected_0,
           (f0 + f1) * corpus_1_total::DOUBLE / grand AS expected_1,
           f0 / corpus_0_total::DOUBLE AS p0, f1 / corpus_1_total::DOUBLE AS p1
    FROM floating
), measures AS (
    SELECT *, 2.0 * (
        CASE WHEN freq_corpus_0 > 0 THEN f0 * ln(f0 / greatest(expected_0, 1e-10)) ELSE 0.0 END +
        CASE WHEN freq_corpus_1 > 0 THEN f1 * ln(f1 / greatest(expected_1, 1e-10)) ELSE 0.0 END
    ) AS log_likelihood_llv
    FROM expected
), statistics AS (
    SELECT token, freq_corpus_0, freq_corpus_1, expected_0, expected_1,
           corpus_0_total, corpus_1_total, log_likelihood_llv,
           log_likelihood_llv - ln(grand) AS bayes_factor_bic,
           log_likelihood_llv / (grand * ln(greatest(least(expected_0, expected_1), 1e-10))) AS effect_size_ell,
           CASE WHEN log_likelihood_llv >= 15.13 THEN '****'
                WHEN log_likelihood_llv >= 10.83 THEN '***'
                WHEN log_likelihood_llv >= 6.63 THEN '**'
                WHEN log_likelihood_llv >= 3.84 THEN '*' ELSE '' END AS significance,
           p0 * 100.0 AS percent_corpus_0, p1 * 100.0 AS percent_corpus_1,
           (p0 - p1) * 100.0 / CASE WHEN freq_corpus_1 = 0 THEN 1e-18 ELSE p1 END AS percent_diff,
           p0 / p1 AS relative_risk,
           log2((CASE WHEN freq_corpus_0 = 0 THEN 0.5 ELSE f0 END / corpus_0_total::DOUBLE) /
                (CASE WHEN freq_corpus_1 = 0 THEN 0.5 ELSE f1 END / corpus_1_total::DOUBLE)) AS log_ratio,
           (f0 / (corpus_0_total - freq_corpus_0)::DOUBLE) /
                (f1 / (corpus_1_total - freq_corpus_1)::DOUBLE) AS odds_ratio
    FROM measures
)
SELECT *, CASE WHEN percent_corpus_0 > percent_corpus_1 THEN 'Reference'
               WHEN percent_corpus_0 < percent_corpus_1 THEN 'Study' ELSE 'Equal' END AS overuse,
       sign(percent_corpus_0 - percent_corpus_1) * abs(log_likelihood_llv) AS signed_ll
FROM statistics
