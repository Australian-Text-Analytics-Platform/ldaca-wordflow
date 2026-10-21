use super::*;

impl ProjectRuntime {
    pub(crate) async fn inspect_files(
        &self,
        input: imports::FileImportRequest,
    ) -> Result<imports::FileImportPlan> {
        let operation = self.operation()?;
        let temporary = self.temporary_directory()?;
        tokio::task::spawn_blocking(move || {
            let plan = imports::Plan::collect(&input, &temporary, &operation.cancellation)?;
            Ok(plan.inspection)
        })
        .await?
    }
    pub(crate) async fn import_files(
        &self,
        input: imports::FileImportRequest,
    ) -> Result<imports::FileImportResult> {
        let temporary = self.temporary_directory()?;
        let context = crate::tasks::current();
        self.with_writable_project(move |project| {
            let mut plan = imports::Plan::collect(&input, &temporary, &project.cancellation)?;
            if let Some(context) = &context {
                context.progress("Preparing file contents", None);
            }
            let sources = plan.prepare(input.selected.as_deref(), &project.cancellation)?;
            if let Some(context) = &context {
                context.progress("Adding Data Blocks", None);
            }
            let table_names = project.import_sources(sources)?;
            Ok(imports::FileImportResult {
                table_names,
                skipped: plan.inspection.skipped,
            })
        })
        .await
    }
    pub(crate) async fn import_tables(
        &self,
        sources: Vec<(String, SqlStatement)>,
    ) -> Result<Vec<String>> {
        self.with_writable_project(move |project| project.import_tables(sources))
            .await
    }
    pub(crate) async fn import_samples(
        &self,
        files: Vec<(String, String)>,
        as_views: bool,
    ) -> Result<Vec<String>> {
        self.with_writable_project(move |project| {
            // DuckDB autoloads its signed httpfs extension on the first remote scan.
            // Every selected object and its registration commit together.
            let kind = if as_views { "VIEW" } else { "TABLE" };
            let tx = project.conn.transaction()?;
            let mut statements = Vec::new();
            let mut reserved = Vec::new();
            for (name, url) in files {
                let object = unique_object_name(&tx, "data", &name, true, &reserved)?;
                reserved.push(object.clone());
                statements.push(SqlStatement {
                    sql: format!(
                        "CREATE {kind} data.{} AS SELECT * FROM read_parquet('{}')",
                        query::quote(&object),
                        url.replace('\'', "''")
                    ),
                    parameters: vec![],
                });
                statements.push(SqlStatement {
                    sql: "INSERT INTO wordflow.nodes(table_name) VALUES (?)".into(),
                    parameters: vec![serde_json::json!(object)],
                });
            }
            for entry in &statements {
                query::validate_statement(&entry.sql)?;
            }
            execute_statements(&tx, &statements, None, &project.cancellation)?;
            check_cancellation(&project.cancellation)?;
            let scope = ChangeScope {
                objects: reserved
                    .iter()
                    .map(|name| Relation {
                        schema: "data".into(),
                        name: name.clone(),
                    })
                    .collect(),
                ..ChangeScope::resource(Resource::Graph)
            };
            PendingChange::new(&tx, scope, &project.cancellation).commit(
                tx,
                &project.changes,
                &project.cancellation,
            )?;
            Ok(reserved)
        })
        .await
    }
    pub(crate) async fn import_ldaca(
        &self,
        staged: tempfile::TempDir,
        name: String,
    ) -> Result<Vec<String>> {
        self.with_writable_project(move |project| {
            let mut paths = std::fs::read_dir(staged.path())?
                .map(|entry| entry.map(|entry| entry.path()))
                .collect::<std::io::Result<Vec<_>>>()?;
            paths.sort();
            if paths.is_empty() {
                return Err(Error::invalid("The collection contains no importable data"));
            }
            let placeholders = vec!["?"; paths.len()].join(",");
            project.import_tables(vec![(
                name,
                SqlStatement {
                    sql: format!(
                        "SELECT * FROM read_parquet([{placeholders}], union_by_name=true)"
                    ),
                    parameters: paths
                        .into_iter()
                        .map(|path| serde_json::json!(path))
                        .collect(),
                },
            )])
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use std::{io::Write, time::Duration};
    use tower::ServiceExt;

    fn inspect_request(path: &Path) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri("/api/project/import/inspect")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::json!({"paths":[path]}).to_string()))
            .unwrap()
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn inspection_is_visible_and_cancellable_before_reading_files() {
        let project = ProjectRuntime::new(CancellationToken::new());
        project.create(None).await.unwrap();
        let (ready, entered) = tokio::sync::oneshot::channel();
        let ready = Mutex::new(Some(ready));
        let (release, wait) = std::sync::mpsc::channel();
        let wait = Mutex::new(wait);
        project
            .shared
            .tasks
            .observe_progress(Arc::new(move |_, progress| {
                if progress.message == "Inspecting files and archives" {
                    ready.lock().unwrap().take().unwrap().send(()).unwrap();
                    wait.lock()
                        .unwrap()
                        .recv_timeout(Duration::from_secs(10))
                        .unwrap();
                }
            }));
        let (router, _) = crate::api::router().split_for_parts();
        let router = router.with_state(project.clone());
        let request = inspect_request(Path::new("/not-read.zip"));
        let response = tokio::spawn(async move { router.oneshot(request).await.unwrap() });
        tokio::time::timeout(Duration::from_secs(5), entered)
            .await
            .unwrap()
            .unwrap();
        let snapshot = project.tasks();
        let task = snapshot.tasks.first().unwrap();
        let id = task.id;
        let active = task.finished_at.is_none();
        let label = task.label.clone();
        project.cancel_task(id).unwrap();
        release.send(()).unwrap();
        let response = response.await.unwrap();
        assert!(active);
        assert_eq!(label, "Prepare data import");
        assert!(!response.status().is_success());
        assert_eq!(response.headers()["x-wordflow-task-id"], id.to_string());
        assert_eq!(project.tasks().tasks[0].state, crate::TaskState::Cancelled);
        project.close().await.unwrap();
    }

    #[tokio::test]
    async fn zip_inspection_retains_completed_and_failed_tasks_without_importing() {
        let project = ProjectRuntime::new(CancellationToken::new());
        project.create(None).await.unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("corpus.zip");
        let mut archive = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        for (name, text) in [
            ("first.txt", "First article"),
            ("second.txt", "Second article"),
        ] {
            archive
                .start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            archive.write_all(text.as_bytes()).unwrap();
        }
        archive.finish().unwrap();
        let (router, _) = crate::api::router().split_for_parts();
        let router = router.with_state(project.clone());
        let response = router
            .clone()
            .oneshot(inspect_request(&path))
            .await
            .unwrap();
        assert!(response.status().is_success());
        let id =
            Uuid::parse_str(response.headers()["x-wordflow-task-id"].to_str().unwrap()).unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let plan: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(plan["files"].as_array().unwrap().len(), 2);
        let snapshot = project.tasks();
        let completed = snapshot.tasks.iter().find(|task| task.id == id).unwrap();
        assert_eq!(completed.state, crate::TaskState::Succeeded);
        let count = project
            .with_project(|db| {
                Ok(db
                    .conn
                    .query_row("SELECT count(*) FROM wordflow.nodes", [], |row| {
                        row.get::<_, i64>(0)
                    })?)
            })
            .await
            .unwrap();
        assert_eq!(count, 0);

        std::fs::write(&path, "invalid ZIP").unwrap();
        let failed = router.oneshot(inspect_request(&path)).await.unwrap();
        assert!(!failed.status().is_success());
        let id = Uuid::parse_str(failed.headers()["x-wordflow-task-id"].to_str().unwrap()).unwrap();
        let snapshot = project.tasks();
        let failed = snapshot.tasks.iter().find(|task| task.id == id).unwrap();
        assert_eq!(failed.state, crate::TaskState::Failed);
        assert!(failed.error.is_some());
        project.close().await.unwrap();
    }
}
