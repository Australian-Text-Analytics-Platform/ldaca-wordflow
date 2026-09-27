#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]
//! Shared HTTP lifecycle for the desktop host and standalone server.

pub mod ai;
pub use ai::AiConfiguration;
mod analysis_api;
mod api;
mod error;
mod expressions;
mod icu;
mod language_assets;
mod ldaca;
pub mod openapi;
mod project;
mod query;
mod samples;
mod tasks;
pub use api::{InputJson, TableNames};
pub use error::{Error, ErrorEnvelope};
pub use project::exports::{ExportInspection, ExportRequest, safe_filename};
pub use project::frequency::{FrequencyExportFormat, FrequencyQuery, StopwordSource};
pub use project::{
    CloseAttempt, ExportFormat, ObjectTarget, Operation, ProjectInfo, ProjectRuntime,
    lock_destination,
};
pub use tasks::{TaskContext, TaskHandle, TaskProgress, TaskSnapshot, TaskState, TaskSummary};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, Method, StatusCode, header},
    response::IntoResponse,
};
use serde::Serialize;
use std::io;
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Serialize, utoipa::ToSchema)]
struct Health {
    status: &'static str,
    version: &'static str,
}

fn health(status: &'static str) -> Json<Health> {
    Json(Health {
        status,
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// Compose the native API without starting a listener. Hosts own project selection.
pub fn router(
    origins: Vec<HeaderValue>,
    shutdown: CancellationToken,
    projects: project::ProjectRuntime,
) -> Router {
    let permitted = origins.clone();
    let (health, _) = health_routes().split_for_parts();
    let (project_routes, _) = api::router().split_for_parts();
    health
        .with_state(shutdown)
        .merge(project_routes.with_state(projects))
        .layer(
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods([Method::GET, Method::POST, Method::DELETE])
                .allow_headers([header::CONTENT_TYPE])
                .expose_headers([
                    header::CONTENT_DISPOSITION,
                    header::HeaderName::from_static("x-wordflow-statements-completed"),
                    header::HeaderName::from_static("x-wordflow-result-truncated"),
                    header::HeaderName::from_static("x-wordflow-task-id"),
                    header::HeaderName::from_static("x-wordflow-total-rows"),
                    header::HeaderName::from_static("x-wordflow-document-count"),
                    header::HeaderName::from_static("x-wordflow-match-count"),
                    header::HeaderName::from_static("x-wordflow-has-next"),
                ]),
        )
        .layer(axum::middleware::from_fn(
            move |request: axum::extract::Request, next: axum::middleware::Next| {
                let permitted = permitted.clone();
                async move {
                    if request
                        .headers()
                        .get(header::ORIGIN)
                        .is_some_and(|origin| !permitted.contains(origin))
                    {
                        return (
                            StatusCode::FORBIDDEN,
                            Json(crate::error::ErrorEnvelope {
                                error: Error::new("origin_not_allowed", "Origin is not allowed"),
                            }),
                        )
                            .into_response();
                    }
                    next.run(request).await
                }
            },
        ))
        .layer(TraceLayer::new_for_http())
}

/// Serve health and project endpoints on a listener already bound by the host.
///
/// The host retains and awaits this future. Cancellation drains accepted
/// requests and releases the project. Hosts await completion without a deadline.
/// Construction performs no filesystem I/O and creates no Tokio runtime.
pub async fn serve(
    listener: TcpListener,
    allowed_origins: Vec<HeaderValue>,
    shutdown: CancellationToken,
    projects: ProjectRuntime,
) -> io::Result<()> {
    let app = router(allowed_origins, shutdown.clone(), projects.clone());
    let server = serve_router(listener, app, shutdown.clone());
    tokio::pin!(server);
    tokio::select! {
        result = &mut server => {
            projects.close().await.map_err(io::Error::other)?;
            result
        }
        _ = shutdown.cancelled() => {
            projects.close().await.map_err(io::Error::other)?;
            server.await
        }
    }
}

async fn serve_router(
    listener: TcpListener,
    app: Router,
    shutdown: CancellationToken,
) -> io::Result<()> {
    // Avoid briefly accepting connections when the host closed during binding.
    if shutdown.is_cancelled() {
        return Ok(());
    }
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown.cancelled_owned())
        .await
}

fn health_routes() -> utoipa_axum::router::OpenApiRouter<CancellationToken> {
    utoipa_axum::router::OpenApiRouter::new()
        .routes(utoipa_axum::routes!(health_live))
        .routes(utoipa_axum::routes!(health_ready))
}
#[utoipa::path(get, path = "/health/live", operation_id = "health_live", responses((status = 200, body = Health), (status = 403, body = error::ErrorEnvelope)))]
async fn health_live() -> Json<Health> {
    health("live")
}
#[utoipa::path(get, path = "/health/ready", operation_id = "health_ready", responses((status = 200, body = Health), (status = 503, body = Health), (status = 403, body = error::ErrorEnvelope)))]
async fn health_ready(State(shutdown): State<CancellationToken>) -> (StatusCode, Json<Health>) {
    if shutdown.is_cancelled() {
        (StatusCode::SERVICE_UNAVAILABLE, health("stopping"))
    } else {
        (StatusCode::OK, health("ready"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use axum::{body::Body, http::Request};
    use std::{sync::Arc, time::Duration};
    use tokio::{sync::Notify, time::timeout};
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_and_shutdown_release_the_bound_port() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        assert_ne!(address.port(), 0);
        assert!(TcpListener::bind(address).await.is_err());
        let shutdown = CancellationToken::new();
        let task = tokio::spawn(serve(
            listener,
            vec![],
            shutdown.clone(),
            ProjectRuntime::new(shutdown.clone()),
        ));
        let client = reqwest::Client::new();
        for (path, status) in [("live", "live"), ("ready", "ready")] {
            let response = client
                .get(format!("http://{address}/health/{path}"))
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let body: serde_json::Value = response.json().await.unwrap();
            assert_eq!(
                body,
                serde_json::json!({"status":status,"version":env!("CARGO_PKG_VERSION")})
            );
        }
        assert_eq!(
            client
                .get(format!("http://{address}/api/data-root"))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        shutdown.cancel();
        timeout(Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(TcpListener::bind(address).await.is_ok());
    }

    #[tokio::test]
    async fn cancelled_startup_does_not_serve_and_readiness_reports_stopping() {
        let shutdown = CancellationToken::new();
        shutdown.cancel();
        let response = router(
            vec![],
            shutdown.clone(),
            project::ProjectRuntime::new(shutdown.clone()),
        )
        .oneshot(
            Request::builder()
                .uri("/health/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        serve(
            listener,
            vec![],
            shutdown.clone(),
            ProjectRuntime::new(shutdown),
        )
        .await
        .unwrap();
        assert!(TcpListener::bind(address).await.is_ok());
    }

    #[tokio::test]
    async fn shutdown_waits_for_an_accepted_request() {
        let entered = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        let app = Router::new().route(
            "/slow",
            get({
                let entered = entered.clone();
                let release = release.clone();
                move || {
                    let entered = entered.clone();
                    let release = release.clone();
                    async move {
                        entered.notify_one();
                        release.notified().await;
                        "finished"
                    }
                }
            }),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let shutdown = CancellationToken::new();
        let mut server = tokio::spawn(serve_router(listener, app, shutdown.clone()));
        let request = tokio::spawn(async move {
            reqwest::get(format!("http://{address}/slow"))
                .await
                .unwrap()
                .text()
                .await
                .unwrap()
        });
        timeout(Duration::from_secs(2), entered.notified())
            .await
            .unwrap();
        shutdown.cancel();
        assert!(
            timeout(Duration::from_millis(20), &mut server)
                .await
                .is_err()
        );
        release.notify_one();
        assert_eq!(request.await.unwrap(), "finished");
        timeout(Duration::from_secs(2), server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn cors_allows_only_configured_origins() {
        for (origin, allowed) in [("tauri://localhost", true), ("https://example.com", false)] {
            let response = router(
                vec![HeaderValue::from_static("tauri://localhost")],
                CancellationToken::new(),
                project::ProjectRuntime::new(CancellationToken::new()),
            )
            .oneshot(
                Request::builder()
                    .uri("/health/live")
                    .header("origin", origin)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
            assert_eq!(
                response
                    .headers()
                    .contains_key("access-control-allow-origin"),
                allowed
            );
        }
    }
}

#[cfg(test)]
mod task_api_tests {
    use super::*;
    use std::time::Duration;
    #[tokio::test]
    async fn task_stream_reconnect_cancel_dismiss_and_origin_checks() {
        let shutdown = CancellationToken::new();
        let project = ProjectRuntime::new(shutdown.clone());
        project.create(None).await.unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(serve(listener, vec![], shutdown.clone(), project.clone()));
        let client = reqwest::Client::new();
        let (started, ready) = tokio::sync::oneshot::channel();
        let task = project
            .submit_task("HTTP task", move |context| async move {
                context.progress("Working", Some(0.5));
                started.send(()).unwrap();
                context.cancellation().cancelled().await;
                context.check_cancelled()
            })
            .unwrap();
        ready.await.unwrap();
        let mut stream = client
            .get(format!("{base}/api/project/events"))
            .send()
            .await
            .unwrap();
        let first = String::from_utf8(stream.chunk().await.unwrap().unwrap().to_vec()).unwrap();
        assert!(first.contains("HTTP task"));
        assert!(first.contains("0.5"));
        assert_eq!(
            client
                .delete(format!("{base}/api/project/tasks/{}", task.id))
                .send()
                .await
                .unwrap()
                .status(),
            409
        );
        assert_eq!(
            client
                .post(format!("{base}/api/project/tasks/{}/cancel", task.id))
                .header("Origin", "https://untrusted.example")
                .json(&serde_json::json!({}))
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
        assert_eq!(
            client
                .post(format!("{base}/api/project/tasks/{}/cancel", task.id))
                .json(&serde_json::json!({}))
                .send()
                .await
                .unwrap()
                .status(),
            200
        );
        let id = task.id;
        task.wait().await.unwrap_err();
        drop(stream);
        let mut reconnected = client
            .get(format!("{base}/api/project/events"))
            .send()
            .await
            .unwrap();
        assert!(
            String::from_utf8(reconnected.chunk().await.unwrap().unwrap().to_vec())
                .unwrap()
                .contains("cancelled")
        );
        assert_eq!(
            client
                .delete(format!("{base}/api/project/tasks/{id}"))
                .send()
                .await
                .unwrap()
                .status(),
            200
        );
        assert!(project.status().await.unwrap().unwrap().path.is_none());
        shutdown.cancel();
        tokio::time::timeout(Duration::from_secs(5), server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let mut remaining = Vec::new();
        while let Some(chunk) = reconnected.chunk().await.unwrap() {
            remaining.extend_from_slice(&chunk);
        }
    }
}
