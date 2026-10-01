use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use futures_util::StreamExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use wordflow_server::{Host, config::Config};

async fn host() -> (tempfile::TempDir, Host) {
    let dir = tempfile::tempdir().unwrap();
    let host = Host::new(
        &Config {
            mode: wordflow_server::config::Mode::SingleUser,
            identity: wordflow_storage::TEST_ID.into(),
            public_url: None,
            worker_root: None,
            worker_socket: None,
            probe_network: false,
            bind: "127.0.0.1:0".parse().unwrap(),
            data_dir: Some(dir.path().into()),
            public_base_path: "/user/test/proxy/8002/".into(),
            allowed_origin: vec![],
            icu_path: Some("unused-by-these-tests".into()),
        },
        vec!["https://binder.example".parse().unwrap()],
        tokio_util::sync::CancellationToken::new(),
    )
    .await
    .unwrap();
    (dir, host)
}
async fn call(host: &Host, method: &str, path: &str, body: Value) -> (StatusCode, Value) {
    let response = host
        .router()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 10_000_000).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
async fn create(host: &Host) -> String {
    let (status, project) = call(host, "POST", "/api/server/project", json!({"name":null})).await;
    assert_eq!(status, StatusCode::OK, "{project}");
    project["project_id"].as_str().unwrap().to_owned()
}
#[tokio::test]
async fn user_event_stream_notifies_preference_changes_and_project_registry_changes() {
    let (_directory, host) = host().await;
    let response = host
        .router()
        .oneshot(
            Request::builder()
                .uri("/api/server/events")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut events = response.into_body().into_data_stream();
    events.next().await.unwrap().unwrap();
    let (status, preferences) = call(
        &host,
        "PATCH",
        "/api/preferences",
        json!({"theme":"dark-2026"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{preferences}");
    let preference_event = tokio::time::timeout(std::time::Duration::from_secs(5), events.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(String::from_utf8_lossy(&preference_event).contains("data: changed"));
    create(&host).await;
    let project_event = tokio::time::timeout(std::time::Duration::from_secs(5), events.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(String::from_utf8_lossy(&project_event).contains("data: changed"));
    host.close().await.unwrap();
}
#[tokio::test]
async fn independent_projects_same_file_reuse_and_shared_close() {
    let (dir, host) = host().await;
    let id = create(&host).await;
    let new_id = create(&host).await;
    assert_ne!(id, new_id);
    assert_eq!(host.status().await.unwrap().projects.len(), 2);
    assert_eq!(
        call(
            &host,
            "GET",
            &format!("/project/{id}/api/project"),
            Value::Null
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, saved) = call(
        &host,
        "POST",
        "/api/server/project/save",
        json!({"project_id":id,"name":"研究.wfpj"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert!(dir.path().join("admin/projects/研究.wfpj").exists());
    assert_eq!(
        call(
            &host,
            "POST",
            "/api/server/project/save",
            json!({"project_id":id,"name":"研究.wfpj"})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let (status, reopened) = call(
        &host,
        "POST",
        "/api/server/project",
        json!({"name":"研究.wfpj"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reopened["project_id"], id);
    assert_eq!(
        call(
            &host,
            "DELETE",
            "/api/server/files/projects/%E7%A0%94%E7%A9%B6.wfpj",
            Value::Null
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(
            &host,
            "POST",
            "/api/server/project/close",
            json!({"project_id":new_id})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        call(
            &host,
            "POST",
            "/api/server/project/close",
            json!({"project_id":new_id,"discard_untitled":true})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(
            &host,
            "GET",
            &format!("/project/{new_id}/api/project"),
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &host,
            "GET",
            &format!("/project/{id}/api/project"),
            Value::Null
        )
        .await
        .0,
        StatusCode::OK
    );
    host.close().await.unwrap();
}
#[tokio::test]
async fn uploads_are_independent_and_failed_import_retains_file() {
    let (dir, host) = host().await;
    let response = host
        .router()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/server/files/data/bad.parquet")
                .body(Body::from("not parquet"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let id = create(&host).await;
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/import",
        json!({"project_id":id,"name":"bad.parquet"}),
    )
    .await;
    assert!(!status.is_success());
    assert!(dir.path().join("admin/data/bad.parquet").exists());
    let response = host
        .router()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/server/files/projects/bad.wfpj")
                .body(Body::from("not duckdb"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(!response.status().is_success());
    assert!(!dir.path().join("admin/projects/bad.wfpj").exists());
    assert_eq!(
        std::fs::read_dir(dir.path().join("admin/projects"))
            .unwrap()
            .count(),
        0
    );
    host.close().await.unwrap();
}
#[tokio::test]
async fn origin_and_encoded_paths_are_preserved() {
    let (_dir, host) = host().await;
    let response = host
        .router()
        .oneshot(
            Request::builder()
                .uri("/api/server")
                .header("origin", "https://evil.example")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let id = create(&host).await;
    let (status, result) = call(
        &host,
        "POST",
        &format!("/project/{id}/api/project/import"),
        json!({"sources":[{"table_name":"a#b?文", "sql":"SELECT 1 AS value"}]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{result}");
    let (status, error) = call(
        &host,
        "GET",
        &format!("/project/{id}/api/project/nodes/a%23b%3F%E6%96%87/schema"),
        Value::Null,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "Encoded identifier was not transported: {error}"
    );
    host.close().await.unwrap();
}

#[tokio::test]
async fn preferences_survive_restart_and_users_have_distinct_roots_and_project_ids() {
    use clap::Parser;
    let root = tempfile::tempdir().unwrap();
    let mut config = Config::parse_from(["server", "--identity", wordflow_storage::TEST_ID]);
    config.data_dir = Some(root.path().into());
    let a = uuid::Uuid::new_v4().to_string();
    let b = uuid::Uuid::new_v4().to_string();
    let shutdown = tokio_util::sync::CancellationToken::new();
    let first = Host::for_user(&config, vec![], shutdown.clone(), &a)
        .await
        .unwrap();
    let other = Host::for_user(&config, vec![], shutdown.clone(), &b)
        .await
        .unwrap();
    let id = create(&first).await;
    assert_eq!(
        call(
            &other,
            "GET",
            &format!("/project/{id}/api/project"),
            Value::Null
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(
            &first,
            "PATCH",
            "/api/preferences",
            json!({"theme":"dark-2026"})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &first,
            "PATCH",
            "/api/preferences",
            json!({"layout":{"sidebarWidth":250}})
        )
        .await
        .1["theme"],
        "dark-2026"
    );
    assert_eq!(
        call(&other, "GET", "/api/preferences", Value::Null).await.1["theme"],
        "light-2026"
    );
    first.close().await.unwrap();
    let reopened = Host::for_user(&config, vec![], shutdown, &a).await.unwrap();
    let prefs = call(&reopened, "GET", "/api/preferences", Value::Null)
        .await
        .1;
    assert_eq!(prefs["theme"], "dark-2026");
    assert_eq!(prefs["layout"]["sidebarWidth"].as_f64(), Some(250.0));
    assert!(
        root.path()
            .join(&a)
            .join("config/preferences.json")
            .exists()
    );
    assert!(
        !root
            .path()
            .join(&b)
            .join("config/preferences.json")
            .exists()
    );
    reopened.close().await.unwrap();
    other.close().await.unwrap();
}
