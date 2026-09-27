use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use serde_json::{Value, json};
use tower::ServiceExt;
use wordflow_server::{Host, config::Config};

async fn host() -> (tempfile::TempDir, Host) {
    let dir = tempfile::tempdir().unwrap();
    let host = Host::new(
        &Config {
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
#[tokio::test]
async fn replacement_rejects_old_requests_and_save_as_preserves_project() {
    let (dir, host) = host().await;
    let id = host.status().await.unwrap().session_id;
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/project",
        json!({"session_id":id}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (status, saved) = call(
        &host,
        "POST",
        "/api/server/project/save",
        json!({"session_id":id,"name":"研究.wfpj"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert!(dir.path().join("projects/研究.wfpj").exists());
    let (status, duplicate) = call(
        &host,
        "POST",
        "/api/server/project/save",
        json!({"session_id":id,"name":"研究.wfpj"}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{duplicate}");
    let (status, changed) = call(
        &host,
        "POST",
        "/api/server/project",
        json!({"session_id":id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{changed}");
    assert_ne!(changed["session_id"], id.to_string());
    let (status, _) = call(
        &host,
        "GET",
        &format!("/session/{id}/api/project"),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let new_id = host.status().await.unwrap().session_id;
    let (status, reopened) = call(
        &host,
        "POST",
        "/api/server/project",
        json!({"session_id":new_id,"name":"研究.wfpj","discard_untitled":true}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{reopened}");
    let (status, same) = call(
        &host,
        "POST",
        "/api/server/project",
        json!({"session_id":reopened["session_id"],"name":"研究.wfpj"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(same["session_id"], reopened["session_id"]);
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
    let id = host.status().await.unwrap().session_id;
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/import",
        json!({"session_id":id,"name":"bad.parquet"}),
    )
    .await;
    assert!(!status.is_success());
    assert!(dir.path().join("data/bad.parquet").exists());
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
    assert!(!dir.path().join("projects/bad.wfpj").exists());
    assert_eq!(
        std::fs::read_dir(dir.path().join("projects"))
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
    let id = host.status().await.unwrap().session_id;
    let (status, result) = call(
        &host,
        "POST",
        &format!("/session/{id}/api/project/import"),
        json!({"sources":[{"table_name":"a#b?文", "sql":"SELECT 1 AS value"}]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{result}");
    let (status, error) = call(
        &host,
        "GET",
        &format!("/session/{id}/api/project/nodes/a%23b%3F%E6%96%87/schema"),
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
