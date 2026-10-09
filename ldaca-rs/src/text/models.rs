/// Built-in tokenizer choices. Custom Hugging Face model IDs are also accepted.
#[derive(Debug, Clone, Copy)]
pub struct TokenizerModel {
    pub model_id: &'static str,
    pub label: &'static str,
    pub about_url: &'static str,
    pub languages: &'static [&'static str],
}
pub const TOKENIZER_MODELS: &[TokenizerModel] = &[
    TokenizerModel {
        model_id: "native:plain_words_en",
        label: "Plain words (English)",
        about_url: "https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow",
        languages: &["en"],
    },
    TokenizerModel {
        model_id: "huggingface:bert-base-uncased",
        label: "BERT base uncased",
        about_url: "https://huggingface.co/google-bert/bert-base-uncased",
        languages: &["en"],
    },
    TokenizerModel {
        model_id: "lindera:jieba",
        label: "Jieba",
        about_url: "https://github.com/messense/jieba-rs",
        languages: &["zh"],
    },
    TokenizerModel {
        model_id: "lindera:cc-cedict",
        label: "CC-CEDICT",
        about_url: "https://www.mdbg.net/chinese/dictionary?page=cc-cedict",
        languages: &["zh"],
    },
    TokenizerModel {
        model_id: "lindera:ja-ipadic",
        label: "IPADIC",
        about_url: "https://github.com/lindera/lindera",
        languages: &["ja"],
    },
    TokenizerModel {
        model_id: "lindera:ja-ipadic-neologd",
        label: "IPADIC Neologd",
        about_url: "https://github.com/neologd/mecab-ipadic-neologd",
        languages: &["ja"],
    },
    TokenizerModel {
        model_id: "lindera:ja-unidic",
        label: "UniDic",
        about_url: "https://clrd.ninjal.ac.jp/unidic/",
        languages: &["ja"],
    },
    TokenizerModel {
        model_id: "lindera:ko-dic",
        label: "ko-dic",
        about_url: "https://github.com/lindera/lindera",
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
        assert!(TOKENIZER_MODELS.iter().all(|m| !m.languages.is_empty()
            && !m.label.is_empty()
            && m.about_url.starts_with("https://")));
    }
}
