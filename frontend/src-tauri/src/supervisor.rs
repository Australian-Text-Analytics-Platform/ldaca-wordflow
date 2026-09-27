//! One embedded Axum server owned by one document window.
use crate::events::emit_to_window;
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Manager, WebviewWindow};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use wordflow_backend::{Error, ProjectRuntime};

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(crate) enum BackendStatus {
    Starting,
    Ready { url: String },
    Failed { error: Error },
    Stopping,
    Stopped,
}
pub(crate) struct BackendSupervisor {
    lifecycle: Mutex<BackendStatus>,
    shutdown: CancellationToken,
    finished: CancellationToken,
    pub(crate) project: ProjectRuntime,
}
impl BackendSupervisor {
    #[cfg(test)]
    pub(crate) fn new() -> Self {
        Self::with_ai(wordflow_backend::AiConfiguration::session_only())
    }
    pub(crate) fn with_ai(ai: wordflow_backend::AiConfiguration) -> Self {
        let shutdown = CancellationToken::new();
        Self {
            lifecycle: Mutex::new(BackendStatus::Starting),
            finished: CancellationToken::new(),
            project: ProjectRuntime::with_ai(shutdown.clone(), ai),
            shutdown,
        }
    }
    pub(crate) fn snapshot(&self) -> BackendStatus {
        self.lifecycle
            .lock()
            .map(|state| state.clone())
            .unwrap_or_else(|_| BackendStatus::Failed {
                error: Error::new("worker_failed", "Backend lifecycle lock poisoned"),
            })
    }
    fn publish_ready(&self, url: String) -> bool {
        let Ok(mut state) = self.lifecycle.lock() else {
            return false;
        };
        if self.shutdown.is_cancelled() || !matches!(*state, BackendStatus::Starting) {
            return false;
        }
        *state = BackendStatus::Ready { url };
        true
    }
    fn fail(&self, error: Error) {
        tracing::error!(%error, "Project backend failed");
        if let Ok(mut state) = self.lifecycle.lock() {
            if !self.shutdown.is_cancelled() {
                *state = BackendStatus::Failed { error };
            }
        }
    }
    fn begin_stop(&self) {
        if let Ok(mut state) = self.lifecycle.lock() {
            if !matches!(*state, BackendStatus::Stopped) {
                *state = BackendStatus::Stopping;
            }
        }
        self.shutdown.cancel();
    }
    pub(crate) fn start(self: &Arc<Self>, window: WebviewWindow, path: Option<PathBuf>) {
        let owner = self.clone();
        tauri::async_runtime::spawn(async move {
            let worker = owner.clone();
            let view = window.clone();
            // Await the worker so panics also publish failure and finish ownership cleanup.
            let result = tokio::spawn(async move { worker.run(&view, path).await }).await;
            match result {
                Ok(Err(error)) => owner.fail(error),
                Err(error) => owner.fail(Error::from(error)),
                Ok(Ok(())) if !owner.shutdown.is_cancelled() => {
                    owner.fail(Error::new("worker_failed", "Backend stopped unexpectedly"))
                }
                _ => {}
            }
            if let Err(error) = owner.project.close().await {
                owner.fail(error);
            }
            if owner.shutdown.is_cancelled() {
                if let Ok(mut state) = owner.lifecycle.lock() {
                    *state = BackendStatus::Stopped;
                }
            }
            let _ = emit_to_window(&window, "backend-status", owner.snapshot());
            owner.finished.cancel();
        });
    }
    async fn run(&self, window: &WebviewWindow, path: Option<PathBuf>) -> Result<(), Error> {
        self.project.set_icu_cache_directory(
            window
                .path()
                .app_cache_dir()
                .map_err(|e| Error::new("desktop_error", e.to_string()))?
                .join("icu"),
        )?;
        self.project.set_language_cache_directory(
            window
                .path()
                .app_cache_dir()
                .map_err(|e| Error::new("desktop_error", e.to_string()))?
                .join("language"),
        )?;
        let cache = window
            .path()
            .app_cache_dir()
            .map_err(|e| Error::new("desktop_error", e.to_string()))?
            .join("embeddings.duckdb");
        self.project.set_embedding_cache_path(cache)?;
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(Error::from)?;
        let url = format!("http://{}", listener.local_addr().map_err(Error::from)?);
        let info = match path {
            Some(path) => self.project.open(path).await,
            None => self.project.create(None).await,
        }?;
        if !self.publish_ready(url) {
            return Ok(());
        }
        crate::recent_projects::record(window.app_handle(), info.path.as_deref());
        window
            .set_title(&info.title)
            .map_err(|error| Error::new("desktop_error", error.to_string()))?;
        let _ = emit_to_window(window, "backend-status", self.snapshot());
        let mut origins = vec![
            http::header::HeaderValue::from_static("tauri://localhost"),
            http::header::HeaderValue::from_static("https://tauri.localhost"),
        ];
        if cfg!(debug_assertions) {
            origins.push(http::header::HeaderValue::from_static(
                "http://127.0.0.1:3001",
            ));
        }
        wordflow_backend::serve(
            listener,
            origins,
            self.shutdown.clone(),
            self.project.clone(),
        )
        .await
        .map_err(Error::from)
    }
    pub(crate) async fn stop(&self, window: &WebviewWindow) {
        self.begin_stop();
        let _ = emit_to_window(window, "backend-status", self.snapshot());
        self.finished.cancelled().await;
        if let Ok(mut state) = self.lifecycle.lock() {
            *state = BackendStatus::Stopped;
        }
        let _ = emit_to_window(window, "backend-status", self.snapshot());
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn closing_startup_prevents_late_publication() {
        let backend = BackendSupervisor::new();
        backend.begin_stop();
        backend.begin_stop();
        assert!(!backend.publish_ready("http://127.0.0.1:1".into()));
        backend.fail(Error::new("worker_failed", "late failure"));
        assert_eq!(backend.snapshot(), BackendStatus::Stopping);
    }
    #[test]
    fn failure_removes_the_discovered_url() {
        let backend = BackendSupervisor::new();
        assert!(backend.publish_ready("http://127.0.0.1:1".into()));
        backend.fail(Error::new("worker_failed", "failed"));
    }
}
