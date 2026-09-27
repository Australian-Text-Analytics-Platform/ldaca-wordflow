use std::collections::{BTreeSet, HashMap};

/// One token's comparison between two corpora. Undefined ratios retain IEEE NaN/infinity.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FrequencyStats {
    pub token: String,
    pub freq_corpus_0: u64,
    pub freq_corpus_1: u64,
    pub expected_0: f64,
    pub expected_1: f64,
    pub corpus_0_total: u64,
    pub corpus_1_total: u64,
    pub log_likelihood_llv: f64,
    pub bayes_factor_bic: f64,
    pub effect_size_ell: f64,
    pub significance: &'static str,
    pub percent_corpus_0: f64,
    pub percent_corpus_1: f64,
    pub percent_diff: f64,
    pub relative_risk: f64,
    pub log_ratio: f64,
    pub odds_ratio: f64,
}

/// Compare counts in lexical token order. Both nonempty corpora must have positive totals.
pub fn frequency_stats(
    a: &HashMap<String, u64>,
    b: &HashMap<String, u64>,
) -> anyhow::Result<Vec<FrequencyStats>> {
    let total = |counts: &HashMap<String, u64>| {
        counts.values().try_fold(0u64, |sum, n| {
            sum.checked_add(*n)
                .ok_or_else(|| anyhow::anyhow!("corpus total exceeds u64"))
        })
    };
    let n0 = total(a)?;
    let n1 = total(b)?;
    if n0 == 0 && n1 == 0 {
        return Ok(Vec::new());
    }
    anyhow::ensure!(
        n0 > 0 && n1 > 0,
        "both corpora must have a positive total frequency"
    );
    let grand =
        n0.checked_add(n1)
            .ok_or_else(|| anyhow::anyhow!("combined corpus total exceeds u64"))? as f64;
    let tokens: BTreeSet<_> = a.keys().chain(b.keys()).collect();
    Ok(tokens
        .into_iter()
        .filter_map(|token| {
            let c0 = a.get(token).copied().unwrap_or(0);
            let c1 = b.get(token).copied().unwrap_or(0);
            if c0 == 0 && c1 == 0 {
                return None;
            }
            let f0 = c0 as f64;
            let f1 = c1 as f64;
            let e0 = (f0 + f1) * n0 as f64 / grand;
            let e1 = (f0 + f1) * n1 as f64 / grand;
            let ll = 2.0
                * (if c0 > 0 {
                    f0 * (f0 / e0.max(1e-10)).ln()
                } else {
                    0.0
                } + if c1 > 0 {
                    f1 * (f1 / e1.max(1e-10)).ln()
                } else {
                    0.0
                });
            let p0 = f0 / n0 as f64;
            let p1 = f1 / n1 as f64;
            Some(FrequencyStats {
                token: token.clone(),
                freq_corpus_0: c0,
                freq_corpus_1: c1,
                expected_0: e0,
                expected_1: e1,
                corpus_0_total: n0,
                corpus_1_total: n1,
                log_likelihood_llv: ll,
                bayes_factor_bic: ll - grand.ln(),
                effect_size_ell: ll / (grand * e0.min(e1).max(1e-10).ln()),
                significance: if ll >= 15.13 {
                    "****"
                } else if ll >= 10.83 {
                    "***"
                } else if ll >= 6.63 {
                    "**"
                } else if ll >= 3.84 {
                    "*"
                } else {
                    ""
                },
                percent_corpus_0: p0 * 100.0,
                percent_corpus_1: p1 * 100.0,
                percent_diff: (p0 - p1) * 100.0 / if c1 == 0 { 1e-18 } else { p1 },
                relative_risk: p0 / p1,
                log_ratio: ((if c0 == 0 { 0.5 } else { f0 } / n0 as f64)
                    / (if c1 == 0 { 0.5 } else { f1 } / n1 as f64))
                    .log2(),
                odds_ratio: (f0 / (n0 - c0) as f64) / (f1 / (n1 - c1) as f64),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn comparison_handles_order_zero_and_overflow() {
        let a = HashMap::from([("z".into(), 2), ("a".into(), 2)]);
        let b = HashMap::from([("z".into(), 4)]);
        let rows = frequency_stats(&a, &b).unwrap();
        assert_eq!(rows[0].token, "a");
        assert_eq!(rows[0].expected_0, 1.0);
        assert!(rows[0].relative_risk.is_infinite());
        assert_eq!(rows[1].relative_risk, 0.5);
        assert!(frequency_stats(&a, &HashMap::new()).is_err());
        assert!(frequency_stats(&HashMap::new(), &HashMap::new())
            .unwrap()
            .is_empty());
        assert!(frequency_stats(
            &HashMap::from([("a".into(), u64::MAX), ("b".into(), 1)]),
            &b
        )
        .is_err());
    }
}
