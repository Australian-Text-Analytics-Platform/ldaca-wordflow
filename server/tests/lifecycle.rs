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
async fn settings_before_project_selection_share_host_ownership() {
    let (directory, host) = host().await;
    let (status, connection) = call(
        &host, "POST", "/api/ai/providers",
        json!({"name":"Synthetic host connection","provider":"custom","endpoint":"http://127.0.0.1:1/v1","credential":{"action":"remove"}}),
    ).await;
    assert_eq!(status, StatusCode::OK, "{connection}");
    let (_, locations) = call(&host, "GET", "/api/storage/locations", Value::Null).await;
    assert_eq!(locations["location_scope"], "server");
    assert_eq!(locations["directories"].as_array().unwrap().len(), 6);
    assert_eq!(
        locations["project_library"],
        directory
            .path()
            .canonicalize()
            .unwrap()
            .join("admin/projects")
            .to_string_lossy()
            .as_ref()
    );
    let project = create(&host).await;
    let (_, root) = call(&host, "GET", "/api/ai/providers", Value::Null).await;
    let (_, legacy) = call(
        &host,
        "GET",
        &format!("/project/{project}/api/ai/providers"),
        Value::Null,
    )
    .await;
    assert_eq!(root, legacy);
    assert!(
        root.as_array()
            .unwrap()
            .iter()
            .any(|item| item["id"] == connection["id"])
    );
    host.close().await.unwrap();
}

#[tokio::test]
async fn preference_patches_merge_visibility_and_highest_hint_version() {
    let (_directory, host) = host().await;
    let (status, _) = call(&host, "PATCH", "/api/preferences", json!({"hiddenTools":["plots"],"guidance":{"acknowledge":{"id":"plots.setup","version":2}}})).await;
    assert_eq!(status, StatusCode::OK);
    let (_, latest) = call(
        &host,
        "PATCH",
        "/api/preferences",
        json!({"theme":"dark-2026","guidance":{"acknowledge":{"id":"plots.setup","version":1}}}),
    )
    .await;
    assert_eq!(latest["schemaVersion"], 2);
    assert_eq!(latest["hiddenTools"], json!(["plots"]));
    assert_eq!(latest["guidance"]["acknowledgments"]["plots.setup"], 2);
    assert_eq!(latest["theme"], "dark-2026");
    host.close().await.unwrap();
}
#[tokio::test]
async fn permanent_untitled_names_and_working_metadata_survive_close() {
    let (_directory, host) = host().await;
    let first = create(&host).await;
    let second = create(&host).await;
    for (id, name) in [(&first, "Untitled-1"), (&second, "Untitled-2")] {
        let (status, response) = call(
            &host,
            "GET",
            &format!("/api/server/project/{id}"),
            Value::Null,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(response["project"]["title"], name);
        assert!(response["project"]["size"].as_u64().unwrap() > 0);
        assert!(response["project"]["modified"].as_u64().unwrap() > 0);
        assert!(
            response["project"]["path"]
                .as_str()
                .unwrap()
                .ends_with(&format!("{name}.wfpj"))
        );
    }
    let (_, registry) = call(&host, "GET", "/api/server", Value::Null).await;
    assert_eq!(registry["projects"].as_array().unwrap().len(), 2);
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/project/close",
        json!({"project_id":first}),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let third = create(&host).await;
    let (_, response) = call(
        &host,
        "GET",
        &format!("/api/server/project/{third}"),
        Value::Null,
    )
    .await;
    assert_eq!(response["project"]["title"], "Untitled-3");
    host.close().await.unwrap();
}

#[tokio::test]
#[ignore = "subprocess helper for external project ownership"]
async fn project_download_owner_child() {
    use std::io::Write;
    let runtime = wordflow_backend::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
    runtime
        .open(
            std::env::var_os("WORDFLOW_TEST_DOWNLOAD_PROJECT")
                .unwrap()
                .into(),
        )
        .await
        .unwrap();
    println!("project owner ready");
    std::io::stdout().flush().unwrap();
    std::io::stdin().read_line(&mut String::new()).unwrap();
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn closed_project_download_is_a_snapshot_and_respects_external_ownership() {
    use std::io::{BufRead, Write};
    use std::process::{Command, Stdio};
    let (directory, host) = host().await;
    let id = create(&host).await;
    let (status, result) = call(
        &host,
        "POST",
        &format!("/project/{id}/api/project/import"),
        json!({"sources":[{"table_name":"documents","sql":"SELECT '猫' AS text, 42 AS value"}]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(
        call(
            &host,
            "POST",
            "/api/server/project/close",
            json!({"project_id":id})
        )
        .await
        .0,
        StatusCode::NO_CONTENT
    );
    let path = directory.path().join("admin/projects/Untitled-1.wfpj");
    let original = std::fs::read(&path).unwrap();
    let mut owner = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "project_download_owner_child",
            "--ignored",
            "--nocapture",
        ])
        .env("WORDFLOW_TEST_DOWNLOAD_PROJECT", &path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut output = std::io::BufReader::new(owner.stdout.take().unwrap());
    loop {
        let mut line = String::new();
        assert!(output.read_line(&mut line).unwrap() > 0);
        if line.contains("project owner ready") {
            break;
        }
    }
    for (method, route, body) in [
        (
            "GET",
            "/api/server/files/projects/Untitled-1.wfpj",
            Value::Null,
        ),
        (
            "POST",
            "/api/server/project",
            json!({"name":"Untitled-1.wfpj"}),
        ),
        (
            "DELETE",
            "/api/server/files/projects/Untitled-1.wfpj",
            Value::Null,
        ),
    ] {
        assert!(!call(&host, method, route, body).await.0.is_success());
    }
    owner.stdin.take().unwrap().write_all(b"release\n").unwrap();
    assert!(owner.wait().unwrap().success());
    assert_eq!(std::fs::read(&path).unwrap(), original);
    let response = host
        .router()
        .oneshot(
            Request::builder()
                .uri("/api/server/files/projects/Untitled-1.wfpj")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let snapshot = directory.path().join("download.wfpj");
    std::fs::write(
        &snapshot,
        to_bytes(response.into_body(), usize::MAX).await.unwrap(),
    )
    .unwrap();
    let runtime = wordflow_backend::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
    runtime.open(snapshot).await.unwrap();
    let response = wordflow_backend::router(
        vec![],
        tokio_util::sync::CancellationToken::new(),
        runtime.clone(),
    )
    .oneshot(
        Request::builder()
            .uri("/api/project/graph")
            .body(Body::empty())
            .unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let graph: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(graph["nodes"][0]["table_name"], "documents", "{graph}");
    runtime.close().await.unwrap();
    assert!(host.status().await.unwrap().projects.is_empty());
    host.close().await.unwrap();
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
async fn one_server_stream_carries_native_tasks_and_registry_invalidations() {
    let (_directory, host) = host().await;
    let id = create(&host).await;
    let response = host
        .router()
        .oneshot(
            Request::builder()
                .uri(format!("/api/server/events?project_id={id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut events = response.into_body().into_data_stream();
    let mut initial = String::new();
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while !initial.contains("event: tasks") {
            initial.push_str(&String::from_utf8_lossy(
                &events.next().await.unwrap().unwrap(),
            ));
        }
    })
    .await
    .unwrap();
    assert_eq!(
        call(
            &host,
            "POST",
            &format!("/project/{id}/api/project/import"),
            json!({"sources":[{"table_name":"docs","sql":"SELECT 'cat' AS text"}]})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &host,
            "PATCH",
            "/api/preferences",
            json!({"theme":"dark-2026"})
        )
        .await
        .0,
        StatusCode::OK
    );
    let mut updates = String::new();
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while !(updates.contains("event: tasks")
            && updates.contains("succeeded")
            && updates.contains("data: changed"))
        {
            updates.push_str(&String::from_utf8_lossy(
                &events.next().await.unwrap().unwrap(),
            ));
        }
    })
    .await
    .unwrap();
    assert!(updates.contains("event: change"));
    drop(events);
    host.close().await.unwrap();
}
#[tokio::test]
async fn independent_projects_same_file_reuse_and_shared_close() {
    let (dir, host) = host().await;
    let id = create(&host).await;
    let new_id = create(&host).await;
    assert!(dir.path().join("admin/projects/Untitled-1.wfpj").exists());
    assert!(dir.path().join("admin/projects/Untitled-2.wfpj").exists());
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
        "/api/server/project/rename",
        json!({"project_id":id,"name":"研究.wfpj"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["project_id"], id);
    assert!(dir.path().join("admin/projects/研究.wfpj").exists());
    assert!(!dir.path().join("admin/projects/Untitled-1.wfpj").exists());
    assert_eq!(
        call(
            &host,
            "POST",
            "/api/server/project/rename",
            json!({"project_id":id,"name":"Untitled-2.wfpj"})
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
    let (status, duplicate) = call(
        &host,
        "POST",
        "/api/server/project/duplicate",
        json!({"project_id":id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{duplicate}");
    assert_eq!(duplicate["name"], "研究_copy.wfpj");
    assert_eq!(
        host.status().await.unwrap().projects.len(),
        2,
        "Duplicate must not open or select a new session"
    );
    let (status, copied) = call(
        &host,
        "POST",
        "/api/server/project",
        json!({"name":"研究_copy.wfpj"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{copied}");
    assert_ne!(copied["project_id"], id);
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
        StatusCode::NO_CONTENT
    );
    assert!(dir.path().join("admin/projects/Untitled-2.wfpj").exists());
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
        json!({"project_id":id,"names":["bad.parquet"]}),
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
        1
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

#[tokio::test]
async fn folders_selections_zip_and_mixed_import_share_atomic_native_planning() {
    let (dir, host) = host().await;
    let root = dir.path().join("admin/data");
    std::fs::create_dir_all(root.join("corpus/nested")).unwrap();
    std::fs::create_dir_all(root.join("other")).unwrap();
    std::fs::write(root.join("corpus/nested/a.txt"), "猫\nwhole file").unwrap();
    std::fs::write(root.join("corpus/b.txt"), "second").unwrap();
    std::fs::write(root.join("corpus/table.csv"), "id,text\n1,cat").unwrap();
    std::fs::write(root.join("corpus/readme.pdf"), "skip").unwrap();
    let id = create(&host).await;
    let names = json!(["corpus", "corpus/nested", "corpus/b.txt"]);
    let (status, plan) = call(
        &host,
        "POST",
        "/api/server/import/inspect",
        json!({"project_id":id,"names":names}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{plan}");
    assert_eq!(plan["text_name"], "folder_selection");
    assert_eq!(plan["files"].as_array().unwrap().len(), 3);
    let (status, result) = call(
        &host,
        "POST",
        "/api/server/import",
        json!({"project_id":id,"names":names}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["table_names"], json!(["table", "folder_selection"]));
    assert_eq!(result["skipped"].as_array().unwrap().len(), 1);
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/files/move",
        json!({"names":["corpus/nested","corpus/b.txt"],"destination":"other"}),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let response = host
        .router()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/server/files/download")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"library":"data","names":["other","other/nested"]}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    assert_eq!(
        archive.file_names().collect::<Vec<_>>(),
        [
            "other/",
            "other/b.txt",
            "other/nested/",
            "other/nested/a.txt"
        ]
    );
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/files/delete-batch",
        json!({"library":"data","names":["corpus/table.csv","does-not-exist.csv"]}),
    )
    .await;
    assert!(!status.is_success());
    assert!(root.join("corpus/table.csv").exists());
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/files/delete-batch",
        json!({"library":"data","names":["other","other/nested"]}),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(!root.join("other").exists());
    host.close().await.unwrap();
}

#[tokio::test]
async fn upload_protects_destination_ancestors_before_preflighting_entire_batches() {
    use axum::body::Bytes;
    let (dir, host) = host().await;
    let root = dir.path().join("admin/data");
    std::fs::create_dir_all(root.join("protected/nested")).unwrap();
    std::fs::create_dir_all(root.join("unrelated")).unwrap();
    std::fs::create_dir_all(root.join("destination")).unwrap();
    std::fs::write(root.join("unrelated/movable.txt"), "keep").unwrap();
    let (started, ready) = tokio::sync::oneshot::channel();
    let (send, receive) =
        tokio::sync::mpsc::channel::<std::result::Result<Bytes, std::io::Error>>(1);
    let stream = futures_util::stream::unfold(
        (Some(started), receive),
        |(mut started, mut receive)| async move {
            if let Some(started) = started.take() {
                let _ = started.send(());
            }
            receive
                .recv()
                .await
                .map(|chunk| (chunk, (started, receive)))
        },
    );
    let uploading = tokio::spawn(
        host.router().oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/server/files/data/protected%2Fnested%2Finput.csv")
                .body(Body::from_stream(stream))
                .unwrap(),
        ),
    );
    ready.await.unwrap();
    let (status, error) = call(
        &host,
        "POST",
        "/api/server/files/move",
        json!({"names":["unrelated/movable.txt","protected"],"destination":"destination"}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{error}");
    assert_eq!(error["error"]["code"], "upload_active");
    assert!(root.join("unrelated/movable.txt").exists());
    assert!(!root.join("destination/movable.txt").exists());
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/files/delete-batch",
        json!({"library":"data","names":["unrelated/movable.txt","protected/nested"]}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(root.join("unrelated/movable.txt").exists());
    let (status, _) = call(
        &host,
        "POST",
        "/api/server/files/move",
        json!({"names":["unrelated/movable.txt"],"destination":"destination"}),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    send.send(Ok(Bytes::from_static(b"id,text\n1,cat")))
        .await
        .unwrap();
    drop(send);
    assert_eq!(uploading.await.unwrap().unwrap().status(), StatusCode::OK);
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            let (status, _) = call(
                &host,
                "POST",
                "/api/server/files/move",
                json!({"names":["protected"],"destination":"destination"}),
            )
            .await;
            if status == StatusCode::NO_CONTENT {
                break;
            }
            assert_eq!(status, StatusCode::CONFLICT);
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(root.join("destination/protected/nested/input.csv").exists());
    host.close().await.unwrap();
}

#[tokio::test]
async fn disconnected_upload_releases_folder_protection_and_staged_bytes() {
    let (dir, host) = host().await;
    let root = dir.path().join("admin/data");
    std::fs::create_dir(root.join("receiving")).unwrap();
    let (started, ready) = tokio::sync::oneshot::channel();
    let stream = futures_util::stream::once(async move {
        started.send(()).unwrap();
        std::future::pending::<Result<axum::body::Bytes, std::io::Error>>().await
    });
    let uploading = tokio::spawn(
        host.router().oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/server/files/data/receiving%2Finput.csv")
                .body(Body::from_stream(stream))
                .unwrap(),
        ),
    );
    ready.await.unwrap();
    assert_eq!(
        call(
            &host,
            "POST",
            "/api/server/files/delete-batch",
            json!({"library":"data","names":["receiving"]})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    uploading.abort();
    assert!(uploading.await.unwrap_err().is_cancelled());
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            let (status, _) = call(
                &host,
                "POST",
                "/api/server/files/delete-batch",
                json!({"library":"data","names":["receiving"]}),
            )
            .await;
            if status == StatusCode::NO_CONTENT {
                break;
            }
            assert_eq!(status, StatusCode::CONFLICT);
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(std::fs::read_dir(root).unwrap().count(), 0);
    host.close().await.unwrap();
}
