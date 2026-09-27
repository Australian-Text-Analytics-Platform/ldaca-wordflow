//! Pinned optional language assets served from the host cache, never a third-party script origin.
use crate::{Error, ProjectRuntime};
use axum::{
    extract::{Path, State},
    http::header,
    response::IntoResponse,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, io::Write, path::PathBuf};
use tokio::sync::Mutex;

#[derive(Deserialize)]
struct Manifest {
    file: String,
    source: String,
    sha256: String,
    runtime: Runtime,
}
#[derive(Deserialize)]
struct Runtime {
    version: String,
    files: BTreeMap<String, String>,
}
fn asset(name: &str) -> Result<(String, String), Error> {
    let manifest: Manifest =
        serde_json::from_str(include_str!("../resources/language-detector.json"))?;
    if name == manifest.file {
        return Ok((manifest.source, manifest.sha256));
    }
    let hash = manifest
        .runtime
        .files
        .get(name)
        .ok_or_else(|| Error::new("file_not_found", "Unknown language asset"))?;
    Ok((
        format!(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-text@{}/wasm/{name}",
            manifest.runtime.version
        ),
        hash.clone(),
    ))
}
pub(crate) struct Cache {
    directory: PathBuf,
    download: Mutex<()>,
}
impl Cache {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            download: Mutex::new(()),
        }
    }
    pub async fn read(&self, client: &reqwest::Client, name: &str) -> Result<Vec<u8>, Error> {
        let (url, hash) = asset(name)?;
        let _guard = self.download.lock().await;
        let path = self.directory.join(&hash).join(name);
        if let Ok(bytes) = tokio::fs::read(&path).await
            && format!("{:x}", Sha256::digest(&bytes)) == hash
        {
            return Ok(bytes);
        }
        let mut response = client.get(url).timeout(std::time::Duration::from_secs(120)).send().await
            .and_then(reqwest::Response::error_for_status).map_err(|e| Error::new("asset_unavailable", format!("Could not download language support: {e}. Connect to the internet and retry.")))?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| Error::new("asset_unavailable", e.to_string()))?
        {
            if bytes.len() + chunk.len() > 32 * 1024 * 1024 {
                return Err(Error::new(
                    "asset_unavailable",
                    "Language asset exceeds 32 MiB",
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        if format!("{:x}", Sha256::digest(&bytes)) != hash {
            return Err(Error::new(
                "asset_unavailable",
                "Language asset checksum mismatch",
            ));
        }
        tokio::task::spawn_blocking(move || {
            let directory = path
                .parent()
                .ok_or_else(|| Error::invalid("Invalid language cache path"))?;
            std::fs::create_dir_all(directory)?;
            let mut staged = tempfile::NamedTempFile::new_in(directory)?;
            staged.write_all(&bytes)?;
            staged.persist(path).map_err(|e| Error::from(e.error))?;
            Ok(bytes)
        })
        .await
        .map_err(|e| Error::new("worker_failed", e.to_string()))?
    }
}

#[utoipa::path(get, path = "/api/resources/language/{name}", operation_id = "language_asset", params(("name" = String, Path)),
responses((status = 200, description = "Pinned model or WASM runtime asset", content((crate::openapi::Binary = "application/octet-stream"), (crate::openapi::Binary = "application/wasm"), (String = "text/javascript"))),
(status = 400, body = crate::ErrorEnvelope), (status = 403, body = crate::ErrorEnvelope), (status = 404, body = crate::ErrorEnvelope), (status = 500, body = crate::ErrorEnvelope), (status = 503, body = crate::ErrorEnvelope)))]
pub(crate) async fn get(
    State(project): State<ProjectRuntime>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, Error> {
    let operation = project.operation()?;
    let bytes = tokio::select! {
        result = project.language_asset(&name) => result?,
        () = operation.cancellation.cancelled() => return Err(Error::new("interrupted", "Language download cancelled")),
    };
    let content_type = if name.ends_with(".js") {
        "text/javascript"
    } else if name.ends_with(".wasm") {
        "application/wasm"
    } else {
        "application/octet-stream"
    };
    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        bytes,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_pinned_files_are_resolved() {
        for name in [
            "../secret",
            "model.tflite",
            "text_wasm_internal.js?url=evil",
        ] {
            assert!(asset(name).is_err());
        }
        assert!(
            asset("text_wasm_internal.wasm")
                .unwrap()
                .0
                .contains("@1.0.1/")
        );
        assert_eq!(asset("language-detector.tflite").unwrap().1.len(), 64);
    }
    #[tokio::test]
    async fn cache_reuses_verified_bytes_without_network() {
        let directory = tempfile::tempdir().unwrap();
        let cache = Cache::new(directory.path().into());
        let (_, hash) = asset("language-detector.tflite").unwrap();
        let destination = directory.path().join(hash);
        std::fs::create_dir_all(&destination).unwrap();
        std::fs::write(
            destination.join("language-detector.tflite"),
            include_bytes!("../tests/fixtures/language-detector.tflite"),
        )
        .unwrap();
        let client = reqwest::Client::builder()
            .proxy(reqwest::Proxy::all("http://127.0.0.1:1").unwrap())
            .build()
            .unwrap();
        let bytes = cache
            .read(&client, "language-detector.tflite")
            .await
            .unwrap();
        assert_eq!(bytes.len(), 315294);
        assert!(
            cache
                .read(&reqwest::Client::new(), "../unknown")
                .await
                .is_err()
        );
    }
}
