use super::*;
use crate::project::{SqlBatch, SqlResponse};
use axum::{
    Router,
    body::{Body, to_bytes},
    http::Request,
    response::Response,
};
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;
use tower::ServiceExt;

async fn send(router: &Router, method: &str, uri: &str, body: Value) -> Response {
    router
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn json_body(response: Response) -> Value {
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

fn input(column: &str) -> Value {
    json!({"inputs":[{"source":{"schema":"data","name":"documents"},"column":column,"tokenizer":"native:plain_words_en"}]})
}

async fn fixture() -> (ProjectRuntime, Router, String) {
    let project = ProjectRuntime::new(CancellationToken::new());
    project.create(None).await.unwrap();
    project.sql(SqlBatch {
        script: Some("CREATE TABLE documents(text VARCHAR); INSERT INTO documents VALUES ('Alpha beta alpha'), (NULL)".into()),
        response: SqlResponse::Command,
        ..Default::default()
    }).await.unwrap();
    let router = crate::api::router()
        .split_for_parts()
        .0
        .with_state(project.clone());
    let response = send(
        &router,
        "POST",
        "/api/project/tabs",
        json!({"kind":"frequency"}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let tab = json_body(response).await;
    (project, router, tab["id"].as_str().unwrap().to_owned())
}

#[tokio::test]
async fn frequency_routes_identify_accepted_success_and_leave_reads_untracked() {
    let (project, router, tab_id) = fixture().await;
    let response = send(
        &router,
        "POST",
        &format!("/api/project/tabs/{tab_id}/frequency"),
        input("text"),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let task_id =
        Uuid::parse_str(response.headers()["x-wordflow-task-id"].to_str().unwrap()).unwrap();
    let result = json_body(response).await;
    assert_eq!(result["kind"], "frequency");
    assert_eq!(result["result"]["version"], 1);
    assert_eq!(result["tab_id"], tab_id);
    assert_eq!(
        result["result"]["payload"]["corpora"][0]["total_tokens"],
        "3"
    );
    let result_id = result["id"].as_str().unwrap();
    for uri in [
        "/api/project/tokenizers".to_owned(),
        "/api/project/tabs".to_owned(),
        format!("/api/project/analyses/{result_id}"),
    ] {
        let response = send(&router, "GET", &uri, Value::Null).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(!response.headers().contains_key("x-wordflow-task-id"));
    }
    let page = send(
        &router,
        "POST",
        &format!("/api/project/analyses/{result_id}/frequency/query"),
        json!({"page":1,"page_size":1}),
    )
    .await;
    assert_eq!(page.status(), StatusCode::OK);
    assert_eq!(
        page.headers()["content-type"],
        "application/vnd.apache.arrow.stream"
    );
    assert_eq!(page.headers()["x-wordflow-total-rows"], "2");
    let bytes = to_bytes(page.into_body(), usize::MAX).await.unwrap();
    let mut reader =
        arrow_ipc::reader::StreamReader::try_new(std::io::Cursor::new(bytes), None).unwrap();
    let batch = reader.next().unwrap().unwrap();
    assert_eq!(batch.num_rows(), 1);
    assert_eq!(
        batch.schema().field(1).data_type(),
        &duckdb::arrow::datatypes::DataType::UInt64
    );
    assert_eq!(project.tasks().tasks.len(), 1);
    assert_eq!(project.tasks().tasks[0].id, task_id);
    assert_eq!(
        project.tasks().tasks[0].tab_id,
        Some(Uuid::parse_str(&tab_id).unwrap())
    );

    let export = send(
        &router,
        "POST",
        &format!("/api/project/analyses/{result_id}/frequency/export"),
        json!({"query":{},"format":"csv"}),
    )
    .await;
    assert_eq!(export.status(), StatusCode::OK);
    assert!(!export.headers().contains_key("x-wordflow-task-id"));
    let csv = String::from_utf8(
        to_bytes(export.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    assert!(csv.contains("\"alpha\",\"2\""));
    assert!(csv.contains("\"beta\",\"1\""));
    project.sql(SqlBatch {script:Some("CREATE TABLE stopwords(word VARCHAR); INSERT INTO stopwords VALUES (' ALPHA '),('alpha'),(NULL)".into()),..Default::default()}).await.unwrap();
    let bundle=send(&router,"POST",&format!("/api/project/analyses/{result_id}/frequency/export"),json!({"query":{"stopword_source":{"source":{"schema":"data","name":"stopwords"},"column":"word"}},"format":"csv","include_stopwords":true})).await;
    assert_eq!(bundle.status(), StatusCode::OK);
    assert!(
        bundle.headers()["content-type"]
            .to_str()
            .unwrap()
            .starts_with("multipart/form-data; boundary=")
    );
    let bytes = String::from_utf8(
        to_bytes(bundle.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    assert!(bytes.contains("name=\"table\""));
    assert!(bytes.contains("name=\"stopwords\""));
    assert!(bytes.contains("\"beta\",\"1\""));
    assert!(!bytes.contains("\"alpha\",\"2\""));
    assert!(bytes.contains("alpha\n"));
    let legacy = send(
        &router,
        "POST",
        &format!("/api/project/analyses/{result_id}/frequency/query"),
        json!({"stopwords":["alpha"]}),
    )
    .await;
    assert_eq!(legacy.status(), StatusCode::BAD_REQUEST);
    assert_eq!(project.tasks().tasks.len(), 1);
    project.close().await.unwrap();
}

#[tokio::test]
async fn failed_run_has_one_task_and_structured_error_while_rejected_request_has_none() {
    let (project, router, tab_id) = fixture().await;
    let uri = format!("/api/project/tabs/{tab_id}/frequency");
    let invalid = send(&router, "POST", &uri, json!({"inputs":[]})).await;
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
    assert!(!invalid.headers().contains_key("x-wordflow-task-id"));
    assert_eq!(json_body(invalid).await["error"]["code"], "invalid_request");
    assert!(project.tasks().tasks.is_empty());

    let failed = send(&router, "POST", &uri, input("missing")).await;
    assert_eq!(failed.status(), StatusCode::BAD_REQUEST);
    let task_id =
        Uuid::parse_str(failed.headers()["x-wordflow-task-id"].to_str().unwrap()).unwrap();
    let error = json_body(failed).await;
    assert_eq!(error["error"]["code"], "sql_error");
    assert!(
        error["error"]["message"]
            .as_str()
            .unwrap()
            .contains("missing")
    );
    let tasks = project.tasks();
    assert_eq!(tasks.tasks.len(), 1);
    assert_eq!(tasks.tasks[0].id, task_id);
    assert_eq!(tasks.tasks[0].state, crate::TaskState::Failed);
    assert_eq!(tasks.tasks[0].error.as_ref().unwrap().code, "sql_error");
    let retry = send(&router, "POST", &uri, input("text")).await;
    assert_eq!(retry.status(), StatusCode::OK);
    assert_eq!(project.tasks().tasks.len(), 2);
    project.close().await.unwrap();
}

#[tokio::test]
async fn tokenizer_catalogue_needs_no_project_or_task() {
    let project = ProjectRuntime::new(CancellationToken::new());
    let response = send(
        &crate::api::router()
            .split_for_parts()
            .0
            .with_state(project.clone()),
        "GET",
        "/api/project/tokenizers",
        Value::Null,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let models = json_body(response).await;
    assert!(
        models
            .as_array()
            .unwrap()
            .iter()
            .any(|model| model["model_id"] == "native:plain_words_en")
    );
    assert!(project.tasks().tasks.is_empty());
    project.close().await.unwrap();
}

#[tokio::test]
async fn concordance_preview_saved_queries_and_publication_have_distinct_ownership() {
    let (project, router, _) = fixture().await;
    let tab = json_body(
        send(
            &router,
            "POST",
            "/api/project/tabs",
            json!({"kind":"concordance"}),
        )
        .await,
    )
    .await;
    assert_eq!(tab["name"], "Concordance 1");
    let id = tab["id"].as_str().unwrap();
    let source =
        json!({"source":{"schema":"data","name":"documents"},"column":"text","tokenizer":null});
    let search = json!({"query":"alpha"});
    let response = send(
        &router,
        "POST",
        &format!("/api/project/tabs/{id}/concordance/preview"),
        json!({"input":source,"search":search,"page":1,"page_size":1}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert!(!response.headers().contains_key("x-wordflow-task-id"));
    assert_eq!(response.headers()["x-wordflow-has-next"], "true");
    assert_eq!(response.headers()["x-wordflow-match-count"], "2");
    let response = send(
        &router,
        "POST",
        &format!("/api/project/tabs/{id}/concordance"),
        json!({"inputs":[source],"search":search}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().contains_key("x-wordflow-task-id"));
    let result = json_body(response).await;
    let mut result_id = result["id"].as_str().unwrap().to_owned();
    let response=send(&router,"POST",&format!("/api/project/analyses/{result_id}/concordance/query"),json!({"source_index":0,"projection":"matches","page":1,"page_size":1,"sort":{"field":"start_idx","descending":true}})).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["x-wordflow-total-rows"], "2");
    let bad = send(
        &router,
        "POST",
        &format!("/api/project/tabs/{id}/concordance"),
        json!({"inputs":[source],"search":{"query":"[","regex":true}}),
    )
    .await;
    assert!(!bad.status().is_success());
    assert!(bad.headers().contains_key("x-wordflow-task-id"));
    let current = json_body(
        send(
            &router,
            "GET",
            "/api/project/tabs?kind=concordance",
            Value::Null,
        )
        .await,
    )
    .await;
    assert!(!current[0]["analysis"]["has_result"].as_bool().unwrap());
    assert_eq!(current[0]["analysis"]["request"]["search"]["query"], "[");
    assert!(current[0]["settings"].get("request").is_none());
    let replacement = json_body(
        send(
            &router,
            "POST",
            &format!("/api/project/tabs/{id}/concordance"),
            json!({"inputs":[source],"search":search}),
        )
        .await,
    )
    .await;
    result_id = replacement["id"].as_str().unwrap().to_owned();
    project
        .sql(SqlBatch {
            script: Some("DROP TABLE documents".into()),
            response: SqlResponse::Command,
            ..Default::default()
        })
        .await
        .unwrap();
    let published=send(&router,"POST",&format!("/api/project/analyses/{result_id}/concordance/publish"),json!({"projection":"documents","sources":[{"source_index":0,"name":"retained","metadata":[],"fields":[]}]})).await;
    assert_eq!(published.status(), StatusCode::OK);
    assert!(published.headers().contains_key("x-wordflow-task-id"));
}

#[tokio::test]
#[ignore = "requires explicitly provisioned WORDFLOW_QUOTATION_MODEL"]
async fn quotation_preview_tasks_and_saved_publication_use_native_ownership() {
    assert!(std::env::var_os("WORDFLOW_QUOTATION_MODEL").is_some());
    let (project, router, _) = fixture().await;
    project.sql(SqlBatch {script:Some("UPDATE documents SET text='Alice said, \"The project will finish tomorrow morning.\"'".into()),response:SqlResponse::Command,..Default::default()}).await.unwrap();
    let tab = json_body(
        send(
            &router,
            "POST",
            "/api/project/tabs",
            json!({"kind":"quotation"}),
        )
        .await,
    )
    .await;
    let id = tab["id"].as_str().unwrap();
    let input = json!({"source":{"schema":"data","name":"documents"},"column":"text"});
    let preview = send(
        &router,
        "POST",
        &format!("/api/project/tabs/{id}/quotation/preview"),
        json!({"input":input,"page":1,"page_size":1}),
    )
    .await;
    assert_eq!(preview.status(), StatusCode::OK);
    assert!(!preview.headers().contains_key("x-wordflow-task-id"));
    assert_eq!(preview.headers()["x-wordflow-has-next"], "true");
    assert_eq!(preview.headers()["x-wordflow-match-count"], "1");
    assert!(project.tasks().tasks.is_empty());
    let run = send(
        &router,
        "POST",
        &format!("/api/project/tabs/{id}/quotation"),
        json!({"input":input}),
    )
    .await;
    assert_eq!(run.status(), StatusCode::OK);
    assert!(run.headers().contains_key("x-wordflow-task-id"));
    let result = json_body(run).await;
    let result_id = result["id"].as_str().unwrap();
    let failed = send(
        &router,
        "POST",
        &format!("/api/project/tabs/{id}/quotation"),
        json!({"input":{"source":{"schema":"data","name":"missing"},"column":"text"}}),
    )
    .await;
    assert!(!failed.status().is_success());
    assert!(failed.headers().contains_key("x-wordflow-task-id"));
    let current = json_body(
        send(
            &router,
            "GET",
            "/api/project/tabs?kind=quotation",
            Value::Null,
        )
        .await,
    )
    .await;
    assert!(!current[0]["analysis"]["has_result"].as_bool().unwrap());
    assert_eq!(
        current[0]["analysis"]["request"]["input"]["source"]["name"],
        "missing"
    );
    assert!(
        project
            .analysis(Uuid::parse_str(result_id).unwrap())
            .await
            .is_err()
    );
    let replacement = json_body(
        send(
            &router,
            "POST",
            &format!("/api/project/tabs/{id}/quotation"),
            json!({"input":input}),
        )
        .await,
    )
    .await;
    let result_id = replacement["id"].as_str().unwrap();
    project
        .sql(SqlBatch {
            script: Some("DROP TABLE documents".into()),
            response: SqlResponse::Command,
            ..Default::default()
        })
        .await
        .unwrap();
    let query=send(&router,"POST",&format!("/api/project/analyses/{result_id}/quotation/query"),json!({"projection":"matches","page":1,"page_size":1,"sort":{"field":"quote_token_count","descending":true}})).await;
    assert_eq!(query.status(), StatusCode::OK);
    assert_eq!(query.headers()["x-wordflow-total-rows"], "2");
    let publish = send(
        &router,
        "POST",
        &format!("/api/project/analyses/{result_id}/quotation/publish"),
        json!({"projection":"matches","name":"quotes","metadata":[],"fields":["quote","speaker"]}),
    )
    .await;
    assert_eq!(publish.status(), StatusCode::OK);
    assert!(publish.headers().contains_key("x-wordflow-task-id"));
    project.close().await.unwrap();
}
