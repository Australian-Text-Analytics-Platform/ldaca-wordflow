/// Built-in tokenizer choices. Custom Hugging Face model IDs are also accepted.
#[derive(Debug, Clone, Copy)]
pub struct TokenizerModel {
    pub model_id: &'static str,
    pub label: &'static str,
    pub languages: &'static [&'static str],
}
pub const TOKENIZER_MODELS: &[TokenizerModel] = &[
    TokenizerModel {
        model_id: "native:plain_words_en",
        label: "Plain words (English)",
        languages: &["en"],
    },
    TokenizerModel {
        model_id: "huggingface:bert-base-uncased",
        label: "BERT base uncased",
        languages: &["en"],
    },
    TokenizerModel {
        model_id: "lindera:jieba",
        label: "Jieba",
        languages: &["zh"],
    },
    TokenizerModel {
        model_id: "lindera:cc-cedict",
        label: "CC-CEDICT",
        languages: &["zh"],
    },
    TokenizerModel {
        model_id: "lindera:ja-ipadic",
        label: "IPADIC",
        languages: &["ja"],
    },
    TokenizerModel {
        model_id: "lindera:ja-ipadic-neologd",
        label: "IPADIC Neologd",
        languages: &["ja"],
    },
    TokenizerModel {
        model_id: "lindera:ja-unidic",
        label: "UniDic",
        languages: &["ja"],
    },
    TokenizerModel {
        model_id: "lindera:ko-dic",
        label: "ko-dic",
        languages: &["ko"],
    },
];

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalogue_is_unique_and_complete() {
        let ids: std::collections::HashSet<_> =
            TOKENIZER_MODELS.iter().map(|m| m.model_id).collect();
        assert_eq!(ids.len(), 8);
        assert!(ids.contains("native:plain_words_en"));
        assert!(TOKENIZER_MODELS
            .iter()
            .all(|m| !m.languages.is_empty() && !m.label.is_empty()));
    }
}
