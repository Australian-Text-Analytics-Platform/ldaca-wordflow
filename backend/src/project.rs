//! Project file ownership and independent transactional database connections.
use crate::{
    error::{Error, Result},
    query::{self, Relation},
};
use arrow_ipc::writer::StreamWriter;
use duckdb::{Connection, OptionalExt, params, params_from_iter, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct SqlStatement {
    pub sql: String,
    #[serde(default)]
    pub parameters: Vec<Value>,
}
#[derive(Debug, Default, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct SqlBatch {
    pub changes: Option<changes::ChangeScope>,
    pub statements: Option<Vec<SqlStatement>>,
    pub script: Option<String>,
    #[serde(default)]
    pub mode: SqlMode,
    pub max_rows: Option<usize>,
    #[serde(default)]
    pub response: SqlResponse,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SqlMode {
    #[default]
    Execute,
    Read,
    Preview,
}

#[derive(Debug, Default, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SqlResponse {
    #[default]
    Arrow,
    Command,
}
pub(crate) enum SqlOutput {
    Arrow {
        file: tempfile::NamedTempFile,
        statements_completed: usize,
        truncated: bool,
    },
    Command(usize),
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    Ndjson,
    Parquet,
    Ipc,
}
impl ExportFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Csv => "csv",
            Self::Json => "json",
            Self::Ndjson => "ndjson",
            Self::Parquet => "parquet",
            Self::Ipc => "arrow",
        }
    }
}

#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub struct ProjectInfo {
    #[schema(value_type = Option<String>)]
    #[schema(required = true)]
    pub path: Option<PathBuf>,
    pub title: String,
    pub schema_version: i32,
}
fn object_kind_schema() -> utoipa::openapi::schema::Object {
    crate::openapi::string_enum(&["table", "view", "missing"])
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct Node {
    pub table_name: String,
    pub visible: bool,
    #[schema(required = true)]
    pub color: Option<String>,
    #[schema(required = true)]
    pub document_column: Option<String>,
    #[schema(schema_with = object_kind_schema)]
    pub kind: String,
    #[schema(required = true)]
    pub column_count: Option<u64>,
    pub can_undo: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<Error>,
}
impl Node {
    fn relation(&self) -> Relation {
        Relation {
            schema: "data".into(),
            name: self.table_name.clone(),
        }
    }
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct Edge {
    pub source_name: String,
    pub target_name: String,
    pub dependency: bool,
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct Graph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

struct Project {
    database: Database,
    path: PathBuf,
    temporary: Option<tempfile::TempDir>,
}

/// One operation connection; only an editor retains it between requests.
struct Database {
    conn: Connection,
    cancellation: CancellationToken,
    changes: changes::Notifications,
}
impl Database {
    fn new(conn: Connection, cancellation: CancellationToken) -> Result<Self> {
        conn.execute_batch("SET SESSION schema='data'")?;
        Ok(Self {
            conn,
            cancellation,
            changes: changes::Notifications::default(),
        })
    }
    fn connection(&self, cancellation: CancellationToken) -> Result<Self> {
        let mut database = Self::new(self.conn.try_clone()?, cancellation)?;
        database.changes = self.changes.clone();
        Ok(database)
    }
    fn import_tables(&mut self, sources: Vec<(String, SqlStatement)>) -> Result<Vec<String>> {
        for (_, statement) in &sources {
            query::parse(&self.conn, &statement.sql)?;
        }
        let tx = self.conn.transaction()?;
        let mut names = Vec::new();
        let mut scope = ChangeScope::resource(Resource::Graph);
        for (name, input) in sources {
            if name.trim().is_empty() {
                return Err(Error::invalid("Table name cannot be empty"));
            }
            let name = unique_object_name(&tx, "data", &name, true, &names)?;
            let raw = unique_object_name(
                &tx,
                "data",
                &format!("{name}_raw"),
                true,
                std::slice::from_ref(&name),
            )?;
            execute_statements(
                &tx,
                &[SqlStatement {
                    sql: format!(
                        "CREATE TABLE data.{} AS {}",
                        query::quote(&raw),
                        input.sql.trim_end().trim_end_matches(';')
                    ),
                    parameters: input.parameters,
                }],
                None,
                &self.cancellation,
            )?;
            tx.execute_batch(&format!(
                "CREATE VIEW data.{} AS SELECT * FROM data.{}",
                query::quote(&name),
                query::quote(&raw)
            ))?;
            tx.execute(
                "INSERT INTO wordflow.nodes(table_name,visible) VALUES (?,false),(?,true)",
                params![raw, name],
            )?;
            scope
                .objects
                .extend([raw, name.clone()].map(|name| Relation {
                    schema: "data".into(),
                    name,
                }));
            names.push(name);
        }
        check_cancellation(&self.cancellation)?;
        PendingChange::new(&tx, scope, &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(names)
    }
    fn delete_node(&mut self, id: impl Into<ObjectTarget>) -> Result<()> {
        let target = id.into();
        let tx = self.conn.transaction()?;
        let object = target.resolve(&tx)?;
        let relation = object.relation;
        let change = PendingChange::new(
            &tx,
            ChangeScope::object(relation.clone()),
            &self.cancellation,
        );

        arrow_metadata::delete_relation(&tx, &relation)?;
        let id = &relation.name;
        if object.registered {
            metadata::delete_node(&tx, id)?;
        }
        let kind = if query::view_query(&tx, &relation)?.is_some() {
            "VIEW"
        } else {
            "TABLE"
        };
        tx.execute_batch(&format!("DROP {kind} IF EXISTS {}", relation.sql()))?;
        check_cancellation(&self.cancellation)?;
        change.commit(tx, &self.changes, &self.cancellation)?;
        Ok(())
    }

    #[cfg(test)]
    fn sql(&mut self, batch: SqlBatch) -> Result<SqlOutput> {
        let read_only = batch.mode != SqlMode::Execute;
        self.sql_with_permission(batch, read_only)
    }
    fn sql_with_permission(&mut self, batch: SqlBatch, read_only: bool) -> Result<SqlOutput> {
        let mut statements = match (batch.statements, batch.script) {
            (Some(statements), None) => statements,
            (None, Some(script)) => query::split_script(&script)
                .map_err(|error| {
                    let mut error = error;
                    if batch.mode == SqlMode::Preview {
                        error.code = "not_previewable".into();
                    }
                    error
                })?
                .into_iter()
                .map(|sql| SqlStatement {
                    sql,
                    parameters: vec![],
                })
                .collect(),
            _ => {
                return Err(Error::invalid(
                    "Supply either statements or script, exclusively",
                ));
            }
        };
        if statements.is_empty() {
            return Err(if batch.mode == SqlMode::Preview {
                Error::new(
                    "not_previewable",
                    "Live preview requires one complete query",
                )
            } else {
                Error::invalid("SQL batch cannot be empty")
            });
        }
        if batch
            .max_rows
            .is_some_and(|limit| !(1..=50_000).contains(&limit))
        {
            return Err(Error::invalid("max_rows must be between 1 and 50000"));
        }
        validate_statements(&statements)?;
        let mut file = match batch.response {
            SqlResponse::Arrow => Some(tempfile::NamedTempFile::new()?),
            SqlResponse::Command => None,
        };
        self.conn.execute_batch(if read_only {
            "BEGIN TRANSACTION READ ONLY"
        } else {
            "BEGIN TRANSACTION"
        })?;
        let scope = if read_only {
            ChangeScope::default()
        } else {
            batch.changes.unwrap_or_else(ChangeScope::all)
        };
        let change = PendingChange::new(&self.conn, scope, &self.cancellation);
        if batch.mode == SqlMode::Preview {
            if statements.len() != 1 {
                return Err(Error::new(
                    "not_previewable",
                    "Live preview requires one complete query",
                ));
            }
            let query = query::parse(&self.conn, &statements[0].sql).map_err(|mut error| {
                error.code = "not_previewable".into();
                error.statement_index = Some(0);
                error
            })?;
            if let Some(limit) = batch.max_rows {
                // Live output is illustrative. Default execution still drains the full script.
                let sql = query::render(&self.conn, &query)?;
                statements[0].sql = format!(
                    "SELECT * FROM ({}) LIMIT {}",
                    sql.trim_end_matches(';'),
                    limit + 1
                );
            }
        }
        let truncated = execute_statements_limited(
            &self.conn,
            &statements,
            file.as_mut(),
            batch.max_rows,
            None,
            &self.cancellation,
        )?;
        check_cancellation(&self.cancellation)?;
        change.commit_sql(&self.conn, &self.changes, &self.cancellation)?;
        Ok(match file {
            Some(file) => SqlOutput::Arrow {
                file,
                statements_completed: statements.len(),
                truncated,
            },
            None => SqlOutput::Command(statements.len()),
        })
    }
    fn view_definition(&self, name: impl Into<ObjectTarget>) -> Result<String> {
        let target = name.into();
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let relation = target.resolve(&self.conn)?.relation;
        let definition = query::view_query(&self.conn, &relation)?
            .ok_or_else(|| Error::invalid("SQL definitions are available only for views"))?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(definition)
    }
    fn replace_view_definition(&mut self, name: impl Into<ObjectTarget>, sql: &str) -> Result<()> {
        self.restore_view_definition(name.into(), Some(sql))
    }
    fn restore_view_definition(
        &mut self,
        target: ObjectTarget,
        definition: Option<&str>,
    ) -> Result<()> {
        let tx = self.conn.transaction()?;
        let object = target.resolve(&tx)?;
        let relation = &object.relation;
        let current = query::view_query(&tx, relation)?.ok_or_else(|| {
            if definition.is_some() {
                Error::invalid("SQL definitions are available only for views")
            } else {
                Error::new("nothing_to_undo", "Stored tables have no query undo")
            }
        })?;
        let definition = match definition {
            Some(sql) => query::render(&tx, &query::parse(&tx, sql)?)?,
            None => query::unwrap(&tx, &current)?,
        };
        let rename = renames::view_rename(&tx, relation, &current, &definition)?;
        let interfaces = if rename.is_some() {
            Some(renames::ViewInterfaces::capture(&tx, relation)?)
        } else {
            None
        };
        let mut scope = ChangeScope::object(relation.clone());
        let rewrites = if let Some(renames::Rename::Column {
            source,
            before,
            after,
        }) = &rename
        {
            let fields = mutations::columns(&tx, source)?;
            let rewrites = renames::column_views(&tx, source, before, after, &fields)?;
            metadata::rename_column(&tx, &object, before, after)?;
            rewrites
        } else {
            vec![]
        };
        if let Some(rename) = rename {
            scope.analysis_ids = renames::reconcile(&tx, &rename)?;
            scope.resources.push(Resource::Tabs);
            scope.renames.push(rename);
        }
        let pending = PendingChange::new(&tx, scope, &self.cancellation);
        redefine(&tx, relation, &definition)?;
        for (view, sql) in rewrites {
            redefine(&tx, &view, &sql)?;
        }
        if let Some(interfaces) = interfaces {
            interfaces.validate(&tx)?;
        }
        pending.commit(tx, &self.changes, &self.cancellation)
    }
    fn edit(&mut self, id: impl Into<ObjectTarget>, sql: &str) -> Result<()> {
        let target = id.into();
        self.edit_batch(target, sql, &[], &[])
    }
    fn edit_batch(
        &mut self,
        id: impl Into<ObjectTarget>,
        sql: &str,
        before: &[SqlStatement],
        after: &[SqlStatement],
    ) -> Result<()> {
        let target = id.into();
        for entry in before.iter().chain(after) {
            query::validate_statement(&entry.sql)?;
        }
        let tx = self.conn.transaction()?;
        execute_statements(&tx, before, None, &self.cancellation)?;
        let relation = target.resolve(&tx)?.relation;
        let mut scope = ChangeScope::object(relation.clone());
        scope.resources.push(Resource::Tabs);
        let change = PendingChange::new(&tx, scope, &self.cancellation);

        let previous = query::view_query(&tx, &relation)?.ok_or_else(|| {
            Error::invalid("Query-layer edits require a view; use SQL to modify a table directly")
        })?;
        let edited = query::wrap(&tx, sql, &previous)?;
        redefine(&tx, &relation, &edited)?;
        execute_statements(&tx, after, None, &self.cancellation)?;
        check_cancellation(&self.cancellation)?;
        change.commit(tx, &self.changes, &self.cancellation)?;
        Ok(())
    }
    fn undo(&mut self, id: impl Into<ObjectTarget>) -> Result<()> {
        self.restore_view_definition(id.into(), None)
    }
    fn replace_source(
        &mut self,
        id: &ObjectTarget,
        old: &ObjectTarget,
        new: &ObjectTarget,
    ) -> Result<()> {
        let tx = self.conn.transaction()?;
        let target = id.resolve(&tx)?.relation;
        let source = old.resolve(&tx)?.relation;
        let replacement = new.resolve(&tx)?.relation;
        if source == replacement {
            return Ok(());
        }
        if target == replacement {
            return Err(Error::invalid("A view cannot use itself as its source"));
        }
        let change =
            PendingChange::new(&tx, ChangeScope::object(target.clone()), &self.cancellation);
        let sql = query::view_query(&tx, &target)?
            .ok_or_else(|| Error::invalid("Source replacement requires a view"))?;
        let mut tree = query::parse(&tx, &sql)?;
        let database: String = tx.query_row("SELECT current_database()", [], |r| r.get(0))?;
        let catalogue = objects::catalogue_relations(&tx)?;
        let search_path: Vec<String> = tx
            .prepare("SELECT unnest(current_schemas(true))")?
            .query_map([], |r| r.get(0))?
            .collect::<duckdb::Result<_>>()?;
        let context = query::ReferenceContext {
            database: &database,
            schema: &target.schema,
            search_path: &search_path,
            catalogue: Some(&catalogue),
        };
        let references = query::references_in(&mut tree, &context, Some((&source, &replacement)));
        if !references.iter().any(|r| {
            r.schema.eq_ignore_ascii_case(&source.schema)
                && r.name.eq_ignore_ascii_case(&source.name)
        }) {
            return Err(Error::invalid(
                "The target view does not reference that source",
            ));
        }
        let rewritten = query::render(&tx, &tree)?;
        redefine(&tx, &target, &rewritten)?;
        // CREATE VIEW can accept recursive definitions. Bind the result before committing,
        // without executing it, so DuckDB owns cycle and column compatibility validation.
        tx.prepare(&format!("SELECT * FROM {}", target.sql()))?;
        check_cancellation(&self.cancellation)?;
        change.commit(tx, &self.changes, &self.cancellation)?;
        Ok(())
    }
    fn materialize(&mut self, id: impl Into<ObjectTarget>) -> Result<()> {
        let target = id.into();
        let tx = self.conn.transaction()?;
        let object = target.resolve(&tx)?;
        let relation = object.relation;
        let change = PendingChange::new(
            &tx,
            ChangeScope::object(relation.clone()),
            &self.cancellation,
        );

        if query::view_query(&tx, &relation)?.is_none() {
            return Ok(());
        }
        // Materialization removes live references. Preserve registered sources as virtual lineage.
        if object.registered {
            for edge in objects::inspect_dependencies(&tx, &self.cancellation)?.edges {
                if edge.target == relation
                    && edge.source.schema.eq_ignore_ascii_case("data")
                    && edge.source != relation
                {
                    tx.execute(
                        "INSERT INTO wordflow.edges(source_name,target_name) SELECT table_name,? FROM wordflow.nodes WHERE translate(table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(?,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') ON CONFLICT DO NOTHING",
                        params![relation.name, edge.source.name],
                    )?;
                }
            }
        }
        let staging = Relation {
            schema: relation.schema.clone(),
            name: format!("m_{}", Uuid::new_v4().simple()),
        };
        tx.execute_batch(&format!(
            "CREATE TABLE {} AS SELECT * FROM {}; DROP VIEW {}; ALTER TABLE {} RENAME TO {};",
            staging.sql(),
            relation.sql(),
            relation.sql(),
            staging.sql(),
            query::quote(&relation.name)
        ))?;
        check_cancellation(&self.cancellation)?;
        change.commit(tx, &self.changes, &self.cancellation)?;
        Ok(())
    }
    fn rename_node(&mut self, id: impl Into<ObjectTarget>, name: &str) -> Result<String> {
        let target = id.into();
        if name.trim().is_empty() {
            return Err(Error::invalid("Table name cannot be empty"));
        }
        let tx = self.conn.transaction()?;
        let object = target.resolve(&tx)?;
        let source = object.relation.clone();
        let interfaces = renames::ViewInterfaces::capture(&tx, &source)?;
        if source.name == name {
            return Ok(source.name);
        }
        let replacement = Relation {
            schema: source.schema.clone(),
            name: name.to_owned(),
        };
        let mut scope = ChangeScope::object(source.clone());
        scope.objects.push(replacement.clone());
        scope.renames.push(renames::Rename::Table {
            source: source.clone(),
            name: name.into(),
        });
        scope.resources.push(Resource::Tabs);
        scope.analysis_ids = renames::reconcile(&tx, &scope.renames[0])?;
        let change = PendingChange::new(&tx, scope, &self.cancellation);
        let database: String = tx.query_row("SELECT current_database()", [], |r| r.get(0))?;
        let relations = {
            let mut stmt = tx.prepare("SELECT schema_name,view_name FROM duckdb_views() WHERE database_name=current_database() AND NOT internal")?;
            stmt.query_map([], |r| {
                Ok(Relation {
                    schema: r.get(0)?,
                    name: r.get(1)?,
                })
            })?
            .collect::<duckdb::Result<Vec<_>>>()?
        };
        let catalogue = objects::catalogue_relations(&tx)?;
        let search_path: Vec<String> = tx
            .prepare("SELECT unnest(current_schemas(true))")?
            .query_map([], |r| r.get(0))?
            .collect::<duckdb::Result<_>>()?;
        let mut rewrites = Vec::new();
        for relation in relations {
            let sql = query::view_query(&tx, &relation)?
                .ok_or_else(|| Error::invalid("View disappeared"))?;
            let mut tree = query::parse(&tx, &sql)?;
            let context = query::ReferenceContext {
                database: &database,
                schema: &relation.schema,
                search_path: &search_path,
                catalogue: Some(&catalogue),
            };
            let refs = query::references_in(&mut tree, &context, Some((&source, &replacement)));
            if refs.iter().any(|r| {
                r.schema.eq_ignore_ascii_case(&source.schema)
                    && r.name.eq_ignore_ascii_case(&source.name)
            }) {
                rewrites.push((relation, query::render(&tx, &tree)?, refs));
            }
        }
        let kind = if query::view_query(&tx, &source)?.is_some() {
            "VIEW"
        } else {
            "TABLE"
        };
        tx.execute_batch(&format!(
            "ALTER {kind} {} RENAME TO {}",
            source.sql(),
            query::quote(name)
        ))?;
        while !rewrites.is_empty() {
            let index = rewrites
                .iter()
                .position(|(_, _, refs)| {
                    !refs.iter().any(|r| {
                        rewrites.iter().any(|(candidate, _, _)| {
                            r.schema.eq_ignore_ascii_case(&candidate.schema)
                                && r.name.eq_ignore_ascii_case(&candidate.name)
                        })
                    })
                })
                .ok_or_else(|| Error::invalid("Cyclic dependent views cannot be renamed"))?;
            let (relation, sql, _) = rewrites.remove(index);
            redefine(&tx, &relation, &sql)?;
        }
        interfaces.validate(&tx)?;
        metadata::rename_node(&tx, &object, name)?;
        check_cancellation(&self.cancellation)?;
        change.commit(tx, &self.changes, &self.cancellation)?;
        Ok(name.to_owned())
    }
    fn clone_node(&mut self, id: impl Into<ObjectTarget>) -> Result<String> {
        let target = id.into();
        let tx = self.conn.transaction()?;
        let object = target.resolve(&tx)?;
        let source = object.relation;
        let id = source.name.as_str();
        let name = unique_object_name(
            &tx,
            &source.schema,
            &format!("{id}_copy"),
            target.schema.is_none(),
            &[],
        )?;
        let relation = Relation {
            schema: source.schema.clone(),
            name: name.clone(),
        };
        let change = PendingChange::new(
            &tx,
            ChangeScope::object(relation.clone()),
            &self.cancellation,
        );
        if let Some(sql) = query::view_query(&tx, &source)? {
            redefine(&tx, &relation, &sql)?;
        } else {
            tx.execute_batch(&format!(
                "CREATE TABLE {} AS SELECT * FROM {}",
                relation.sql(),
                source.sql()
            ))?;
        }
        arrow_metadata::Annotations::load(&tx, &source)?.store(&tx, &relation)?;
        if target.schema.is_none() {
            metadata::clone_node(&tx, id, &name)?;
        }
        check_cancellation(&self.cancellation)?;
        change.commit(tx, &self.changes, &self.cancellation)?;
        Ok(name)
    }
    fn graph(&self) -> Result<Graph> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let mut statement = self.conn.prepare("SELECT table_name,visible,color,document_column FROM wordflow.nodes WHERE visible ORDER BY lower(table_name),table_name")?;
        let mut nodes: Vec<Node> = statement
            .query_map([], read_node)?
            .collect::<duckdb::Result<_>>()?;
        let inspection = objects::inspect_dependencies(&self.conn, &self.cancellation)?;
        let mut inspected: std::collections::HashMap<_, _> = inspection
            .nodes
            .into_iter()
            .filter(|n| n.object.schema.eq_ignore_ascii_case("data"))
            .map(|n| (n.object.name.to_ascii_lowercase(), n))
            .collect();
        for item in &mut nodes {
            if let Some(object) = inspected.remove(&item.table_name.to_ascii_lowercase()) {
                item.kind = object.kind;
                item.column_count = object.column_count;
                item.can_undo = object.can_undo;
                item.diagnostic = object.diagnostic;
            } else {
                item.diagnostic = Some(Error::new(
                    "object_unavailable",
                    "Registered object is unavailable",
                ));
            }
        }
        let names: std::collections::HashMap<_, _> = nodes
            .iter()
            .map(|n| (n.table_name.to_ascii_lowercase(), n.table_name.as_str()))
            .collect();
        // Stored rows are virtual relationships, never a cache of the SQL dependency graph.
        let mut statement = self
            .conn
            .prepare("SELECT source_name,target_name FROM wordflow.edges")?;
        let pairs = statement
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<duckdb::Result<Vec<_>>>()?;
        let mut relationships = std::collections::BTreeMap::new();
        for (source, target) in pairs {
            if let (Some(source), Some(target)) = (
                names.get(&source.to_ascii_lowercase()),
                names.get(&target.to_ascii_lowercase()),
            ) {
                relationships.insert((*source, *target), false);
            }
        }
        for edge in inspection.edges {
            if edge.source.schema.eq_ignore_ascii_case("data")
                && edge.target.schema.eq_ignore_ascii_case("data")
                && let (Some(source), Some(target)) = (
                    names.get(&edge.source.name.to_ascii_lowercase()),
                    names.get(&edge.target.name.to_ascii_lowercase()),
                )
            {
                relationships.insert((*source, *target), true);
            }
        }
        let edges = relationships
            .into_iter()
            .map(|((source_name, target_name), dependency)| Edge {
                source_name: source_name.to_owned(),
                target_name: target_name.to_owned(),
                dependency,
            })
            .collect();
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(Graph { nodes, edges })
    }
}
fn validate_statements(statements: &[SqlStatement]) -> Result<()> {
    for (index, entry) in statements.iter().enumerate() {
        query::validate_statement(&entry.sql).map_err(|mut error| {
            error.statement_index = Some(index);
            error
        })?;
    }
    Ok(())
}
fn check_cancellation(token: &CancellationToken) -> Result<()> {
    if token.is_cancelled() {
        Err(Error::new("interrupted", "Operation interrupted"))
    } else {
        Ok(())
    }
}
fn execute_statements(
    conn: &Connection,
    statements: &[SqlStatement],
    output: Option<&mut tempfile::NamedTempFile>,
    cancellation: &CancellationToken,
) -> Result<()> {
    execute_statements_limited(conn, statements, output, None, None, cancellation).map(|_| ())
}
fn execute_statements_limited(
    conn: &Connection,
    statements: &[SqlStatement],
    mut output: Option<&mut tempfile::NamedTempFile>,
    max_rows: Option<usize>,
    metadata: Option<&arrow_metadata::Annotations>,
    cancellation: &CancellationToken,
) -> Result<bool> {
    let mut truncated = false;
    for (index, entry) in statements.iter().enumerate() {
        (|| -> Result<()> {
            check_cancellation(cancellation)?;
            let parameters = entry
                .parameters
                .iter()
                .map(parameter)
                .collect::<Result<Vec<_>>>()?;
            let mut statement = conn.prepare(&entry.sql)?;
            let schema = statement
                .stream_arrow(params_from_iter(parameters.iter()))?
                .get_schema();
            let schema = if let Some(metadata) = metadata {
                Arc::new(metadata.enrich(&schema, schema.fields().len())?)
            } else {
                schema
            };
            let mut writer = if index + 1 == statements.len() {
                output
                    .as_mut()
                    .map(|file| {
                        StreamWriter::try_new(file.as_file_mut(), &schema).map_err(arrow_error)
                    })
                    .transpose()?
            } else {
                None
            };
            let mut written = 0;
            // The fallible step API avoids upstream iterator panics on Arrow conversion errors.
            while let Some(array) = statement.step()? {
                check_cancellation(cancellation)?;
                if let Some(writer) = writer.as_mut() {
                    let batch = duckdb::arrow::record_batch::RecordBatch::from(&array);
                    let batch = arrow_metadata::enrich_batch(batch, schema.clone())?;
                    let count = batch
                        .num_rows()
                        .min(max_rows.unwrap_or(usize::MAX).saturating_sub(written));
                    truncated |= count < batch.num_rows();
                    if count > 0 {
                        writer.write(&batch.slice(0, count)).map_err(arrow_error)?;
                        written += count;
                    }
                }
            }
            if let Some(writer) = writer.as_mut() {
                writer.finish().map_err(arrow_error)?;
            }
            Ok(())
        })()
        .map_err(|mut error| {
            error.statement_index = Some(index);
            error
        })?;
    }
    Ok(truncated)
}
fn read_node(r: &duckdb::Row<'_>) -> duckdb::Result<Node> {
    Ok(Node {
        table_name: r.get(0)?,
        visible: r.get(1)?,
        color: r.get(2)?,
        document_column: r.get(3)?,
        kind: "missing".into(),
        column_count: None,
        can_undo: false,
        diagnostic: None,
    })
}
fn node(conn: &Connection, name: &str) -> Result<Node> {
    conn.query_row("SELECT table_name,visible,color,document_column FROM wordflow.nodes WHERE translate(table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(?,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')", [name], read_node)
        .optional()?.ok_or_else(|| Error::new("node_not_found", "Data Block is not registered"))
}
fn unique_object_name(
    conn: &Connection,
    schema: &str,
    base: &str,
    registered: bool,
    reserved: &[String],
) -> Result<String> {
    let catalogue = objects::catalogue_relations(conn)?;
    let mut names: Vec<String> = catalogue
        .into_iter()
        .filter(|r| r.schema.eq_ignore_ascii_case(schema))
        .map(|r| r.name)
        .collect();
    if registered {
        names.extend(
            conn.prepare("SELECT table_name FROM wordflow.nodes")?
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<duckdb::Result<Vec<_>>>()?,
        );
    }
    names.extend_from_slice(reserved);
    let names: std::collections::HashSet<_> = names
        .into_iter()
        .map(|name| name.to_ascii_lowercase())
        .collect();
    let mut name = base.to_owned();
    let mut suffix = 2;
    while names.contains(&name.to_ascii_lowercase()) {
        name = format!("{base}_{suffix}");
        suffix += 1;
    }
    Ok(name)
}
fn redefine(conn: &Connection, relation: &Relation, sql: &str) -> Result<()> {
    conn.execute_batch(&format!(
        "CREATE OR REPLACE VIEW {} AS {sql}",
        relation.sql()
    ))?;
    Ok(())
}
fn validate_project(conn: &Connection) -> Result<()> {
    let data_schema: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM duckdb_schemas() WHERE database_name=current_database() AND schema_name='data')",[],|row|row.get(0))?;
    if !data_schema {
        return Err(Error::new(
            "invalid_project",
            "The project data schema is missing",
        ));
    }

    let header = conn
        .query_row(
            "SELECT count(*),min(schema_version) FROM wordflow.project",
            [],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<i32>>(1)?)),
        )
        .map_err(|e| Error::new("invalid_project", e.to_string()))?;
    if header != (1, Some(1)) {
        return Err(Error::new(
            "invalid_project",
            "Unsupported or invalid Wordflow project format",
        ));
    }
    for sql in [
        "SELECT singleton,description,created_at FROM wordflow.project LIMIT 0",
        "SELECT table_name,visible,color,document_column FROM wordflow.nodes LIMIT 0",
        "SELECT source_name,target_name FROM wordflow.edges LIMIT 0",
        "SELECT schema_name,relation_name,field_path,extension_name,extension_metadata FROM wordflow.arrow_metadata LIMIT 0",
        "SELECT table_name,column_name,tokenizer_model FROM wordflow.tokenizer_models LIMIT 0",
        "SELECT id,position,sql,mode FROM wordflow.sql_cells LIMIT 0",
        "SELECT id,kind,name,position,settings FROM wordflow.tabs LIMIT 0",
        "SELECT id,tab_id,request,result,result_version,created_at,finished_at FROM wordflow.analyses LIMIT 0",
        "SELECT id,analysis_id,name,storage_kind,media_type,relation_name,content FROM wordflow.artifacts LIMIT 0",
    ] {
        conn.prepare(sql)
            .map_err(|e| Error::new("invalid_project", e.to_string()))?;
    }
    Ok(())
}
fn parameter(value: &Value) -> Result<SqlValue> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::Bool(v) => SqlValue::Boolean(*v),
        Value::String(v) => SqlValue::Text(v.clone()),
        Value::Number(v) => {
            if let Some(i) = v.as_i64() {
                SqlValue::BigInt(i)
            } else if let Some(i) = v.as_u64() {
                SqlValue::UBigInt(i)
            } else {
                SqlValue::Double(
                    v.as_f64()
                        .ok_or_else(|| Error::invalid("Invalid numeric parameter"))?,
                )
            }
        }
        _ => {
            return Err(Error::invalid(
                "Parameters must be JSON scalars; bind JSON or binary encodings as strings and cast in SQL",
            ));
        }
    })
}
fn arrow_error(e: duckdb::arrow::error::ArrowError) -> Error {
    Error::new("arrow_error", e.to_string())
}

pub mod analyses;
pub(crate) mod changes;
pub(crate) mod concordance;
mod document_matches;
pub mod exports;
pub mod frequency;
pub(crate) mod plots;
pub(crate) mod quotation;
pub(crate) mod topic_modeling;
pub(crate) use analyses::*;
use changes::{ChangeScope, PendingChange, Resource};
pub(crate) use concordance::*;
pub(crate) use document_matches::DocumentPage;
pub(crate) use frequency::*;
pub(crate) use plots::*;
pub(crate) use quotation::*;
pub(crate) mod annotation;
mod arrow_metadata;
pub(crate) mod cell_edit;
mod datetime_cast;
mod lifecycle;
mod metadata;
pub(crate) mod mutations;
pub(crate) mod objects;
mod protection;
mod renames;
pub(crate) mod stopwords;
pub use lifecycle::lock_destination;
pub use objects::ObjectTarget;
pub(crate) mod node_reads;
mod runtime;
pub use runtime::Operation;
pub use runtime::{CloseAttempt, ProjectRuntime};

pub(crate) use runtime::topic_preview::Update as TopicPreviewUpdate;
