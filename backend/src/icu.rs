//! Optional signed DuckDB extension, acquired only when a timezone operation needs it.
use crate::Error;
use std::{
    io::{Read, Write},
    path::PathBuf,
};
use tokio::sync::Mutex;

pub(crate) struct Cache {
    pub directory: PathBuf,
    download: Mutex<()>,
}
impl Cache {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            download: Mutex::new(()),
        }
    }
    pub async fn resolve(
        &self,
        client: &reqwest::Client,
        version: String,
        platform: String,
    ) -> Result<PathBuf, Error> {
        let _guard = self.download.lock().await;
        let directory = self.directory.join(&version).join(&platform);
        let path = directory.join("icu.duckdb_extension");
        if path.is_file() {
            return Ok(path);
        }
        let url =
            format!("https://extensions.duckdb.org/{version}/{platform}/icu.duckdb_extension.gz");
        tracing::info!(%version, %platform, "Downloading timezone support for first use");
        let mut response = client.get(url).timeout(std::time::Duration::from_secs(120)).send().await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|e| Error::new("icu_unavailable", format!("Could not download timezone support: {e}. Connect to the internet and retry.")))?;
        // Bound the compressed download independently of untrusted Content-Length.
        let mut compressed = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| Error::new("icu_unavailable", e.to_string()))?
        {
            if compressed.len() + chunk.len() > 64 * 1024 * 1024 {
                return Err(Error::new(
                    "icu_unavailable",
                    "Timezone extension download exceeds 64 MiB",
                ));
            }
            compressed.extend_from_slice(&chunk);
        }
        tokio::task::spawn_blocking(move || {
            std::fs::create_dir_all(directory)?;
            let staging = tempfile::tempdir_in(
                path.parent()
                    .ok_or_else(|| Error::invalid("Invalid extension cache path"))?,
            )?;
            let staged_path = staging.path().join("icu.duckdb_extension");
            let mut staged = std::fs::File::create(&staged_path)?;
            let mut decoder =
                flate2::read::GzDecoder::new(compressed.as_slice()).take(128 * 1024 * 1024 + 1);
            if std::io::copy(&mut decoder, &mut staged)? > 128 * 1024 * 1024 {
                return Err(Error::new(
                    "icu_unavailable",
                    "Timezone extension exceeds 128 MiB",
                ));
            }
            staged.flush()?;
            // Windows cannot load the extension while its writer handle remains open.
            drop(staged);
            // LOAD checks DuckDB's own version, platform and cryptographic signature.
            // Validate before publishing; never enable allow_unsigned_extensions.
            let connection = duckdb::Connection::open_in_memory()?;
            connection.execute_batch(&format!(
                "LOAD '{}'",
                staged_path.to_string_lossy().replace('\'', "''")
            ))?;
            drop(connection);
            match std::fs::hard_link(&staged_path, &path) {
                Ok(_) => (),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
                Err(error) => return Err(Error::from(error)),
            }
            Ok(path)
        })
        .await
        .map_err(|e| Error::new("worker_failed", e.to_string()))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn configuring_cache_does_not_create_or_download_files() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("cache");
        let _cache = Cache::new(root.clone());
        assert!(!root.exists());
    }
    #[tokio::test]
    #[ignore = "Downloads the official signed extension; run explicitly with network access"]
    async fn first_use_download_and_offline_reuse() {
        let temporary = tempfile::tempdir().unwrap();
        let cache = Cache::new(temporary.path().into());
        let connection = duckdb::Connection::open_in_memory().unwrap();
        let version: String = connection
            .query_row("SELECT version()", [], |r| r.get(0))
            .unwrap();
        let platform: String = connection
            .query_row("PRAGMA platform", [], |r| r.get(0))
            .unwrap();
        let path = cache
            .resolve(&reqwest::Client::new(), version.clone(), platform.clone())
            .await
            .unwrap();
        let offline = reqwest::Client::builder()
            .proxy(reqwest::Proxy::all("http://127.0.0.1:1").unwrap())
            .build()
            .unwrap();
        assert_eq!(
            cache.resolve(&offline, version, platform).await.unwrap(),
            path
        );
        connection
            .execute_batch(&format!("LOAD '{}'", path.display()))
            .unwrap();
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM pg_timezone_names() WHERE name='Australia/Sydney'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
