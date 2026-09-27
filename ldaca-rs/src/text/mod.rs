//! Text utilities independent of a dataframe or database engine.
mod statistics;
pub use statistics::{frequency_stats, FrequencyStats};
#[cfg(feature = "tokenization")]
mod concordance;
#[cfg(feature = "tokenization")]
pub use crate::tokenizer::{Token, TokenizeOptions, Tokenizer};
#[cfg(feature = "tokenization")]
pub use concordance::{Concordance, ConcordanceMatch, ConcordanceOptions, TokenConcordance};
#[cfg(all(feature = "tokenization", feature = "cache"))]
mod token_cache;
#[cfg(all(feature = "tokenization", feature = "cache"))]
pub use token_cache::tokenize_cached;
mod models;
pub use models::{TokenizerModel, TOKENIZER_MODELS};
use unicode_segmentation::UnicodeSegmentation;

/// Count Unicode scalar values, not bytes or grapheme clusters.
pub fn char_count(text: &str) -> usize {
    text.chars().count()
}
/// Count Unicode UAX #29 words.
pub fn word_count(text: &str) -> usize {
    text.unicode_words().count()
}
/// Count nonblank Unicode UAX #29 sentences.
pub fn sentence_count(text: &str) -> usize {
    text.unicode_sentences()
        .filter(|s| !s.trim().is_empty())
        .count()
}
/// Lowercase, replace ASCII punctuation/digits with spaces, and normalize whitespace.
pub fn clean_text(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_punctuation() || c.is_ascii_digit() {
                ' '
            } else {
                c
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Token counts accumulated one document at a time, without retaining source text.
#[cfg(feature = "tokenization")]
#[derive(Debug, Default)]
pub struct FrequencyAccumulator {
    counts: std::collections::HashMap<String, u64>,
}

#[cfg(feature = "tokenization")]
impl FrequencyAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Count one document with the frequency tokenizer's lowercase/punctuation settings.
    /// Blank documents are skipped. Hosts can check cancellation between calls.
    /// Tokenizer errors and count overflow return an error; discard the accumulator on failure.
    pub fn add(&mut self, text: &str, tokenizer: &Tokenizer) -> anyhow::Result<()> {
        if text.trim().is_empty() {
            return Ok(());
        }
        for token in tokenizer.backend.tokenize_text(text, true, true)? {
            let count = self.counts.entry(token).or_default();
            *count = count
                .checked_add(1)
                .ok_or_else(|| anyhow::anyhow!("token count exceeds u64"))?;
        }
        Ok(())
    }

    pub fn counts(&self) -> &std::collections::HashMap<String, u64> {
        &self.counts
    }

    pub fn into_counts(self) -> std::collections::HashMap<String, u64> {
        self.counts
    }
}

/// Count tokens over an iterator without collecting the corpus. Blank documents are skipped.
#[cfg(feature = "tokenization")]
pub fn token_frequencies<'a>(
    texts: impl IntoIterator<Item = &'a str>,
    tokenizer: &Tokenizer,
) -> anyhow::Result<std::collections::HashMap<String, u64>> {
    let mut counts = FrequencyAccumulator::new();
    for text in texts {
        counts.add(text, tokenizer)?;
    }
    Ok(counts.into_counts())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unicode_utilities() {
        assert_eq!(char_count("é猫"), 2);
        assert_eq!(word_count("One word. Another!"), 3);
        assert_eq!(sentence_count("One word. Another!"), 2);
        assert_eq!(clean_text(" Café, 123\nCAT! "), "café cat");
    }

    #[cfg(feature = "tokenization")]
    #[test]
    fn incremental_frequencies_preserve_unicode_and_iterator_results() {
        let tokenizer = Tokenizer::load("native:plain_words_en").unwrap();
        let documents = [
            Some("Café, 猫!"),
            None,
            Some("CAFÉ café"),
            Some(""),
            Some("\n \t"),
            Some("[CLS] [UNK]"),
            Some("123"),
            Some("猫 Café"),
        ];
        let mut counts = FrequencyAccumulator::new();
        assert!(counts.counts().is_empty());
        for batch in documents.chunks(3) {
            for text in batch.iter().flatten() {
                counts.add(text, &tokenizer).unwrap();
            }
        }
        assert_eq!(
            counts.counts(),
            &std::collections::HashMap::from([
                ("café".to_owned(), 4),
                ("猫".to_owned(), 2),
                ("123".to_owned(), 1),
            ])
        );
        assert_eq!(
            counts.into_counts(),
            token_frequencies(documents.into_iter().flatten(), &tokenizer).unwrap()
        );
    }

    #[cfg(feature = "tokenization")]
    #[test]
    fn incremental_frequencies_use_full_u64_range_and_reject_overflow() {
        let tokenizer = Tokenizer::load("native:plain_words_en").unwrap();
        let mut counts = FrequencyAccumulator::new();
        counts.counts.insert("word".into(), i64::MAX as u64);
        counts.add("word", &tokenizer).unwrap();
        assert_eq!(counts.counts()["word"], i64::MAX as u64 + 1);

        counts.counts.insert("word".into(), u64::MAX);
        let error = counts.add("word", &tokenizer).unwrap_err();
        assert_eq!(error.to_string(), "token count exceeds u64");
        assert_eq!(counts.counts()["word"], u64::MAX);
    }
}
