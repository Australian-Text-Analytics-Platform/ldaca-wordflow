//! Cross-process locking shared by dictionary downloads and disposable caches.
use anyhow::{Context, Result};
use fs2::FileExt;
#[cfg(feature = "cache")]
use std::sync::{RwLock, TryLockError};
use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex},
};
#[derive(Default)]
struct PathLocks {
    operation: Mutex<()>,
    #[cfg(feature = "cache")]
    lease: RwLock<()>,
}
static CACHE_PATH_LOCKS: LazyLock<Mutex<HashMap<PathBuf, Arc<PathLocks>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
pub(crate) fn with_file_lock<T>(path: &Path, action: impl FnOnce() -> Result<T>) -> Result<T> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create cache lock dir {}", parent.display()))?;
    }

    let local_lock = local_path_lock(path)?;
    let _local_guard = local_lock
        .operation
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

/// Hold a shared lease across lookup, computation and persistence. Maintenance
/// cannot remove a cache while an unlocked miss computation still intends to write it.
#[cfg(feature = "cache")]
pub(crate) fn with_cache_lease<T>(path: &Path, action: impl FnOnce() -> Result<T>) -> Result<T> {
    let local = local_path_lock(path)?;
    let _lease = local
        .lease
        .read()
        .map_err(|_| anyhow::anyhow!("cache lease poisoned"))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = open_lock_file(&lease_path(path))?;
    FileExt::lock_shared(&file)?;
    action()
}

/// A nonblocking exclusive lease leaves active work undisturbed. Never remove
/// either sidecar: another process may already be waiting on its open handle.
#[cfg(feature = "cache")]
pub(crate) fn try_cache_maintenance<T>(
    path: &Path,
    action: impl FnOnce() -> Result<T>,
) -> Result<Option<T>> {
    let local = local_path_lock(path)?;
    let _lease = match local.lease.try_write() {
        Ok(guard) => guard,
        Err(TryLockError::WouldBlock) => return Ok(None),
        Err(TryLockError::Poisoned(_)) => anyhow::bail!("cache lease poisoned"),
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = open_lock_file(&lease_path(path))?;
    match file.try_lock_exclusive() {
        Ok(()) => with_file_lock(path, action).map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => Ok(None),
        Err(error) => Err(error).context("lock cache for maintenance"),
    }
}

#[cfg(feature = "cache")]
fn lease_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".lease.lock");
    PathBuf::from(name)
}

fn local_path_lock(path: &Path) -> Result<Arc<PathLocks>> {
    let key = normalize_lock_key(path)?;
    let mut locks = CACHE_PATH_LOCKS
        .lock()
        .map_err(|_| anyhow::anyhow!("cache path lock registry poisoned"))?;
    Ok(Arc::clone(locks.entry(key).or_default()))
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
