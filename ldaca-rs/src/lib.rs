//! Native text analysis and ONI data access. Hosts own execution and persistence.
#[cfg(feature = "cache")]
mod cache;
#[cfg(feature = "data")]
pub mod data;
#[cfg(feature = "embedding")]
pub mod embedding;
#[cfg(all(feature = "embedding", feature = "cache"))]
mod embedding_cache;
#[cfg(any(feature = "tokenization", feature = "cache"))]
mod fingerprint;
#[cfg(feature = "tokenization")]
mod lindera_dict;
#[cfg(feature = "tokenization")]
mod offsets;
#[cfg(feature = "quotation")]
pub mod quotation;
pub mod text;
#[cfg(feature = "tokenization")]
mod tokenizer;
#[cfg(feature = "topic-modeling")]
pub mod topic_modeling;

#[cfg(any(feature = "cache", feature = "tokenization"))]
mod file_lock;
