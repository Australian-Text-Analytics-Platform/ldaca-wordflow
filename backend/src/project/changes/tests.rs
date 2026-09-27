use super::*;

fn batch(sql: &str, changes: Option<ChangeScope>) -> SqlBatch {
    SqlBatch {
        script: Some(sql.into()),
        changes,
        response: SqlResponse::Command,
        ..Default::default()
    }
}
fn object(schema: &str, name: &str) -> Relation {
    Relation {
        schema: schema.into(),
        name: name.into(),
    }
}

#[tokio::test]
async fn save_as_preserves_change_subscriptions_for_subsequent_mutations() {
    let runtime = ProjectRuntime::new(CancellationToken::new());
    runtime.create(None).await.unwrap();
    runtime
        .sql(batch("CREATE TABLE source(n INTEGER)", None))
        .await
        .unwrap();
    let mut events = runtime.changes();
    let directory = tempfile::tempdir().unwrap();
    for name in ["first.wfpj", "first.wfpj", "second.wfpj"] {
        runtime
            .save(Some(directory.path().join(name)))
            .await
            .unwrap();
        runtime
            .sql(batch(
                "INSERT INTO source VALUES (1)",
                Some(ChangeScope::object(object("data", "source"))),
            ))
            .await
            .unwrap();
        let change = events.try_recv().expect("Save As detached change delivery");
        assert_eq!(change.objects, [object("data", "source")]);
        assert!(!change.all);
    }
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn commits_refresh_sql_dependants_only_and_rollbacks_publish_nothing() {
    let runtime = ProjectRuntime::new(CancellationToken::new());
    runtime.create(None).await.unwrap();
    runtime.sql(batch("CREATE TABLE source(n INTEGER); CREATE VIEW child AS SELECT * FROM source; CREATE VIEW grandchild AS SELECT * FROM child; CREATE TABLE other(n INTEGER); CREATE SCHEMA elsewhere; CREATE TABLE elsewhere.source(n INTEGER); INSERT INTO wordflow.nodes(table_name) VALUES ('source'),('other'); INSERT INTO wordflow.edges(source_name,target_name) VALUES ('source','other')", None)).await.unwrap();
    let mut events = runtime.changes();
    let scope = ChangeScope {
        objects: vec![object("data", "SOURCE")],
        ..Default::default()
    };
    runtime
        .sql(batch("INSERT INTO source VALUES (1)", Some(scope.clone())))
        .await
        .unwrap();
    let change = events.try_recv().unwrap();
    assert!(!change.all);
    for name in ["source", "child", "grandchild"] {
        assert!(
            change
                .objects
                .iter()
                .any(|r| same(r, &object("data", name)))
        );
    }
    assert_eq!(change.objects.len(), 3);
    assert!(change.resources.is_empty());
    assert!(
        runtime
            .sql(batch(
                "INSERT INTO source VALUES (2); SELECT error('rollback')",
                Some(scope)
            ))
            .await
            .is_err()
    );
    assert!(events.try_recv().is_err());
    runtime
        .sql(SqlBatch {
            script: Some("SELECT * FROM source".into()),
            mode: SqlMode::Read,
            ..Default::default()
        })
        .await
        .unwrap();
    assert!(events.try_recv().is_err());
    runtime
        .sql(batch("INSERT INTO other VALUES (3)", None))
        .await
        .unwrap();
    assert!(events.try_recv().unwrap().all);
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn rename_and_delete_include_dependants_and_uncertain_views_without_scanning() {
    let runtime = ProjectRuntime::new(CancellationToken::new());
    runtime.create(None).await.unwrap();
    runtime.sql(batch("CREATE TABLE source(n INTEGER); CREATE VIEW child AS SELECT * FROM source; CREATE VIEW never_execute AS SELECT error('must not execute') AS n FROM source; CREATE VIEW generated AS SELECT * FROM range(1); INSERT INTO wordflow.nodes(table_name) VALUES ('source')", None)).await.unwrap();
    let mut events = runtime.changes();
    runtime
        .rename_node("source", "renamed".into())
        .await
        .unwrap();
    let renamed = events.try_recv().unwrap();
    for name in ["source", "renamed", "child", "never_execute", "generated"] {
        assert!(
            renamed.objects.contains(&object("data", name)),
            "missing {name}"
        );
    }
    runtime.delete_node("renamed").await.unwrap();
    let deleted = events.try_recv().unwrap();
    assert!(deleted.objects.contains(&object("data", "child")));
    assert!(!deleted.all);
    runtime.close().await.unwrap();
}

#[tokio::test]
async fn changes_survive_disconnected_task_handles_and_metadata_stays_scoped() {
    let runtime = ProjectRuntime::new(CancellationToken::new());
    runtime.create(None).await.unwrap();
    let mut events = runtime.changes();
    let worker = runtime.clone();
    let task = runtime
        .submit_task("Disconnected write", move |_| async move {
            worker
                .sql(batch(
                    "CREATE TABLE accepted(n INTEGER)",
                    Some(ChangeScope::object(object("data", "accepted"))),
                ))
                .await
        })
        .unwrap();
    drop(task);
    let event = tokio::time::timeout(std::time::Duration::from_secs(5), events.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(event.objects, [object("data", "accepted")]);
    runtime
        .create_analysis_tab(CreateTab::default())
        .await
        .unwrap();
    let metadata = events.recv().await.unwrap();
    assert_eq!(metadata.resources, [Resource::Tabs]);
    assert!(metadata.objects.is_empty());
    runtime.close().await.unwrap();
}

#[test]
fn mutation_stamps_change_only_after_relevant_commits() {
    let mut p = Project::untitled().unwrap();
    let db = &mut p.database;
    db.conn
        .execute_batch("CREATE TABLE data.a(n INT); CREATE TABLE data.b(n INT)")
        .unwrap();
    let a = object("data", "a");
    let b = object("data", "b");
    let first = db.changes.stamp(&a);
    db.sql(batch(
        "INSERT INTO b VALUES(1)",
        Some(ChangeScope::object(b)),
    ))
    .unwrap();
    assert_eq!(db.changes.stamp(&a), first);
    {
        let mut operation = db.connection(CancellationToken::new()).unwrap();
        assert!(
            operation
                .sql(batch(
                    "INSERT INTO a VALUES(1); SELECT error('rollback')",
                    Some(ChangeScope::object(a.clone()))
                ))
                .is_err()
        );
    }
    assert_eq!(db.changes.stamp(&a), first);
    db.sql(batch(
        "INSERT INTO a VALUES(2)",
        Some(ChangeScope::object(a.clone())),
    ))
    .unwrap();
    assert_ne!(db.changes.stamp(&a), first);
    let second = db.changes.stamp(&a);
    db.sql(batch("CREATE TABLE data.c(n INT)", None)).unwrap();
    assert_ne!(db.changes.stamp(&a), second);
}
