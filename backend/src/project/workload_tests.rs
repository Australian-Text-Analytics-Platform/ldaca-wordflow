//! Exercise production task routes with an offline ONI fixture.
use super::*;
use axum::{
    Json, Router,
    body::Body,
    extract::{Query, State},
    http::{HeaderMap, Request},
    routing::get,
};
use std::{collections::HashMap, time::Duration};
use tokio::{net::TcpListener, sync::Notify, time::timeout};
use tower::ServiceExt;

#[derive(Clone, Default)]
struct Portal {
    entered: Arc<Notify>,
    release: Arc<Notify>,
}
async fn metadata(
    State(portal): State<Portal>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Json<Value> {
    assert_eq!(headers["authorization"], "Bearer private-token");
    if query["id"] == "slow-metadata" {
        portal.entered.notify_one();
        portal.release.notified().await;
    }
    Json(
        serde_json::json!({"@graph":[{"@id":"./","@type":"Dataset"},{"@id":"text.txt","@type":"File","encodingFormat":"text/plain","name":"Example"}]}),
    )
}
async fn document(
    State(portal): State<Portal>,
    Query(query): Query<HashMap<String, String>>,
) -> &'static str {
    if query.get("id").is_some_and(|id| id.ends_with("download")) {
        portal.entered.notify_one();
        portal.release.notified().await;
    }
    "Café 猫"
}
#[tokio::test]
async fn ldaca_route_owns_download_conversion_and_commit_and_cancels_network_stages() {
    let project = ProjectRuntime::new(CancellationToken::new());
    project.create(None).await.unwrap();
    let portal = Portal::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = ldaca_rs::data::Client::new(
        None,
        ldaca_rs::data::ClientOptions {
            base_url: format!("http://{}/api", listener.local_addr().unwrap()),
            ..Default::default()
        },
    )
    .unwrap();
    *project.shared.portal.lock().unwrap() = Some(client);
    let routes = Router::new()
        .route("/api/object/meta", get(metadata))
        .route("/api/stream", get(document))
        .with_state(portal.clone());
    let shutdown = CancellationToken::new();
    let stopped = shutdown.clone();
    let server = tokio::spawn(async move {
        axum::serve(listener, routes)
            .with_graceful_shutdown(stopped.cancelled_owned())
            .await
            .unwrap();
    });
    let router = crate::api::router()
        .split_for_parts()
        .0
        .with_state(project.clone());
    for (index, identifier) in ["slow-metadata", "slow-download", "finish-download"]
        .into_iter()
        .enumerate()
    {
        let request = Request::post("/api/project/ldaca/import")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({"identifier":identifier,"token":"private-token"}).to_string(),
            ))
            .unwrap();
        let caller = tokio::spawn(router.clone().oneshot(request));
        if identifier.starts_with("slow") {
            timeout(Duration::from_secs(5), portal.entered.notified())
                .await
                .unwrap();
            let snapshot = project.tasks();
            let task = snapshot
                .tasks
                .iter()
                .find(|t| !t.state.is_finished())
                .unwrap();
            assert!(
                task.progress
                    .as_ref()
                    .unwrap()
                    .message
                    .contains(if index == 0 {
                        "metadata"
                    } else {
                        "Downloading"
                    })
            );
            project.cancel_task(task.id).unwrap();
            let response = timeout(Duration::from_secs(5), caller)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert_eq!(response.status(), 400);
            assert_eq!(
                response.headers()["x-wordflow-task-id"],
                task.id.to_string()
            );
            assert_eq!(
                project
                    .tasks()
                    .tasks
                    .iter()
                    .find(|t| t.id == task.id)
                    .unwrap()
                    .state,
                crate::TaskState::Cancelled
            );
            portal.release.notify_one();
        } else {
            timeout(Duration::from_secs(5), portal.entered.notified())
                .await
                .unwrap();
            caller.abort();
            let close = project.begin_close().unwrap();
            assert!(close.has_work());
            assert!(project.operation().is_err());
            portal.release.notify_one();
            timeout(Duration::from_secs(5), async {
                while project.tasks().tasks.iter().any(|t| !t.state.is_finished()) {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            assert!(
                project
                    .tasks()
                    .tasks
                    .iter()
                    .any(|t| t.state == crate::TaskState::Succeeded)
            );
            drop(close);
            assert_eq!(project.graph().await.unwrap().nodes.len(), 1);
        }
        let snapshot = project.tasks();
        assert_eq!(snapshot.tasks.len(), index + 1);
        assert!(
            !serde_json::to_string(&snapshot)
                .unwrap()
                .contains("private-token")
        );
    }
    project.close().await.unwrap();
    shutdown.cancel();
    timeout(Duration::from_secs(5), server)
        .await
        .unwrap()
        .unwrap();
}
