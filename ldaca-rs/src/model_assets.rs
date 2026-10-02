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
    pub(crate) fn huggingface_api(&self) -> hf_hub::HFClientBuilder {
        hf_hub::HFClient::builder()
            .cache_dir(self.huggingface.join("hub"))
            .endpoint("https://huggingface.co")
            // An explicit empty token prevents fallback to ambient login credentials.
            .token("")
    }
}

#[cfg(any(feature = "tokenization", feature = "embedding"))]
pub(crate) fn huggingface_model(
    model_id: &str,
    assets: Option<&ModelAssets>,
) -> anyhow::Result<hf_hub::HFRepositorySync<hf_hub::RepoTypeModel>> {
    let client = assets
        .map(ModelAssets::huggingface_api)
        .unwrap_or_else(hf_hub::HFClient::builder)
        .build_sync()?;
    let (owner, name) = model_id.split_once('/').unwrap_or(("", model_id));
    Ok(client.model(owner, name))
}

#[cfg(any(feature = "tokenization", feature = "embedding"))]
pub(crate) fn huggingface_file(
    repo: &hf_hub::HFRepositorySync<hf_hub::RepoTypeModel>,
    filename: &str,
    revision: &str,
) -> hf_hub::HFResult<PathBuf> {
    // Preserve offline reuse of cached branch snapshots across client upgrades.
    match repo
        .download_file()
        .filename(filename)
        .revision(revision)
        .local_files_only(true)
        .send()
    {
        Err(hf_hub::HFError::LocalEntryNotFound { .. }) => repo
            .download_file()
            .filename(filename)
            .revision(revision)
            .send(),
        result => result,
    }
}

#[cfg(all(test, any(feature = "tokenization", feature = "embedding")))]
mod tests {
    use super::{huggingface_file, ModelAssets};
    use axum::{http::HeaderMap, routing::get, Router};

    #[tokio::test]
    async fn huggingface_download_is_anonymous_scoped_and_reusable_offline() {
        let root = tempfile::tempdir().unwrap();
        let assets = ModelAssets {
            huggingface: root.path().join("hf"),
            lindera: root.path().join("lindera"),
            temporary: root.path().join("tmp"),
        };
        let app = Router::new().route(
            "/test/model/resolve/main/tokenizer.json",
            get(|headers: HeaderMap| async move {
                assert!(headers.get("authorization").is_none_or(|value| value
                    .to_str()
                    .is_ok_and(|value| value.trim() == "Bearer")));
                (
                    [
                        ("x-repo-commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
                        ("etag", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
                    ],
                    "fixture",
                )
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    stopped.await.ok();
                })
                .await
                .unwrap();
        });
        let repo = assets
            .huggingface_api()
            .endpoint(endpoint)
            .retry_max_attempts(0)
            .build_sync()
            .unwrap()
            .model("test", "model");
        let (repo, path) = tokio::task::spawn_blocking(move || {
            let path = huggingface_file(&repo, "tokenizer.json", "main").unwrap();
            (repo, path)
        })
        .await
        .unwrap();
        assert!(path.starts_with(&assets.huggingface));
        assert!(path
            .canonicalize()
            .unwrap()
            .starts_with(assets.huggingface.canonicalize().unwrap()));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "fixture");
        stop.send(()).unwrap();
        server.await.unwrap();
        let cached = tokio::task::spawn_blocking(move || {
            huggingface_file(&repo, "tokenizer.json", "main").unwrap()
        })
        .await
        .unwrap();
        assert_eq!(cached, path);
    }
}
