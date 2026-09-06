#![allow(clippy::unwrap_used)]
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use ldaca_data_rs::{Client, ClientOptions, Error};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Clone, Default)]
struct Requests(
    Arc<Mutex<Vec<(String, String)>>>,
    Arc<tokio::sync::Notify>,
    Arc<tokio::sync::Notify>,
);

struct Server(tokio::task::JoinHandle<()>);
impl Drop for Server {
    fn drop(&mut self) {
        self.0.abort();
    }
}
async fn metadata(
    State(state): State<Requests>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Json<Value> {
    state.0.lock().unwrap().push((
        query["id"].clone(),
        headers
            .get("authorization")
            .map(|s| s.to_str().unwrap().into())
            .unwrap_or_default(),
    ));
    Json(json!({"@graph":[{"@id":"./","@type":"Dataset"}]}))
}
async fn search(Json(body): Json<Value>) -> Json<Value> {
    Json(
        json!({"hits":{"total":{"value":9},"hits":[{"_source":{"@id":"w","name":[{"@value":"Work"}]}}]},"aggregations":{"x":1},"request":body}),
    )
}
async fn file(
    State(state): State<Requests>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    match query.get("path").map(String::as_str) {
        Some("slow") => {
            state.1.notify_one();
            state.2.notified().await;
            "slow".into_response()
        }
        Some("missing") => StatusCode::NOT_FOUND.into_response(),
        _ => "Café".into_response(),
    }
}
async fn server() -> (String, Requests, Server) {
    let state = Requests::default();
    let app = Router::new()
        .route("/api/object/meta", get(metadata))
        .route("/api/search/index/items", post(search))
        .route("/api/stream", get(file))
        .route("/api/object", get(|| async { StatusCode::NOT_FOUND }))
        .with_state(state.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/api", listener.local_addr().unwrap());
    let handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (url, state, Server(handle))
}
#[tokio::test]
async fn credentials_are_bound_to_views_and_identifiers_are_encoded_once() {
    let (base, state, server) = server().await;
    let client = Client::new(
        None,
        ClientOptions {
            base_url: base,
            ..Default::default()
        },
    )
    .unwrap();
    let a = client.with_api_key(Some("a")).unwrap();
    let b = client.with_api_key(Some("b")).unwrap();
    let id = "arcp://name,thing/é?x=1&y=2";
    let (left, right) = tokio::join!(
        a.get_metadata(id, false, false),
        b.get_metadata(id, false, false)
    );
    left.unwrap();
    right.unwrap();
    let requests = state.0.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests.contains(&(id.into(), "Bearer a".into())));
    assert!(requests.contains(&(id.into(), "Bearer b".into())));
    assert!(!format!("{a:?}").contains("Bearer"));
    drop(server);
}
#[tokio::test]
async fn search_keeps_raw_results_and_aggregations() {
    let (base, _, server) = server().await;
    let client = Client::new(
        None,
        ClientOptions {
            base_url: base,
            ..Default::default()
        },
    )
    .unwrap();
    let page = client.search("keyword", "Café", 2, 4).await.unwrap();
    assert_eq!(page.total, 9);
    assert_eq!(page.raw["aggregations"], json!({"x":1}));
    assert_eq!(page.raw["request"]["from"], 4);
    assert_eq!(page.items[0]["title"], "Work");
    assert!(client.get_object("absent").await.unwrap().is_none());
    drop(server);
}
#[tokio::test]
async fn download_budgets_and_timeouts_are_failures() {
    let (base, _, server) = server().await;
    let client = Client::new(
        None,
        ClientOptions {
            base_url: base,
            timeout: Duration::from_millis(50),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(matches!(
        client
            .download_texts("id", &["x".into(), "y".into()], 5)
            .await,
        Err(Error::Limit(_))
    ));
    assert!(matches!(
        client.download_texts("id", &["slow".into()], 100).await,
        Err(Error::Timeout)
    ));
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("file");
    assert!(client.download_file("id", "x", &path, 1).await.is_err());
    assert!(!path.exists());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    drop(server);
}
#[tokio::test]
async fn close_cancels_an_inflight_request() {
    let (base, state, server) = server().await;
    let client = Client::new(
        None,
        ClientOptions {
            base_url: base,
            ..Default::default()
        },
    )
    .unwrap();
    let paths = ["slow".into()];
    let operation = client.download_texts("id", &paths, 100);
    let close = async {
        state.1.notified().await;
        client.close();
    };
    let (result, ()) = tokio::time::timeout(Duration::from_secs(3), async {
        tokio::join!(operation, close)
    })
    .await
    .unwrap();
    assert!(matches!(result, Err(Error::Cancelled)));
    drop(server);
}

#[tokio::test]
async fn redirect_limits_cross_origin_headers_and_bad_responses() {
    let received: Arc<Mutex<Vec<Option<String>>>> = Default::default();
    let target = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target_url = format!("http://{}", target.local_addr().unwrap());
    let observations = received.clone();
    let destination = Router::new().route(
        "/capture",
        get(move |headers: HeaderMap| {
            let observations = observations.clone();
            async move {
                observations.lock().unwrap().push(
                    headers
                        .get("authorization")
                        .map(|v| v.to_str().unwrap().into()),
                );
                Json(json!({}))
            }
        }),
    );
    let destination_task = Server(tokio::spawn(async move {
        axum::serve(target, destination).await.unwrap();
    }));
    let redirect_url = format!("{target_url}/capture");
    let app = Router::new()
        .route(
            "/api/configuration",
            get(move || {
                let url = redirect_url.clone();
                async move { (StatusCode::FOUND, [("location", url)], "") }
            }),
        )
        .route(
            "/api/version",
            get(|| async { (StatusCode::FOUND, [("location", "/api/version")], "") }),
        )
        .route("/api/object/meta", get(|| async { "invalid json" }))
        .route(
            "/api/authenticated",
            get(|| async { StatusCode::FORBIDDEN }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}/api", listener.local_addr().unwrap());
    let task = Server(tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    }));
    let client = Client::new(
        Some("private-key"),
        ClientOptions {
            base_url: base,
            ..Default::default()
        },
    )
    .unwrap();
    client.configuration().await.unwrap();
    assert_eq!(*received.lock().unwrap(), vec![None]);
    assert!(matches!(
        client.version().await,
        Err(Error::InvalidResponse(_))
    ));
    assert!(matches!(
        client.get_metadata("x", false, false).await,
        Err(Error::InvalidResponse(_))
    ));
    assert!(matches!(
        client.authenticated().await,
        Err(Error::Http(403))
    ));
    drop(task);
    drop(destination_task);
}
