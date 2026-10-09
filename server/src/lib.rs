#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]
pub mod auth;
pub mod config;
mod files;
mod routes;
pub mod workers;
/// Increment when the private gateway/worker contract changes.
pub const WORKER_PROTOCOL: u32 = 1;

use axum::{Router, http::HeaderValue};
pub use files::{Library, LibraryFile};
use std::{collections::BTreeMap, path::PathBuf, sync::Arc};
use tokio::sync::{Mutex, RwLock, watch};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
use wordflow_backend::{AiConfiguration, Error, ProjectInfo, ProjectRuntime};
use wordflow_storage::{AppDirectories, http::PreferencesApi};
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone)]
pub struct Host(Arc<Inner>);
struct Inner {
    files: files::Files,
    projects: RwLock<BTreeMap<Uuid, Active>>,
    mutation: Arc<Mutex<()>>,
    data_files: Arc<Mutex<files::Mutations>>,
    changed: watch::Sender<u64>,
    shutdown: CancellationToken,
    ai: AiConfiguration,
    icu: Option<PathBuf>,
    directories: AppDirectories,
    preferences: PreferencesApi,
    origins: Vec<HeaderValue>,
    base_path: String,
}
#[derive(Clone)]
struct Active {
    id: Uuid,
    runtime: ProjectRuntime,
}
#[derive(Clone, serde::Serialize, utoipa::ToSchema)]
pub struct ServerProject {
    pub project_id: Uuid,
    pub project: Option<ProjectInfo>,
}
#[derive(Clone, serde::Serialize, utoipa::ToSchema)]
pub struct ServerStatus {
    pub public_base_path: String,
    pub projects: Vec<ServerProject>,
}
impl Host {
    pub async fn new(
        config: &config::Config,
        origins: Vec<HeaderValue>,
        shutdown: CancellationToken,
    ) -> Result<Self> {
        Self::for_user(config, origins, shutdown, "admin").await
    }
    pub async fn for_user(
        config: &config::Config,
        origins: Vec<HeaderValue>,
        shutdown: CancellationToken,
        user: &str,
    ) -> Result<Self> {
        if user != "admin" && Uuid::parse_str(user).is_err() {
            return Err(Error::invalid("Invalid storage user identifier"));
        }
        let root = match &config.worker_root {
            Some(root) => root.clone(),
            None => config.directory()?.join(user),
        };
        wordflow_storage::private_directory(&root)?;
        let files = tokio::task::spawn_blocking(move || files::Files::new(&root)).await??;
        let directories = AppDirectories::browser(files.root())?;
        directories.create()?;
        let ai = if config.worker_root.is_some() {
            AiConfiguration::browser_owned(directories.config.join("ai-providers.json"))
        } else {
            AiConfiguration::new(
                &format!("{}.server", config.identity),
                directories.config.join("ai-providers.json"),
            )
        };
        let preferences = PreferencesApi::new(&directories.config, shutdown.clone());
        Ok(Self(Arc::new(Inner {
            files,
            projects: RwLock::new(BTreeMap::new()),
            mutation: Arc::new(Mutex::new(())),
            data_files: Arc::new(Mutex::new(files::Mutations::default())),
            changed: watch::channel(0).0,
            shutdown,
            ai,
            icu: config.icu_path.clone(),
            directories,
            preferences,
            origins,
            base_path: config.base_path()?,
        })))
    }
    fn new_runtime(&self) -> Result<ProjectRuntime> {
        let runtime = ProjectRuntime::with_ai(self.0.shutdown.clone(), self.0.ai.clone());
        runtime.set_storage(self.0.directories.clone())?;
        if let Some(path) = &self.0.icu {
            runtime.set_icu_path(path.clone())?;
        }
        Ok(runtime)
    }
    async fn project_status(&self, id: Uuid) -> Result<ServerProject> {
        let active = self.session(id).await?;
        Ok(ServerProject {
            project_id: id,
            project: active.runtime.status().await?,
        })
    }
    pub async fn status(&self) -> Result<ServerStatus> {
        let active: Vec<_> = self.0.projects.read().await.values().cloned().collect();
        let mut projects = Vec::new();
        for project in active {
            projects.push(ServerProject {
                project_id: project.id,
                project: project.runtime.status().await?,
            });
        }
        Ok(ServerStatus {
            public_base_path: self.0.base_path.clone(),
            projects,
        })
    }
    pub async fn close(&self) -> Result<()> {
        let _mutation = self.0.mutation.lock().await;
        let projects = std::mem::take(&mut *self.0.projects.write().await);
        let mut failure = None;
        for project in projects.into_values() {
            if let Err(error) = project.runtime.close().await {
                failure.get_or_insert(error);
            }
        }
        failure.map_or(Ok(()), Err)
    }
    async fn session(&self, id: Uuid) -> Result<Active> {
        self.0
            .projects
            .read()
            .await
            .get(&id)
            .cloned()
            .ok_or_else(|| {
                Error::new(
                    "project_not_found",
                    "This project is closed. Open it again from the project library.",
                )
            })
    }
    async fn open_file(&self, path: &std::path::Path) -> Result<Option<Active>> {
        for active in self.0.projects.read().await.values() {
            if active
                .runtime
                .status()
                .await?
                .and_then(|p| p.path)
                .as_deref()
                == Some(path)
            {
                return Ok(Some(active.clone()));
            }
        }
        Ok(None)
    }
    fn changed(&self) {
        self.0.changed.send_modify(|revision| *revision += 1);
    }
    pub fn router(&self) -> Router {
        routes::router()
            .with_state(self.clone())
            .split_for_parts()
            .0
            .route(
                "/api/account",
                axum::routing::get(|| async {
                    axum::Json(auth::Account {
                        id: "admin".into(),
                        name: None,
                        browser_credentials: false,
                    })
                }),
            )
            .route(
                "/internal/worker",
                axum::routing::get(|| async {
                    axum::Json(serde_json::json!({"version":env!("CARGO_PKG_VERSION"), "protocol":WORKER_PROTOCOL}))
                }),
            )
            .route(
                "/project/{id}/{*path}",
                axum::routing::any(routes::project_request).with_state(self.clone()),
            )
            .merge(self.0.preferences.router())
            .layer(axum::middleware::from_fn_with_state(
                self.clone(),
                routes::check_origin,
            ))
    }
}
/// Export host and shared contracts without loading assets or opening storage.
pub fn openapi() -> utoipa::openapi::OpenApi {
    let (_, host) = routes::router().split_for_parts();
    let (_, preferences) = wordflow_storage::http::contract().split_for_parts();
    let mut document = wordflow_backend::openapi::document();
    document.merge(host);
    document.merge(preferences);
    document.merge(auth::contract());
    document
}
