use arrow_ipc::reader::{FileReader, StreamReader};
use duckdb::arrow::{
    array::{Array, BinaryArray, Float64Array, Int64Array, ListArray, StringArray, StructArray},
    record_batch::RecordBatch,
};
use serde_json::{Value, json};
use std::{io::Cursor, path::PathBuf, time::Duration};
use tokio::{net::TcpListener, task::JoinHandle, time::timeout};
use tokio_util::sync::CancellationToken;

const A: &str = "a";
const B: &str = "b";
const C: &str = "c";
const D: &str = "other";

struct App {
    url: String,
    client: reqwest::Client,
    shutdown: CancellationToken,
    task: JoinHandle<std::io::Result<()>>,
    directory: tempfile::TempDir,
    path: PathBuf,
}
impl App {
    async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let shutdown = CancellationToken::new();
        let task = tokio::spawn(wordflow_backend::serve(
            listener,
            vec![],
            shutdown.clone(),
            wordflow_backend::ProjectRuntime::new(shutdown.clone()),
        ));
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("project.wfpj");
        Self {
            url,
            client: reqwest::Client::new(),
            shutdown,
            task,
            directory,
            path,
        }
    }
    async fn post(&self, path: &str, body: Value) -> reqwest::Response {
        self.client
            .post(format!("{}/api/project{path}", self.url))
            .json(&body)
            .send()
            .await
            .unwrap()
    }
    async fn create(&self) {
        let response = self.post("/create", json!({"path":self.path})).await;
        let status = response.status();
        let text = response.text().await.unwrap();
        assert_eq!(status, 201, "{text}");
    }
    async fn action(&self, id: &str, action: &str, body: Value) {
        let response = self.post(&format!("/nodes/{id}/{action}"), body).await;
        let status = response.status();
        let text = response.text().await.unwrap();
        assert_eq!(status, if action == "rename" { 200 } else { 204 }, "{text}");
    }
    async fn sql_response(&self, statements: &[&str]) -> reqwest::Response {
        self.post("/sql",json!({"statements":statements.iter().map(|sql|json!({"sql":sql})).collect::<Vec<_>>()})).await
    }
    async fn sql(&self, statements: &[&str]) -> Vec<RecordBatch> {
        let response = self.sql_response(statements).await;
        let status = response.status();
        let bytes = response.bytes().await.unwrap();
        assert_eq!(status, 200, "{}", String::from_utf8_lossy(&bytes));
        StreamReader::try_new(Cursor::new(bytes), None)
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }
    async fn number(&self, sql: &str) -> i64 {
        let batches = self.sql(&[sql]).await;
        batches[0]
            .column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap()
            .value(0)
    }
    async fn graph(&self) -> Value {
        let response = self
            .client
            .get(format!("{}/api/project/graph", self.url))
            .send()
            .await
            .unwrap();
        let status = response.status();
        let body: Value = response.json().await.unwrap();
        assert_eq!(status, 200, "{body}");
        body
    }
    async fn close(&self) {
        assert_eq!(self.post("/close", json!({})).await.status(), 204);
    }
    async fn reopen(&mut self) {
        self.close().await;
        self.restart().await;
        let response = self.post("/open", json!({"path":self.path})).await;
        let status = response.status();
        let text = response.text().await.unwrap();
        assert_eq!(status, 200, "{text}");
    }
    async fn restart(&mut self) {
        self.shutdown.cancel();
        let shutdown = CancellationToken::new();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        self.url = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(wordflow_backend::serve(
            listener,
            vec![],
            shutdown.clone(),
            wordflow_backend::ProjectRuntime::new(shutdown.clone()),
        ));
        let previous = std::mem::replace(&mut self.task, task);
        timeout(Duration::from_secs(10), previous)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        self.shutdown = shutdown;
    }
    async fn fixture(&self) {
        self.create().await;
        self.sql(&[
            "CREATE TABLE a AS SELECT 1::BIGINT AS x, 'one' AS label UNION ALL SELECT 2, 'two'",
            "CREATE TABLE other AS SELECT 10::BIGINT AS x, 'ten' AS label",
            "CREATE VIEW b AS SELECT x*2 AS y,label FROM a",
            "CREATE VIEW c AS SELECT y+1 AS z FROM b",
            &format!("INSERT INTO wordflow.nodes(table_name,color,document_column) VALUES ('{A}','#123456','label'),('{B}',NULL,NULL),('{C}',NULL,NULL),('{D}',NULL,NULL)"),
            "INSERT INTO wordflow.tokenizer_models VALUES ('a','label','example'),('a','x','another-model')",
            &format!("INSERT INTO wordflow.edges VALUES ('{A}','{B}'),('{B}','{C}')"),
        ]).await;
    }
    async fn finish(self) {
        self.shutdown.cancel();
        timeout(Duration::from_secs(7), self.task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
}

#[tokio::test]
async fn embedded_data_metadata_and_results_survive_relocation() {
    let mut app = App::start().await;
    app.fixture().await;
    let csv = app.directory.path().join("input.csv");
    std::fs::write(&csv, "document,n\nhello,42\n").unwrap();
    let response=app.post("/sql",json!({"statements":[
        {"sql":"CREATE TABLE imported AS SELECT * FROM read_csv(?)","parameters":[csv]},
        {"sql":"COPY imported TO ? (FORMAT PARQUET)","parameters":[app.directory.path().join("input.parquet")]},
        {"sql":"CREATE TABLE from_parquet AS SELECT * FROM read_parquet(?)","parameters":[app.directory.path().join("input.parquet")]},
        {"sql":"INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data', ?, json_array('label'), 'org.ldaca.wordflow.topic_coverage.v1', '{\"version\":1}')","parameters":[A]},
        {"sql":"INSERT INTO wordflow.tabs(id,kind,name,position) VALUES (?, 'test', 'Saved analysis', 0)","parameters":["00000000-0000-4000-8000-000000000002"]},
        {"sql":"INSERT INTO wordflow.analyses(id,tab_id,request,result,result_version,finished_at) VALUES (?, ?, '{\"seed\":42}','{\"tables\":[]}',1,current_timestamp)","parameters":["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002"]},
        {"sql":"INSERT INTO wordflow.artifacts(analysis_id,name,storage_kind,media_type,content) VALUES (?, 'model', 'blob', 'application/octet-stream', from_hex('00FF10'))","parameters":["00000000-0000-4000-8000-000000000001"]}
    ]})).await;
    let status = response.status();
    let text = response.bytes().await.unwrap();
    assert_eq!(status, 200, "{}", String::from_utf8_lossy(&text));
    std::fs::remove_file(csv).unwrap();
    std::fs::remove_file(app.directory.path().join("input.parquet")).unwrap();
    app.close().await;
    let moved = app.directory.path().join("renamed.wfpj");
    std::fs::rename(&app.path, &moved).unwrap();
    app.path = moved;
    app.restart().await;
    assert_eq!(
        app.post("/open", json!({"path":app.path})).await.status(),
        200
    );
    assert_eq!(app.number("SELECT n::BIGINT FROM from_parquet").await, 42);
    assert_eq!(
        app.number("SELECT octet_length(content)::BIGINT FROM wordflow.artifacts")
            .await,
        3
    );
    assert_eq!(
        app.number(
            "SELECT count(*) FROM wordflow.tabs t JOIN wordflow.analyses r ON r.tab_id=t.id"
        )
        .await,
        1
    );
    let rows = app
        .sql(&["SELECT extension_name,extension_metadata FROM wordflow.arrow_metadata"])
        .await;
    assert_eq!(
        rows[0]
            .column(1)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap()
            .value(0),
        "{\"version\":1}"
    );
    let graph = app.graph().await;
    assert_eq!(graph["nodes"][0]["color"], "#123456");
    assert_eq!(graph["nodes"][1]["table_name"], "b");
    assert!(graph["nodes"][1].get("name").is_none());
    assert_eq!(graph["edges"][0]["dependency"], true);
    app.finish().await;
}

#[tokio::test]
async fn nested_view_edits_undo_preserve_block_identity() {
    let mut app = App::start().await;
    app.fixture().await;
    app.sql(&[
        "ALTER TABLE a RENAME TO a_raw",
        "CREATE VIEW a AS SELECT * FROM a_raw",
        "INSERT INTO wordflow.nodes(table_name,visible) VALUES ('a_raw',false)",
        "INSERT INTO wordflow.edges VALUES ('a_raw','a')",
    ])
    .await;
    app.action(
        A,
        "edit",
        json!({"sql":"SELECT __wf_current.x + 1 AS x, label FROM __wf_current"}),
    )
    .await;
    assert_eq!(app.number("SELECT min(z)::BIGINT FROM c").await, 5);
    app.action(
        A,
        "edit",
        json!({"sql":"SELECT x::VARCHAR AS x,label FROM __wf_current"}),
    )
    .await;
    app.action(
        A,
        "edit",
        json!({"sql":"SELECT x FROM __wf_current WHERE x='2'"}),
    )
    .await;
    app.reopen().await;
    assert_eq!(app.number("SELECT count(*) FROM a").await, 1);
    app.action(A, "undo", json!({})).await;
    assert_eq!(app.number("SELECT count(*) FROM a").await, 2);
    app.action(A, "undo", json!({})).await;
    app.action(A, "undo", json!({})).await;
    assert_eq!(app.number("SELECT min(x)::BIGINT FROM a").await, 1);
    assert_eq!(
        app.post(&format!("/nodes/{A}/undo"), json!({}))
            .await
            .status(),
        409
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.nodes WHERE NOT visible")
            .await,
        1
    );
    assert_eq!(app.graph().await["nodes"].as_array().unwrap().len(), 4);
    app.finish().await;
}

#[tokio::test]
async fn replacements_and_materialization_keep_logical_edges_and_leave_outputs_alone() {
    let mut app = App::start().await;
    app.fixture().await;
    app.sql(&["CREATE TABLE saved_result AS SELECT * FROM c"])
        .await;
    app.action(
        B,
        "replace-source",
        json!({"old_source_name":A,"new_source_name":D}),
    )
    .await;
    assert_eq!(app.number("SELECT z FROM c").await, 21);
    assert_eq!(app.number("SELECT min(z) FROM saved_result").await, 3);
    app.action(B, "materialize", json!({})).await;
    let graph = app.graph().await;
    assert!(
        graph["edges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["source_name"] == D && e["target_name"] == B && e["dependency"] == false)
    );
    app.sql(&["UPDATE other SET x=99"]).await;
    assert_eq!(app.number("SELECT z FROM c").await, 21);
    assert_eq!(
        app.post(&format!("/nodes/{B}/undo"), json!({}))
            .await
            .status(),
        409
    );
    app.sql(&["UPDATE b SET y=31"]).await;
    assert_eq!(app.number("SELECT z FROM c").await, 32);
    app.reopen().await;
    assert_eq!(app.number("SELECT z FROM c").await, 32);
    app.finish().await;
}

#[tokio::test]
async fn source_rewrite_respects_bindings_nested_queries_and_catalog_aliases() {
    let app = App::start().await;
    app.fixture().await;
    for (query, expected) in [
        ("SELECT data.a.x::BIGINT AS y FROM data.a", 10),
        ("SELECT a.x::BIGINT AS y FROM data.a", 10),
        ("SELECT old.x::BIGINT AS y FROM data.a AS old", 10),
        (
            "SELECT sum(a.x+q.x)::BIGINT AS y FROM data.a CROSS JOIN (SELECT x FROM data.a) q",
            20,
        ),
        (
            "WITH a AS (SELECT 100::BIGINT AS x) SELECT src.x+local.x AS y FROM data.a src CROSS JOIN a local",
            110,
        ),
        (
            "SELECT a.x+(SELECT sum(a.x) FROM (SELECT 100::BIGINT AS x) a) AS y FROM data.a",
            110,
        ),
        (
            "SELECT (SELECT sum(inside.x) FROM data.a inside WHERE inside.x=outside.x)::BIGINT AS y FROM data.a outside",
            10,
        ),
    ] {
        app.sql(&[&format!("CREATE OR REPLACE VIEW b AS {query}")])
            .await;
        app.action(
            B,
            "replace-source",
            json!({"old_source_name":A,"new_source_name":D}),
        )
        .await;
        assert_eq!(
            app.number("SELECT min(y)::BIGINT FROM b").await,
            expected,
            "{query}"
        );
    }
    app.sql(&["CREATE OR REPLACE VIEW b AS SELECT a.*, 'data.a' AS literal FROM data.a"])
        .await;
    app.action(
        B,
        "replace-source",
        json!({"old_source_name":A,"new_source_name":D}),
    )
    .await;
    let rows = app.sql(&["SELECT literal FROM b"]).await;
    assert_eq!(
        rows[0]
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap()
            .value(0),
        "data.a"
    );
    app.sql(&["CREATE OR REPLACE VIEW b (\"Odd AS name\",label) AS SELECT x,label FROM a"])
        .await;
    app.action(
        B,
        "edit",
        json!({"sql":"SELECT \"Odd AS name\" FROM __wf_current"}),
    )
    .await;
    app.action(B, "undo", json!({})).await;
    assert_eq!(
        app.number("SELECT min(\"Odd AS name\")::BIGINT FROM b")
            .await,
        1
    );
    app.finish().await;
}

#[tokio::test]
async fn errors_rollback_the_target_without_prevalidating_descendants() {
    let app = App::start().await;
    app.fixture().await;
    let error = app
        .sql_response(&["UPDATE a SET x=99", "SELECT missing FROM a"])
        .await;
    assert_eq!(error.status(), 400);
    assert_eq!(
        error.json::<Value>().await.unwrap()["error"]["code"],
        "sql_error"
    );
    assert_eq!(app.number("SELECT min(x) FROM a").await, 1);
    assert_eq!(
        app.post(
            &format!("/nodes/{A}/edit"),
            json!({"sql":"SELECT missing FROM __wf_current"})
        )
        .await
        .status(),
        400
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.nodes WHERE NOT visible")
            .await,
        0
    );
    app.action(B, "edit", json!({"sql":"SELECT label FROM __wf_current"}))
        .await;
    assert_eq!(app.sql_response(&["SELECT * FROM c"]).await.status(), 400);
    assert_eq!(app.number("SELECT min(x) FROM a").await, 1);
    app.action(B, "undo", json!({})).await;
    assert_eq!(app.number("SELECT min(z) FROM c").await, 3);
    app.finish().await;
}

#[tokio::test]
async fn sql_boundaries_prevent_transaction_escape_and_handle_quoted_semicolons() {
    let app = App::start().await;
    app.fixture().await;
    for sql in [
        "COMMIT",
        "--comment\nEND",
        "SELECT 1; COMMIT;",
        "SET enable_view_dependencies=true",
        "PREPARE bad AS COMMIT",
        "PRAGMA version",
        "/* outer /* inner */ */ ROLLBACK",
    ] {
        assert_eq!(
            app.sql_response(&["UPDATE a SET x=99", sql]).await.status(),
            400,
            "{sql}"
        );
        assert_eq!(app.number("SELECT min(x) FROM a").await, 1);
    }
    app.sql(&["SELECT '; COMMIT; ' AS \"name; AS\", $$;COMMIT;$$ AS dollar; -- trailing comment"])
        .await;
    app.sql(&[r"SELECT E'escaped\'; COMMIT; quote' AS escaped"])
        .await;
    assert_eq!(
        app.sql_response(&[r"SELECT E'escaped\' quote'; COMMIT;"])
            .await
            .status(),
        400
    );
    app.finish().await;
}

#[tokio::test]
async fn arrow_preserves_large_integers_nulls_nested_values_and_command_completion() {
    let app = App::start().await;
    app.create().await;
    let rows=app.sql(&["SELECT 9007199254740993::BIGINT AS large,NULL::BIGINT AS missing,[{'topic_id':1::BIGINT,'coverage':0.5::DOUBLE}] AS topics,from_hex('00FF') AS bytes"]).await;
    assert_eq!(
        rows[0]
            .column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap()
            .value(0),
        9007199254740993
    );
    assert!(rows[0].column(1).is_null(0));
    let topics = rows[0]
        .column(2)
        .as_any()
        .downcast_ref::<ListArray>()
        .unwrap()
        .value(0);
    let topic = topics.as_any().downcast_ref::<StructArray>().unwrap();
    assert_eq!(
        topic
            .column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap()
            .value(0),
        1
    );
    assert_eq!(
        topic
            .column(1)
            .as_any()
            .downcast_ref::<Float64Array>()
            .unwrap()
            .value(0),
        0.5
    );
    assert_eq!(
        rows[0]
            .column(3)
            .as_any()
            .downcast_ref::<BinaryArray>()
            .unwrap()
            .value(0),
        &[0, 255]
    );
    let rows = app.sql(&["CREATE TABLE empty(x BIGINT)"]).await;
    assert!(rows.is_empty() || rows[0].schema().field(0).name() == "Count");
    app.finish().await;
}

#[tokio::test]
async fn project_lifecycle_refuses_overwrite_missing_and_unrelated_files() {
    let mut app = App::start().await;
    assert_eq!(
        app.post("/open", json!({"path":app.path})).await.status(),
        500
    );
    assert!(!app.path.exists());
    app.create().await;
    assert_eq!(
        app.post("/create", json!({"path":app.path})).await.status(),
        409
    );
    app.close().await;
    app.close().await;
    app.restart().await;
    let before = std::fs::read(&app.path).unwrap();
    assert_eq!(
        app.post("/create", json!({"path":app.path})).await.status(),
        400
    );
    assert_eq!(std::fs::read(&app.path).unwrap(), before);
    let unrelated = app.directory.path().join("unrelated.wfpj");
    let db = duckdb::Connection::open(&unrelated).unwrap();
    db.execute_batch("CREATE TABLE keep(x INTEGER)").unwrap();
    db.close().unwrap();
    let before = std::fs::read(&unrelated).unwrap();
    assert_eq!(
        app.post("/open", json!({"path":unrelated})).await.status(),
        400
    );
    assert_eq!(std::fs::read(&unrelated).unwrap(), before);
    app.finish().await;
}

#[tokio::test]
async fn close_interrupts_a_query_and_releases_the_file() {
    let app = App::start().await;
    app.create().await;
    let client = app.client.clone();
    let url = app.url.clone();
    let query = tokio::spawn(async move {
        client
            .post(format!("{url}/api/project/sql"))
            .json(
                &json!({"statements":[{"sql":"SELECT sum(sin(i)) FROM range(100000000000) t(i)"}]}),
            )
            .send()
            .await
            .unwrap()
    });
    tokio::time::sleep(Duration::from_millis(150)).await;
    timeout(Duration::from_secs(3), app.close()).await.unwrap();
    assert!(
        !timeout(Duration::from_secs(3), query)
            .await
            .unwrap()
            .unwrap()
            .status()
            .is_success()
    );
    let reopened = duckdb::Connection::open(&app.path).unwrap();
    reopened.close().unwrap();
    app.finish().await;
}

#[test]
#[ignore = "Subprocess helper, exercised by project_file_lock_and_wal_recovery"]
fn project_process_helper() {
    let path = std::env::var("WORDFLOW_TEST_PROJECT").unwrap();
    if std::env::var("WORDFLOW_TEST_MODE").unwrap() == "lock" {
        assert!(duckdb::Connection::open(path).is_err());
    } else {
        let conn = duckdb::Connection::open(path).unwrap();
        conn.execute_batch("UPDATE data.a SET x=77").unwrap();
        // Simulate process exit without dropping the database handle or checkpointing it.
        std::process::exit(0);
    }
}

#[tokio::test]
async fn project_file_lock_and_wal_recovery() {
    let mut app = App::start().await;
    app.fixture().await;
    for mode in ["lock", "crash"] {
        if mode == "crash" {
            app.close().await;
        }
        let path = app.path.clone();
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "project_process_helper",
                    "--ignored",
                    "--nocapture",
                ])
                .env("WORDFLOW_TEST_PROJECT", path)
                .env("WORDFLOW_TEST_MODE", mode)
                .output()
                .unwrap()
        })
        .await
        .unwrap();
        assert!(
            output.status.success(),
            "{} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    app.restart().await;
    let wal = PathBuf::from(format!("{}.wal", app.path.display()));
    assert!(wal.exists(), "Crash fixture must leave a recovery WAL");
    let response = app.post("/open", json!({"path":app.path})).await;
    let status = response.status();
    let text = response.text().await.unwrap();
    assert_eq!(status, 200, "{text}");
    assert_eq!(app.number("SELECT min(x) FROM a").await, 77);
    app.close().await;
    assert!(!wal.exists());
    app.finish().await;
}

#[tokio::test]
async fn shutdown_interrupts_database_work_and_keeps_committed_data() {
    let app = App::start().await;
    app.fixture().await;
    let client = app.client.clone();
    let url = app.url.clone();
    let query = tokio::spawn(async move {
        client
            .post(format!("{url}/api/project/sql"))
            .json(&json!({"statements":[
                {"sql":"UPDATE a SET x=999"},
                {"sql":"SELECT sum(sin(i)) FROM range(100000000000) t(i)"}
            ]}))
            .send()
            .await
    });
    tokio::time::sleep(Duration::from_millis(150)).await;
    app.shutdown.cancel();
    timeout(Duration::from_secs(7), app.task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let _ = query.await.unwrap();
    let conn = duckdb::Connection::open(&app.path).unwrap();
    assert_eq!(
        conn.query_row("SELECT min(x) FROM data.a", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    conn.close().unwrap();
}

#[tokio::test]
async fn untitled_save_and_retired_runtime_contract() {
    let app = App::start().await;
    let response = app.post("/create", json!({})).await;
    assert_eq!(response.status(), 201);
    let info: Value = response.json().await.unwrap();
    assert_eq!(info["title"], "Untitled");
    assert!(info.get("id").is_none());
    assert!(info.get("name").is_none());
    assert!(info.get("needs_save").is_none());
    app.sql(&["CREATE TABLE data AS SELECT 42::BIGINT AS answer"])
        .await;
    let info: Value = app
        .client
        .get(format!("{}/api/project", app.url))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(info["project"].get("needs_save").is_none());
    assert_eq!(
        app.post("/open", json!({"path":app.path})).await.status(),
        409
    );
    let response = app.post("/save", json!({"path":app.path})).await;
    assert_eq!(response.status(), 200);
    let info: Value = response.json().await.unwrap();
    assert!(info.get("needs_save").is_none());
    assert_eq!(info["title"], "project");
    assert_eq!(app.post("/save", json!({})).await.status(), 200);
    assert_eq!(app.number("SELECT answer FROM data").await, 42);
    app.close().await;
    assert_eq!(
        app.post("/open", json!({"path":app.path})).await.status(),
        409
    );
    app.finish().await;
}

#[tokio::test]
async fn deleting_linked_blocks_is_atomic_and_retains_other_metadata() {
    let app = App::start().await;
    app.fixture().await;
    assert_eq!(
        app.post(&format!("/nodes/{C}/delete"), json!({}))
            .await
            .status(),
        204
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.nodes").await, 3);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges").await, 1);
    assert_eq!(app.number("SELECT min(x) FROM a").await, 1);
    app.finish().await;
}

#[tokio::test]
async fn node_names_and_column_tokenizers_are_the_persistent_keys() {
    let mut app = App::start().await;
    app.fixture().await;
    app.reopen().await;
    assert_eq!(
        app.number("SELECT schema_version::BIGINT FROM wordflow.project")
            .await,
        1
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.tokenizer_models WHERE table_name='a' AND ((column_name='label' AND tokenizer_model='example') OR (column_name='x' AND tokenizer_model='another-model'))").await, 2);
    assert_eq!(
        app.number("SELECT count(*) FROM information_schema.columns WHERE table_schema='wordflow' AND table_name='nodes' AND column_name='name'")
            .await,
        0
    );
    assert_eq!(
        app.sql_response(&["INSERT INTO wordflow.nodes(table_name) VALUES ('A')"])
            .await
            .status(),
        400
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.nodes").await, 4);
    app.action(A, "delete", json!({})).await;
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.tokenizer_models")
            .await,
        0
    );
    app.finish().await;
}

#[tokio::test]
async fn old_format_is_rejected_without_modification() {
    let app = App::start().await;
    {
        let db = duckdb::Connection::open(&app.path).unwrap();
        db.execute_batch("CREATE SCHEMA wordflow; CREATE TABLE wordflow.project(schema_version INTEGER); INSERT INTO wordflow.project VALUES (5)").unwrap();
    }
    assert_eq!(
        app.post("/open", json!({"path":app.path})).await.status(),
        400
    );
    {
        let db = duckdb::Connection::open(&app.path).unwrap();
        let version: i32 = db
            .query_row("SELECT schema_version FROM wordflow.project", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, 5);
        assert!(db.prepare("SELECT * FROM wordflow.nodes").is_err());
    }
    app.finish().await;
}

#[tokio::test]
async fn legacy_version_one_and_malformed_layout_are_rejected_byte_for_byte() {
    for sql in [
        include_str!("../src/schema.sql").replace("schema_version", "format_version") + "; INSERT INTO wordflow.project(format_version) VALUES (1)",
        "CREATE SCHEMA data; CREATE SCHEMA wordflow; CREATE TABLE wordflow.project(schema_version INTEGER); INSERT INTO wordflow.project(schema_version) VALUES (1)".to_string(),
    ] {
        let app = App::start().await;
        {
            let db = duckdb::Connection::open(&app.path).unwrap();
            db.execute_batch(&sql).unwrap();
        }
        let before = std::fs::read(&app.path).unwrap();
        assert_eq!(
            app.post("/open", json!({"path":app.path})).await.status(),
            400
        );
        assert_eq!(std::fs::read(&app.path).unwrap(), before);
        app.finish().await;
    }
}

#[tokio::test]
async fn save_as_overwrites_the_selected_destination() {
    let mut app = App::start().await;
    app.fixture().await;
    let destination = app.directory.path().join("replace.wfpj");
    std::fs::write(&destination, b"old contents").unwrap();
    assert_eq!(
        app.post("/save", json!({"path":destination}))
            .await
            .status(),
        200
    );
    assert_eq!(app.number("SELECT min(x) FROM a").await, 1);
    assert_eq!(
        app.post("/save", json!({"path":destination}))
            .await
            .status(),
        200
    );
    app.close().await;
    app.restart().await;
    assert_eq!(
        app.post("/open", json!({"path":destination}))
            .await
            .status(),
        200
    );
    assert_eq!(app.number("SELECT min(x) FROM a").await, 1);
    app.finish().await;
}

#[tokio::test]
async fn native_rename_clone_cast_and_export() {
    let mut app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE data.a AS SELECT 1::BIGINT x, 'red' text_value UNION ALL SELECT 2, 'blue'",
        "CREATE VIEW data.b AS SELECT a.x, text_value FROM data.a",
        "CREATE VIEW data.c AS SELECT b.x, a.text_value FROM data.b JOIN data.a a USING(x)",
        "INSERT INTO wordflow.nodes(table_name,color,document_column) VALUES ('a','#abcdef','text_value'),('b',NULL,NULL),('c',NULL,NULL)",
        "INSERT INTO wordflow.edges VALUES ('a','b'),('b','c')",
        "INSERT INTO wordflow.tokenizer_models VALUES ('a','text_value','test-model')",
        "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name) VALUES ('data','a',json_array('text_value'),'test.semantic')",
    ]).await;
    app.action("a", "rename", json!({"name":"renamed source"}))
        .await;
    assert_eq!(app.number("SELECT sum(x)::BIGINT FROM data.c").await, 3);
    assert_eq!(
        app.number(
            "SELECT count(*) FROM wordflow.tokenizer_models WHERE table_name='renamed source'"
        )
        .await,
        1
    );
    assert_eq!(
        app.number(
            "SELECT count(*) FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='renamed source'"
        )
        .await,
        1
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.edges WHERE source_name='renamed source'")
            .await,
        1
    );
    let bad = app.post("/nodes/b/rename", json!({"name":"c"})).await;
    assert!(!bad.status().is_success());
    assert_eq!(app.number("SELECT sum(x)::BIGINT FROM data.b").await, 3);
    for id in ["renamed%20source", "b"] {
        let result = app.post(&format!("/nodes/{id}/clone"), json!({})).await;
        assert_eq!(result.status(), 200, "{}", result.text().await.unwrap());
    }
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges WHERE target_name='b_copy' AND source_name='renamed source'").await, 1);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges WHERE source_name='b_copy' OR source_name='renamed source_copy' OR target_name='renamed source_copy'").await, 0);
    app.action(
        "b",
        "edit",
        json!({"sql":"SELECT * REPLACE (x + 10 AS x) FROM __wf_current"}),
    )
    .await;
    assert_eq!(
        app.number("SELECT sum(x)::BIGINT FROM data.b_copy").await,
        3
    );
    app.sql(&["UPDATE data.\"renamed source\" SET x=x+100"])
        .await;
    assert_eq!(
        app.number("SELECT sum(x)::BIGINT FROM data.\"renamed source_copy\"")
            .await,
        3
    );
    assert_eq!(
        app.number("SELECT sum(x)::BIGINT FROM data.b_copy").await,
        203
    );
    app.action("b", "undo", json!({})).await;
    let failed = app.post("/nodes/b/edit",json!({"sql":"SELECT * REPLACE (CAST(x AS VARCHAR) AS x) FROM __wf_current","before":[{"sql":"CREATE TYPE wordflow.rollback_enum AS ENUM ('a')"}],"after":[{"sql":"SELECT missing_column FROM data.b"}]})).await;
    assert!(!failed.status().is_success());
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_types() WHERE type_name='rollback_enum'")
            .await,
        0
    );
    app.action("b", "edit",json!({"sql":"SELECT * REPLACE (CAST(text_value AS wordflow.text_values) AS text_value) FROM __wf_current","before":[{"sql":"CREATE TYPE wordflow.text_values AS ENUM ('red','blue','unused')"}]})).await;
    let batches = app.sql(&["SELECT text_value FROM data.b"]).await;
    use duckdb::arrow::{array::DictionaryArray, datatypes::UInt8Type};
    let dictionary = batches[0]
        .column(0)
        .as_any()
        .downcast_ref::<DictionaryArray<UInt8Type>>()
        .unwrap();
    assert_eq!(dictionary.values().len(), 3);
    assert!(
        app.graph().await["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["table_name"] == "b" && n["can_undo"] == true)
    );
    app.close().await;
    app.reopen().await;
    app.action("b", "undo", json!({})).await;
    for format in ["csv", "json", "ndjson", "parquet", "ipc"] {
        let result = app.post("/nodes/b/export", json!({"format":format})).await;
        let status = result.status();
        let bytes = result.bytes().await.unwrap();
        assert_eq!(status, 200, "{}", String::from_utf8_lossy(&bytes));
        assert!(!bytes.is_empty());
        if format == "csv" {
            assert!(String::from_utf8_lossy(&bytes).contains("101"));
        }
        if format == "ipc" {
            assert_eq!(
                FileReader::try_new(Cursor::new(bytes), None)
                    .unwrap()
                    .map(|b| b.unwrap().num_rows())
                    .sum::<usize>(),
                2
            );
        }
    }
    app.close().await;
    app.shutdown.cancel();
    app.task.await.unwrap().unwrap();
}

#[tokio::test]
async fn graph_reads_only_metadata_and_has_no_row_count_endpoint() {
    let app = App::start().await;
    app.fixture().await;
    let columns = |graph: &Value, name: &str| {
        graph["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|node| node["table_name"] == name)
            .unwrap()["column_count"]
            .clone()
    };
    assert_eq!(columns(&app.graph().await, A), json!(2));
    app.sql(&[
        "DROP TABLE a",
        "CREATE TABLE a AS SELECT 'invalid' AS x, 'label' AS label",
    ])
    .await;
    let graph = app.graph().await;
    assert_eq!(columns(&graph, A), json!(2));
    assert_eq!(columns(&graph, B), json!(2));
    assert_eq!(columns(&graph, D), json!(2));
    assert!(
        graph["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|node| node.get("shape").is_none())
    );
    assert_eq!(
        app.client
            .get(format!("{}/api/project/nodes/b/row-count", app.url))
            .send()
            .await
            .unwrap()
            .status(),
        reqwest::StatusCode::NOT_FOUND
    );
    app.finish().await;
}

#[tokio::test]
async fn node_reads_enrich_exact_arrow_and_do_not_execute_unavailable_view_sources_in_graph() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TYPE labels AS ENUM ('used','unused')",
        "CREATE TABLE data.\"odd table\" AS SELECT i::BIGINT AS id, 12345678901234567890.1234567890::DECIMAL(38,10) AS exact, 'used'::labels AS label FROM range(4) r(i)",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('odd table'),('missing')",
        "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','odd table',json_array('label'),'test.label','{}')",
    ]).await;
    let url = format!("{}/api/project/nodes/odd%20table", app.url);
    let response = app
        .client
        .get(format!("{url}/schema"))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let reader = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None).unwrap();
    assert_eq!(
        reader.schema().field(2).metadata()["ARROW:extension:name"],
        "test.label"
    );
    assert!(reader.schema().field(1).data_type().is_decimal());
    assert_eq!(
        reader.map(|batch| batch.unwrap().num_rows()).sum::<usize>(),
        0
    );
    let response = app
        .client
        .post(format!("{url}/page"))
        .json(&json!({"page":1,"page_size":2,"sorting":[{"column":"id","descending":true}]}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let mut reader =
        StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None).unwrap();
    assert_eq!(
        reader.schema().field(2).metadata()["ARROW:extension:metadata"],
        "{}"
    );
    let page = reader.next().unwrap().unwrap();
    assert_eq!(page.num_rows(), 3);
    assert_eq!(
        page.column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap()
            .value(0),
        3
    );
    let source = app.directory.path().join("source.csv");
    std::fs::write(&source, "value\nhello\n").unwrap();
    app.sql(&[
        &format!(
            "CREATE VIEW remote AS SELECT * FROM read_csv('{}');",
            source.to_string_lossy().replace('\'', "''")
        ),
        "INSERT INTO wordflow.nodes(table_name) VALUES ('remote')",
    ])
    .await;
    std::fs::remove_file(&source).unwrap();
    let graph = app.graph().await;
    let nodes = graph["nodes"].as_array().unwrap();
    assert!(nodes.iter().all(|n| n.get("shape").is_none()));
    assert!(
        nodes
            .iter()
            .any(|n| n["table_name"] == "remote" && n["column_count"] == 1)
    );
    assert!(
        nodes.iter().any(
            |n| n["table_name"] == "missing" && n["diagnostic"]["code"] == "object_unavailable"
        )
    );
    assert!(
        !app.client
            .get(format!("{}/api/project/nodes/remote/row-count", app.url))
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );
    app.finish().await;
}

#[tokio::test]
async fn cte_definition_scope_case_and_canonical_rename() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE source AS SELECT 3::BIGINT x",
        "CREATE TABLE replacement AS SELECT 8::BIGINT x",
        "CREATE VIEW composed AS WITH source AS (SELECT x FROM source), later AS (SELECT x FROM source) SELECT * FROM later",
        "CREATE VIEW recursive_view AS WITH RECURSIVE source(x) AS (SELECT 1::BIGINT UNION ALL SELECT x+1 FROM source WHERE x<3) SELECT * FROM source",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('source'),('replacement'),('composed'),('recursive_view')",
        "INSERT INTO wordflow.edges VALUES ('source','composed'),('source','recursive_view')",
    ]).await;
    let graph = app.graph().await;
    let edges = graph["edges"].as_array().unwrap();
    assert!(
        edges
            .iter()
            .any(|e| e["target_name"] == "composed" && e["dependency"] == true)
    );
    assert!(
        edges
            .iter()
            .any(|e| e["target_name"] == "recursive_view" && e["dependency"] == false)
    );
    app.action(
        "composed",
        "replace-source",
        json!({"old_source_name":"SOURCE","new_source_name":"replacement"}),
    )
    .await;
    assert_eq!(app.number("SELECT x FROM composed").await, 8);
    assert_eq!(
        app.number("SELECT sum(x)::BIGINT FROM recursive_view")
            .await,
        6
    );
    let renamed = app
        .post("/nodes/REPLACEMENT/rename", json!({"name":"Quoted table"}))
        .await;
    assert_eq!(renamed.status(), 200);
    assert_eq!(
        renamed.json::<Value>().await.unwrap()["table_name"],
        "Quoted table"
    );
    assert_eq!(app.number("SELECT x FROM composed").await, 8);
    let missing = app
        .post("/nodes/missing/rename", json!({"name":"missing"}))
        .await;
    assert_eq!(missing.status(), 404);
    app.close().await;
}

#[tokio::test]
async fn request_boundary_rejects_origins_and_returns_structured_json_errors() {
    let app = App::start().await;
    let response = app
        .client
        .post(format!("{}/api/project/create", app.url))
        .header("Origin", "https://untrusted.example")
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    let response = app
        .client
        .post(format!("{}/api/project/create", app.url))
        .header("Content-Type", "application/json")
        .body("{")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"]["code"],
        "invalid_request"
    );
    app.create().await;
    let response = app
        .client
        .post(format!("{}/api/project/close", app.url))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    assert_eq!(app.number("SELECT 1::BIGINT").await, 1);
    app.close().await;
}

#[tokio::test]
async fn imports_preserve_raw_rows_and_materialized_tables_edit_without_backings() {
    let mut app = App::start().await;
    app.create().await;
    let input = app.directory.path().join("input.csv");
    std::fs::write(&input, "value,label\n12,first\n34,second\n").unwrap();
    let imported = app.post("/import", json!({"sources":[{"table_name":"test","sql":"SELECT * FROM read_csv(?)", "parameters":[input]}]})).await;
    assert_eq!(imported.status(), 200, "{}", imported.text().await.unwrap());
    std::fs::remove_file(&input).unwrap();
    let graph = app.graph().await;
    assert_eq!(graph["nodes"].as_array().unwrap().len(), 1);
    assert_eq!(graph["nodes"][0]["kind"], "view");
    assert_eq!(graph["nodes"][0]["can_undo"], false);
    assert_eq!(
        app.number(
            "SELECT count(*) FROM wordflow.nodes WHERE table_name='test_raw' AND NOT visible"
        )
        .await,
        1
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges WHERE source_name='test_raw' AND target_name='test'").await, 0);
    app.action(
        "test",
        "edit",
        json!({"sql":"SELECT * REPLACE (value+1 AS value) FROM __wf_current"}),
    )
    .await;
    assert_eq!(app.number("SELECT min(value) FROM data.test_raw").await, 12);
    assert_eq!(app.number("SELECT min(value) FROM data.test").await, 13);
    assert_eq!(app.post("/nodes/test/clone", json!({})).await.status(), 200);
    app.action("test", "materialize", json!({})).await;
    app.sql(&[
        "ALTER TABLE data.test ALTER COLUMN value TYPE VARCHAR USING CAST(value AS VARCHAR)",
        "ALTER TABLE data.test RENAME COLUMN label TO renamed",
        "ALTER TABLE data.test DROP COLUMN renamed",
    ])
    .await;
    assert_eq!(app.number("SELECT count(*) FROM wordflow.nodes").await, 3);
    assert_eq!(app.number("SELECT count(*) FROM duckdb_tables() WHERE schema_name='data' AND table_name LIKE '%backing%'").await, 0);
    assert_eq!(app.post("/nodes/test/undo", json!({})).await.status(), 409);
    let refused = app.post("/nodes/test/edit",json!({"sql":"SELECT * FROM __wf_current", "before":[{"sql":"CREATE TABLE data.must_rollback(x INT)"}]})).await;
    assert_eq!(refused.status(), 400);
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_tables() WHERE table_name='must_rollback'")
            .await,
        0
    );
    app.sql(&["UPDATE data.test_raw SET value=50"]).await;
    // The view clone still needs raw data, while the materialized original is fixed.
    assert_eq!(
        app.number("SELECT min(value) FROM data.test_copy").await,
        51
    );
    assert_eq!(
        app.number("SELECT min(value::BIGINT) FROM data.test").await,
        13
    );
    app.action("test_copy", "materialize", json!({})).await;
    app.reopen().await;
    assert_eq!(
        app.number("SELECT min(value::BIGINT) FROM data.test").await,
        13
    );
    // Future GC may collect this now-unreferenced hidden source; today it stays stored.
    assert_eq!(app.number("SELECT count(*) FROM data.test_raw").await, 2);
    assert!(
        app.graph().await["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|node| node["kind"] == "table" && node["can_undo"] == false)
    );
    app.finish().await;
}

#[tokio::test]
async fn raw_import_names_and_failed_imports_are_transactional() {
    let app = App::start().await;
    app.create().await;
    app.sql(&["CREATE TABLE data.test_raw(x INT)"]).await;
    let response = app
        .post(
            "/import",
            json!({"sources":[
                {"table_name":"test","sql":"SELECT 1::BIGINT x"},
                {"table_name":"test","sql":"SELECT 2::BIGINT x"}
            ]}),
        )
        .await;
    assert_eq!(response.status(), 200, "{}", response.text().await.unwrap());
    assert_eq!(app.number("SELECT min(x) FROM data.test_raw_2").await, 1);
    assert_eq!(app.number("SELECT min(x) FROM data.test_2_raw").await, 2);
    let failed = app
        .post(
            "/import",
            json!({"sources":[
                {"table_name":"rolled_back","sql":"SELECT 1 x"},
                {"table_name":"broken","sql":"SELECT missing FROM data.test"}
            ]}),
        )
        .await;
    assert_eq!(failed.status(), 400);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.nodes WHERE table_name LIKE 'rolled_back%' OR table_name LIKE 'broken%'").await, 0);
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_tables() WHERE table_name='rolled_back_raw'")
            .await,
        0
    );
    app.finish().await;
}

#[tokio::test]
async fn direct_table_schema_changes_rollback_failures_and_leave_descendants_to_the_user() {
    let app = App::start().await;
    app.fixture().await;
    let failed = app
        .sql_response(&["ALTER TABLE a ALTER COLUMN label TYPE BIGINT USING CAST(label AS BIGINT)"])
        .await;
    assert_eq!(failed.status(), 400);
    assert_eq!(app.number("SELECT min(z) FROM c").await, 3);
    let failed = app
        .sql_response(&[
            "ALTER TABLE a RENAME COLUMN x TO renamed",
            "SELECT missing FROM a",
        ])
        .await;
    assert_eq!(failed.status(), 400);
    assert_eq!(app.number("SELECT min(x) FROM a").await, 1);
    app.sql(&["ALTER TABLE a RENAME COLUMN x TO renamed"]).await;
    assert_eq!(app.sql_response(&["SELECT * FROM b"]).await.status(), 400);
    assert_eq!(app.number("SELECT min(renamed) FROM a").await, 1);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.nodes WHERE NOT visible")
            .await,
        0
    );
    app.finish().await;
}

#[tokio::test]
async fn view_definition_round_trips_aliases_and_replaces_without_a_history_layer() {
    let mut app = App::start().await;
    app.fixture().await;
    app.sql(&[
        "CREATE OR REPLACE VIEW b(y,label) AS SELECT x*2,label FROM a",
        "UPDATE wordflow.nodes SET color='#123456',document_column='label' WHERE table_name='b'",
        "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name) VALUES ('data','b',json_array('label'),'test:label')",
    ]).await;
    let response = app
        .client
        .get(format!("{}/api/project/nodes/b/definition", app.url))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let definition: Value = response.json().await.unwrap();
    assert!(definition["sql"].as_str().unwrap().starts_with("SELECT"));
    app.action(B, "definition", definition).await;
    assert_eq!(app.number("SELECT sum(z)::BIGINT FROM c").await, 8);
    app.action(
        B,
        "definition",
        json!({"sql":"WITH input AS (SELECT * FROM a) SELECT x*3 AS y, label FROM input"}),
    )
    .await;
    assert_eq!(app.number("SELECT sum(z)::BIGINT FROM c").await, 11);
    let graph = app.graph().await;
    assert_eq!(graph["edges"].as_array().unwrap().len(), 2);
    let view = graph["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["table_name"] == B)
        .unwrap();
    assert_eq!(view["can_undo"], false);
    assert_eq!(view["color"], "#123456");
    assert_eq!(view["document_column"], "label");
    assert_eq!(app.number("SELECT count(*) FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='b' AND field_path=json_array('label')").await, 1);
    app.reopen().await;
    assert_eq!(app.number("SELECT sum(z)::BIGINT FROM c").await, 11);
    // Helpers always read the current catalogue, including changes made through direct SQL.
    app.sql(&["CREATE OR REPLACE VIEW b AS SELECT 42::BIGINT AS y, 'direct' AS label"])
        .await;
    let current: Value = app
        .client
        .get(format!("{}/api/project/nodes/b/definition", app.url))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(current["sql"].as_str().unwrap().contains("42"));
    app.finish().await;
}

#[tokio::test]
async fn invalid_view_definitions_leave_committed_data_and_metadata_unchanged() {
    let app = App::start().await;
    app.fixture().await;
    for sql in [
        "SELECT absent FROM a",
        "SELECT 1; DROP TABLE a",
        "DELETE FROM a",
        "",
        "CREATE TABLE surprise AS SELECT 1",
    ] {
        let response = app.post("/nodes/b/definition", json!({"sql":sql})).await;
        assert_eq!(response.status(), 400, "{sql}");
        let error: Value = response.json().await.unwrap();
        assert!(error["error"]["code"].is_string());
        assert_eq!(app.number("SELECT sum(z)::BIGINT FROM c").await, 8);
    }
    let response = app
        .post("/nodes/a/definition", json!({"sql":"SELECT 1"}))
        .await;
    assert_eq!(response.status(), 400);
    assert_eq!(app.number("SELECT sum(x)::BIGINT FROM a").await, 3);
    let response = app
        .client
        .get(format!("{}/api/project/nodes/a/definition", app.url))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    let response = app
        .post("/nodes/missing/definition", json!({"sql":"SELECT 1"}))
        .await;
    assert_eq!(response.status(), 404);
    app.finish().await;
}

#[tokio::test]
async fn cell_edit_http_guards_mutations_preserves_other_projects_and_releases_on_close() {
    let mut app = App::start().await;
    app.fixture().await;
    let other = App::start().await;
    other.fixture().await;
    let response = app.post("/nodes/a/cell-edit", json!({})).await;
    assert_eq!(response.status(), 200);
    let session: Value = response.json().await.unwrap();
    assert_eq!(session["row_count"], 2);
    let id = session["session_id"].as_str().unwrap();
    assert_eq!(app.sql_response(&["SELECT * FROM a"]).await.status(), 200);
    for (route, body) in [
        ("/nodes/a/rename", json!({"name":"renamed"})),
        ("/nodes/a/delete", json!({})),
        (
            "/nodes/a/columns",
            json!({"operation":"cast","column":"x","target":"string"}),
        ),
        (
            "/stopwords/save",
            json!({"selected":{"source":{"schema":"data","name":"a"},"column":"label"},"before":[],"after":["word"]}),
        ),
        ("/save", json!({})),
        (
            "/save",
            json!({"path":app.directory.path().join("other.wfpj")}),
        ),
    ] {
        let response = app.post(route, body).await;
        assert_eq!(response.status(), 409, "{route}");
        assert_eq!(
            response.json::<Value>().await.unwrap()["error"]["code"],
            "editing_active"
        );
    }
    assert_eq!(
        app.post(
            "/stopwords/read",
            json!({"source":{"schema":"data","name":"a"},"column":"label"})
        )
        .await
        .status(),
        200
    );
    assert_eq!(app.graph().await["nodes"].as_array().unwrap().len(), 4);
    assert_eq!(other.number("SELECT sum(x)::BIGINT FROM a").await, 3);
    let page = app
        .post(
            &format!("/cell-edits/{id}/page"),
            json!({"page":1,"page_size":1}),
        )
        .await;
    assert_eq!(page.status(), 200);
    let reader = StreamReader::try_new(Cursor::new(page.bytes().await.unwrap()), None).unwrap();
    assert!(
        reader
            .schema()
            .metadata()
            .contains_key("wordflow:cell-edit")
    );
    let request = json!({"changes":[{"row_ref":"0","column":"label","value":"changed"}]});
    let route = format!("/cell-edits/{id}/save");
    let (first, repeated) =
        tokio::join!(app.post(&route, request.clone()), app.post(&route, request));
    assert_eq!(first.status(), 200);
    assert_eq!(repeated.status(), 200);
    assert_eq!(
        app.number("SELECT count(*) FROM a WHERE label='changed'")
            .await,
        1
    );
    app.reopen().await;
    assert_eq!(
        app.number("SELECT count(*) FROM a WHERE label='changed'")
            .await,
        1
    );
    assert_eq!(
        app.post("/nodes/a/cell-edit", json!({})).await.status(),
        200
    );
    app.close().await;
    // An idle editor holds no permanent lock after runtime retirement.
    let connection = duckdb::Connection::open(&app.path).unwrap();
    assert_eq!(
        connection
            .query_row("SELECT count(*) FROM data.a", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    drop(connection);
    assert_eq!(
        other
            .number("SELECT count(*) FROM a WHERE label='changed'")
            .await,
        0
    );
    app.finish().await;
    other.finish().await;
}

#[tokio::test]
async fn preprocessing_samples_store_values_and_preserve_live_views_across_reopen() {
    let mut app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE source AS SELECT i FROM range(1000) t(i)",
        "CREATE TABLE fixed AS WITH __wf_current AS (SELECT * FROM source) SELECT * FROM (SELECT * FROM __wf_current USING SAMPLE reservoir(25 ROWS) REPEATABLE (0))",
        "CREATE VIEW live_sample AS WITH __wf_current AS (SELECT * FROM source) SELECT * FROM (SELECT * FROM __wf_current USING SAMPLE reservoir(25 ROWS) REPEATABLE (0))",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('source'), ('fixed'), ('live_sample')",
        "INSERT INTO wordflow.edges VALUES ('source','fixed'), ('source','live_sample')",
    ]).await;
    let fingerprint = app.number("SELECT sum(i)::BIGINT FROM fixed").await;
    assert_eq!(app.number("SELECT count(*) FROM fixed").await, 25);
    app.sql(&["UPDATE source SET i = i + 10000"]).await;
    app.reopen().await;
    assert_eq!(
        app.number("SELECT sum(i)::BIGINT FROM fixed").await,
        fingerprint
    );
    assert!(app.number("SELECT min(i)::BIGINT FROM live_sample").await >= 10000);
    let graph = app.graph().await;
    let edges = graph["edges"].as_array().unwrap();
    assert!(
        edges
            .iter()
            .any(|edge| edge["target_name"] == "fixed" && edge["dependency"] == false)
    );
    assert!(
        edges
            .iter()
            .any(|edge| edge["target_name"] == "live_sample" && edge["dependency"] == true)
    );
    app.finish().await;
}

#[test]
fn seeded_reservoir_sampling_is_repeatable_with_one_thread() {
    let connection = duckdb::Connection::open_in_memory().unwrap();
    connection
        .execute_batch("SET threads=1; CREATE TABLE source AS SELECT i FROM range(10000) t(i)")
        .unwrap();
    let sample = || {
        connection
            .prepare(
                "SELECT i FROM source USING SAMPLE reservoir(50 ROWS) REPEATABLE (0) ORDER BY i",
            )
            .unwrap()
            .query_map([], |row| row.get::<_, i64>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    };
    assert_eq!(sample(), sample());
    assert_eq!(sample().len(), 50);
}

#[tokio::test]
async fn console_scripts_are_atomic_capped_and_preserve_statement_errors() {
    let app = App::start().await;
    app.create().await;
    let response = app.post("/sql", json!({"script": "-- ; comment\nCREATE TABLE \"a;b\" (v VARCHAR); /* ; */ INSERT INTO \"a;b\" VALUES ('x;y'), ($tag$z;w$tag$); SELECT * FROM \"a;b\"; -- trailing", "max_rows":1})).await;
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["x-wordflow-statements-completed"], "3");
    assert_eq!(response.headers()["x-wordflow-result-truncated"], "true");
    let batches = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None)
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(batches.iter().map(RecordBatch::num_rows).sum::<usize>(), 1);
    assert_eq!(app.number("SELECT count(*) FROM \"a;b\"").await, 2);
    let failed = app.post("/sql", json!({"script":"INSERT INTO \"a;b\" VALUES ('rollback'); SELECT missing_column FROM \"a;b\";"})).await;
    assert_eq!(failed.status(), 400);
    assert_eq!(
        failed.json::<Value>().await.unwrap()["error"]["statement_index"],
        1
    );
    assert_eq!(app.number("SELECT count(*) FROM \"a;b\"").await, 2);
    let incomplete = app
        .post(
            "/sql",
            json!({"script":";; CREATE TABLE unfinished(v INT); SELECT 'unterminated"}),
        )
        .await;
    assert_eq!(incomplete.status(), 400);
    assert_eq!(
        incomplete.json::<Value>().await.unwrap()["error"]["statement_index"],
        1
    );
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_tables() WHERE table_name='unfinished'")
            .await,
        0
    );
    let forbidden = app
        .post(
            "/sql",
            json!({"script":"CREATE TABLE must_not_exist(v INT); COMMIT;"}),
        )
        .await;
    assert_eq!(forbidden.status(), 400);
    assert_eq!(
        forbidden.json::<Value>().await.unwrap()["error"]["statement_index"],
        1
    );
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_tables() WHERE table_name='must_not_exist'")
            .await,
        0
    );
    assert!(app.graph().await["nodes"].as_array().unwrap().is_empty());
    for body in [
        json!({"script":"SELECT 1","statements":[]}),
        json!({"script":"SELECT 1","max_rows":50001}),
    ] {
        assert_eq!(app.post("/sql", body).await.status(), 400);
    }
    app.shutdown.cancel();
    app.task.await.unwrap().unwrap();
}

#[tokio::test]
async fn console_read_only_queries_reject_side_effects_and_release_transactions() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE SEQUENCE seq",
        "CREATE TABLE source AS SELECT range AS n FROM range(60001)",
    ])
    .await;
    for script in [
        "SELECT nextval('seq')",
        "CREATE TABLE forbidden(v INT)",
        "SELECT 1; SELECT 2",
        "SELECT '",
        "SELECT * FROM missing_table",
        "-- only a comment;",
    ] {
        let response = app
            .post(
                "/sql",
                json!({"script":script,"mode":"preview","max_rows":50000}),
            )
            .await;
        assert_eq!(response.status(), 400, "{script}");
        assert_eq!(app.number("SELECT count(*) FROM source").await, 60001);
    }
    assert_eq!(app.number("SELECT nextval('seq')").await, 1);
    let response = app.post("/sql", json!({"script":"SELECT n, 9007199254740993::BIGINT AS exact, 1234567890123456789.123::DECIMAL(25,3) AS decimal FROM source", "mode":"preview", "max_rows":50000})).await;
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["x-wordflow-result-truncated"], "true");
    let batches = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None)
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(
        batches.iter().map(RecordBatch::num_rows).sum::<usize>(),
        50000
    );
    assert_eq!(
        batches[0]
            .column(1)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap()
            .value(0),
        9007199254740993
    );
    assert_eq!(
        batches[0].column(2).data_type(),
        &duckdb::arrow::datatypes::DataType::Decimal128(25, 3)
    );
    let response = app
        .post(
            "/sql",
            json!({"script":"UPDATE source SET n=n+1 RETURNING n", "max_rows":1}),
        )
        .await;
    assert_eq!(response.status(), 200);
    assert_eq!(app.number("SELECT min(n) FROM source").await, 1);
    assert_eq!(app.number("SELECT max(n) FROM source").await, 60001);
    let response = app
        .post(
            "/sql",
            json!({"script":"SELECT n FROM source WHERE false", "mode":"preview","max_rows":50000}),
        )
        .await;
    assert_eq!(response.headers()["x-wordflow-result-truncated"], "false");
    let reader = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None).unwrap();
    assert_eq!(reader.schema().field(0).name(), "n");
    assert_eq!(reader.map(|b| b.unwrap().num_rows()).sum::<usize>(), 0);
    app.shutdown.cancel();
    app.task.await.unwrap().unwrap();
}

#[tokio::test]
async fn live_limit_stops_before_late_errors_but_execute_drains_and_rolls_back() {
    let app = App::start().await;
    app.create().await;
    app.sql(&["CREATE TABLE changes(v INTEGER)"]).await;
    // Put the error beyond several vector batches, not just beyond the display cap.
    let select = "SELECT CASE WHEN range=999999 THEN error('late error') ELSE range END AS n FROM range(1000000)";
    let response = app
        .post(
            "/sql",
            json!({"script":select,"mode":"preview","max_rows":10}),
        )
        .await;
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["x-wordflow-result-truncated"], "true");
    let reader = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None).unwrap();
    assert_eq!(reader.map(|b| b.unwrap().num_rows()).sum::<usize>(), 10);
    let response = app
        .post(
            "/sql",
            json!({"script":format!("INSERT INTO changes VALUES (1); {select}"),"max_rows":10}),
        )
        .await;
    assert_eq!(response.status(), 400);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"]["statement_index"],
        1
    );
    assert_eq!(app.number("SELECT count(*) FROM changes").await, 0);
    let response = app.post("/sql", json!({"statements":[{"sql":"-- quoted semicolon\n SELECT ?::BIGINT AS \"n;value\" FROM range(5) LIMIT 2; -- trailing", "parameters":[9007199254740993i64]}],"mode":"preview","max_rows":2})).await;
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["x-wordflow-result-truncated"], "false");
    let batches = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None)
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(batches[0].schema().field(0).name(), "n;value");
    assert_eq!(
        batches[0]
            .column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap()
            .value(0),
        9007199254740993
    );
    app.shutdown.cancel();
    app.task.await.unwrap().unwrap();
}

#[tokio::test]
async fn console_cell_source_survives_failure_and_save_as() {
    let app = App::start().await;
    app.post("/create", json!({}))
        .await
        .error_for_status()
        .unwrap();
    let initialize = "INSERT INTO wordflow.sql_cells SELECT uuid(), 0, '', 'default' WHERE NOT EXISTS (SELECT 1 FROM wordflow.sql_cells)";
    app.sql(&[initialize]).await;
    app.sql(&[initialize]).await;
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.sql_cells").await,
        1
    );
    let info: Value = app
        .client
        .get(format!("{}/api/project", app.url))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(info["project"].get("needs_save").is_none());
    app.sql(&["UPDATE wordflow.sql_cells SET sql='SELECT missing', mode='live'"])
        .await;
    assert_eq!(
        app.post("/sql", json!({"script":"SELECT missing"}))
            .await
            .status(),
        400
    );
    app.post("/save", json!({"path":app.path}))
        .await
        .error_for_status()
        .unwrap();
    let destination = app.directory.path().join("copy.wfpj");
    app.post("/save", json!({"path":destination}))
        .await
        .error_for_status()
        .unwrap();
    app.shutdown.cancel();
    app.task.await.unwrap().unwrap();
    let conn = duckdb::Connection::open(destination).unwrap();
    let saved: (String, String) = conn
        .query_row("SELECT sql, mode FROM wordflow.sql_cells", [], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .unwrap();
    assert_eq!(saved, ("SELECT missing".into(), "live".into()));
}

async fn task_snapshot(app: &App) -> Value {
    app.client
        .get(format!("{}/api/project/tasks", app.url))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap()
}

#[tokio::test]
async fn production_workloads_return_one_task_and_preserve_responses() {
    let app = App::start().await;
    app.fixture().await;
    assert_eq!(task_snapshot(&app).await["tasks"], json!([]));
    let requests = [
        (
            "/import",
            json!({"sources":[{"table_name":"Imported", "sql":"SELECT 7 AS x"}]}),
        ),
        ("/nodes/a/clone", json!({})),
        ("/nodes/b/materialize", json!({})),
        (
            "/sql",
            json!({"script":"SELECT 42 AS n", "task_label":"SQL cell 1"}),
        ),
    ];
    for (index, (path, input)) in requests.into_iter().enumerate() {
        let response = app.post(path, input).await;
        assert!(response.status().is_success());
        let id = response.headers()["x-wordflow-task-id"]
            .to_str()
            .unwrap()
            .to_owned();
        if path == "/import" {
            assert_eq!(
                response.json::<Value>().await.unwrap()["table_names"],
                json!(["Imported"])
            );
        } else if path.ends_with("clone") {
            assert_eq!(
                response.json::<Value>().await.unwrap()["table_name"],
                "a_copy"
            );
        } else if path == "/sql" {
            assert_eq!(response.headers()["x-wordflow-statements-completed"], "1");
            let bytes = response.bytes().await.unwrap();
            assert!(
                StreamReader::try_new(Cursor::new(bytes), None)
                    .unwrap()
                    .next()
                    .unwrap()
                    .is_ok()
            );
        } else {
            assert_eq!(response.status(), 204);
        }
        let snapshot = task_snapshot(&app).await;
        let tasks = snapshot["tasks"].as_array().unwrap();
        assert_eq!(tasks.len(), index + 1);
        assert_eq!(
            tasks.iter().find(|t| t["id"] == id).unwrap()["state"],
            "succeeded"
        );
    }
    let response = app.post("/sql", json!({"script":"CREATE TABLE rolled_back AS SELECT 1; SELECT * FROM nonexistent", "task_label":"Failed SQL"})).await;
    assert_eq!(response.status(), 400);
    let id = response.headers()["x-wordflow-task-id"]
        .to_str()
        .unwrap()
        .to_owned();
    let error = response.json::<Value>().await.unwrap();
    assert_eq!(error["error"]["statement_index"], 1);
    let snapshot = task_snapshot(&app).await;
    let task = snapshot["tasks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["id"] == id)
        .unwrap();
    assert_eq!(task["state"], "failed");
    assert_eq!(task["error"], error["error"]);
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_tables() WHERE table_name='rolled_back'")
            .await,
        0
    );
    let before = snapshot["tasks"].as_array().unwrap().len();
    let response = app
        .post("/sql", json!({"script":"SELECT 1", "unexpected":true}))
        .await;
    assert_eq!(response.status(), 400);
    assert!(response.headers().get("x-wordflow-task-id").is_none());
    app.sql(&["SELECT 1"]).await;
    app.graph().await;
    app.action("a", "rename", json!({"name":"renamed"})).await;
    assert_eq!(
        task_snapshot(&app).await["tasks"].as_array().unwrap().len(),
        before
    );
    app.finish().await;
}

#[tokio::test]
async fn cancelling_a_disconnected_sql_task_does_not_interrupt_an_import_or_another_project() {
    let app = App::start().await;
    app.create().await;
    let other = App::start().await;
    other.create().await;
    let client = app.client.clone();
    let url = format!("{}/api/project/sql", app.url);
    let request = tokio::spawn(async move {
        client.post(url).json(&json!({"script":"CREATE TABLE must_rollback AS SELECT 1; SELECT sum(a.i*b.i) FROM range(1000000000) a(i), range(1000000000) b(i)", "task_label":"Long SQL"})).send().await
    });
    let id = timeout(Duration::from_secs(10), async {
        loop {
            let snapshot = task_snapshot(&app).await;
            if let Some(task) = snapshot["tasks"].as_array().unwrap().first() {
                break task["id"].as_str().unwrap().to_owned();
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    request.abort();
    let (import, independent) = tokio::join!(
        app.post(
            "/import",
            json!({"sources":[{"table_name":"survives", "sql":"SELECT 9 AS n"}]})
        ),
        other.post(
            "/sql",
            json!({"script":"SELECT 3", "task_label":"Other project"})
        ),
    );
    assert!(import.status().is_success());
    assert!(independent.status().is_success());
    assert!(
        app.post(&format!("/tasks/{id}/cancel"), json!({}))
            .await
            .status()
            .is_success()
    );
    timeout(Duration::from_secs(10), async {
        loop {
            let snapshot = task_snapshot(&app).await;
            if snapshot["tasks"]
                .as_array()
                .unwrap()
                .iter()
                .any(|t| t["id"] == id && t["state"] == "cancelled")
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_tables() WHERE table_name='must_rollback'")
            .await,
        0
    );
    assert_eq!(app.number("SELECT n::BIGINT FROM survives").await, 9);
    assert_eq!(
        task_snapshot(&other).await["tasks"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    app.finish().await;
    other.finish().await;
}

#[tokio::test]
async fn import_task_cancellation_rolls_back_all_sources_and_keeps_sql_usable() {
    let app = App::start().await;
    app.create().await;
    let client = app.client.clone();
    let url = format!("{}/api/project/import", app.url);
    let request = tokio::spawn(async move {
        client.post(url).json(&json!({"sources":[
            {"table_name":"first", "sql":"SELECT 1 AS n"},
            {"table_name":"slow", "sql":"SELECT sum(a.i*b.i) AS n FROM range(1000000000) a(i), range(1000000000) b(i)"}
        ]})).send().await.unwrap()
    });
    let id = timeout(Duration::from_secs(10), async {
        loop {
            let snapshot = task_snapshot(&app).await;
            if let Some(task) = snapshot["tasks"].as_array().unwrap().first()
                && task["progress"]["message"] == "Importing data"
            {
                break task["id"].as_str().unwrap().to_owned();
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    // Ordinary SQL can finish while the import owns a separate transaction.
    assert_eq!(app.number("SELECT 42::BIGINT").await, 42);
    assert!(
        app.post(&format!("/tasks/{id}/cancel"), json!({}))
            .await
            .status()
            .is_success()
    );
    let response = timeout(Duration::from_secs(10), request)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(response.status(), 400);
    assert_eq!(response.headers()["x-wordflow-task-id"], id);
    assert_eq!(
        response.json::<Value>().await.unwrap()["error"]["code"],
        "interrupted"
    );
    let snapshot = task_snapshot(&app).await;
    assert_eq!(snapshot["tasks"].as_array().unwrap().len(), 1);
    assert_eq!(snapshot["tasks"][0]["state"], "cancelled");
    assert!(app.graph().await["nodes"].as_array().unwrap().is_empty());
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_tables() WHERE schema_name='data'")
            .await,
        0
    );
    app.sql(&["CREATE TABLE after_cancel AS SELECT 1"]).await;
    app.finish().await;
}

#[tokio::test]
async fn arrow_export_preserves_extension_metadata_and_exact_values() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TYPE category AS ENUM ('used','unused')",
        "CREATE TABLE t AS SELECT 9007199254740993::BIGINT AS id, 1234567890123456789.123::DECIMAL(25,3) AS exact, 'used'::category AS label",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('t')",
        "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','t',json_array('label'),'wordflow.test','{\"version\":1}')",
    ]).await;
    let response = app.post("/nodes/t/export", json!({"format":"ipc"})).await;
    assert_eq!(response.status(), 200);
    let reader = FileReader::try_new(Cursor::new(response.bytes().await.unwrap()), None).unwrap();
    assert_eq!(
        reader.schema().field(2).metadata()["ARROW:extension:name"],
        "wordflow.test"
    );
    assert_eq!(
        reader.schema().field(2).metadata()["ARROW:extension:metadata"],
        "{\"version\":1}"
    );
    assert_eq!(
        reader.schema().field(1).data_type(),
        &duckdb::arrow::datatypes::DataType::Decimal128(25, 3)
    );
    let rows = reader.collect::<Result<Vec<_>, _>>().unwrap();
    assert_eq!(
        rows[0]
            .column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap()
            .value(0),
        9007199254740993
    );
    use duckdb::arrow::{array::DictionaryArray, datatypes::UInt8Type};
    assert_eq!(
        rows[0]
            .column(2)
            .as_any()
            .downcast_ref::<DictionaryArray<UInt8Type>>()
            .unwrap()
            .values()
            .len(),
        2
    );
    app.finish().await;
}

#[tokio::test]
async fn expression_parsing_is_read_only_syntax_and_available_during_cell_editing() {
    let app = App::start().await;
    app.fixture().await;
    app.sql(&["CREATE SEQUENCE expression_probe START 17"])
        .await;
    let session: Value = app
        .post("/nodes/a/cell-edit", json!({}))
        .await
        .json()
        .await
        .unwrap();
    let response = app.post("/expressions/parse", json!({"expression": "concat_ws(' ', label, CASE WHEN x > 0 THEN nextval('expression_probe') ELSE 0 END)"})).await;
    assert_eq!(response.status(), 200);
    let tree: Value = response.json().await.unwrap();
    assert_eq!(tree["children"][2]["kind"], "sql");
    for expression in ["x, label", "x FROM a", "1; SELECT 2", "lower("] {
        let response = app
            .post("/expressions/parse", json!({"expression":expression}))
            .await;
        assert!(!response.status().is_success(), "{expression}");
        let error: Value = response.json().await.unwrap();
        assert!(error["error"]["code"].is_string());
    }
    let id = session["session_id"].as_str().unwrap();
    assert!(
        app.post(&format!("/cell-edits/{id}/cancel"), json!({}))
            .await
            .status()
            .is_success()
    );
    assert_eq!(app.number("SELECT nextval('expression_probe')").await, 17);
    app.finish().await;
}

async fn dependency_graph(app: &App) -> Value {
    let response = app
        .client
        .get(format!("{}/api/project/graph?mode=dependencies", app.url))
        .send()
        .await
        .unwrap();
    let status = response.status();
    let body: Value = response.json().await.unwrap();
    assert_eq!(status, 200, "{body}");
    body
}

#[tokio::test]
async fn dependency_graph_is_catalogue_only_and_scope_aware() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE SCHEMA other",
        "CREATE SCHEMA second",
        "CREATE TABLE data.source AS SELECT 1 AS x",
        "CREATE TABLE main.source AS SELECT 2 AS x",
        "CREATE TABLE other.source AS SELECT 3 AS x",
        "CREATE TABLE second.source AS SELECT 4 AS x",
        "INSERT INTO wordflow.nodes(table_name,visible) VALUES ('source',false)",
        "CREATE VIEW data.visible AS SELECT * FROM data.source",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('visible')",
        "CREATE VIEW other.own_schema AS SELECT a.x FROM source a JOIN source b USING(x)",
        "CREATE VIEW other.nested AS WITH source AS (SELECT * FROM second.source) SELECT * FROM (SELECT * FROM source) nested JOIN other.own_schema USING(x)",
        "CREATE VIEW second.main_fallback AS SELECT * FROM main.source",
        "CREATE TABLE other.\"Quoted \"\"source\" AS SELECT 5 AS x",
        "CREATE VIEW other.quoted_view AS SELECT * FROM other.\"Quoted \"\"source\"",
        "CREATE TABLE other.gone(x INTEGER)",
        "CREATE TABLE second.gone(x INTEGER)",
        "CREATE VIEW other.broken AS SELECT * FROM other.gone",
        "DROP TABLE other.gone",
        "CREATE VIEW other.do_not_execute AS SELECT error('graph executed a view') AS x",
        "CREATE TABLE other.materialized AS SELECT * FROM other.source",
        "INSERT INTO wordflow.edges VALUES ('source','visible')",
    ]).await;
    let logical = app.graph().await;
    assert_eq!(logical["nodes"].as_array().unwrap().len(), 1);
    let graph = dependency_graph(&app).await;
    let nodes = graph["nodes"].as_array().unwrap();
    assert_eq!(nodes.len(), 14);
    assert!(nodes.iter().all(|n| n["object"]["schema"] != "wordflow"));
    let find = |schema: &str, name: &str| {
        nodes
            .iter()
            .find(|n| n["object"] == json!({"schema":schema,"name":name}))
            .unwrap()
    };
    assert_eq!(find("data", "source")["registered"], true);
    assert_eq!(find("data", "source")["visible"], false);
    assert_eq!(find("other", "source")["registered"], false);
    assert_eq!(find("other", "do_not_execute")["column_count"], 1);
    assert_eq!(
        find("other", "broken")["diagnostic"]["code"],
        "unresolved_dependency"
    );
    let edges = graph["edges"].as_array().unwrap();
    let edge = |ss: &str, sn: &str, ts: &str, tn: &str| json!({"source":{"schema":ss,"name":sn},"target":{"schema":ts,"name":tn}});
    assert_eq!(edges.len(), 6, "{edges:?}");
    for expected in [
        edge("data", "source", "data", "visible"),
        edge("other", "source", "other", "own_schema"),
        edge("second", "source", "other", "nested"),
        edge("other", "own_schema", "other", "nested"),
        edge("main", "source", "second", "main_fallback"),
        edge("other", "Quoted \"source", "other", "quoted_view"),
    ] {
        assert!(edges.contains(&expected), "missing {expected}");
    }
    assert_eq!(app.number("SELECT count(*) FROM wordflow.nodes").await, 2);
    assert_eq!(
        app.number("SELECT current_setting('enable_view_dependencies')::BIGINT")
            .await,
        0
    );
    assert_eq!(app.graph().await, logical);
    app.finish().await;
}

#[tokio::test]
async fn object_routes_share_mutations_without_registering_or_crossing_schemas() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE SCHEMA other",
        "CREATE TABLE data.same AS SELECT 1::BIGINT AS x, 'logical' AS text",
        "INSERT INTO wordflow.nodes(table_name,visible,document_column) VALUES ('same',false,'text')",
        "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','same',json_array('text'),'test.text','{}')",
        "CREATE TABLE other.same AS SELECT 9::BIGINT AS x, 'physical' AS text",
        "CREATE VIEW other.v (number, label) AS SELECT * FROM same",
        "CREATE VIEW other.child AS SELECT * FROM other.v",
    ]).await;
    let get = |path: &str| app.client.get(format!("{}/api/project{path}", app.url));
    let response = get("/objects/other/same/schema").send().await.unwrap();
    assert_eq!(response.status(), 200);
    let schema = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None)
        .unwrap()
        .schema();
    assert!(
        !schema
            .field(1)
            .metadata()
            .contains_key("ARROW:extension:name")
    );
    let response = get("/objects/data/same/schema").send().await.unwrap();
    let schema = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None)
        .unwrap()
        .schema();
    assert_eq!(
        schema
            .field(1)
            .metadata()
            .get("ARROW:extension:name")
            .map(String::as_str),
        Some("test.text")
    );
    let response = app
        .post("/objects/other/same/page", json!({"page":1,"page_size":20}))
        .await;
    assert_eq!(response.status(), 200);
    let rows = StreamReader::try_new(Cursor::new(response.bytes().await.unwrap()), None)
        .unwrap()
        .next()
        .unwrap()
        .unwrap();
    assert_eq!(
        rows.column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap()
            .value(0),
        9
    );
    for (path, body) in [
        (
            "/objects/other/v/edit",
            json!({"sql":"SELECT * REPLACE (number + 1 AS number) FROM __wf_current"}),
        ),
        (
            "/objects/other/v/edit",
            json!({"sql":"SELECT * REPLACE (number * 2 AS number) FROM __wf_current"}),
        ),
    ] {
        assert_eq!(app.post(path, body).await.status(), 204);
    }
    assert_eq!(app.number("SELECT number FROM other.child").await, 20);
    assert_eq!(
        app.post("/objects/other/v/undo", json!({})).await.status(),
        204
    );
    assert_eq!(app.number("SELECT number FROM other.child").await, 10);
    let failed = app
        .post(
            "/objects/other/v/definition",
            json!({"sql":"SELECT missing FROM other.same"}),
        )
        .await;
    assert_eq!(failed.status(), 400);
    assert_eq!(app.number("SELECT number FROM other.child").await, 10);
    let response = app
        .post("/objects/other/same/rename", json!({"name":"renamed"}))
        .await;
    assert_eq!(response.status(), 200, "{}", response.text().await.unwrap());
    assert_eq!(app.number("SELECT number FROM other.child").await, 10);
    assert_eq!(
        app.number(
            "SELECT count(*) FROM wordflow.nodes WHERE table_name='same' AND document_column='text'"
        )
        .await,
        1
    );
    for name in ["renamed", "v"] {
        let response = app
            .post(&format!("/objects/other/{name}/clone"), json!({}))
            .await;
        assert_eq!(response.status(), 200);
        assert!(response.headers().contains_key("X-Wordflow-Task-Id"));
        assert_eq!(
            response.json::<Value>().await.unwrap()["table_name"],
            format!("{name}_copy")
        );
    }
    assert_eq!(app.number("SELECT count(*) FROM wordflow.nodes").await, 1);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges").await, 0);
    assert_eq!(app.number("SELECT number FROM other.v_copy").await, 10);
    // The editing session retains the schema throughout page and Save.
    let session: Value = app
        .post("/objects/other/renamed/cell-edit", json!({}))
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(session["schema"], "other");
    let id = session["session_id"].as_str().unwrap();
    assert_eq!(
        app.post(
            &format!("/cell-edits/{id}/page"),
            json!({"page":1,"page_size":20})
        )
        .await
        .status(),
        200
    );
    assert_eq!(
        app.post(
            &format!("/cell-edits/{id}/save"),
            json!({"changes":[{"row_ref":"0","column":"x","value":"12"}]})
        )
        .await
        .status(),
        200
    );
    assert_eq!(app.number("SELECT x FROM other.renamed").await, 12);
    assert_eq!(app.number("SELECT x FROM data.same").await, 1);
    let response = app.post("/objects/other/v/materialize", json!({})).await;
    assert_eq!(response.status(), 204);
    assert!(response.headers().contains_key("X-Wordflow-Task-Id"));
    let graph = dependency_graph(&app).await;
    assert!(
        !graph["edges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|edge| edge["target"] == json!({"schema":"other","name":"v"}))
    );
    for format in ["csv", "json", "ndjson", "parquet", "ipc"] {
        let response = app
            .post("/objects/other/v/export", json!({"format":format}))
            .await;
        assert_eq!(
            response.status(),
            200,
            "{format}: {}",
            response.text().await.unwrap()
        );
    }
    assert_eq!(
        app.post("/objects/other/renamed/delete", json!({}))
            .await
            .status(),
        204
    );
    assert_eq!(
        app.number(
            "SELECT count(*) FROM duckdb_views() WHERE schema_name='other' AND view_name='v_copy'"
        )
        .await,
        1
    );
    assert_eq!(app.number("SELECT number FROM other.v").await, 13);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='same'")
            .await,
        1
    );
    assert_eq!(
        app.post("/objects/wordflow/nodes/delete", json!({}))
            .await
            .status(),
        400
    );
    app.finish().await;
}

#[tokio::test]
async fn graph_unions_sql_dependencies_and_virtual_links_without_persisting_inspection() {
    let mut app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE source AS SELECT 1 AS n",
        "CREATE TABLE replacement AS SELECT 2 AS n",
        "CREATE TABLE hidden AS SELECT 3 AS n",
        "CREATE TABLE unregistered AS SELECT 4 AS n",
        "CREATE VIEW live AS SELECT * FROM source",
        "CREATE VIEW failed AS SELECT error('materialize must roll back') AS n FROM hidden",
        "CREATE VIEW stored AS SELECT * FROM hidden UNION ALL SELECT * FROM unregistered",
        "INSERT INTO wordflow.nodes(table_name,visible) VALUES ('source',true),('replacement',true),('hidden',false),('live',true),('failed',true),('stored',true)",
        "INSERT INTO wordflow.edges VALUES ('source','live'),('replacement','source')",
    ]).await;
    let expected = json!([
        {"source_name":"replacement","target_name":"source","dependency":false},
        {"source_name":"source","target_name":"live","dependency":true},
    ]);
    assert_eq!(app.graph().await["edges"], expected);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges").await, 2);

    // A source edit changes the calculated graph, not independently stored virtual links.
    app.action(
        "live",
        "replace-source",
        json!({"old_source_name":"source","new_source_name":"replacement"}),
    )
    .await;
    let graph = app.graph().await;
    assert_eq!(
        graph["edges"],
        json!([
            {"source_name":"replacement","target_name":"live","dependency":true},
            {"source_name":"replacement","target_name":"source","dependency":false},
            {"source_name":"source","target_name":"live","dependency":false},
        ])
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges").await, 2);
    let clone = app.post("/nodes/live/clone", json!({})).await;
    assert_eq!(clone.status(), 200);
    let graph = app.graph().await;
    assert!(graph["edges"].as_array().unwrap().contains(
        &json!({"source_name":"replacement","target_name":"live_copy","dependency":true})
    ));
    assert!(
        graph["edges"].as_array().unwrap().contains(
            &json!({"source_name":"source","target_name":"live_copy","dependency":false})
        )
    );

    // The same registered target behaves identically through its catalogue route.
    let response = app.post("/objects/data/live/materialize", json!({})).await;
    assert_eq!(response.status(), 204);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges WHERE source_name='replacement' AND target_name='live'").await, 1);
    let graph = app.graph().await;
    assert!(
        graph["edges"].as_array().unwrap().contains(
            &json!({"source_name":"replacement","target_name":"live","dependency":false})
        )
    );
    let dependencies = dependency_graph(&app).await;
    assert!(
        !dependencies["edges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["target"]["name"] == "live")
    );

    let before = app.number("SELECT count(*) FROM wordflow.edges").await;
    assert_eq!(
        app.post("/nodes/failed/materialize", json!({}))
            .await
            .status(),
        400
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.edges").await,
        before
    );
    assert_eq!(
        app.number(
            "SELECT count(*) FROM duckdb_views() WHERE schema_name='data' AND view_name='failed'"
        )
        .await,
        1
    );
    app.action("stored", "materialize", json!({})).await;
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges WHERE source_name='hidden' AND target_name='stored'").await, 1);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.edges WHERE source_name='unregistered'")
            .await,
        0
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.nodes WHERE table_name='unregistered'")
            .await,
        0
    );

    // Reopen keeps stored virtual relationships and newly captured lineage intact.
    let before = app.graph().await;
    let rows = app.number("SELECT count(*) FROM wordflow.edges").await;
    app.reopen().await;
    assert_eq!(app.graph().await, before);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.edges").await,
        rows
    );
    app.finish().await;
}

#[tokio::test]
async fn schema_qualified_source_reconnection_is_atomic_and_does_not_register_objects() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE SCHEMA first",
        "CREATE SCHEMA second",
        "CREATE TABLE first.\"Source name\" AS SELECT 2::BIGINT AS n",
        "CREATE TABLE second.\"Source name\" AS SELECT 7::BIGINT AS n",
        "CREATE TABLE second.incompatible AS SELECT 1 AS other",
        "CREATE TABLE data.\"Source name\" AS SELECT 90::BIGINT AS n",
        "CREATE VIEW first.child(total) AS WITH local AS (SELECT 1 AS n) SELECT a.n+b.n+local.n FROM first.\"Source name\" a CROSS JOIN first.\"Source name\" b CROSS JOIN local",
        "CREATE VIEW first.descendant AS SELECT total AS n FROM first.child",
    ]).await;
    let replace = |old: Value, new: Value| json!({"old_source":old,"new_source":new});
    let original = json!({"schema":"first","name":"Source name"});
    let replacement = json!({"schema":"second","name":"SOURCE NAME"});
    for new in [
        json!({"schema":"second","name":"incompatible"}),
        json!({"schema":"first","name":"descendant"}),
        json!({"schema":"first","name":"CHILD"}),
    ] {
        let response = app
            .post(
                "/objects/first/child/replace-source",
                replace(original.clone(), new),
            )
            .await;
        assert!(
            response.status().is_client_error(),
            "{}",
            response.text().await.unwrap()
        );
        assert_eq!(app.number("SELECT total FROM first.child").await, 5);
    }
    let response = app
        .post(
            "/objects/FIRST/CHILD/replace-source",
            replace(original.clone(), replacement.clone()),
        )
        .await;
    assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
    assert_eq!(app.number("SELECT total FROM first.child").await, 15);
    assert_eq!(app.number("SELECT n FROM first.descendant").await, 15);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.nodes").await, 0);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges").await, 0);
    assert!(
        app.post(
            "/objects/first/child/replace-source",
            replace(original, replacement)
        )
        .await
        .status()
        .is_client_error()
    );
    assert_eq!(app.number("SELECT total FROM first.child").await, 15);
    app.sql(&["CREATE VIEW second.scoped AS WITH \"Source name\" AS (SELECT 100::BIGINT AS n) SELECT a.n+local.n AS n FROM second.\"Source name\" a CROSS JOIN \"Source name\" local"]).await;
    let response = app
        .post(
            "/objects/second/scoped/replace-source",
            replace(
                json!({"schema":"second","name":"Source name"}),
                json!({"schema":"first","name":"Source name"}),
            ),
        )
        .await;
    assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
    assert_eq!(app.number("SELECT n FROM second.scoped").await, 102);
    app.finish().await;
}

#[tokio::test]
async fn local_file_metadata_reports_sizes_without_reading_or_importing_data() {
    let app = App::start().await;
    let file = app.directory.path().join("quoted ' Unicode 文.csv");
    let empty = app.directory.path().join("empty.csv");
    let missing = app.directory.path().join("missing.csv");
    std::fs::write(&file, b"id,text\n1,hello\n").unwrap();
    std::fs::write(&empty, []).unwrap();
    let response = app
        .post(
            "/files/metadata",
            json!({"paths":[file,empty,missing,app.directory.path()]}),
        )
        .await;
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.json::<Value>().await.unwrap(),
        json!([
            {"path":file,"size_bytes":16}, {"path":empty,"size_bytes":0},
            {"path":missing,"size_bytes":null}, {"path":app.directory.path(),"size_bytes":null}
        ])
    );
    let denied = app
        .client
        .post(format!("{}/api/project/files/metadata", app.url))
        .header("Origin", "https://untrusted.example")
        .json(&json!({"paths":[file]}))
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), 403);
    let tasks: Value = app
        .client
        .get(format!("{}/api/project/tasks", app.url))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(tasks["tasks"].as_array().unwrap().len(), 0);
    app.shutdown.cancel();
    app.task.await.unwrap().unwrap();
}

#[tokio::test]
async fn rename_reconciles_only_matching_stopword_sources() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE data.\"Stop words\" (word VARCHAR)",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('Stop words')",
        "INSERT INTO wordflow.tabs(id,kind,name,position,settings) VALUES ('00000000-0000-4000-8000-000000000081','frequency','one',0,'{\"stopwordSource\":{\"source\":{\"schema\":\"data\",\"name\":\"Stop words\"},\"column\":\"word\"},\"stopwordsEnabled\":true,\"cloudLimit\":20}'), ('00000000-0000-4000-8000-000000000082','frequency','two',1,'{\"stopwordSource\":{\"source\":{\"schema\":\"other\",\"name\":\"Stop words\"},\"column\":\"word\"}}')",
    ]).await;
    app.action("Stop%20words", "rename", json!({"name":"Shared words"}))
        .await;
    assert_eq!(app.number("SELECT count(*) FROM wordflow.tabs WHERE json_extract_string(settings,'$.stopwordSource.source.name')='Shared words' AND json_extract_string(settings,'$.stopwordSource.column')='word' AND json_extract_string(settings,'$.stopwordsEnabled')='true' AND json_extract_string(settings,'$.cloudLimit')='20'").await, 1);
    assert_eq!(app.number("SELECT count(*) FROM wordflow.tabs WHERE json_extract_string(settings,'$.stopwordSource.source.name')='Stop words'").await, 1);
    app.close().await;
}

#[tokio::test]
async fn rename_keeps_frequency_colour_for_both_saved_and_new_source_names() {
    let app = App::start().await;
    app.create().await;
    let old = serde_json::to_string(&["data", "Corpus"]).unwrap();
    let new = serde_json::to_string(&["data", "Renamed"]).unwrap();
    let other = serde_json::to_string(&["other", "Corpus"]).unwrap();
    let settings = json!({"colors":{&old:"#ff0000",&other:"#0000ff"},"cloudLimit":20});
    app.sql(&["CREATE TABLE Corpus (text VARCHAR)", "INSERT INTO wordflow.nodes(table_name) VALUES ('Corpus')", &format!("INSERT INTO wordflow.tabs(id,kind,name,position,settings) VALUES ('00000000-0000-4000-8000-000000000091','frequency','colours',0,'{}')",settings)]).await;
    app.action("Corpus", "rename", json!({"name":"Renamed"}))
        .await;
    let tabs: Value = app
        .client
        .get(format!("{}/api/project/tabs", app.url))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let colors = &tabs[0]["settings"]["colors"];
    assert_eq!(colors[&old], "#ff0000");
    assert_eq!(colors[&new], "#ff0000");
    assert_eq!(colors[&other], "#0000ff");
    assert_eq!(tabs[0]["settings"]["cloudLimit"], 20);
    app.close().await;
}

#[tokio::test]
async fn column_operations_own_metadata_and_rollback_together() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE docs(\"Text value\" VARCHAR, untouched INTEGER DEFAULT 7)",
        "INSERT INTO docs VALUES ('12',9),(NULL,10)",
        "INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('docs','Text value')",
        "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name) VALUES ('data','docs',json_array('Text value'),'test.text')",
        "INSERT INTO wordflow.tokenizer_models VALUES ('docs','Text value','native:plain_words_en')",
    ]).await;
    app.action(
        "docs",
        "columns",
        json!({"operation":"cast","column":"TEXT VALUE","target":{"sqlType":"TEXT /* alias */"}}),
    )
    .await;
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.arrow_metadata")
            .await,
        1
    );
    for kind in [
        "missing_type",
        "INTEGER) + 1 --",
        "INTEGER); DROP TABLE docs; --",
        "INTEGER) AS BIGINT --",
    ] {
        let response = app
            .post(
                "/nodes/docs/columns",
                json!({"operation":"cast","column":"Text value","target":{"sqlType":kind}}),
            )
            .await;
        assert_eq!(response.status(), 400, "{}", response.text().await.unwrap());
    }
    app.action("docs", "columns", json!({"operation":"transform","column":"TEXT VALUE","expression":"regexp_replace(\"Text value\", '2', '3')"})).await;
    assert_eq!(
        app.number("SELECT count(*) FROM docs WHERE \"Text value\"='13' AND untouched=9")
            .await,
        1
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.arrow_metadata")
            .await,
        0
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.tokenizer_models")
            .await,
        1
    );
    app.action(
        "docs",
        "columns",
        json!({"operation":"cast","column":"Text value","target":{"sqlType":"DECIMAL(18,4)"}}),
    )
    .await;
    assert_eq!(app.number("SELECT count(*) FROM duckdb_columns() WHERE table_name='docs' AND data_type='DECIMAL(18,4)'").await, 1);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.tokenizer_models")
            .await,
        0
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.nodes WHERE document_column IS NULL")
            .await,
        1
    );
    let response = app.post("/nodes/docs/columns", json!({"operation":"transform","column":"new","expression":"regexp_replace('abc','[','x')"})).await;
    assert_eq!(response.status(), 400);
    assert_eq!(
        app.number(
            "SELECT count(*) FROM duckdb_columns() WHERE table_name='docs' AND column_name='new'"
        )
        .await,
        0
    );
    let response = app
        .post(
            "/nodes/docs/columns",
            json!({"operation":"transform","column":"Text value","expression":"'invalid number'"}),
        )
        .await;
    assert_eq!(response.status(), 400);
    assert_eq!(
        app.number("SELECT sum(\"Text value\")::BIGINT FROM docs")
            .await,
        13
    );
    app.action(
        "docs",
        "columns",
        json!({"operation":"delete","column":"untouched"}),
    )
    .await;
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_columns() WHERE table_name='docs'")
            .await,
        1
    );
    app.finish().await;
}

#[tokio::test]
async fn column_operations_preserve_view_undo_and_schema_qualified_references() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE docs(value VARCHAR)",
        "INSERT INTO docs VALUES ('[1,2]'),(NULL)",
        "CREATE SCHEMA lists",
        "CREATE VIEW lists.docs AS SELECT value FROM data.docs",
        "INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('docs','value')",
        "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name) VALUES ('data','docs',json_array('value'),'test.text')",
        "INSERT INTO wordflow.tabs(id,kind,name,position,settings) VALUES ('00000000-0000-4000-8000-000000000091','frequency','one',0,'{\"stopwordSource\":{\"source\":{\"schema\":\"lists\",\"name\":\"docs\"},\"column\":\"value\"}}')",
    ]).await;
    let response = app
        .post(
            "/objects/lists/docs/columns",
            json!({"operation":"cast","column":"VALUE","target":{"sqlType":"INTEGER[]"}}),
        )
        .await;
    assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
    assert_eq!(
        app.number("SELECT sum(value[2])::BIGINT FROM lists.docs")
            .await,
        2
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.arrow_metadata")
            .await,
        1
    );
    assert_eq!(
        app.post("/objects/lists/docs/undo", json!({}))
            .await
            .status(),
        204
    );
    assert_eq!(
        app.number("SELECT count(*) FROM lists.docs WHERE value='[1,2]'")
            .await,
        1
    );
    assert_eq!(
        app.post(
            "/objects/lists/docs/columns",
            json!({"operation":"rename","column":"value","name":"quoted \"word\""})
        )
        .await
        .status(),
        204
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.tabs WHERE json_extract_string(settings,'$.stopwordSource.column')='quoted \"word\"'").await, 1);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.nodes WHERE document_column='value'")
            .await,
        1
    );
    let response = app.post("/objects/lists/docs/columns", json!({"operation":"transform","column":"extra","expression":"upper(\"quoted \"\"word\"\"\")"})).await;
    assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
    app.sql(&["UPDATE data.docs SET value='next' WHERE value IS NOT NULL"])
        .await;
    assert_eq!(
        app.number("SELECT count(*) FROM lists.docs WHERE extra='NEXT'")
            .await,
        1
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.nodes").await, 1);
    app.finish().await;
}

#[tokio::test]
async fn created_views_inherit_only_agreed_applicable_metadata() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE a(text VARCHAR)",
        "CREATE TABLE b(text VARCHAR)",
        "INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('a','text'),('b','text')",
        "INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name) VALUES ('data','a',json_array('text'),'test.text'),('data','b',json_array('text'),'test.text')",
        "INSERT INTO wordflow.tokenizer_models VALUES ('a','text','native:plain_words_en'),('b','text','native:plain_words_en')",
    ]).await;
    let mappings = json!([{"source":"a","column":"text","output":"text"},{"source":"b","column":"text","output":"text"}]);
    for (name, computed) in [("stacked", json!([])), ("computed", json!(["text"]))] {
        let response = app.post("/views",json!({"name":name,"sql":"SELECT text FROM a UNION ALL SELECT text FROM b","mappings":mappings,"computed_columns":computed})).await;
        assert_eq!(response.status(), 200, "{}", response.text().await.unwrap());
    }
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='stacked'")
            .await,
        1
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='computed'")
            .await,
        0
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.tokenizer_models WHERE table_name IN ('stacked','computed')").await, 2);
    app.sql(&[
        "DELETE FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='b'",
        "UPDATE wordflow.tokenizer_models SET tokenizer_model='other' WHERE table_name='b'",
    ])
    .await;
    let response = app.post("/views",json!({"name":"mixed","sql":"SELECT text FROM a UNION ALL SELECT text FROM b","mappings":mappings})).await;
    assert_eq!(response.status(), 200, "{}", response.text().await.unwrap());
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='mixed'")
            .await,
        0
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.tokenizer_models WHERE table_name='mixed'")
            .await,
        0
    );
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges").await, 0);
    let response = app
        .post("/views", json!({"name":"a","sql":"SELECT 1","mappings":[]}))
        .await;
    assert_eq!(response.status(), 400);
    app.finish().await;
}

#[tokio::test]
async fn stopword_operations_share_normalization_preserve_order_and_membership() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE words(\"w'ord\" VARCHAR, note INTEGER DEFAULT 42)",
        "INSERT INTO words VALUES (' Zebra ',1),('CAT',2),('cat',3),(NULL,4),('  ',5),('dog',6)",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('words')",
    ])
    .await;
    let selected = json!({"source":{"schema":"DATA","name":"WORDS"},"column":"W'ORD"});
    let read = app.post("/stopwords/read", selected.clone()).await;
    assert_eq!(read.status(), 200);
    assert_eq!(
        read.json::<Value>().await.unwrap(),
        json!(["zebra", "cat", "dog"])
    );
    let save = app.post("/stopwords/save",json!({"selected":selected,"before":[" zebra ","CAT","dog"],"after":["ZEBRA","cat","FOX"," fox ","quote'"," "]})).await;
    assert_eq!(save.status(), 204, "{}", save.text().await.unwrap());
    assert_eq!(app.number("SELECT count(*) FROM words WHERE \"w'ord\"='CAT' AND note=2 OR \"w'ord\"='cat' AND note=3 OR \"w'ord\"=' Zebra ' AND note=1 OR \"w'ord\" IS NULL AND note=6").await,4);
    assert_eq!(
        app.number("SELECT count(*) FROM words WHERE \"w'ord\"='FOX' AND note=42")
            .await,
        1
    );
    assert_eq!(
        app.post("/stopwords/read", selected.clone())
            .await
            .json::<Value>()
            .await
            .unwrap(),
        json!(["zebra", "cat", "fox", "quote'"])
    );
    app.sql(&[
        "CREATE TABLE numbers(word INTEGER NOT NULL)",
        "INSERT INTO numbers VALUES(123),(456)",
    ])
    .await;
    let numbers = json!({"source":{"schema":"data","name":"numbers"},"column":"word"});
    let response = app
        .post(
            "/stopwords/save",
            json!({"selected":numbers,"before":["123","456"],"after":["456","oops"]}),
        )
        .await;
    assert_eq!(response.status(), 400);
    assert_eq!(
        app.number("SELECT sum(word)::BIGINT FROM numbers").await,
        579
    );
    assert_eq!(
        app.post(
            "/stopwords/save",
            json!({"selected":numbers,"before":["123","456"],"after":["456","789"]})
        )
        .await
        .status(),
        204
    );
    assert_eq!(
        app.post("/stopwords/read", numbers)
            .await
            .json::<Value>()
            .await
            .unwrap(),
        json!(["456", "789"])
    );
    app.finish().await;
}

#[tokio::test]
async fn stopword_sort_reorders_complete_rows_and_preserves_constraints() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE words(\"w'ord\" VARCHAR UNIQUE NOT NULL, note INTEGER DEFAULT 42)",
        "INSERT INTO words VALUES ('Zebra', 1),('apple',2),('Banana',3)",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('words')",
    ])
    .await;
    let selected = json!({"source":{"schema":"data","name":"words"},"column":"w'ord"});
    let response = app
        .post(
            "/stopwords/save",
            json!({"selected":selected,"before":[],"after":[],"sort":true}),
        )
        .await;
    assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
    assert_eq!(
        app.post("/stopwords/read", selected.clone())
            .await
            .json::<Value>()
            .await
            .unwrap(),
        json!(["apple", "banana", "zebra"])
    );
    assert_eq!(app.number("SELECT count(*) FROM words WHERE \"w'ord\"='Zebra' AND note=1 OR \"w'ord\"='apple' AND note=2 OR \"w'ord\"='Banana' AND note=3").await,3);
    assert_eq!(
        app.number("SELECT count(*) FROM duckdb_constraints() WHERE table_name='words'")
            .await,
        2
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.nodes WHERE table_name='words'")
            .await,
        1
    );
    let response = app
        .post(
            "/stopwords/save",
            json!({"selected":selected,"before":[],"after":["pear"]}),
        )
        .await;
    assert_eq!(response.status(), 204);
    assert_eq!(
        app.number("SELECT note::BIGINT FROM words WHERE \"w'ord\"='pear'")
            .await,
        42
    );
    // A constraint failure must undo the full membership edit and row reordering.
    let response = app
        .post(
            "/stopwords/save",
            json!({"selected":selected,"before":["apple"],"after":["new"],"sort":true}),
        )
        .await;
    assert_eq!(response.status(), 400);
    assert_eq!(
        app.post("/stopwords/read", selected)
            .await
            .json::<Value>()
            .await
            .unwrap(),
        json!(["apple", "banana", "zebra", "pear"])
    );
    app.finish().await;
}

#[tokio::test]
async fn stopword_preparation_allocates_names_and_logical_parents_in_one_transaction() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE corpus(text VARCHAR)",
        "CREATE VIEW words AS SELECT 123::INTEGER AS word",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('corpus'),('words'),('CORPUS_STOPWORDS')",
        "CREATE TABLE corpus_stopwords_2(word VARCHAR)",
    ])
    .await;
    let input = json!({"source":{"schema":"data","name":"CORPUS"},"column":"text"});
    let response = app
        .post(
            "/stopwords/prepare",
            json!({"selected":null,"inputs":[input,input]}),
        )
        .await;
    assert_eq!(response.status(), 200);
    let list = response.json::<Value>().await.unwrap();
    assert_eq!(list["source"]["name"], "CORPUS_stopwords_3");
    assert_eq!(app.number("SELECT count(*) FROM wordflow.edges WHERE source_name='corpus' AND target_name='CORPUS_stopwords_3'").await,1);
    let view = json!({"source":{"schema":"data","name":"words"},"column":"word"});
    let response = app
        .post(
            "/stopwords/prepare",
            json!({"selected":view,"inputs":[input]}),
        )
        .await;
    assert_eq!(response.status(), 200);
    let copy = response.json::<Value>().await.unwrap();
    assert_eq!(copy["source"]["name"], "words_stopwords");
    assert_eq!(app.number("SELECT count(*) FROM duckdb_columns() WHERE table_name='words_stopwords' AND data_type='INTEGER'").await,1);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.edges WHERE target_name='words_stopwords'")
            .await,
        2
    );
    assert_eq!(
        app.post("/stopwords/prepare", json!({"selected":copy,"inputs":[]}))
            .await
            .json::<Value>()
            .await
            .unwrap(),
        copy
    );
    // A plain database clone uses the same allocator without adding registration or lineage.
    assert_eq!(
        app.post("/objects/data/words_stopwords/clone", json!({}))
            .await
            .status(),
        200
    );
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.nodes WHERE table_name='words_stopwords_copy'")
            .await,
        0
    );
    app.finish().await;
}

#[tokio::test]
async fn stopword_limits_and_constraints_rollback_the_complete_membership_edit() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE large AS SELECT i::VARCHAR AS word FROM range(100000) t(i)",
        "CREATE TABLE constrained(word VARCHAR NOT NULL, other INTEGER)",
        "INSERT INTO constrained VALUES ('keep',1)",
    ])
    .await;
    let selected = json!({"source":{"schema":"data","name":"large"},"column":"word"});
    let response = app
        .post(
            "/stopwords/save",
            json!({"selected":selected,"before":[],"after":["extra"]}),
        )
        .await;
    assert_eq!(response.status(), 400);
    assert!(response.text().await.unwrap().contains("100,000"));
    assert_eq!(app.number("SELECT count(*) FROM large").await, 100000);
    app.sql(&["INSERT INTO large VALUES ('extra')"]).await;
    assert_eq!(app.post("/stopwords/read", selected).await.status(), 400);
    let selected = json!({"source":{"schema":"data","name":"constrained"},"column":"word"});
    let response = app
        .post(
            "/stopwords/save",
            json!({"selected":selected,"before":["keep"],"after":["new"]}),
        )
        .await;
    assert_eq!(response.status(), 400);
    assert_eq!(
        app.number("SELECT count(*) FROM constrained WHERE word='keep' AND other=1")
            .await,
        1
    );
    app.sql(&["CREATE TABLE submitted(word VARCHAR)"]).await;
    let words: Vec<_> = (0..100000)
        .map(|i| format!("stopword-with-a-long-spelling-{i}"))
        .collect();
    let selected = json!({"source":{"schema":"data","name":"submitted"},"column":"word"});
    let response = app
        .post(
            "/stopwords/save",
            json!({"selected":selected,"before":[],"after":words}),
        )
        .await;
    assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
    assert_eq!(app.number("SELECT count(*) FROM submitted").await, 100000);
    app.finish().await;
}

#[tokio::test]
async fn annotation_manual_reuses_protected_editor_and_live_codebook() {
    let app = App::start().await;
    app.create().await;
    app.sql(&["CREATE TABLE data.docs(rowid VARCHAR PRIMARY KEY,text VARCHAR,label VARCHAR,other VARCHAR,extra INTEGER)", "INSERT INTO data.docs VALUES ('01','One','A','B',7),('1','Two','A','A',8)", "INSERT INTO wordflow.nodes(table_name) VALUES ('docs')"]).await;
    let book = app
        .post("/annotation/codebooks", json!({"name":"Codes"}))
        .await;
    assert_eq!(book.status(), 200, "{}", book.text().await.unwrap());
    let tab: Value = app
        .post("/tabs", json!({"kind":"annotation"}))
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(tab["name"], "Annotation 1");
    let id = tab["id"].as_str().unwrap();
    let codebook = json!({"source":{"schema":"data","name":"Codes"},"code":"code","description":"description"});
    let book_edit: Value = app
        .post(
            &format!("/tabs/{id}/annotation/edit"),
            json!({"mode":"codebook","codebook":codebook}),
        )
        .await
        .json()
        .await
        .unwrap();
    let bid = book_edit["session_id"].as_str().unwrap();
    let save = app.post(&format!("/cell-edits/{bid}/save"),json!({"changes":[],"insertions":[{"values":{"code":"A","description":"First"}},{"values":{"code":"B","description":"Second"}}]})).await;
    assert_eq!(save.status(), 200, "{}", save.text().await.unwrap());
    let setup = json!({"source":{"schema":"data","name":"docs"},"document":"text","annotation":"label","correction":null,"codebook":codebook});
    let start = app
        .post(
            &format!("/tabs/{id}/annotation/edit"),
            json!({"mode":"manual","setup":setup}),
        )
        .await;
    assert_eq!(start.status(), 200);
    let session: Value = start.json().await.unwrap();
    let sid = session["session_id"].as_str().unwrap();
    assert_eq!(session["columns"][0]["editable"], false);
    assert_eq!(session["columns"][2]["editable"], true);
    let protected = app
        .post(
            "/nodes/docs/columns",
            json!({"operation":"add","column":"new","sql_type":"VARCHAR"}),
        )
        .await;
    assert_eq!(protected.status(), 409);
    let readonly = app.sql_response(&["UPDATE data.docs SET extra=0"]).await;
    assert_eq!(readonly.status(), 400);
    // The Codebook is independent. Its rename is reconciled into the active editor.
    app.action("Codes", "rename", json!({"name":"Renamed"}))
        .await;
    let page = app.post(&format!("/cell-edits/{sid}/page"),json!({"page":1,"page_size":10,"sorting":[],"review":{"compare":["other"],"changes":[{"row_ref":"1","column":"label","value":"B"}],"filter":{"column":"label","differs":true,"existence":"off"}}})).await;
    assert_eq!(page.status(), 200);
    let bytes = page.bytes().await.unwrap();
    let mut reader = StreamReader::try_new(Cursor::new(bytes), None).unwrap();
    let metadata: Value =
        serde_json::from_str(&reader.schema().metadata()["wordflow:annotation-review"]).unwrap();
    assert_eq!(metadata["filtered_rows"], 2);
    assert_eq!(metadata["comparisons"][0]["agreement"], 0.0);
    assert_eq!(reader.next().unwrap().unwrap().num_rows(), 2);
    // Display settings cannot overwrite a successfully started Manual request.
    let updated: Value = app
        .post(
            &format!("/tabs/{id}"),
            json!({"settings":{"manual":{"setup":{}},"color":"#112233"}}),
        )
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(updated["settings"]["manual"]["setup"]["document"], "text");
    assert_eq!(
        updated["settings"]["manual"]["setup"]["codebook"]["source"]["name"],
        "Renamed"
    );
    let invalid = app
        .post(
            &format!("/cell-edits/{sid}/save"),
            json!({"changes":[{"row_ref":"1","column":"label","value":"not-a-code"}]}),
        )
        .await;
    assert_eq!(invalid.status(), 400);
    let save = app
        .post(
            &format!("/cell-edits/{sid}/save"),
            json!({"changes":[{"row_ref":"1","column":"label","value":"B"}]}),
        )
        .await;
    assert_eq!(save.status(), 200, "{}", save.text().await.unwrap());
    assert_eq!(
        app.number("SELECT sum(extra)::BIGINT FROM data.docs").await,
        15
    );
    assert_eq!(
        app.number("SELECT count(*)::BIGINT FROM data.docs WHERE rowid='01' AND label='A'")
            .await,
        1
    );
    app.shutdown.cancel();
    app.task.await.unwrap().unwrap();
}

#[tokio::test]
async fn annotation_ai_fresh_preview_atomic_run_and_live_report() {
    use axum::{
        Json, Router,
        extract::State,
        routing::{get, post},
    };
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    async fn predict(
        State(calls): State<Arc<AtomicUsize>>,
        Json(body): Json<Value>,
    ) -> Json<Value> {
        calls.fetch_add(1, Ordering::SeqCst);
        let content = body["messages"].as_array().unwrap().last().unwrap()["content"]
            .as_str()
            .unwrap();
        let texts: Vec<String> = serde_json::from_str(content).unwrap();
        let labels = texts
            .iter()
            .map(|text| {
                if text == "clear" {
                    Value::Null
                } else {
                    json!("A")
                }
            })
            .collect::<Vec<_>>();
        Json(
            json!({"choices":[{"message":{"content":json!({"labels":labels}).to_string()},"finish_reason":"stop"}]}),
        )
    }
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
    let calls = Arc::new(AtomicUsize::new(0));
    let stop = CancellationToken::new();
    let provider = tokio::spawn(
        axum::serve(
            listener,
            Router::new()
                .route("/v1/chat/completions", post(predict))
                .route(
                    "/v1/models",
                    get(|| async { Json(json!({"data":[{"id":"fixture"}]})) }),
                )
                .with_state(calls.clone()),
        )
        .with_graceful_shutdown(stop.clone().cancelled_owned())
        .into_future(),
    );
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE data.docs(rowid VARCHAR PRIMARY KEY, text VARCHAR, label VARCHAR, correction VARCHAR, reference VARCHAR, untouched INTEGER CHECK(untouched>0))",
        "INSERT INTO data.docs VALUES ('01','first','old',NULL,'A',7),('1','clear','B',NULL,'B',8),('blank',chr(9)||chr(10),'old',NULL,'A',9)",
        "CREATE TABLE data.codes(code VARCHAR, description VARCHAR)",
        "INSERT INTO data.codes VALUES ('A','First'),('B','Second')",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('docs'),('codes')"
    ]).await;
    let response = app.client.post(format!("{}/api/ai/providers",app.url)).json(&json!({"name":"Local test","provider":"custom","endpoint":endpoint,"credential":{"action":"remove"}})).send().await.unwrap();
    let status = response.status();
    let connection: Value = response.json().await.unwrap();
    assert_eq!(status, 200, "{connection}");
    assert!(connection.get("key").is_none());
    let tab: Value = app
        .post("/tabs", json!({"kind":"annotation"}))
        .await
        .json()
        .await
        .unwrap();
    let tab = tab["id"].as_str().unwrap();
    let request = json!({"setup":{"source":{"schema":"data","name":"docs"},"document":"text","annotation":"label","correction":"correction","codebook":{"source":{"schema":"data","name":"codes"},"code":"code","description":"description"}},"examples":null,"processing":"all","inference":{"provider":connection["id"],"model":"fixture","prompt":"Classify","temperature":null,"reasoning":"default","batch_size":20,"retries":0,"concurrency":2}});
    let mut stamp = Value::Null;
    for _ in 0..2 {
        let response = app
            .post(
                &format!("/tabs/{tab}/annotation/preview"),
                json!({"request":request,"page":1,"page_size":10}),
            )
            .await;
        let status = response.status();
        let bytes = response.bytes().await.unwrap();
        assert_eq!(status, 200, "{}", String::from_utf8_lossy(&bytes));
        let reader = StreamReader::try_new(Cursor::new(bytes), None).unwrap();
        let metadata: Value = serde_json::from_str(
            reader
                .schema()
                .metadata()
                .get("wordflow:annotation-preview")
                .unwrap(),
        )
        .unwrap();
        stamp = metadata["mutation_stamp"].clone();
        assert_eq!(metadata["skipped"], 1);
        assert_eq!(metadata["predictions"][0]["label"], "A");
        assert_eq!(metadata["predictions"][1]["label"], Value::Null);
        assert_eq!(metadata["row_refs"], json!(["01", "1", "blank"]));
    }
    let response = app
        .post(
            &format!("/tabs/{tab}/annotation/edit"),
            json!({"mode":"corrections","setup":request["setup"],"expected":stamp}),
        )
        .await;
    assert_eq!(response.status(), 200);
    let session: Value = response.json().await.unwrap();
    let edit = session["session_id"].as_str().unwrap();
    let saved=app.post(&format!("/cell-edits/{edit}/save"),json!({"changes":[{"row_ref":"01","column":"correction","value":"B"}],"insertions":[],"deletions":[]})).await;
    assert_eq!(saved.status(), 200);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.analyses").await,
        0
    );
    assert_eq!(
        app.number("SELECT count(*) FROM data.docs WHERE label='old'")
            .await,
        2
    );
    let response = app
        .post(&format!("/tabs/{tab}/annotation"), request.clone())
        .await;
    let status = response.status();
    let output: Value = response.json().await.unwrap();
    assert_eq!(status, 200, "{output}");
    let id = output["id"].as_str().unwrap();
    assert_eq!(output["result"]["payload"]["processed"], 2);
    assert_eq!(output["result"]["payload"]["skipped"], 1);
    assert_eq!(
        app.number("SELECT count(*) FROM data.docs WHERE rowid='01' AND label='A' AND untouched=7")
            .await,
        1
    );
    assert_eq!(
        app.number("SELECT count(*) FROM data.docs WHERE rowid='1' AND label IS NULL")
            .await,
        1
    );
    let response=app.post(&format!("/analyses/{id}/annotation/query"),json!({"view":"rows","page":1,"page_size":10,"correction":"correction","review":{"compare":["reference"],"filter":null}})).await;
    let status = response.status();
    let bytes = response.bytes().await.unwrap();
    assert_eq!(status, 200, "{}", String::from_utf8_lossy(&bytes));
    let reader = StreamReader::try_new(Cursor::new(bytes), None).unwrap();
    let summary: Value = serde_json::from_str(
        reader
            .schema()
            .metadata()
            .get("wordflow:annotation-review")
            .unwrap(),
    )
    .unwrap();
    assert_eq!(summary["comparisons"][0]["included"], 1);
    app.sql(&[
        "DROP TABLE data.docs",
        "DELETE FROM wordflow.nodes WHERE table_name='docs'",
    ])
    .await;
    let context: Value = app
        .post(
            &format!("/analyses/{id}/annotation/query"),
            json!({"view":"context"}),
        )
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(context["codes"].as_array().unwrap().len(), 2);
    let clear = app
        .client
        .delete(format!("{}/api/project/tabs/{tab}/result", app.url))
        .send()
        .await
        .unwrap();
    assert_eq!(clear.status(), 204);
    assert_eq!(
        app.number("SELECT count(*) FROM wordflow.artifacts").await,
        0
    );
    assert_eq!(
        app.number(
            "SELECT count(*) FROM wordflow.analyses WHERE result IS NULL AND request IS NOT NULL"
        )
        .await,
        1
    );
    app.finish().await;
    stop.cancel();
    provider.await.unwrap().unwrap();
}

#[tokio::test]
async fn export_service_inspects_captures_and_streams_portable_projects() {
    let app = App::start().await;
    app.create().await;
    app.sql(&[
        "CREATE TABLE data.\"文件 / one\"(id BIGINT PRIMARY KEY, text VARCHAR)",
        "INSERT INTO data.\"文件 / one\" VALUES (9007199254740993,'Unicode 👋'),(2,NULL)",
        "CREATE VIEW data.filtered AS SELECT * FROM data.\"文件 / one\" WHERE id>2",
        "INSERT INTO wordflow.nodes(table_name) VALUES ('文件 / one'),('filtered')",
    ])
    .await;
    let selected =
        json!({"kind":"selected_project","objects":[{"schema":"data","name":"filtered"}]});
    let inspect = app.post("/exports/inspect", selected.clone()).await;
    assert_eq!(inspect.status(), 200);
    assert!(inspect.headers().get("x-wordflow-task-id").is_none());
    let inspect: Value = inspect.json().await.unwrap();
    assert_eq!(inspect["objects"][0]["action"], "materialize_view");
    assert_eq!(inspect["blockers"], json!([]));
    let export = app.post("/exports", selected).await;
    assert_eq!(export.status(), 200);
    assert!(export.headers().get("x-wordflow-task-id").is_some());
    assert!(
        export.headers()["content-disposition"]
            .to_str()
            .unwrap()
            .ends_with("_selected.wfpj")
    );
    let path = app.directory.path().join("selection.wfpj");
    std::fs::write(&path, export.bytes().await.unwrap()).unwrap();
    let copy = duckdb::Connection::open(&path).unwrap();
    assert_eq!(
        copy.query_row("SELECT id FROM data.filtered", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        9007199254740993
    );
    assert_eq!(
        copy.query_row("SELECT count(*) FROM wordflow.nodes", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        copy.query_row("SELECT count(*) FROM wordflow.analyses", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        0
    );
    assert!(copy.prepare("SELECT * FROM data.\"文件 / one\"").is_err());
    let single=app.post("/exports",json!({"kind":"files","objects":[{"schema":"data","name":"文件 / one"}],"format":"ipc"})).await;
    assert_eq!(single.status(), 200);
    assert_eq!(
        single.headers()["content-type"],
        "application/vnd.apache.arrow.file"
    );
    assert!(
        single.headers()["content-disposition"]
            .to_str()
            .unwrap()
            .contains("%E6%96%87")
    );
    let reader = FileReader::try_new(Cursor::new(single.bytes().await.unwrap()), None).unwrap();
    assert_eq!(reader.map(|b| b.unwrap().num_rows()).sum::<usize>(), 2);
    let zip=app.post("/exports",json!({"kind":"files","objects":[{"schema":"data","name":"文件 / one"},{"schema":"data","name":"filtered"}],"format":"csv"})).await;
    assert_eq!(zip.status(), 200);
    assert_eq!(zip.headers()["content-type"], "application/zip");
    let zip = zip::ZipArchive::new(Cursor::new(zip.bytes().await.unwrap())).unwrap();
    assert_eq!(
        zip.file_names().collect::<Vec<_>>(),
        ["文件 _ one.csv", "filtered.csv"]
    );
    // Inspection never blesses a stale selection: execution resolves it again.
    app.sql(&["DROP VIEW data.filtered"]).await;
    let failed = app
        .post(
            "/exports",
            json!({"kind":"files","objects":[{"schema":"data","name":"filtered"}],"format":"csv"}),
        )
        .await;
    assert_eq!(failed.status(), 404);
    assert!(failed.headers().get("x-wordflow-task-id").is_some());
    assert_eq!(
        app.number("SELECT count(*) FROM data.\"文件 / one\"").await,
        2
    );
    app.close().await;
    app.shutdown.cancel();
    app.task.await.unwrap().unwrap();
}
