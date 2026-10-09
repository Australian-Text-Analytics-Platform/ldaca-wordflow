-- New results calculate Study against Reference. Keep wire columns in source order.
SELECT * EXCLUDE (freq_corpus_0, freq_corpus_1, expected_0, expected_1,
                  corpus_0_total, corpus_1_total, percent_corpus_0, percent_corpus_1,
                  overuse, percent_diff),
       freq_corpus_1 AS freq_corpus_0, freq_corpus_0 AS freq_corpus_1,
       expected_1 AS expected_0, expected_0 AS expected_1,
       corpus_1_total AS corpus_0_total, corpus_0_total AS corpus_1_total,
       percent_corpus_1 AS percent_corpus_0, percent_corpus_0 AS percent_corpus_1,
       CASE overuse WHEN 'Reference' THEN 'Study' WHEN 'Study' THEN 'Reference'
                    ELSE 'Equal' END AS overuse,
       CASE WHEN freq_corpus_1 = 0 THEN NULL ELSE percent_diff END AS percent_diff
FROM ({})
