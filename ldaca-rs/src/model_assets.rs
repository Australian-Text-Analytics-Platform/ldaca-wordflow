//! Explicit model cache paths supplied by an application host.
use std::path::PathBuf;
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ModelAssets {
    pub huggingface: PathBuf,
    pub lindera: PathBuf,
    pub temporary: PathBuf,
}
#[cfg(any(feature = "tokenization", feature = "embedding"))]
impl ModelAssets {
    pub(crate) fn huggingface_api(&self) -> hf_hub::api::sync::ApiBuilder {
        hf_hub::api::sync::ApiBuilder::from_cache(hf_hub::Cache::new(self.huggingface.join("hub")))
            .with_token(None)
    }
}
