//! Deterministic task and lifecycle checks around real Frequency execution.
use super::*;
use crate::{TaskHandle, TaskState};
use std::{sync::mpsc, time::Duration};
use tokio::{sync::Notify, time::timeout};

fn request() -> FrequencyRequest {
    FrequencyRequest {
        inputs: vec![FrequencyInput {
            source: ObjectTarget {
                schema: Some("data".into()),
                name: "documents".into(),
            },
            column: "text".into(),
            tokenizer: "native:plain_words_en".into(),
        }],
    }
}

async fn fixture() -> (ProjectRuntime, Uuid) {
    let runtime = ProjectRuntime::new(CancellationToken::new());
    runtime.create(None).await.unwrap();
    runtime
        .sql(SqlBatch {
            script: Some("CREATE TABLE documents(text VARCHAR); INSERT INTO documents VALUES ('Alpha beta alpha'), ('Café 猫'), (NULL), (' ')".into()),
            response: SqlResponse::Command,
            ..Default::default()
        })
        .await
        .unwrap();
    let tab = runtime
        .create_analysis_tab(CreateTab::default())
        .await
        .unwrap();
    (runtime, tab.id)
}

// Pause at a real computation/publication boundary while retaining all database ownership.
fn paused_run(
    runtime: &ProjectRuntime,
    tab_id: Uuid,
    stage: &'static str,
) -> (TaskHandle<Analysis>, Arc<Notify>, mpsc::Sender<()>) {
    let entered = Arc::new(Notify::new());
    let started = entered.clone();
    let (release, resume) = mpsc::channel();
    let worker = runtime.clone();
    let task = runtime
        .shared
        .tasks
        .submit_owned(
            runtime.operation().unwrap(),
            "Frequency test stage".into(),
            Some(tab_id),
            move |context| async move {
                let analysis_id = worker
                    .with_writable_project(move |database| {
                        database.begin_analysis_run(
                            tab_id,
                            "frequency",
                            serde_json::to_value(request())?,
                        )
                    })
                    .await?;
                let tokenizer = ldaca_rs::text::Tokenizer::load("native:plain_words_en").unwrap();
                worker
                    .with_writable_project(move |database| {
                        database.run_frequency(
                            tab_id,
                            analysis_id,
                            request(),
                            vec![tokenizer],
                            |message| {
                                context.progress(message, None);
                                if message == stage {
                                    started.notify_one();
                                    resume.recv_timeout(Duration::from_secs(10)).unwrap();
                                }
                            },
                        )
                    })
                    .await
            },
        )
        .unwrap();
    (task, entered, release)
}

async fn entered(signal: &Notify) {
    timeout(Duration::from_secs(10), signal.notified())
        .await
        .unwrap();
}

async fn terminal(runtime: &ProjectRuntime, id: Uuid) -> TaskState {
    let (mut events, _) = runtime.task_events();
    timeout(Duration::from_secs(10), async {
        loop {
            if let Some(state) = events
                .borrow()
                .tasks
                .iter()
                .find(|task| task.id == id && task.state.is_finished())
                .map(|task| task.state)
            {
                return state;
            }
            events.changed().await.unwrap();
        }
    })
    .await
    .unwrap()
}

async fn current(runtime: &ProjectRuntime, tab_id: Uuid) -> Option<Uuid> {
    runtime
        .tabs(None)
        .await
        .unwrap()
        .into_iter()
        .find(|tab| tab.id == tab_id)
        .unwrap()
        .analysis
        .as_ref()
        .filter(|a| a.has_result)
        .map(|a| a.id)
}

#[tokio::test]
async fn same_tab_rejects_duplicate_admission_while_different_tabs_overlap() {
    let (runtime, first_tab) = fixture().await;
    let second_tab = runtime
        .create_analysis_tab(CreateTab::default())
        .await
        .unwrap()
        .id;
    let (first, first_entered, first_release) =
        paused_run(&runtime, first_tab, "Counting tokens in documents");
    entered(&first_entered).await;
    assert_eq!(
        runtime
            .submit_frequency(first_tab, request())
            .await
            .err()
            .unwrap()
            .code,
        "analysis_busy"
    );
    let (second, second_entered, second_release) =
        paused_run(&runtime, second_tab, "Counting tokens in documents");
    entered(&second_entered).await;
    assert_eq!(runtime.tasks().tasks.len(), 2);
    assert!(
        runtime
            .tasks()
            .tasks
            .iter()
            .all(|task| task.state == TaskState::Running)
    );
    first_release.send(()).unwrap();
    let first_result = first.wait().await.unwrap();
    second_release.send(()).unwrap();
    let second_result = second.wait().await.unwrap();
    assert_ne!(first_result.id, second_result.id);
    assert_eq!(current(&runtime, first_tab).await, Some(first_result.id));
    assert_eq!(current(&runtime, second_tab).await, Some(second_result.id));
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn disconnected_result_receiver_does_not_abandon_accepted_publication() {
    let (runtime, tab_id) = fixture().await;
    let (task, ready, release) = paused_run(&runtime, tab_id, "Saving Frequency result");
    entered(&ready).await;
    let task_id = task.id;
    drop(task);
    let close = runtime.begin_close().unwrap();
    assert!(close.has_work());
    release.send(()).unwrap();
    assert_eq!(terminal(&runtime, task_id).await, TaskState::Succeeded);
    drop(close);
    let result = runtime
        .analysis(current(&runtime, tab_id).await.unwrap())
        .await
        .unwrap();
    assert_eq!(
        result.result.as_ref().unwrap().payload["corpora"][0]["document_count"],
        "4"
    );
    assert_eq!(
        result.result.as_ref().unwrap().payload["corpora"][0]["total_tokens"],
        "5"
    );
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn cancellation_waits_for_cleanup_and_keeps_request_without_previous_result() {
    let (runtime, tab_id) = fixture().await;
    let previous = runtime
        .submit_frequency(tab_id, request())
        .await
        .unwrap()
        .wait()
        .await
        .unwrap();
    let (task, ready, release) = paused_run(&runtime, tab_id, "Saving Frequency result");
    entered(&ready).await;
    let task_id = task.id;
    runtime.cancel_task(task_id).unwrap();
    assert_eq!(
        runtime
            .tasks()
            .tasks
            .iter()
            .find(|task| task.id == task_id)
            .unwrap()
            .state,
        TaskState::Cancelling
    );
    release.send(()).unwrap();
    assert_eq!(task.wait().await.unwrap_err().code, "interrupted");
    assert_eq!(terminal(&runtime, task_id).await, TaskState::Cancelled);
    assert_eq!(current(&runtime, tab_id).await, None);
    assert!(
        runtime
            .frequency_page(previous.id, FrequencyQuery::default())
            .await
            .is_err()
    );
    let saved = runtime.tabs(None).await.unwrap();
    assert_eq!(
        saved[0].analysis.as_ref().unwrap().request,
        serde_json::to_value(request()).unwrap()
    );
    let retained = runtime.with_project(|database| Ok(database.conn.query_row(
        "SELECT (SELECT count(*) FROM wordflow.analyses), (SELECT count(*) FROM wordflow.artifacts)", [],
        |row| Ok((row.get::<_, u64>(0)?, row.get::<_, u64>(1)?)),
    )?)).await.unwrap();
    assert_eq!(retained, (1, 0));
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn deleting_tab_cancels_its_publisher_without_resurrecting_results() {
    let (runtime, tab_id) = fixture().await;
    runtime
        .submit_frequency(tab_id, request())
        .await
        .unwrap()
        .wait()
        .await
        .unwrap();
    let (task, ready, release) = paused_run(&runtime, tab_id, "Saving Frequency result");
    entered(&ready).await;
    runtime.delete_analysis_tab(tab_id).await.unwrap();
    release.send(()).unwrap();
    assert!(task.wait().await.is_err());
    assert!(runtime.tabs(None).await.unwrap().is_empty());
    let remaining = runtime.with_project(|database| Ok(database.conn.query_row(
        "SELECT (SELECT count(*) FROM wordflow.analyses), (SELECT count(*) FROM wordflow.artifacts), (SELECT count(*) FROM duckdb_tables() WHERE schema_name='wordflow' AND starts_with(table_name,'result_'))", [],
        |row| Ok((row.get::<_, u64>(0)?, row.get::<_, u64>(1)?, row.get::<_, u64>(2)?)),
    )?)).await.unwrap();
    assert_eq!(remaining, (0, 0, 0));
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn editor_allows_frequency_to_read_committed_source_values() {
    let (runtime, tab_id) = fixture().await;
    let session = runtime
        .begin_cell_edit(request().inputs[0].source.clone())
        .await
        .unwrap();
    runtime
        .submit_frequency(tab_id, request())
        .await
        .unwrap()
        .wait()
        .await
        .unwrap();
    assert!(runtime.is_editing().await);
    runtime.cancel_cell_edit(session.session_id).await.unwrap();
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn cancelling_one_project_does_not_interrupt_another_frequency() {
    let (first, first_tab) = fixture().await;
    let (second, second_tab) = fixture().await;
    let (task, ready, release) = paused_run(&first, first_tab, "Saving Frequency result");
    entered(&ready).await;
    first.cancel_task(task.id).unwrap();
    let independent = second
        .submit_frequency(second_tab, request())
        .await
        .unwrap()
        .wait()
        .await
        .unwrap();
    release.send(()).unwrap();
    assert_eq!(task.wait().await.unwrap_err().code, "interrupted");
    assert_eq!(current(&first, first_tab).await, None);
    assert_eq!(current(&second, second_tab).await, Some(independent.id));
    first.close().await.unwrap();
    second.close().await.unwrap();
}

#[tokio::test]
async fn accepted_failed_request_survives_clear_and_reopen_during_independent_editing() {
    let (runtime, tab) = fixture().await;
    let _successful = runtime
        .submit_frequency(tab, request())
        .await
        .unwrap()
        .wait()
        .await
        .unwrap();
    let editor = runtime
        .begin_cell_edit(request().inputs[0].source.clone())
        .await
        .unwrap();
    let mut invalid = request();
    invalid.inputs[0].column = "missing_column".into();
    assert!(
        runtime
            .submit_frequency(tab, invalid.clone())
            .await
            .unwrap()
            .wait()
            .await
            .is_err()
    );
    assert!(runtime.is_editing().await);
    runtime.cancel_cell_edit(editor.session_id).await.unwrap();
    assert_eq!(current(&runtime, tab).await, None);
    runtime.clear_analysis_tab(tab).await.unwrap();
    let directory = tempfile::tempdir().unwrap();
    let destination = directory.path().join("failed-request.wfpj");
    runtime.save(Some(destination.clone())).await.unwrap();
    runtime.close().await.unwrap();
    let reopened = ProjectRuntime::new(CancellationToken::new());
    reopened.open(destination).await.unwrap();
    let tabs = reopened.tabs(None).await.unwrap();
    assert_eq!(
        tabs[0].analysis.as_ref().unwrap().request,
        serde_json::to_value(invalid).unwrap()
    );
    assert_eq!(
        tabs[0]
            .analysis
            .as_ref()
            .filter(|a| a.has_result)
            .map(|a| a.id),
        None
    );
    reopened.close().await.unwrap();
}

#[tokio::test]
async fn save_as_waits_for_frequency_then_reopens_persisted_results() {
    let directory = tempfile::tempdir().unwrap();
    let destination = directory.path().join("frequency.wfpj");
    let (runtime, tab_id) = fixture().await;
    let (task, ready, release) = paused_run(&runtime, tab_id, "Saving Frequency result");
    entered(&ready).await;
    let mut saving = Box::pin(runtime.save(Some(destination.clone())));
    assert!(saving.as_mut().now_or_never().is_none());
    release.send(()).unwrap();
    let result = task.wait().await.unwrap();
    assert_eq!(
        saving.await.unwrap().path,
        Some(destination.canonicalize().unwrap())
    );
    runtime.close().await.unwrap();
    let reopened = ProjectRuntime::new(CancellationToken::new());
    reopened.open(destination).await.unwrap();
    assert!(reopened.tasks().tasks.is_empty());
    assert_eq!(current(&reopened, tab_id).await, Some(result.id));
    assert_eq!(
        reopened
            .frequency_page(result.id, FrequencyQuery::default())
            .await
            .unwrap()
            .total_rows,
        4
    );
    reopened.close().await.unwrap();
}

#[tokio::test]
async fn concordance_cancelled_publication_and_deleted_tab_leave_no_artifacts() {
    let (runtime, _) = fixture().await;
    let tab = runtime
        .create_analysis_tab(CreateTab {
            kind: "concordance".into(),
            name: None,
        })
        .await
        .unwrap()
        .id;
    let input = ConcordanceRequest {
        inputs: vec![ConcordanceInput {
            source: ObjectTarget {
                schema: Some("data".into()),
                name: "documents".into(),
            },
            column: "text".into(),
            tokenizer: None,
        }],
        search: ConcordanceSearch {
            query: "alpha".into(),
            ..Default::default()
        },
    };
    let previous = runtime
        .submit_concordance(tab, input.clone())
        .await
        .unwrap()
        .wait()
        .await
        .unwrap();
    let started = Arc::new(Notify::new());
    let observed = started.clone();
    let (release, resume) = mpsc::channel();
    let worker = runtime.clone();
    let task = runtime
        .shared
        .tasks
        .submit_owned(
            runtime.operation().unwrap(),
            "Concordance paused".into(),
            Some(tab),
            move |context| async move {
                let matcher = DocumentMatcher::prepare(&input.search, &input.inputs[0]).unwrap();
                worker
                    .with_writable_project(move |database| {
                        let analysis_id = database.begin_analysis_run(
                            tab,
                            "concordance",
                            serde_json::to_value(&input)?,
                        )?;
                        database.run_concordance(tab, analysis_id, input, vec![matcher], |stage| {
                            context.progress(stage, None);
                            if stage == "Saving results" {
                                observed.notify_one();
                                resume.recv_timeout(Duration::from_secs(10)).unwrap();
                            }
                        })
                    })
                    .await
            },
        )
        .unwrap();
    entered(&started).await;
    assert_eq!(current(&runtime, tab).await, None);
    assert!(runtime.analysis(previous.id).await.is_err());
    runtime.delete_analysis_tab(tab).await.unwrap();
    release.send(()).unwrap();
    assert!(task.wait().await.is_err());
    let count = runtime
        .with_project(|db| {
            Ok(db
                .conn
                .query_row("SELECT count(*) FROM wordflow.artifacts", [], |row| {
                    row.get::<_, u64>(0)
                })?)
        })
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn concordance_preview_receiver_drop_cancels_and_keeps_cleanup_owned() {
    let (runtime, _) = fixture().await;
    let operation = runtime.operation().unwrap();
    let cancellation = operation.cancellation.clone();
    let started = Arc::new(Notify::new());
    let observed = started.clone();
    let worker = runtime.clone();
    let request = tokio::spawn(async move {
        let _guard = operation.cancellation.clone().drop_guard();
        worker
            .run_operation(operation, Access::Read, move |db, _| {
                observed.notify_one();
                while !db.cancellation.is_cancelled() {
                    std::thread::sleep(Duration::from_millis(5));
                }
                check_cancellation(&db.cancellation)
            })
            .await
    });
    entered(&started).await;
    request.abort();
    timeout(Duration::from_secs(5), cancellation.cancelled())
        .await
        .unwrap();
    runtime
        .begin_close()
        .unwrap()
        .interrupt_and_wait()
        .await
        .unwrap();
    assert!(runtime.shared.active.lock().unwrap().is_empty());
}
