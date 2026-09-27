use super::*;
use std::time::Duration;
use tokio::{sync::oneshot, time::timeout};
fn sql(text: &str) -> SqlBatch {
    SqlBatch {
        script: Some(text.into()),
        response: SqlResponse::Command,
        ..Default::default()
    }
}
async fn project() -> ProjectRuntime {
    let p = ProjectRuntime::new(CancellationToken::new());
    p.create(None).await.unwrap();
    p
}
async fn settle(p: &ProjectRuntime) {
    let close = p.begin_close().unwrap();
    p.shared.tracker.close();
    timeout(Duration::from_secs(10), p.shared.tracker.wait())
        .await
        .unwrap();
    drop(close);
}

#[tokio::test]
async fn independent_writes_overlap_without_shared_metadata_conflicts() {
    let p = project().await;
    p.sql(sql("CREATE TABLE a(i INTEGER); CREATE TABLE b(i INTEGER); INSERT INTO a VALUES (1); INSERT INTO b VALUES (1)")).await.unwrap();
    let (started, ready) = oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let first = p.clone();
    let held = tokio::spawn(async move {
        first
            .with_writable_project(move |db| {
                let tx = db.conn.transaction()?;
                tx.execute_batch("UPDATE a SET i=2")?;
                started.send(()).unwrap();
                wait.recv_timeout(Duration::from_secs(10)).unwrap();
                tx.commit()?;
                Ok(())
            })
            .await
    });
    ready.await.unwrap();
    assert_eq!(
        timeout(
            Duration::from_secs(3),
            p.with_project(|db| Ok(db
                .conn
                .query_row("SELECT i FROM a", [], |r| r.get::<_, i32>(0))?))
        )
        .await
        .unwrap()
        .unwrap(),
        1
    );
    timeout(Duration::from_secs(3), p.sql(sql("UPDATE b SET i=3")))
        .await
        .unwrap()
        .unwrap();
    let conflict = p.sql(sql("UPDATE a SET i=99")).await.err().unwrap();
    assert!(conflict.message.contains("Conflict"));
    release.send(()).unwrap();
    held.await.unwrap().unwrap();
    assert_eq!(
        p.with_project(|db| Ok(db
            .conn
            .query_row("SELECT a.i+b.i FROM a,b", [], |r| r.get::<_, i32>(0))?))
            .await
            .unwrap(),
        5
    );
    p.close().await.unwrap();
}

#[tokio::test]
async fn task_cancel_targets_its_connection_and_status_does_not_wait_for_query() {
    let p = project().await;
    let query = p.clone();
    let task = p
        .submit_task("Long query", move |context| async move {
            context.progress("Scanning", None);
            query
                .sql(sql(
                    "SELECT sum(a.i*b.i) FROM range(10000000) a(i), range(10000000) b(i)",
                ))
                .await
                .map(|_| ())
        })
        .unwrap();
    timeout(Duration::from_secs(5), async {
        loop {
            if p.shared
                .active
                .lock()
                .unwrap()
                .values()
                .any(|w| w.interrupt.lock().unwrap().is_some())
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    timeout(
        Duration::from_secs(2),
        p.sql(sql("CREATE TABLE parallel AS SELECT 42 v")),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        timeout(Duration::from_secs(1), p.status())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
            .path
            .is_none()
    );
    let id = task.id;
    assert_eq!(
        p.cancel_task(id)
            .unwrap()
            .tasks
            .iter()
            .find(|t| t.id == id)
            .unwrap()
            .state,
        crate::TaskState::Cancelling
    );
    assert_eq!(
        timeout(Duration::from_secs(5), task.wait())
            .await
            .unwrap()
            .unwrap_err()
            .code,
        "interrupted"
    );
    assert_eq!(
        p.tasks().tasks.iter().find(|t| t.id == id).unwrap().state,
        crate::TaskState::Cancelled
    );
    p.sql(sql("SELECT * FROM parallel")).await.unwrap();
    p.dismiss_task(id).unwrap();
    assert!(p.tasks().tasks.is_empty());
    p.close().await.unwrap();
}

#[tokio::test]
async fn save_as_waits_for_database_leases_and_next_task_stage_uses_new_file() {
    let p = project().await;
    let (started, ready) = oneshot::channel();
    let (release, wait) = oneshot::channel();
    let run = p.clone();
    let task = p
        .submit_task("Two stages", move |_| async move {
            run.sql(sql("CREATE TABLE a(v INTEGER)")).await?;
            started.send(()).unwrap();
            wait.await.unwrap();
            run.sql(sql("INSERT INTO a VALUES (42)")).await?;
            Ok(())
        })
        .unwrap();
    ready.await.unwrap();
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("saved.wfpj");
    p.save(Some(path.clone())).await.unwrap();
    release.send(()).unwrap();
    task.wait().await.unwrap();
    assert!(p.status().await.unwrap().unwrap().path.is_some());
    assert_eq!(p.tasks().tasks.len(), 1);
    p.close().await.unwrap();
    let db = Connection::open(path).unwrap();
    assert_eq!(
        db.query_row("SELECT v FROM data.a", [], |r| r.get::<_, i32>(0))
            .unwrap(),
        42
    );
}

#[tokio::test]
async fn editor_admission_waits_for_prior_writes_and_rejects_late_writes() {
    let p = project().await;
    p.sql(sql("CREATE TABLE t(v INTEGER); INSERT INTO t VALUES (1); INSERT INTO wordflow.nodes(table_name) VALUES ('t')")).await.unwrap();
    let (started, ready) = oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let writer = p.clone();
    let writing = tokio::spawn(async move {
        writer
            .with_mutation("t".into(), move |db| {
                started.send(()).unwrap();
                wait.recv_timeout(Duration::from_secs(10)).unwrap();
                db.sql(sql("INSERT INTO t VALUES (2)")).map(|_| ())
            })
            .await
    });
    ready.await.unwrap();
    let editor = p.clone();
    let opening = tokio::spawn(async move { editor.begin_cell_edit("t").await });
    timeout(Duration::from_secs(2), async {
        while !p.is_editing().await {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        p.sql(sql("INSERT INTO t VALUES (3)"))
            .await
            .err()
            .unwrap()
            .code,
        "sql_error"
    );
    assert!(!opening.is_finished());
    release.send(()).unwrap();
    writing.await.unwrap().unwrap();
    let session = opening.await.unwrap().unwrap();
    assert_eq!(session.row_count, 2);
    p.cancel_cell_edit(session.session_id).await.unwrap();
    p.close().await.unwrap();
}

#[tokio::test]
async fn cancelled_task_waits_for_blocking_cleanup_and_late_success_stays_successful() {
    let p = project().await;
    let (started, ready) = oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let task = p
        .submit_task("Blocking", move |context| async move {
            context
                .run_blocking(move |context| {
                    started.send(()).unwrap();
                    wait.recv_timeout(Duration::from_secs(10)).unwrap();
                    context.check_cancelled()
                })
                .await
        })
        .unwrap();
    ready.await.unwrap();
    let id = task.id;
    p.cancel_task(id).unwrap();
    assert_eq!(p.tasks().tasks[0].state, crate::TaskState::Cancelling);
    release.send(()).unwrap();
    task.wait().await.unwrap_err();
    let (started, ready) = oneshot::channel();
    let (release, wait) = oneshot::channel();
    let run = p.clone();
    let task = p
        .submit_task("Committed", move |_| async move {
            run.sql(sql("CREATE TABLE committed(v INTEGER)")).await?;
            started.send(()).unwrap();
            wait.await.unwrap();
            Ok(42)
        })
        .unwrap();
    ready.await.unwrap();
    p.cancel_task(task.id).unwrap();
    release.send(()).unwrap();
    assert_eq!(task.wait().await.unwrap(), 42);
    assert!(
        p.tasks()
            .tasks
            .iter()
            .any(|t| t.label == "Committed" && t.state == crate::TaskState::Succeeded)
    );
    p.close().await.unwrap();
}

#[tokio::test]
async fn task_history_is_bounded_and_handles_disconnect_panic_and_prestart_cancel() {
    let p = project().await;
    let task = p
        .submit_task("Cancel before polling", |_| async {
            panic!("Cancelled body must not run");
            #[allow(unreachable_code)]
            Ok(())
        })
        .unwrap();
    p.cancel_task(task.id).unwrap();
    assert_eq!(task.wait().await.unwrap_err().code, "interrupted");
    p.submit_task("Panic", |_| async {
        panic!("worker panic");
        #[allow(unreachable_code)]
        Ok(())
    })
    .unwrap()
    .wait()
    .await
    .unwrap_err();
    assert!(
        p.tasks()
            .tasks
            .iter()
            .any(|t| t.state == crate::TaskState::Failed
                && t.error.as_ref().is_some_and(|e| e.code == "worker_failed"))
    );
    for i in 0..102 {
        let task = p
            .submit_task(format!("Task {i}"), |_| async { Ok(()) })
            .unwrap();
        drop(task);
    }
    settle(&p).await;
    assert_eq!(p.tasks().tasks.len(), 100);
    let id = p.tasks().tasks[0].id;
    p.dismiss_task(id).unwrap();
    p.dismiss_task(id).unwrap();
    assert_eq!(p.tasks().tasks.len(), 99);
    assert!(p.status().await.unwrap().unwrap().path.is_none());
    p.close().await.unwrap();
}

#[tokio::test]
async fn save_as_drains_connections_and_failed_save_preserves_the_runtime() {
    let p = project().await;
    let (started, ready) = oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let read = p.clone();
    let holding = tokio::spawn(async move {
        read.with_project(move |db| {
            let tx = db.conn.transaction()?;
            tx.execute_batch("SELECT 1")?;
            started.send(()).unwrap();
            wait.recv_timeout(Duration::from_secs(10)).unwrap();
            tx.commit()?;
            Ok(())
        })
        .await
    });
    ready.await.unwrap();
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("saved.wfpj");
    let saver = p.clone();
    let saving = tokio::spawn(async move { saver.save(Some(path)).await });
    tokio::task::yield_now().await;
    assert!(!saving.is_finished());
    release.send(()).unwrap();
    holding.await.unwrap().unwrap();
    saving.await.unwrap().unwrap();
    assert!(
        p.save(Some(directory.path().join("absent/no.wfpj")))
            .await
            .is_err()
    );
    p.sql(sql("CREATE TABLE remains(v INTEGER)")).await.unwrap();
    p.close().await.unwrap();
}

#[tokio::test]
async fn finished_editor_releases_connections_and_completion_survives_save_as() {
    let p = project().await;
    p.sql(sql(
        "CREATE TABLE t(v INTEGER); INSERT INTO wordflow.nodes(table_name) VALUES ('t')",
    ))
    .await
    .unwrap();
    let session = p.begin_cell_edit("t").await.unwrap();
    let first = p
        .save_cell_edit(session.session_id.clone(), cell_edit::Save::default())
        .await
        .unwrap();
    assert!(p.shared.editor.lock().await.sessions.is_empty());
    let directory = tempfile::tempdir().unwrap();
    p.save(Some(directory.path().join("saved.wfpj")))
        .await
        .unwrap();
    assert_eq!(
        p.save_cell_edit(session.session_id, cell_edit::Save::default())
            .await
            .unwrap(),
        first
    );
    assert!(p.shared.editor.lock().await.sessions.is_empty());
    p.close().await.unwrap();
}

#[tokio::test]
async fn project_metadata_has_creation_time_without_a_shared_mutation_timestamp() {
    let p = project().await;
    assert_eq!(p.status().await.unwrap().unwrap().schema_version, 1);
    p.with_project(|db| {
        let columns = db
            .conn
            .prepare("DESCRIBE wordflow.project")?
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<duckdb::Result<Vec<_>>>()?;
        assert!(columns.iter().any(|c| c == "created_at"));
        assert!(
            !columns
                .iter()
                .any(|c| c == "modified_at" || c == "uuid" || c == "name" || c == "path")
        );
        Ok(())
    })
    .await
    .unwrap();
    p.sql(sql("SELECT 1")).await.unwrap();
    assert!(p.status().await.unwrap().unwrap().path.is_none());
    assert!(
        p.sql(sql(
            "CREATE TABLE rolled_back(v INTEGER); INSERT INTO missing VALUES (1)"
        ))
        .await
        .is_err()
    );
    assert!(p.status().await.unwrap().unwrap().path.is_none());
    p.close().await.unwrap();
}

#[tokio::test]
async fn explicit_reads_remain_available_during_editing_and_local_settings_do_not_leak() {
    let p = project().await;
    p.sql(sql("CREATE TABLE t(i BIGINT); INSERT INTO t VALUES (1); INSERT INTO wordflow.nodes(table_name) VALUES ('t')")).await.unwrap();
    p.sql(sql("SET VARIABLE answer=42; SET SESSION schema='main'; CREATE TEMP TABLE scratch AS SELECT getvariable('answer') AS value; SELECT * FROM scratch; RESET VARIABLE answer; USE data")).await.unwrap();
    p.with_project(|db| {
        let (schema, value): (String, Option<i64>) =
            db.conn
                .query_row("SELECT current_schema(), getvariable('answer')", [], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })?;
        assert_eq!(schema, "data");
        assert_eq!(value, None);
        assert!(db.conn.prepare("SELECT * FROM scratch").is_err());
        Ok(())
    })
    .await
    .unwrap();
    for statement in [
        "SET threads=1",
        "SET GLOBAL threads=1",
        "RESET threads",
        "ATTACH ':memory:' AS other",
        "COMMIT",
    ] {
        assert!(p.sql(sql(statement)).await.is_err(), "{statement}");
    }
    assert!(p.sql(sql("SET SESSION threads=1")).await.is_err());
    let session = p.begin_cell_edit("t").await.unwrap();
    let mut read = sql("SELECT * FROM t");
    read.mode = SqlMode::Read;
    p.sql(read).await.unwrap();
    let mut write = sql("DELETE FROM t");
    write.mode = SqlMode::Read;
    assert!(p.sql(write).await.is_err());
    p.with_project(|p| {
        assert_eq!(
            p.conn
                .query_row("SELECT count(*) FROM t", [], |r| r.get::<_, i64>(0))?,
            1
        );
        Ok(())
    })
    .await
    .unwrap();
    assert_eq!(
        p.sql(sql("INSERT INTO t VALUES (2)"))
            .await
            .err()
            .unwrap()
            .code,
        "sql_error"
    );
    p.cancel_cell_edit(session.session_id).await.unwrap();
    p.sql(sql("INSERT INTO t VALUES (2)")).await.unwrap();
    p.close().await.unwrap();
}

#[tokio::test]
async fn teardown_waits_for_pending_startup_and_cannot_leave_an_orphan() {
    let p = project().await;
    p.sql(sql("CREATE TABLE t(i INT); INSERT INTO t VALUES (1); INSERT INTO wordflow.nodes(table_name) VALUES ('t')")).await.unwrap();
    let (started, ready) = oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let writer = p.clone();
    let writing = tokio::spawn(async move {
        writer
            .with_mutation("t".into(), move |_| {
                started.send(()).unwrap();
                wait.recv_timeout(Duration::from_secs(5)).unwrap();
                Ok(())
            })
            .await
    });
    ready.await.unwrap();
    let runtime = p.clone();
    let opening = tokio::spawn(async move { runtime.begin_cell_edit("t").await });
    timeout(Duration::from_secs(2), async {
        while !p.is_editing().await {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let runtime = p.clone();
    let cleanup = tokio::spawn(async move { runtime.discard_cell_edit().await });
    p.sql(sql("SET VARIABLE answer=42; CREATE TEMP TABLE scratch AS SELECT getvariable('answer'); SELECT * FROM scratch")).await.unwrap();
    assert!(p.sql(sql("INSERT INTO t VALUES (2)")).await.is_err());
    assert!(!cleanup.is_finished());
    release.send(()).unwrap();
    writing.await.unwrap().unwrap();
    opening.await.unwrap().unwrap();
    cleanup.await.unwrap().unwrap();
    assert!(!p.is_editing().await);
    p.sql(sql("INSERT INTO t VALUES (2)")).await.unwrap();
    p.close().await.unwrap();
}

#[tokio::test]
async fn cleanup_awaits_a_save_accepted_behind_an_editor_read() {
    let p = project().await;
    p.sql(sql("CREATE TABLE t(i INT); INSERT INTO t VALUES (1); INSERT INTO wordflow.nodes(table_name) VALUES ('t')")).await.unwrap();
    let session = p.begin_cell_edit("t").await.unwrap();
    let (started, ready) = oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let reader = p.clone();
    let reading = tokio::spawn(async move {
        reader
            .with_editor(move |_, _| {
                started.send(()).unwrap();
                wait.recv_timeout(Duration::from_secs(5)).unwrap();
                Ok(())
            })
            .await
    });
    ready.await.unwrap();
    let saving = p.save_cell_edit(
        session.session_id,
        cell_edit::Save {
            changes: vec![cell_edit::Patch {
                row_ref: "0".into(),
                column: "i".into(),
                value: Some("42".into()),
            }],
            ..Default::default()
        },
    );
    let mut saving = Box::pin(saving);
    assert!(saving.as_mut().now_or_never().is_none());
    drop(saving); // Accepted Save owns its queue position even after the HTTP future is dropped.
    let runtime = p.clone();
    let cleanup = tokio::spawn(async move { runtime.discard_cell_edit().await });
    release.send(()).unwrap();
    reading.await.unwrap().unwrap();
    cleanup.await.unwrap().unwrap();
    assert!(!p.is_editing().await);
    p.with_project(|db| {
        assert_eq!(
            db.conn
                .query_row("SELECT i FROM t", [], |r| r.get::<_, i32>(0))?,
            42
        );
        Ok(())
    })
    .await
    .unwrap();
    p.close().await.unwrap();
}

#[tokio::test]
async fn read_batches_allow_local_state_and_exports_but_not_persistent_mutations() {
    let p = project().await;
    p.sql(sql(
        "CREATE TABLE t(i INT); INSERT INTO t VALUES (1); CREATE SEQUENCE seq",
    ))
    .await
    .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let output = dir.path().join("read.csv");
    let mut batch = sql(&format!(
        "SET VARIABLE answer=42; SET SESSION schema='main'; CREATE TEMP TABLE scratch AS SELECT getvariable('answer') AS n; COPY scratch TO '{}'; USE data; RESET VARIABLE answer; SELECT * FROM t",
        output.display()
    ));
    batch.mode = SqlMode::Read;
    p.sql(batch).await.unwrap();
    assert!(std::fs::read_to_string(output).unwrap().contains("42"));
    for script in [
        "INSERT INTO t VALUES (2)",
        "SELECT nextval('seq')",
        "CREATE TABLE no(i INT)",
    ] {
        let mut batch = sql(script);
        batch.mode = SqlMode::Read;
        let error = p.sql(batch).await.err().unwrap();
        assert_eq!(error.code, "sql_error");
        assert_eq!(error.statement_index, Some(0));
    }
    let mut preview = sql("SELECT 1; SELECT 2");
    preview.mode = SqlMode::Preview;
    assert_eq!(p.sql(preview).await.err().unwrap().code, "not_previewable");
    p.with_project(|db| {
        assert_eq!(
            db.conn
                .query_row("SELECT current_schema()", [], |r| r.get::<_, String>(0))?,
            "data"
        );
        assert_eq!(
            db.conn
                .query_row("SELECT nextval('seq')", [], |r| r.get::<_, i64>(0))?,
            1
        );
        assert!(db.conn.prepare("SELECT * FROM scratch").is_err());
        Ok(())
    })
    .await
    .unwrap();
    p.close().await.unwrap();
}

#[tokio::test]
async fn streaming_failure_after_the_display_cap_rolls_back_the_whole_script() {
    let p = project().await;
    let mut batch = sql(
        "CREATE TABLE must_rollback(i INT); SELECT CASE WHEN i=90000 THEN error('late batch') ELSE i END FROM range(100000) r(i)",
    );
    batch.response = SqlResponse::Arrow;
    batch.max_rows = Some(1);
    let error = p.sql(batch).await.err().unwrap();
    assert_eq!(error.statement_index, Some(1));
    assert!(error.message.contains("late batch"));
    p.with_project(|db| {
        assert!(db.conn.prepare("SELECT * FROM must_rollback").is_err());
        Ok(())
    })
    .await
    .unwrap();
    p.sql(sql("SELECT 42")).await.unwrap();
    p.close().await.unwrap();
}

#[tokio::test]
async fn disposable_connections_rollback_before_permissions_and_completion_are_released() {
    let p = project().await;
    p.sql(sql("CREATE TABLE rollback_boundary(i INTEGER CHECK(i>0)); INSERT INTO rollback_boundary VALUES (1)")).await.unwrap();
    for failure in [
        "UPDATE rollback_boundary SET i=2; SELECT error('late failure')",
        "UPDATE rollback_boundary SET i=2; INSERT INTO rollback_boundary VALUES (-1)",
    ] {
        let error = p.sql(sql(failure)).await.err().unwrap();
        assert_eq!(error.statement_index, Some(1));
        assert_eq!(
            p.with_project(|db| Ok(db.conn.query_row(
                "SELECT i FROM rollback_boundary",
                [],
                |r| r.get::<_, i32>(0)
            )?))
            .await
            .unwrap(),
            1
        );
    }
    let error = p
        .with_writable_project::<()>(|db| {
            db.conn
                .execute_batch("BEGIN; UPDATE rollback_boundary SET i=3")?;
            panic!("worker unwinds with an open transaction");
        })
        .await
        .unwrap_err();
    assert_eq!(error.code, "worker_failed");
    // Acquiring editor protection must observe rollback, not an orphaned write transaction.
    p.sql(sql(
        "INSERT INTO wordflow.nodes(table_name) VALUES ('rollback_boundary')",
    ))
    .await
    .unwrap();
    let session = p.begin_cell_edit("rollback_boundary").await.unwrap();
    p.cancel_cell_edit(session.session_id).await.unwrap();
    assert_eq!(
        p.with_project(|db| Ok(db
            .conn
            .query_row("SELECT i FROM rollback_boundary", [], |r| r
                .get::<_, i32>(0))?))
            .await
            .unwrap(),
        1
    );
    p.sql(sql("UPDATE rollback_boundary SET i=4"))
        .await
        .unwrap();
    assert_eq!(
        p.with_project(|db| Ok(db
            .conn
            .query_row("SELECT i FROM rollback_boundary", [], |r| r
                .get::<_, i32>(0))?))
            .await
            .unwrap(),
        4
    );
    p.close().await.unwrap();
}

#[tokio::test]
async fn abandoning_close_during_interruption_restores_admission_without_restarting_work() {
    let p = project().await;
    let work = p.operation().unwrap();
    let close = p.begin_close().unwrap();
    assert_eq!(p.operation().err().unwrap().code, "project_busy");
    drop(close);
    assert!(!work.cancellation.is_cancelled());
    drop(p.operation().unwrap());
    let close = p.begin_close().unwrap();
    let waiting = tokio::spawn(async move { close.interrupt_and_wait().await });
    work.cancellation.cancelled().await;
    waiting.abort();
    assert!(waiting.await.unwrap_err().is_cancelled());
    assert!(work.cancellation.is_cancelled());
    drop(p.operation().unwrap());
    drop(work);
    p.sql(sql("SELECT 1")).await.unwrap();
    p.close().await.unwrap();
}
