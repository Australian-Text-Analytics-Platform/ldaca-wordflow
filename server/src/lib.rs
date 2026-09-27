#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]
pub mod config;
mod files;
mod routes;

use axum::{Router, http::HeaderValue};
pub use files::{Library, LibraryFile};
use std::{path::PathBuf, sync::Arc};
use tokio::sync::{Mutex, RwLock, watch};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
use wordflow_backend::{AiConfiguration, Error, ProjectInfo, ProjectRuntime};
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone)]
pub struct Host(Arc<Inner>);
struct Inner {
    files: files::Files,
    active: RwLock<Active>,
    mutation: Mutex<()>,
    data_files: Mutex<()>,
    changed: watch::Sender<Uuid>,
    shutdown: CancellationToken,
    ai: AiConfiguration,
    icu: Option<PathBuf>,
    origins: Vec<HeaderValue>,
    base_path: String,
}
#[derive(Clone)]
struct Active {
    id: Uuid,
    runtime: ProjectRuntime,
}
#[derive(Clone, serde::Serialize, utoipa::ToSchema)]
pub struct ServerStatus {
    pub session_id: Uuid,
    pub public_base_path: String,
    pub project: Option<ProjectInfo>,
}
impl Host {
    pub async fn new(
        config: &config::Config,
        origins: Vec<HeaderValue>,
        shutdown: CancellationToken,
    ) -> Result<Self> {
        let root = config.directory()?;
        let files = tokio::task::spawn_blocking(move || files::Files::new(&root)).await??;
        let ai = AiConfiguration::new(
            "au.edu.ldaca.wordflow.server",
            files.root().join("ai-providers.json"),
        );
        let icu = config.icu_path.clone();
        let runtime = ProjectRuntime::with_ai(shutdown.clone(), ai.clone());
        runtime.set_icu_cache_directory(files.root().join("cache/icu"))?;
        runtime.set_language_cache_directory(files.root().join("cache/language"))?;
        if let Some(path) = &icu {
            runtime.set_icu_path(path.clone())?;
        }
        runtime.set_embedding_cache_path(files.root().join("embeddings.duckdb"))?;
        runtime.create(None).await?;
        let id = Uuid::new_v4();
        let (changed, _) = watch::channel(id);
        Ok(Self(Arc::new(Inner {
            files,
            active: RwLock::new(Active { id, runtime }),
            mutation: Mutex::new(()),
            data_files: Mutex::new(()),
            changed,
            shutdown,
            ai,
            icu,
            origins,
            base_path: config.base_path()?,
        })))
    }
    fn new_runtime(&self) -> Result<ProjectRuntime> {
        let runtime = ProjectRuntime::with_ai(self.0.shutdown.clone(), self.0.ai.clone());
        runtime.set_icu_cache_directory(self.0.files.root().join("cache/icu"))?;
        runtime.set_language_cache_directory(self.0.files.root().join("cache/language"))?;
        if let Some(path) = &self.0.icu {
            runtime.set_icu_path(path.clone())?;
        }
        runtime.set_embedding_cache_path(self.0.files.root().join("embeddings.duckdb"))?;
        Ok(runtime)
    }
    pub async fn status(&self) -> Result<ServerStatus> {
        let active = self.0.active.read().await;
        Ok(ServerStatus {
            session_id: active.id,
            public_base_path: self.0.base_path.clone(),
            project: active.runtime.status().await?,
        })
    }
    pub async fn close(&self) -> Result<()> {
        let _mutation = self.0.mutation.lock().await;
        self.0.active.read().await.runtime.close().await
    }
    async fn session(&self, id: Uuid) -> Result<Active> {
        let active = self.0.active.read().await;
        if active.id != id {
            return Err(Error::new(
                "session_changed",
                "The active project changed. Reconnect to the current project.",
            ));
        }
        Ok(active.clone())
    }
    pub fn router(&self) -> Router {
        routes::router()
            .with_state(self.clone())
            .split_for_parts()
            .0
            .route(
                "/session/{id}/{*path}",
                axum::routing::any(routes::project_request).with_state(self.clone()),
            )
            .layer(axum::middleware::from_fn_with_state(
                self.clone(),
                routes::check_origin,
            ))
    }
}
/// Export both host and shared HTTP contracts without loading assets or opening storage.
pub fn openapi() -> utoipa::openapi::OpenApi {
    let (_, host) = routes::router().split_for_parts();
    let mut document = wordflow_backend::openapi::document();
    document.merge(host);
    document
}
