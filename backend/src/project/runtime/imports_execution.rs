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
        self.with_writable_project(move |project| {
            let mut plan = imports::Plan::collect(&input, &temporary, &project.cancellation)?;
            let sources = plan.prepare(input.selected.as_deref(), &project.cancellation)?;
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
            project.import_tables(vec![(
                name,
                SqlStatement {
                    sql: "SELECT * FROM read_parquet(?)".into(),
                    parameters: vec![serde_json::json!(staged.path().join("import.parquet"))],
                },
            )])
        })
        .await
    }
}
