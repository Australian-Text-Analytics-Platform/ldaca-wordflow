use std::borrow::Cow;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, OnceLock, RwLock};

use anyhow::{Context, Result};
use hf_hub::api::sync::ApiBuilder;
use hf_hub::{Repo, RepoType};
use lindera::tokenizer::Tokenizer as LinderaTokenizer;
use tokenizers::pre_tokenizers::bert::BertPreTokenizer;
use tokenizers::{
    OffsetReferential, OffsetType, PreTokenizedString, PreTokenizer, Tokenizer as HfTokenizer,
};

use crate::fingerprint::hash_text;
use crate::offsets::byte_spans_to_char_spans;

const DEFAULT_TOKENIZER_REF: &str = "main";
const TOKENIZER_IMPLEMENTATION_REVISION: &str = "tokenizer-pipeline-v2";
const NATIVE_MODEL_PREFIX: &str = "native:";
const HUGGINGFACE_MODEL_PREFIX: &str = "huggingface:";
const LINDERA_MODEL_PREFIX: &str = "lindera:";
pub const PLAIN_WORDS_EN_MODEL_ID: &str = "native:plain_words_en";
pub const JIEBA_MODEL_ID: &str = "lindera:jieba";
/// Opaque model IDs for downloaded Lindera dict variants. These route through
/// `load_backend` to the on-demand downloader in `lindera_dict.rs`; subsequent
/// calls hit the in-memory REGISTRY.
pub const LINDERA_ZH_CC_CEDICT_MODEL_ID: &str = "lindera:cc-cedict";
pub const LINDERA_JA_IPADIC_MODEL_ID: &str = "lindera:ja-ipadic";
pub const LINDERA_JA_IPADIC_NEOLOGD_MODEL_ID: &str = "lindera:ja-ipadic-neologd";
pub const LINDERA_JA_UNIDIC_MODEL_ID: &str = "lindera:ja-unidic";
pub const LINDERA_KO_DIC_MODEL_ID: &str = "lindera:ko-dic";

const SPECIAL_TOKENS: &[&str] = &["[CLS]", "[SEP]", "[PAD]", "[UNK]", "[MASK]"];

fn keep_token_text(token: &str, remove_punctuation: bool) -> bool {
    !remove_punctuation || token.chars().any(|ch| ch.is_alphanumeric())
}

/// A model-specific tokenizer fronting one of:
/// - a HuggingFace tokenizer (BERT-family WordPiece, XLM-R SentencePiece, etc.)
/// - Lindera for Chinese Jieba word segmentation, Japanese (IPADIC / UniDic),
///   or Korean (ko-dic)
pub enum TokenizerBackend {
    PlainWordsEn,
    HuggingFace(HfTokenizer),
    Lindera(LinderaTokenizer),
}

struct TokenRecord {
    token: String,
    start: i64,
    end: i64,
}

fn is_special_token_text(token: &str) -> bool {
    let token_upper = token.to_ascii_uppercase();
    if SPECIAL_TOKENS.contains(&token_upper.as_str()) {
        return true;
    }

    let bracketed = format!("[{token_upper}]");
    SPECIAL_TOKENS.contains(&bracketed.as_str())
}

fn plain_word_records(text: &str, remove_punctuation: bool) -> Vec<TokenRecord> {
    let mut pre_tokenized = PreTokenizedString::from(text);
    if BertPreTokenizer.pre_tokenize(&mut pre_tokenized).is_err() {
        return Vec::new();
    }

    let splits = pre_tokenized.get_splits(OffsetReferential::Original, OffsetType::Byte);
    let char_spans = byte_spans_to_char_spans(
        text,
        splits.iter().map(|(_, (start, end), _)| (*start, *end)),
    );

    splits
        .into_iter()
        .zip(char_spans)
        .filter_map(|((token, _span, _), (start, end))| {
            if remove_punctuation && !token.chars().any(|ch| ch.is_alphanumeric()) {
                return None;
            }

            if is_special_token_text(token) || token.is_empty() {
                return None;
            }

            Some(TokenRecord {
                token: token.to_string(),
                start,
                end,
            })
        })
        .collect()
}

impl TokenizerBackend {
    /// Whether `to_lowercase()` is a semantically meaningful preprocessing step.
    /// Jieba (zh) and Lindera (ja/ko) operate on scripts with no case, so
    /// running the full Unicode case-fold table walk + heap allocation per row
    /// is unnecessary; keep that behavior consistent for all native callers.
    fn case_aware(&self) -> bool {
        matches!(
            self,
            TokenizerBackend::PlainWordsEn | TokenizerBackend::HuggingFace(_)
        )
    }

    /// Apply the requested case-folding only when meaningful. Returns a
    /// `Cow<str>` so that the no-op branch borrows the original text
    /// (zero allocations) instead of paying for a `text.to_string()` clone.
    fn preprocess<'a>(&self, text: &'a str, lowercase: bool) -> Cow<'a, str> {
        if lowercase && self.case_aware() {
            Cow::Owned(text.to_lowercase())
        } else {
            Cow::Borrowed(text)
        }
    }

    pub fn tokenize_text(
        &self,
        text: &str,
        lowercase: bool,
        remove_punctuation: bool,
    ) -> Result<Vec<String>> {
        Ok(self
            .tokenize_records(text, lowercase, remove_punctuation)?
            .into_iter()
            .map(|record| record.token)
            .collect())
    }

    fn tokenize_records(
        &self,
        text: &str,
        lowercase: bool,
        remove_punctuation: bool,
    ) -> Result<Vec<TokenRecord>> {
        let processed = self.preprocess(text, lowercase);
        let processed_ref: &str = processed.as_ref();

        let mut records: Vec<TokenRecord> = match self {
            TokenizerBackend::PlainWordsEn => plain_word_records(processed_ref, remove_punctuation),
            TokenizerBackend::HuggingFace(tokenizer) => {
                let encoding = tokenizer
                    .encode(processed_ref, false)
                    .map_err(|e| anyhow::anyhow!("Tokenizer encode failed: {e}"))?;
                let toks = encoding.get_tokens();
                let offsets = encoding.get_offsets();
                let char_spans =
                    byte_spans_to_char_spans(processed_ref, offsets.iter().map(|(s, e)| (*s, *e)));
                toks.iter()
                    .zip(char_spans)
                    .map(|(tok, (start, end))| TokenRecord {
                        token: tok.clone(),
                        start,
                        end,
                    })
                    .collect()
            }
            TokenizerBackend::Lindera(tok) => tok
                .tokenize(processed_ref)
                .map_err(|e| anyhow::anyhow!("Lindera tokenize failed: {e}"))?
                .into_iter()
                .map(|t| TokenRecord {
                    token: t.surface.to_string(),
                    start: t.byte_start as i64,
                    end: t.byte_end as i64,
                })
                .collect(),
        };

        if matches!(self, TokenizerBackend::Lindera(_)) {
            let char_spans = byte_spans_to_char_spans(
                processed_ref,
                records
                    .iter()
                    .map(|record| (record.start as usize, record.end as usize)),
            );
            for (record, (start, end)) in records.iter_mut().zip(char_spans) {
                record.start = start;
                record.end = end;
            }
        }

        records.retain(|record| keep_token_text(&record.token, remove_punctuation));
        Ok(records)
    }

    /// Tokenize and emit `(token, start, end)` triples where `start` and `end`
    /// are **character** offsets (1 char per Hanzi, not 3 bytes), into the
    /// `lowercase`-applied processed text. Used by Phase 2's persisted tokens
    /// column so downstream tools can locate each token's span in the source.
    pub fn tokenize_text_with_offsets(
        &self,
        text: &str,
        lowercase: bool,
        remove_punctuation: bool,
    ) -> Result<Vec<(String, i64, i64)>> {
        let result: Vec<(String, i64, i64)> = self
            .tokenize_records(text, lowercase, remove_punctuation)?
            .into_iter()
            .map(|record| (record.token, record.start, record.end))
            .collect();

        Ok(result)
    }
}

static REGISTRY: OnceLock<RwLock<HashMap<String, Arc<TokenizerBackend>>>> = OnceLock::new();

fn registry() -> &'static RwLock<HashMap<String, Arc<TokenizerBackend>>> {
    REGISTRY.get_or_init(|| RwLock::new(HashMap::new()))
}

pub fn ensure_tokenizer_for_model(model_id: &str) -> Result<Arc<TokenizerBackend>> {
    let key = model_id.trim();
    if key.is_empty() {
        anyhow::bail!("Tokenizer model id is required");
    }

    {
        let map = registry()
            .read()
            .map_err(|_| anyhow::anyhow!("tokenizer registry lock poisoned"))?;
        if let Some(tok) = map.get(key) {
            return Ok(Arc::clone(tok));
        }
    }

    let mut map = registry()
        .write()
        .map_err(|_| anyhow::anyhow!("tokenizer registry lock poisoned"))?;
    if let Some(tok) = map.get(key) {
        return Ok(Arc::clone(tok));
    }
    let backend = load_backend(key)?;
    let arc = Arc::new(backend);
    map.insert(key.to_string(), Arc::clone(&arc));
    Ok(arc)
}

fn load_backend(model_id: &str) -> Result<TokenizerBackend> {
    if model_id.starts_with(NATIVE_MODEL_PREFIX) {
        return match model_id {
            PLAIN_WORDS_EN_MODEL_ID => Ok(TokenizerBackend::PlainWordsEn),
            _ => Err(anyhow::anyhow!(
                "Unknown native tokenizer model id: {model_id}"
            )),
        };
    }

    if let Some(huggingface_model_id) = model_id.strip_prefix(HUGGINGFACE_MODEL_PREFIX) {
        if huggingface_model_id.is_empty() {
            return Err(anyhow::anyhow!(
                "Hugging Face tokenizer model id must include a repository id"
            ));
        }
        return load_hf_tokenizer(huggingface_model_id).map(TokenizerBackend::HuggingFace);
    }

    if model_id.starts_with(LINDERA_MODEL_PREFIX) {
        if let Some(kind) = lindera_dict_for_model_id(model_id) {
            let tok = crate::lindera_dict::ensure_lindera_tokenizer(kind)?;
            return Ok(TokenizerBackend::Lindera(tok));
        }
        return Err(anyhow::anyhow!(
            "Unknown Lindera tokenizer model id: {model_id}"
        ));
    }

    Err(anyhow::anyhow!(
        "Unknown tokenizer model id {model_id:?}; expected native:..., huggingface:..., or lindera:..."
    ))
}

fn lindera_dict_for_model_id(model_id: &str) -> Option<crate::lindera_dict::LinderaDict> {
    match model_id {
        LINDERA_ZH_CC_CEDICT_MODEL_ID => Some(crate::lindera_dict::LinderaDict::CcCedict),
        JIEBA_MODEL_ID => Some(crate::lindera_dict::LinderaDict::Jieba),
        LINDERA_JA_IPADIC_MODEL_ID => Some(crate::lindera_dict::LinderaDict::JaIpadic),
        LINDERA_JA_IPADIC_NEOLOGD_MODEL_ID => {
            Some(crate::lindera_dict::LinderaDict::JaIpadicNeologd)
        }
        LINDERA_JA_UNIDIC_MODEL_ID => Some(crate::lindera_dict::LinderaDict::JaUnidic),
        LINDERA_KO_DIC_MODEL_ID => Some(crate::lindera_dict::LinderaDict::KoDic),
        _ => None,
    }
}

fn load_hf_tokenizer(model_id: &str) -> Result<HfTokenizer> {
    let api = ApiBuilder::from_env()
        .build()
        .context("Failed to initialize hf-hub client")?;
    let repo = Repo::with_revision(
        model_id.to_string(),
        RepoType::Model,
        DEFAULT_TOKENIZER_REF.to_string(),
    );
    let api = api.repo(repo);
    let tokenizer_path = api
        .get("tokenizer.json")
        .with_context(|| format!("Failed to fetch tokenizer.json for {model_id}"))?;
    HfTokenizer::from_file(tokenizer_path)
        .map_err(|e| anyhow::anyhow!("Failed to load tokenizer {model_id}: {e}"))
}

pub fn tokenizer_cache_fingerprint(model_id: &str) -> Result<String> {
    let artifact_identity = if model_id == PLAIN_WORDS_EN_MODEL_ID {
        "bert-pre-tokenizer".to_string()
    } else if let Some(repository) = model_id.strip_prefix(HUGGINGFACE_MODEL_PREFIX) {
        let api = ApiBuilder::from_env()
            .build()
            .context("Failed to initialize hf-hub client")?;
        let path = api
            .repo(Repo::with_revision(
                repository.to_string(),
                RepoType::Model,
                DEFAULT_TOKENIZER_REF.to_string(),
            ))
            .get("tokenizer.json")
            .with_context(|| format!("Failed to fetch tokenizer.json for {repository}"))?;
        let revision = path
            .parent()
            .and_then(Path::file_name)
            .and_then(|value| value.to_str())
            .ok_or_else(|| anyhow::anyhow!("tokenizer snapshot has no immutable revision"))?;
        let checksum = hash_text(
            std::str::from_utf8(&std::fs::read(&path)?)
                .context("tokenizer.json is not valid UTF-8")?,
        );
        format!("{revision}:{checksum}")
    } else if let Some(kind) = lindera_dict_for_model_id(model_id) {
        kind.cache_identity()
    } else {
        anyhow::bail!("Unknown tokenizer model id {model_id:?}");
    };
    Ok(hash_text(&format!(
        "{TOKENIZER_IMPLEMENTATION_REVISION}\0{model_id}\0{artifact_identity}"
    )))
}

/// One token with exclusive Unicode character offsets into the processed text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub token: String,
    pub start: i64,
    pub end: i64,
}
#[derive(Debug, Clone, Copy)]
pub struct TokenizeOptions {
    pub lowercase: bool,
    pub remove_punctuation: bool,
}
impl Default for TokenizeOptions {
    fn default() -> Self {
        Self {
            lowercase: true,
            remove_punctuation: true,
        }
    }
}
/// A reusable loaded tokenizer. Loading may download missing model files.
#[derive(Clone)]
pub struct Tokenizer {
    pub(crate) backend: Arc<TokenizerBackend>,
    pub(crate) model_id: String,
}
impl Tokenizer {
    pub fn load(model_id: &str) -> Result<Self> {
        Ok(Self {
            backend: ensure_tokenizer_for_model(model_id)?,
            model_id: model_id.trim().to_owned(),
        })
    }
    pub fn model_id(&self) -> &str {
        &self.model_id
    }
    pub fn fingerprint(&self) -> Result<String> {
        tokenizer_cache_fingerprint(&self.model_id)
    }
    pub fn tokenize(&self, text: &str, options: TokenizeOptions) -> Result<Vec<Token>> {
        self.backend
            .tokenize_text_with_offsets(text, options.lowercase, options.remove_punctuation)
            .map(|tokens| {
                tokens
                    .into_iter()
                    .map(|(token, start, end)| Token { token, start, end })
                    .collect()
            })
    }
}

#[cfg(test)]
pub fn tokenize_plain_text(text: &str, lowercase: bool, remove_punctuation: bool) -> Vec<String> {
    TokenizerBackend::PlainWordsEn
        .tokenize_text(text, lowercase, remove_punctuation)
        .unwrap_or_default()
}

pub fn tokenize_plain_text_with_offsets(
    text: &str,
    lowercase: bool,
    remove_punctuation: bool,
) -> Vec<(String, i64, i64)> {
    TokenizerBackend::PlainWordsEn
        .tokenize_text_with_offsets(text, lowercase, remove_punctuation)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{
        lindera_dict_for_model_id, load_backend, tokenize_plain_text, TokenizerBackend,
        JIEBA_MODEL_ID, LINDERA_JA_IPADIC_MODEL_ID, LINDERA_JA_IPADIC_NEOLOGD_MODEL_ID,
        LINDERA_JA_UNIDIC_MODEL_ID, LINDERA_KO_DIC_MODEL_ID, LINDERA_ZH_CC_CEDICT_MODEL_ID,
        PLAIN_WORDS_EN_MODEL_ID,
    };
    use crate::lindera_dict::LinderaDict;

    #[test]
    fn test_tokenize_plain_text_drops_special_tokens() {
        let input = "[CLS] hello [SEP] [PAD] [UNK]";
        let tokens = tokenize_plain_text(input, true, true);
        assert_eq!(tokens, vec!["hello"]);
    }

    #[test]
    fn cache_fingerprint_includes_immutable_model_artifact_identity() {
        let native = super::tokenizer_cache_fingerprint(PLAIN_WORDS_EN_MODEL_ID).unwrap();
        let jieba = super::tokenizer_cache_fingerprint(JIEBA_MODEL_ID).unwrap();
        assert_ne!(native, jieba);
        assert_eq!(
            native,
            super::tokenizer_cache_fingerprint(PLAIN_WORDS_EN_MODEL_ID).unwrap()
        );
    }

    #[test]
    fn test_plain_words_en_offsets_reconstruct_english() {
        let backend = TokenizerBackend::PlainWordsEn;
        let text = "Hello, Queensland";
        let toks = backend
            .tokenize_text_with_offsets(text, true, true)
            .unwrap();
        assert_eq!(toks.len(), 2);
        let text_lc = text.to_lowercase();
        for (tok, start, end) in &toks {
            let extracted: String = text_lc
                .chars()
                .skip(*start as usize)
                .take((*end - *start) as usize)
                .collect();
            assert_eq!(*tok, extracted);
        }
    }

    #[test]
    fn test_lindera_model_id_constants_match_dict_kinds() {
        // Phase 5: the Lindera model IDs route to the matching
        // LinderaDict variant in load_backend. Catches a copy-paste
        // mistake where two ids map to the same kind.
        assert_eq!(
            lindera_dict_for_model_id(LINDERA_ZH_CC_CEDICT_MODEL_ID),
            Some(LinderaDict::CcCedict)
        );
        assert_eq!(
            lindera_dict_for_model_id(JIEBA_MODEL_ID),
            Some(LinderaDict::Jieba)
        );
        assert_eq!(
            lindera_dict_for_model_id(LINDERA_JA_IPADIC_MODEL_ID),
            Some(LinderaDict::JaIpadic)
        );
        assert_eq!(
            lindera_dict_for_model_id(LINDERA_JA_IPADIC_NEOLOGD_MODEL_ID),
            Some(LinderaDict::JaIpadicNeologd)
        );
        assert_eq!(
            lindera_dict_for_model_id(LINDERA_JA_UNIDIC_MODEL_ID),
            Some(LinderaDict::JaUnidic)
        );
        assert_eq!(
            lindera_dict_for_model_id(LINDERA_KO_DIC_MODEL_ID),
            Some(LinderaDict::KoDic)
        );
    }

    #[test]
    fn test_lindera_dict_for_unknown_model_id_returns_none() {
        // Anything that is not one of the prefixed Lindera ids should not be
        // interpreted as a Lindera dictionary.
        assert_eq!(lindera_dict_for_model_id("lindera-ja"), None);
        assert_eq!(lindera_dict_for_model_id("ja-ipadic"), None);
        assert_eq!(
            lindera_dict_for_model_id("huggingface:bert-base-uncased"),
            None
        );
        assert_eq!(lindera_dict_for_model_id("jieba"), None);
        assert_eq!(lindera_dict_for_model_id(""), None);
    }

    #[test]
    fn test_unprefixed_model_ids_are_rejected() {
        let err = match load_backend("bert-base-uncased") {
            Ok(_) => panic!("unprefixed model id should be rejected"),
            Err(err) => err.to_string(),
        };
        assert!(err.contains("Unknown tokenizer model id"), "{err}");
    }

    #[test]
    fn test_empty_model_id_is_rejected() {
        let err = match super::ensure_tokenizer_for_model("") {
            Ok(_) => panic!("empty model id should be rejected"),
            Err(err) => err.to_string(),
        };
        assert!(err.contains("Tokenizer model id is required"), "{err}");
    }
}
