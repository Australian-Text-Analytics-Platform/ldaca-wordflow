//! Host-owned model caches for Dev and Test. Production keeps its existing environment.
use std::path::{Path, PathBuf};

const DEV: &str = "au.edu.ldaca.wordflow.dev";
pub(crate) const TEST: &str = "au.edu.ldaca.wordflow.test";

fn cache_directory(identifier: &str, base: Option<&Path>) -> std::io::Result<Option<PathBuf>> {
    if ![DEV, TEST].contains(&identifier) {
        return Ok(None);
    }
    base.map(|base| Some(base.join(identifier)))
        .ok_or_else(|| std::io::Error::other("Cannot locate the system cache directory"))
}

/// Called before Tauri, plugins or the async runtime create threads.
pub(crate) fn configure(identifier: &str) -> std::io::Result<()> {
    validate_identity(identifier, cfg!(feature = "e2e"))?;
    let base = if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/Caches"))
    } else if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else {
        std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))
    };
    if let Some(cache) = cache_directory(identifier, base.as_deref())? {
        std::env::set_var("HF_HOME", cache.join("huggingface"));
        std::env::set_var("LINDERA_DICT_PATH", cache.join("lindera"));
        std::env::set_var("WORDFLOW_QUOTATION_CACHE", cache.join("udpipe"));
        std::env::remove_var("WORDFLOW_QUOTATION_MODEL");
        std::env::remove_var("WORDFLOW_ICU_PATH");
    }
    Ok(())
}

fn validate_identity(identifier: &str, instrumented: bool) -> std::io::Result<()> {
    if instrumented && identifier != TEST {
        return Err(std::io::Error::other(
            "Instrumented native tests require the Test identity",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_has_no_environment_changes_even_without_a_cache_root() {
        assert_eq!(
            cache_directory("au.edu.ldaca.wordflow", None).unwrap(),
            None
        );
    }

    #[test]
    fn instrumented_binaries_refuse_production_and_dev_identities() {
        assert!(validate_identity(TEST, true).is_ok());
        assert!(validate_identity(DEV, true).is_err());
        assert!(validate_identity("au.edu.ldaca.wordflow", true).is_err());
        assert!(validate_identity("au.edu.ldaca.wordflow", false).is_ok());
    }

    #[test]
    fn dev_and_test_use_distinct_identity_directories_and_require_a_root() {
        let base = Path::new("/system/caches");
        assert_eq!(
            cache_directory(DEV, Some(base)).unwrap(),
            Some(base.join(DEV))
        );
        assert_eq!(
            cache_directory(TEST, Some(base)).unwrap(),
            Some(base.join(TEST))
        );
        assert!(cache_directory(TEST, None).is_err());
    }
}
