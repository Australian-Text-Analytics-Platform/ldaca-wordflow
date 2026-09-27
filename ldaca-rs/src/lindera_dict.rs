//! On-demand Lindera dictionary downloader.
//!
//! Uses official prebuilt Lindera dictionaries for Chinese CC-CEDICT / Jieba,
//! Japanese IPADIC / IPADIC-neologd / UniDic, and Korean ko-dic. Those
//! dictionaries are NOT bundled with this library — instead the first
//! `lindera:*` tokenize call lands here, fetches the matching official Lindera
//! release zip, extracts into the local dictionary cache, and hands the loaded
//! `Tokenizer` back to `tokenizer.rs` for memoization in the existing
//! `REGISTRY`.
//!
//! Cache layout: `${LINDERA_DICT_PATH:-$HOME/.cache/ldaca}/<dict-name>/`.
//!
//! Subsequent calls hit the in-process REGISTRY first and never re-enter
//! this module — `ensure_lindera_tokenizer` is only called on cache miss.

use std::env;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use lindera::dictionary::load_dictionary;
use lindera::mode::Mode;
use lindera::segmenter::Segmenter;
use lindera::tokenizer::Tokenizer as LinderaTokenizer;

use crate::file_lock::with_file_lock;

const LINDERA_VERSION: &str = "3.0.7";
const LINDERA_RELEASE_BASE_URL: &str = "https://github.com/lindera/lindera/releases/download";
const LINDERA_DICT_PATH_ENV: &str = "LINDERA_DICT_PATH";
const MAX_ARCHIVE_BYTES: u64 = 128 * 1024 * 1024;

/// Which prebuilt dict to fetch. Mirrors the model-id constants in
/// `tokenizer.rs` (`LINDERA_JA_IPADIC_MODEL_ID` etc).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinderaDict {
    CcCedict,
    Jieba,
    JaIpadic,
    JaIpadicNeologd,
    JaUnidic,
    KoDic,
}

impl LinderaDict {
    fn artifact_stem(&self) -> &'static str {
        match self {
            LinderaDict::CcCedict => "lindera-cc-cedict",
            LinderaDict::Jieba => "lindera-jieba",
            LinderaDict::JaIpadic => "lindera-ipadic",
            LinderaDict::JaIpadicNeologd => "lindera-ipadic-neologd",
            LinderaDict::JaUnidic => "lindera-unidic",
            LinderaDict::KoDic => "lindera-ko-dic",
        }
    }

    fn archive_name(&self) -> String {
        format!("{}-{LINDERA_VERSION}.zip", self.artifact_stem())
    }

    fn cache_subdir(&self) -> String {
        format!("{}-{LINDERA_VERSION}", self.artifact_stem())
    }

    fn download_url(&self) -> String {
        format!(
            "{LINDERA_RELEASE_BASE_URL}/v{LINDERA_VERSION}/{}",
            self.archive_name()
        )
    }

    pub fn cache_identity(&self) -> String {
        format!("{}-{LINDERA_VERSION}", self.artifact_stem())
    }
}

/// `${LINDERA_DICT_PATH:-$HOME/.cache/ldaca}`.
fn cache_root() -> Result<PathBuf> {
    if let Some(path) = env::var_os(LINDERA_DICT_PATH_ENV) {
        if !path.is_empty() {
            return Ok(PathBuf::from(path));
        }
    }

    let home = env::var_os("HOME").context("HOME is not set; cannot resolve Lindera dict cache")?;
    Ok(PathBuf::from(home).join(".cache").join("ldaca"))
}

fn fresh_extract_dir(root: &Path, kind: LinderaDict) -> Result<PathBuf> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("System clock is before UNIX_EPOCH")?
        .as_nanos();
    let path = root.join(format!(
        ".{}.extract.{}.{}",
        kind.cache_subdir(),
        std::process::id(),
        nonce
    ));
    fs::create_dir_all(&path)
        .with_context(|| format!("Failed to create temp extract dir {path:?}"))?;
    Ok(path)
}

/// Returns the absolute path to the extracted dict directory. Downloads
/// + extracts the official Lindera release zip on cache miss.
pub fn ensure_dict(kind: LinderaDict) -> Result<PathBuf> {
    let root = cache_root()?;
    let dict_dir = root.join(kind.cache_subdir());

    // Sentinel: lindera dicts always include matrix.mtx. If it's there
    // we treat the extract as complete and short-circuit.
    if dict_dir.join("matrix.mtx").is_file() {
        return Ok(dict_dir);
    }

    fs::create_dir_all(&root).with_context(|| format!("Failed to create cache dir {root:?}"))?;

    with_file_lock(&dict_dir, || {
        if dict_dir.join("matrix.mtx").is_file() {
            return Ok(());
        }

        let extract_dir = fresh_extract_dir(&root, kind)?;
        let archive_bytes = download_archive(kind)?;
        extract_zip(&archive_bytes, &extract_dir)
            .with_context(|| format!("Failed to extract {}", kind.archive_name()))?;

        if !extract_dir.join("matrix.mtx").is_file() {
            let _ = fs::remove_dir_all(&extract_dir);
            bail!(
                "Lindera dict archive {archive} did not contain matrix.mtx \
                 after extracting — release layout may have changed",
                archive = kind.archive_name(),
            );
        }

        if dict_dir.exists() {
            fs::remove_dir_all(&dict_dir)
                .with_context(|| format!("Failed to remove incomplete dict dir {dict_dir:?}"))?;
        }
        fs::rename(&extract_dir, &dict_dir)
            .with_context(|| format!("Failed to move {extract_dir:?} to {dict_dir:?}"))
    })?;
    Ok(dict_dir)
}

fn download_archive(kind: LinderaDict) -> Result<Vec<u8>> {
    let url = kind.download_url();
    let mut response = ureq::get(&url)
        .header("User-Agent", "ldaca-rs")
        .call()
        .with_context(|| format!("Failed to download Lindera dictionary from {url}"))?;
    response
        .body_mut()
        .with_config()
        .limit(MAX_ARCHIVE_BYTES)
        .read_to_vec()
        .with_context(|| format!("Failed to read Lindera dictionary response from {url}"))
}

fn extract_zip(archive_bytes: &[u8], dest: &Path) -> Result<()> {
    let reader = Cursor::new(archive_bytes);
    let mut archive = zip::ZipArchive::new(reader).context("Failed to read Lindera zip archive")?;
    archive
        .extract_unwrapped_root_dir(dest, zip::read::root_dir_common_filter)
        .context("zip extract failed")
}

fn lindera_tokenizer_from_path(path: &Path) -> Result<LinderaTokenizer> {
    let path_str = path
        .to_str()
        .with_context(|| format!("Lindera dictionary path is not valid UTF-8: {path:?}"))?;
    let dictionary = load_dictionary(path_str)
        .map_err(|e| anyhow::anyhow!("Lindera load_dictionary({path_str}) failed: {e}"))?;
    let segmenter = Segmenter::new(Mode::Normal, dictionary, None);
    Ok(LinderaTokenizer::new(segmenter))
}

/// Build a `LinderaTokenizer` for the given dict, downloading + extracting
/// on first use. Caller (in `tokenizer.rs`) wraps the result in the
/// shared `REGISTRY` so subsequent lookups skip both the download and
/// the dict-load step.
pub fn ensure_lindera_tokenizer(kind: LinderaDict) -> Result<LinderaTokenizer> {
    let dict_dir = ensure_dict(kind)?;
    lindera_tokenizer_from_path(&dict_dir)
}

#[cfg(test)]
mod tests {
    use super::LinderaDict;

    #[test]
    fn archive_and_subdir_names_are_distinct_per_kind() {
        // Sanity: prevents an accidental copy-paste collision in
        // archive_name / cache_subdir that would route two dicts to
        // the same cache path.
        let all = [
            LinderaDict::CcCedict,
            LinderaDict::Jieba,
            LinderaDict::JaIpadic,
            LinderaDict::JaIpadicNeologd,
            LinderaDict::JaUnidic,
            LinderaDict::KoDic,
        ];
        for (i, a) in all.iter().enumerate() {
            for b in &all[i + 1..] {
                assert_ne!(a.archive_name(), b.archive_name());
                assert_ne!(a.cache_subdir(), b.cache_subdir());
            }
        }
    }
}
