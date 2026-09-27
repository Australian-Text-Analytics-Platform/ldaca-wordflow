//! Cross-process locking shared by dictionary downloads and disposable caches.
use anyhow::{Context, Result};
use fs2::FileExt;
use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex},
};
static CACHE_PATH_LOCKS: LazyLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
pub(crate) fn with_file_lock<T>(path: &Path, action: impl FnOnce() -> Result<T>) -> Result<T> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create cache lock dir {}", parent.display()))?;
    }

    let local_lock = local_path_lock(path)?;
    let _local_guard = local_lock
        .lock()
        .map_err(|_| anyhow::anyhow!("cache path lock poisoned for {}", path.display()))?;

    let lock_path = lock_path_for(path);
    let lock_file = open_lock_file(&lock_path)?;
    lock_file
        .lock_exclusive()
        .with_context(|| format!("lock cache file {}", lock_path.display()))?;
    let result = action();
    let unlock_result = lock_file
        .unlock()
        .with_context(|| format!("unlock cache file {}", lock_path.display()));

    match (result, unlock_result) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(err), _) => Err(err),
        (Ok(_), Err(err)) => Err(err),
    }
}

fn local_path_lock(path: &Path) -> Result<Arc<Mutex<()>>> {
    let key = normalize_lock_key(path)?;
    let mut locks = CACHE_PATH_LOCKS
        .lock()
        .map_err(|_| anyhow::anyhow!("cache path lock registry poisoned"))?;
    Ok(Arc::clone(
        locks.entry(key).or_insert_with(|| Arc::new(Mutex::new(()))),
    ))
}

fn normalize_lock_key(path: &Path) -> Result<PathBuf> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let absolute_parent = if parent.is_absolute() {
        parent.to_path_buf()
    } else {
        std::env::current_dir()?.join(parent)
    };
    Ok(absolute_parent.join(
        path.file_name()
            .ok_or_else(|| anyhow::anyhow!("cache path has no file name: {}", path.display()))?,
    ))
}

pub(crate) fn lock_path_for(path: &Path) -> PathBuf {
    let mut lock_name = path
        .file_name()
        .map(|value| value.to_os_string())
        .unwrap_or_else(|| "cache".into());
    lock_name.push(".lock");
    path.with_file_name(lock_name)
}

fn open_lock_file(path: &Path) -> Result<File> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .with_context(|| format!("open cache lock file {}", path.display()))
}
