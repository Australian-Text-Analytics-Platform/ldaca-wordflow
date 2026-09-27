//! Captured exports own their staging files, never project records or source mutations.
use super::*;
use arrow_ipc::writer::FileWriter;
use std::collections::HashSet;
use std::io::{Read, Write};

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ExportRequest {
    Files {
        objects: Vec<ObjectTarget>,
        format: ExportFormat,
    },
    SelectedProject {
        objects: Vec<ObjectTarget>,
    },
    CompleteProject,
}
impl ExportRequest {
    pub fn filename(&self, title: &str) -> String {
        match self {
            Self::Files { objects, format } if objects.len() == 1 => {
                format!("{}.{}", safe_filename(&objects[0].name), format.extension())
            }
            Self::Files { .. } => format!("{}_data_blocks.zip", safe_filename(title)),
            Self::SelectedProject { .. } => format!("{}_selected.wfpj", safe_filename(title)),
            Self::CompleteProject => format!("{}_portable.wfpj", safe_filename(title)),
        }
    }
    pub fn media_type(&self) -> &'static str {
        match self {
            Self::Files { objects, format } if objects.len() == 1 => match format {
                ExportFormat::Csv => "text/csv; charset=utf-8",
                ExportFormat::Json => "application/json",
                ExportFormat::Ndjson => "application/x-ndjson",
                ExportFormat::Parquet => "application/vnd.apache.parquet",
                ExportFormat::Ipc => "application/vnd.apache.arrow.file",
            },
            Self::Files { .. } => "application/zip",
            _ => "application/octet-stream",
        }
    }
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ExportInspection {
    pub summary: ExportSummary,
    pub objects: Vec<ExportObject>,
    pub blockers: Vec<Error>,
}
#[derive(Debug, Default, Serialize, utoipa::ToSchema)]
pub struct ExportSummary {
    pub data_blocks: usize,
    pub hidden_data_blocks: usize,
    pub analyses: u64,
    pub sql_cells: u64,
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ExportObject {
    #[schema(schema_with = export_class_schema)]
    pub classification: &'static str,
    pub source: ObjectTarget,
    #[schema(schema_with = export_action_schema)]
    pub action: &'static str,
    #[schema(required = true)]
    pub reason: Option<String>,
}
#[derive(Clone)]
struct Entry {
    oid: u64,
    relation: Relation,
    kind: String,
    sql: String,
}
struct Planned {
    entry: Entry,
    action: &'static str,
    reason: Option<String>,
    sql: Option<String>,
    parents: Vec<Relation>,
}
struct Plan {
    database: String,
    items: Vec<Planned>,
    blockers: Vec<Error>,
}
fn contextual(mut error: Error, object: &Relation) -> Error {
    error.message = format!("Export {}: {}", object.sql(), error.message);
    error
}
fn qualified(database: &str, relation: &Relation) -> String {
    format!("{}.{}", query::quote(database), relation.sql())
}
fn catalogue(conn: &Connection) -> Result<Vec<Entry>> {
    Ok(conn.prepare("SELECT table_oid,schema_name,table_name,'table',sql FROM duckdb_tables() WHERE database_name=current_database() AND NOT temporary AND NOT internal UNION ALL SELECT view_oid,schema_name,view_name,'view',sql FROM duckdb_views() WHERE database_name=current_database() AND NOT temporary AND NOT internal ORDER BY 2,3")?
        .query_map([], |r| Ok(Entry { oid:r.get(0)?, relation:Relation {schema:r.get(1)?, name:r.get(2)?}, kind:r.get(3)?, sql:r.get(4)? }))?
        .collect::<duckdb::Result<Vec<_>>>()?)
}
fn key(relation: &Relation) -> (String, String) {
    (
        relation.schema.to_ascii_lowercase(),
        relation.name.to_ascii_lowercase(),
    )
}
fn plan(
    conn: &Connection,
    request: &ExportRequest,
    cancellation: &CancellationToken,
) -> Result<Plan> {
    let database: String = conn.query_row("SELECT current_database()", [], |r| r.get(0))?;
    let catalogue = catalogue(conn)?;
    let mut blockers = Vec::new();
    let entries = match request {
        ExportRequest::Files { objects, .. } | ExportRequest::SelectedProject { objects } => {
            if objects.is_empty() {
                return Err(Error::invalid("Select at least one Data Block"));
            }
            let mut seen = HashSet::new();
            let mut selected = Vec::new();
            for object in objects {
                match object.resolve(conn) {
                    Ok(object) => {
                        if !seen.insert(key(&object.relation)) {
                            return Err(Error::invalid(
                                "Each Data Block may be selected only once",
                            ));
                        }
                        if let Some(entry) = catalogue
                            .iter()
                            .find(|entry| entry.relation == object.relation)
                        {
                            selected.push(entry.clone());
                        } else {
                            blockers.push(Error::new(
                                "object_not_found",
                                format!("Export {}: relation is missing", object.relation.sql()),
                            ));
                        }
                    }
                    Err(mut error) => {
                        error.message = format!("Export {object}: {}", error.message);
                        blockers.push(error);
                    }
                }
            }
            selected
        }
        ExportRequest::CompleteProject => catalogue.clone(),
    };
    let selected: HashSet<_> = entries.iter().map(|entry| key(&entry.relation)).collect();
    let relations: Vec<_> = catalogue
        .iter()
        .map(|entry| entry.relation.clone())
        .collect();
    let search_path = conn
        .prepare("SELECT unnest(current_schemas(true))")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<duckdb::Result<Vec<_>>>()?;
    // Scalar macros can contain subqueries too. The graph deliberately does not expand them.
    let macros = conn.prepare("SELECT function_name FROM duckdb_functions() WHERE database_name=current_database() AND function_type IN ('macro','table_macro')")?
        .query_map([], |r| r.get::<_, String>(0))?.collect::<duckdb::Result<Vec<_>>>()?;
    fn uncertain(value: &Value, database: &str, macros: &[String]) -> bool {
        value["type"] == "TABLE_FUNCTION"
            || value["function_name"].as_str().is_some_and(|name| {
                matches!(name.to_ascii_lowercase().as_str(), "nextval" | "currval")
            })
            || value["catalog_name"]
                .as_str()
                .is_some_and(|name| !name.is_empty() && !name.eq_ignore_ascii_case(database))
            || value["function_name"]
                .as_str()
                .is_some_and(|name| macros.iter().any(|item| item.eq_ignore_ascii_case(name)))
            || match value {
                Value::Object(map) => map.values().any(|v| uncertain(v, database, macros)),
                Value::Array(items) => items.iter().any(|v| uncertain(v, database, macros)),
                _ => false,
            }
    }
    let mut items = Vec::new();
    for entry in entries {
        check_cancellation(cancellation)?;
        let mut item = Planned {
            entry,
            action: "copy_table",
            reason: None,
            sql: None,
            parents: vec![],
        };
        if matches!(request, ExportRequest::Files { .. }) {
            item.action = "write_file";
        } else if item.entry.kind == "view" {
            let context = query::ReferenceContext {
                database: &database,
                schema: &item.entry.relation.schema,
                search_path: &search_path,
                catalogue: Some(&relations),
            };
            let parsed = query::select_body(&item.entry.sql).and_then(|sql| {
                let mut tree = query::parse(conn, &sql)?;
                let uncertain = uncertain(&tree, &database, &macros);
                let parents = query::references_in(&mut tree, &context, None);
                let missing = parents
                    .iter()
                    .filter(|p| !selected.contains(&key(p)))
                    .map(Relation::sql)
                    .collect::<Vec<_>>();
                let portable = query::portable_select(conn, &sql, &context)?;
                Ok((uncertain, parents, missing, portable))
            });
            match parsed {
                Ok((uncertain, parents, missing, sql)) => {
                    item.parents = parents;
                    if !uncertain && missing.is_empty() {
                        item.action = "preserve_view";
                        item.sql = Some(sql);
                    } else {
                        item.action = "materialize_view";
                        item.reason = Some(if uncertain {
                            "External, dynamic or macro dependencies require a data snapshot".into()
                        } else {
                            format!("Dependencies not included: {}", missing.join(", "))
                        });
                    }
                }
                Err(_) => {
                    item.action = "materialize_view";
                    item.reason = Some("Dependencies cannot be safely inspected".into());
                }
            }
        }
        if matches!(request, ExportRequest::SelectedProject { .. }) && item.entry.kind == "table" {
            let required_macros=conn.prepare("SELECT DISTINCT f.function_name FROM duckdb_dependencies() d JOIN duckdb_functions() f ON f.function_oid=d.objid WHERE d.refobjid=? AND f.database_name=current_database() AND f.function_type IN ('macro','table_macro')")?
                .query_map([item.entry.oid],|r|r.get::<_,String>(0))?.collect::<duckdb::Result<Vec<_>>>()?;
            if !required_macros.is_empty() {
                blockers.push(Error::new("export_dependency",format!("{} depends on SQL macro definitions ({}). Use Complete project to preserve those definitions and their parameter defaults.",item.entry.relation.sql(),required_macros.join(", "))));
            }
            let parents = conn.prepare("SELECT DISTINCT referenced_table FROM duckdb_constraints() WHERE database_name=current_database() AND schema_name=? AND table_name=? AND constraint_type='FOREIGN KEY'")?
                .query_map(params![item.entry.relation.schema,item.entry.relation.name], |r| r.get::<_,String>(0))?.collect::<duckdb::Result<Vec<_>>>()?;
            for name in parents {
                let parent = Relation {
                    schema: item.entry.relation.schema.clone(),
                    name,
                };
                if !selected.contains(&key(&parent)) {
                    blockers.push(Error::new("export_dependency", format!("{} requires {} through a foreign key. Include that Table in the selection.",item.entry.relation.sql(),parent.sql())));
                }
                item.parents.push(parent);
            }
        }
        items.push(item);
    }
    Ok(Plan {
        database,
        items,
        blockers,
    })
}
impl Database {
    pub(super) fn inspect_export(&self, request: &ExportRequest) -> Result<ExportInspection> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let plan = plan(&self.conn, request, &self.cancellation)?;
        let hidden = self
            .conn
            .prepare("SELECT lower(table_name) FROM wordflow.nodes WHERE NOT visible")?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<duckdb::Result<HashSet<_>>>()?;
        let mut summary = ExportSummary::default();
        if matches!(request, ExportRequest::CompleteProject) {
            summary.analyses =
                self.conn
                    .query_row("SELECT count(*) FROM wordflow.analyses", [], |row| {
                        row.get(0)
                    })?;
            summary.sql_cells =
                self.conn
                    .query_row("SELECT count(*) FROM wordflow.sql_cells", [], |row| {
                        row.get(0)
                    })?;
        }
        let objects = plan
            .items
            .into_iter()
            .map(|item| {
                let classification = if item.entry.relation.schema.eq_ignore_ascii_case("wordflow")
                {
                    "internal"
                } else if item.entry.relation.schema.eq_ignore_ascii_case("data")
                    && hidden.contains(&item.entry.relation.name.to_ascii_lowercase())
                {
                    summary.hidden_data_blocks += 1;
                    "hidden_data_block"
                } else {
                    summary.data_blocks += 1;
                    "data_block"
                };
                ExportObject {
                    classification,
                    source: ObjectTarget {
                        schema: Some(item.entry.relation.schema),
                        name: item.entry.relation.name,
                    },
                    action: item.action,
                    reason: item.reason,
                }
            })
            .collect();
        self.conn.execute_batch("COMMIT")?;
        Ok(ExportInspection {
            summary,
            objects,
            blockers: plan.blockers,
        })
    }
    pub(super) fn write_export(
        &self,
        request: &ExportRequest,
        mut file: tempfile::NamedTempFile,
        progress: Option<&crate::TaskContext>,
    ) -> Result<tempfile::NamedTempFile> {
        if let ExportRequest::Files { format, .. } = request {
            self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
            let plan = plan(&self.conn, request, &self.cancellation)?;
            if let Some(error) = plan.blockers.into_iter().next() {
                return Err(error);
            }
            if plan.items.len() == 1 {
                file = write_data(
                    &self.conn,
                    &plan.items[0].entry.relation,
                    *format,
                    file,
                    &self.cancellation,
                )?;
            } else {
                let names = archive_names(
                    plan.items.iter().map(|i| i.entry.relation.name.as_str()),
                    format.extension(),
                );
                let mut zip = zip::ZipWriter::new(file.as_file_mut());
                for (i, (item, name)) in plan.items.iter().zip(names).enumerate() {
                    if let Some(progress) = progress {
                        progress.progress(
                            format!(
                                "Exporting {} ({}/{})",
                                item.entry.relation.sql(),
                                i + 1,
                                plan.items.len()
                            ),
                            Some(i as f64 / plan.items.len() as f64),
                        );
                    }
                    let mut part = write_data(
                        &self.conn,
                        &item.entry.relation,
                        *format,
                        tempfile::NamedTempFile::new()?,
                        &self.cancellation,
                    )?;
                    zip.start_file(
                        name,
                        zip::write::SimpleFileOptions::default()
                            .compression_method(zip::CompressionMethod::Deflated)
                            .large_file(true),
                    )
                    .map_err(zip_error)?;
                    let mut buffer = [0; 64 * 1024];
                    loop {
                        check_cancellation(&self.cancellation)?;
                        let n = part.read(&mut buffer)?;
                        if n == 0 {
                            break;
                        }
                        zip.write_all(&buffer[..n])?;
                    }
                }
                zip.finish().map_err(zip_error)?;
            }
            check_cancellation(&self.cancellation)?;
            self.conn.execute_batch("COMMIT")?;
            Ok(file)
        } else {
            self.write_project_export(request, file, progress)
        }
    }
    fn write_project_export(
        &self,
        request: &ExportRequest,
        file: tempfile::NamedTempFile,
        progress: Option<&crate::TaskContext>,
    ) -> Result<tempfile::NamedTempFile> {
        let (handle, path) = file.into_parts();
        drop(handle);
        std::fs::remove_file(&path)?;
        let destination = format!("export_{}", Uuid::new_v4().simple());
        self.conn.execute_batch(&format!(
            "ATTACH {} AS {}",
            query::literal(&path.to_string_lossy()),
            query::quote(&destination)
        ))?;
        let original: String = self
            .conn
            .query_row("SELECT current_database()", [], |r| r.get(0))?;
        let original_schema: String = self
            .conn
            .query_row("SELECT current_schema()", [], |r| r.get(0))?;
        let attached = Attached {
            conn: &self.conn,
            name: &destination,
            original: &original,
            schema: &original_schema,
        };
        self.conn.execute_batch(&format!(
            "BEGIN TRANSACTION; CREATE SCHEMA {}.__export_guard",
            query::quote(&destination)
        ))?;
        // DuckDB permits writes to only one database per transaction. Claiming the destination
        // first forbids source writes, including nextval in a source View, while allowing the
        // native catalogue/data copy and maintaining one source snapshot during concurrent edits.
        let plan = plan(&self.conn, request, &self.cancellation)?;
        if let Some(error) = plan.blockers.first() {
            return Err(error.clone());
        }
        if matches!(request, ExportRequest::CompleteProject) {
            if let Some(progress) = progress {
                progress.progress("Copying committed project data", None);
            }
            self.conn.execute_batch(&format!(
                "COPY FROM DATABASE {} TO {} (SCHEMA)",
                query::quote(&plan.database),
                query::quote(&destination)
            ))?;
        } else {
            self.conn
                .execute_batch(&format!("USE {}", query::quote(&destination)))?;
            self.conn.execute_batch(include_str!("../schema.sql"))?;
            self.conn.execute(
                "INSERT INTO wordflow.project(schema_version,description) VALUES (1,?)",
                ["Exported selection"],
            )?;
            copy_selected_tables(
                &self.conn,
                &plan,
                &destination,
                &self.cancellation,
                progress,
            )?;
            copy_selected_metadata(&self.conn, &plan, &destination)?;
        }
        self.conn
            .execute_batch(&format!("USE {}", query::quote(&destination)))?;
        if matches!(request, ExportRequest::CompleteProject) {
            // Native catalogue copying retains literal catalogue names inside defaults.
            // Rebase only syntactic references, without changing ordinary default strings.
            let defaults=self.conn.prepare("SELECT schema_name,table_name,column_name,column_default FROM duckdb_columns() WHERE database_name=? AND column_default IS NOT NULL")?
                .query_map([&plan.database],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?)))?.collect::<duckdb::Result<Vec<_>>>()?;
            for (schema, name, column, expression) in defaults {
                let rebased = query::portable_ddl(&expression, &plan.database)?;
                if rebased != expression {
                    let relation = Relation { schema, name };
                    self.conn.execute_batch(&format!(
                        "ALTER TABLE {} ALTER COLUMN {} SET DEFAULT {rebased}",
                        qualified(&destination, &relation),
                        query::quote(&column)
                    ))?;
                }
            }
            // Bind inserts only after defaults point at the destination's own sequences.
            // Even an explicitly supplied column can cause DuckDB to bind its default.
            self.conn.execute_batch(&format!(
                "COPY FROM DATABASE {} TO {} (DATA)",
                query::quote(&plan.database),
                query::quote(&destination)
            ))?;
        }
        // Materialized boundary Views read the captured source; preserved descendants will bind
        // to these Tables in the destination. No source relation is dropped or renamed.
        for item in &plan.items {
            check_cancellation(&self.cancellation)?;
            if item.action == "materialize_view" {
                if let Some(progress) = progress {
                    progress.progress(format!("Materializing {}", item.entry.relation.sql()), None);
                }
                self.conn.execute_batch(&format!(
                    "CREATE SCHEMA IF NOT EXISTS {}",
                    query::quote(&item.entry.relation.schema)
                ))?;
                let target = qualified(&destination, &item.entry.relation);
                if matches!(request, ExportRequest::CompleteProject) {
                    self.conn.execute_batch(&format!("DROP VIEW {target}"))?;
                }
                self.conn
                    .execute_batch(&format!(
                        "CREATE TABLE {target} AS SELECT * FROM {}",
                        qualified(&plan.database, &item.entry.relation)
                    ))
                    .map_err(|e| contextual(e.into(), &item.entry.relation))?;
                for parent in &item.parents {
                    if parent.schema == "data"
                        && item.entry.relation.schema == "data"
                        && parent != &item.entry.relation
                    {
                        self.conn.execute("INSERT INTO wordflow.edges(source_name,target_name) SELECT s.table_name,t.table_name FROM wordflow.nodes s,wordflow.nodes t WHERE s.table_name=? AND t.table_name=? ON CONFLICT DO NOTHING",params![parent.name,item.entry.relation.name])?;
                    }
                }
            }
        }
        let mut pending: Vec<_> = plan
            .items
            .iter()
            .filter(|i| i.action == "preserve_view")
            .collect();
        let mut ready: HashSet<_> = plan
            .items
            .iter()
            .filter(|i| i.action != "preserve_view")
            .map(|i| key(&i.entry.relation))
            .collect();
        while !pending.is_empty() {
            let before = pending.len();
            let mut remaining = Vec::new();
            for item in pending {
                if !item.parents.iter().all(|p| ready.contains(&key(p))) {
                    remaining.push(item);
                    continue;
                }
                check_cancellation(&self.cancellation)?;
                self.conn
                    .execute_batch(&format!(
                        "CREATE SCHEMA IF NOT EXISTS {}; CREATE OR REPLACE VIEW {} AS {}",
                        query::quote(&item.entry.relation.schema),
                        qualified(&destination, &item.entry.relation),
                        item.sql
                            .as_deref()
                            .ok_or_else(|| Error::invalid("Missing portable View definition"))?
                    ))
                    .map_err(|e| contextual(e.into(), &item.entry.relation))?;
                ready.insert(key(&item.entry.relation));
            }
            if remaining.len() == before {
                return Err(Error::new(
                    "export_dependency",
                    "View dependencies contain an unresolved cycle",
                ));
            }
            pending = remaining;
        }
        self.conn.execute_batch(&format!(
            "DROP SCHEMA {}.__export_guard",
            query::quote(&destination)
        ))?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        self.conn
            .execute_batch(&format!("CHECKPOINT {}", query::quote(&destination)))?;
        drop(attached);
        let handle = std::fs::File::open(&path)?;
        Ok(tempfile::NamedTempFile::from_parts(handle, path))
    }
}
/// Cleanup must precede deletion of the staged database, including cancellation and unwinding.
struct Attached<'a> {
    conn: &'a Connection,
    name: &'a str,
    original: &'a str,
    schema: &'a str,
}
impl Drop for Attached<'_> {
    fn drop(&mut self) {
        let _ = self.conn.execute_batch("ROLLBACK");
        let _ = self.conn.execute_batch(&format!(
            "USE {}.{}; DETACH {}",
            query::quote(self.original),
            query::quote(self.schema),
            query::quote(self.name)
        ));
    }
}
fn zip_error(error: zip::result::ZipError) -> Error {
    Error::new("export_error", error.to_string())
}

fn write_data(
    conn: &Connection,
    relation: &Relation,
    format: ExportFormat,
    mut file: tempfile::NamedTempFile,
    cancellation: &CancellationToken,
) -> Result<tempfile::NamedTempFile> {
    (|| -> Result<_> {
        check_cancellation(cancellation)?;
        if matches!(format, ExportFormat::Ipc) {
            let metadata = arrow_metadata::Annotations::load(conn, relation)?;
            let mut statement = conn.prepare(&format!("SELECT * FROM {}", relation.sql()))?;
            let source_schema = statement.stream_arrow([])?.get_schema();
            let schema = Arc::new(metadata.enrich(&source_schema, source_schema.fields().len())?);
            let mut writer =
                FileWriter::try_new(file.as_file_mut(), &schema).map_err(arrow_error)?;
            while let Some(array) = statement.step()? {
                check_cancellation(cancellation)?;
                let batch = arrow_metadata::enrich_batch(
                    duckdb::arrow::record_batch::RecordBatch::from(&array),
                    schema.clone(),
                )?;
                writer.write(&batch).map_err(arrow_error)?;
            }
            writer.finish().map_err(arrow_error)?;
            drop(writer);
            use std::io::{Seek, SeekFrom};
            file.seek(SeekFrom::Start(0))?;
            Ok(file)
        } else {
            let options = match format {
                ExportFormat::Csv => "FORMAT CSV, HEADER true",
                ExportFormat::Json => "FORMAT JSON, ARRAY true",
                ExportFormat::Ndjson => "FORMAT JSON, ARRAY false",
                ExportFormat::Parquet => "FORMAT PARQUET",
                ExportFormat::Ipc => unreachable!(),
            };
            conn.execute(
                &format!("COPY (SELECT * FROM {}) TO ? ({options})", relation.sql()),
                [file.path().to_string_lossy().as_ref()],
            )?;
            check_cancellation(cancellation)?;
            let (_, path) = file.into_parts();
            Ok(tempfile::NamedTempFile::from_parts(
                std::fs::File::open(&path)?,
                path,
            ))
        }
    })()
    .map_err(|e| contextual(e, relation))
}

/// File names have no relationship to SQL identifiers or filesystem paths.
pub fn safe_filename(value: &str) -> String {
    let value: String = value
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let value = value.trim().trim_end_matches(['.', ' ']);
    let stem = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    format!(
        "{}{}",
        if reserved { "_" } else { "" },
        if value.is_empty() || value == ".." {
            "export"
        } else {
            value
        }
    )
}
fn archive_names<'a>(names: impl Iterator<Item = &'a str>, extension: &str) -> Vec<String> {
    let mut used = HashSet::new();
    names
        .map(|name| {
            let stem = safe_filename(name);
            let mut candidate = format!("{stem}.{extension}");
            let mut i = 2;
            while !used.insert(candidate.to_lowercase()) {
                candidate = format!("{stem}_{i}.{extension}");
                i += 1;
            }
            candidate
        })
        .collect()
}

fn copy_selected_tables(
    conn: &Connection,
    plan: &Plan,
    destination: &str,
    cancellation: &CancellationToken,
    progress: Option<&crate::TaskContext>,
) -> Result<()> {
    let selected_oids: HashSet<_> = plan.items.iter().map(|item| item.entry.oid).collect();
    conn.execute_batch(&format!("USE {}", query::quote(&plan.database)))?;
    let sequence_dependencies = conn
        .prepare("SELECT objid,refobjid FROM duckdb_dependencies() WHERE deptype='n'")?
        .query_map([], |r| Ok((r.get::<_, u64>(0)?, r.get::<_, u64>(1)?)))?
        .collect::<duckdb::Result<Vec<_>>>()?;
    let sequences = conn.prepare("SELECT sequence_oid,schema_name,sql FROM duckdb_sequences() WHERE database_name=? AND NOT temporary")?
        .query_map([&plan.database],|r|Ok((r.get::<_,u64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?)))?.collect::<duckdb::Result<Vec<_>>>()?;
    let types=conn.prepare("SELECT type_oid,schema_name,type_name FROM duckdb_types() WHERE database_name=? AND NOT internal")?
        .query_map([&plan.database],|r|Ok((r.get::<_,u64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?)))?.collect::<duckdb::Result<Vec<_>>>()?;
    let mut required_types = Vec::new();
    for (oid, schema, name) in types {
        if sequence_dependencies
            .iter()
            .any(|(dependency, owner)| *dependency == oid && selected_oids.contains(owner))
        {
            let definition: String = conn.query_row(
                &format!(
                    "SELECT typeof(CAST(NULL AS {}.{}))",
                    query::quote(&schema),
                    query::quote(&name)
                ),
                [],
                |r| r.get(0),
            )?;
            required_types.push((schema, name, definition));
        }
    }
    conn.execute_batch(&format!("USE {}", query::quote(destination)))?;
    for (schema, name, definition) in required_types {
        conn.execute_batch(&format!(
            "CREATE SCHEMA IF NOT EXISTS {}; CREATE TYPE {}.{} AS {definition}",
            query::quote(&schema),
            query::quote(&schema),
            query::quote(&name)
        ))?;
    }
    for (oid, schema, sql) in sequences {
        if sequence_dependencies
            .iter()
            .any(|(dependency, owner)| *dependency == oid && selected_oids.contains(owner))
        {
            conn.execute_batch(&format!(
                "CREATE SCHEMA IF NOT EXISTS {}; SET schema={}; {sql}",
                query::quote(&schema),
                query::literal(&schema)
            ))?;
        }
    }
    let mut pending: Vec<_> = plan
        .items
        .iter()
        .filter(|item| item.entry.kind == "table")
        .collect();
    let mut ready = HashSet::new();
    while !pending.is_empty() {
        let before = pending.len();
        let mut remaining = Vec::new();
        for item in pending {
            if !item
                .parents
                .iter()
                .all(|p| key(p) == key(&item.entry.relation) || ready.contains(&key(p)))
            {
                remaining.push(item);
                continue;
            }
            check_cancellation(cancellation)?;
            if let Some(progress) = progress {
                progress.progress(format!("Copying {}", item.entry.relation.sql()), None);
            }
            let relation = &item.entry.relation;
            (|| -> Result<()> {
                conn.execute_batch(&format!("CREATE SCHEMA IF NOT EXISTS {}; SET schema={}",query::quote(&relation.schema),query::literal(&relation.schema)))?;
                // Catalogue DDL preserves constraints and defaults. DuckDB emits inline ENUM
                // definitions, avoiding a lossy table-as-SELECT reconstruction.
                conn.execute_batch(&query::portable_ddl(&item.entry.sql,&plan.database)?)?;
                let generated=query::generated_columns(&item.entry.sql)?;
                let columns=conn.prepare("SELECT column_name FROM duckdb_columns() WHERE database_name=? AND schema_name=? AND table_name=? ORDER BY column_index")?
                    .query_map(params![plan.database,relation.schema,relation.name],|r|r.get::<_,String>(0))?.collect::<duckdb::Result<Vec<_>>>()?;
                let columns=columns.iter().filter(|c|!generated.contains(*c)).map(|c|query::quote(c)).collect::<Vec<_>>().join(",");
                conn.execute_batch(&format!("INSERT INTO {} ({columns}) SELECT {columns} FROM {}",qualified(destination,relation),qualified(&plan.database,relation)))?;
                let indexes=conn.prepare("SELECT sql FROM duckdb_indexes() WHERE database_name=? AND schema_name=? AND table_name=? AND sql IS NOT NULL")?
                    .query_map(params![plan.database,relation.schema,relation.name],|r|r.get::<_,String>(0))?.collect::<duckdb::Result<Vec<_>>>()?;
                for sql in indexes {conn.execute_batch(&query::portable_ddl(&sql,&plan.database)?)?;}
                Ok(())
            })().map_err(|error|contextual(error,relation))?;
            ready.insert(key(relation));
        }
        if remaining.len() == before {
            return Err(Error::new(
                "export_dependency",
                "Table constraints contain an unresolved dependency cycle",
            ));
        }
        pending = remaining;
    }
    conn.execute_batch("SET schema='data'")?;
    Ok(())
}
fn copy_selected_metadata(conn: &Connection, plan: &Plan, destination: &str) -> Result<()> {
    let source = query::quote(&plan.database);
    let target = query::quote(destination);
    for item in &plan.items {
        let relation = &item.entry.relation;
        conn.execute(&format!("INSERT INTO {target}.wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) SELECT schema_name,relation_name,field_path,extension_name,extension_metadata FROM {source}.wordflow.arrow_metadata WHERE schema_name=? AND relation_name=?"),params![relation.schema,relation.name])?;
        if relation.schema == "data" {
            conn.execute(&format!("INSERT INTO {target}.wordflow.nodes(table_name,visible,color,document_column) SELECT table_name,visible,color,document_column FROM {source}.wordflow.nodes WHERE table_name=?"),[&relation.name])?;
            conn.execute(&format!("INSERT INTO {target}.wordflow.tokenizer_models(table_name,column_name,tokenizer_model) SELECT table_name,column_name,tokenizer_model FROM {source}.wordflow.tokenizer_models WHERE table_name=?"),[&relation.name])?;
        }
    }
    conn.execute_batch(&format!("INSERT INTO {target}.wordflow.edges(source_name,target_name) SELECT e.source_name,e.target_name FROM {source}.wordflow.edges e JOIN {target}.wordflow.nodes s ON s.table_name=e.source_name JOIN {target}.wordflow.nodes t ON t.table_name=e.target_name"))?;
    Ok(())
}

fn export_class_schema() -> utoipa::openapi::schema::Object {
    crate::openapi::string_enum(&["data_block", "hidden_data_block", "internal"])
}
fn export_action_schema() -> utoipa::openapi::schema::Object {
    crate::openapi::string_enum(&[
        "copy_table",
        "write_file",
        "preserve_view",
        "materialize_view",
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Project {
        let project = Project::untitled().unwrap();
        project.database.conn.execute_batch("CREATE TABLE data.posts(id BIGINT PRIMARY KEY, text VARCHAR, n DECIMAL(20,3)); INSERT INTO data.posts VALUES (9007199254740993,'你好 👋',1.125),(2,NULL,NULL); CREATE VIEW data.filtered AS SELECT * FROM data.posts WHERE id>2; INSERT INTO wordflow.nodes(table_name,color,document_column) VALUES ('posts','#123456','text'),('filtered',NULL,'text'); INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','posts','[\"text\"]','example.text','opaque payload');").unwrap();
        project
    }
    fn selected(names: &[&str]) -> ExportRequest {
        ExportRequest::SelectedProject {
            objects: names.iter().map(|n| ObjectTarget::from(*n)).collect(),
        }
    }
    fn output(project: &Project, request: ExportRequest) -> tempfile::NamedTempFile {
        project
            .database
            .write_export(&request, tempfile::NamedTempFile::new().unwrap(), None)
            .unwrap()
    }
    #[test]
    fn selection_keeps_constraints_metadata_and_self_contained_views() {
        let project = fixture();
        let file = output(&project, selected(&["filtered", "posts"]));
        let copy = Project::open(file.path()).unwrap();
        let conn = &copy.database.conn;
        assert_eq!(
            conn.query_row("SELECT count(*) FROM data.filtered", [], |r| r
                .get::<_, u64>(0))
                .unwrap(),
            1
        );
        assert!(
            conn.execute_batch("INSERT INTO data.posts(id) VALUES(2)")
                .is_err()
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM wordflow.arrow_metadata", [], |r| r
                .get::<_, u64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM wordflow.tabs", [], |r| r
                .get::<_, u64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row(
                "SELECT table_type FROM information_schema.tables WHERE table_name='filtered'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "VIEW"
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row(
                    "SELECT count(*) FROM duckdb_databases() WHERE database_name LIKE 'export_%'",
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            0
        );
    }
    #[test]
    fn missing_view_parents_materialize_without_exporting_other_rows() {
        let project = fixture();
        let file = output(&project, selected(&["filtered"]));
        let copy = Project::open(file.path()).unwrap();
        assert_eq!(
            copy.database
                .conn
                .query_row("SELECT count(*) FROM data.filtered", [], |r| r
                    .get::<_, u64>(0))
                .unwrap(),
            1
        );
        assert!(
            copy.database
                .conn
                .prepare("SELECT * FROM data.posts")
                .is_err()
        );
        assert_eq!(
            copy.database
                .conn
                .query_row(
                    "SELECT count(*) FROM duckdb_tables() WHERE schema_name='data'",
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            1
        );
        assert!(
            project
                .database
                .conn
                .query_row(
                    "SELECT sql FROM duckdb_views() WHERE view_name='filtered'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .is_ok()
        );
    }
    #[test]
    fn constraints_generated_columns_sequences_and_indexes_survive() {
        let project = fixture();
        project.database.conn.execute_batch("CREATE SEQUENCE data.ids START 10; CREATE TABLE data.parent(id INTEGER DEFAULT nextval('data.ids') PRIMARY KEY, doubled INTEGER GENERATED ALWAYS AS (id*2)); INSERT INTO data.parent DEFAULT VALUES; CREATE TABLE data.child(id INTEGER REFERENCES data.parent(id)); INSERT INTO data.child VALUES(10); CREATE INDEX child_index ON data.child(id); INSERT INTO wordflow.nodes(table_name) VALUES ('parent'),('child')").unwrap();
        let inspection = project
            .database
            .inspect_export(&selected(&["child"]))
            .unwrap();
        assert_eq!(inspection.blockers.len(), 1);
        let file = output(&project, selected(&["child", "parent"]));
        let copy = Project::open(file.path()).unwrap();
        copy.database
            .conn
            .execute_batch("SET schema='data'; INSERT INTO parent DEFAULT VALUES")
            .unwrap();
        assert_eq!(
            copy.database
                .conn
                .query_row("SELECT max(doubled) FROM parent", [], |r| r
                    .get::<_, i32>(0))
                .unwrap(),
            22
        );
        assert!(
            copy.database
                .conn
                .execute_batch("INSERT INTO child VALUES(42)")
                .is_err()
        );
        assert_eq!(
            copy.database
                .conn
                .query_row(
                    "SELECT count(*) FROM duckdb_indexes() WHERE index_name='child_index'",
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            1
        );
    }
    #[test]
    fn complete_project_rebases_qualified_views_and_retains_opaque_analysis() {
        let project = fixture();
        let database: String = project
            .database
            .conn
            .query_row("SELECT current_database()", [], |r| r.get(0))
            .unwrap();
        project.database.conn.execute_batch(&format!("CREATE VIEW data.qualified AS SELECT {db}.data.posts.id FROM {db}.data.posts; INSERT INTO wordflow.nodes(table_name) VALUES ('qualified'); INSERT INTO wordflow.tabs(id,kind,name,position) VALUES ('00000000-0000-0000-0000-000000000001','future','Future',0); INSERT INTO wordflow.analyses(id,tab_id,request,result,result_version,finished_at) VALUES ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','{{\"future\":true}}','{{\"unknown\":true}}',999,current_timestamp)",db=query::quote(&database))).unwrap();
        let file = output(&project, ExportRequest::CompleteProject);
        drop(project);
        let copy = Project::open(file.path()).unwrap();
        assert_eq!(
            copy.database
                .conn
                .query_row("SELECT count(*) FROM data.qualified", [], |r| r
                    .get::<_, u64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            copy.database
                .conn
                .query_row("SELECT result_version FROM wordflow.analyses", [], |r| r
                    .get::<_, i32>(0))
                .unwrap(),
            999
        );
    }
    #[test]
    fn external_views_become_offline_tables_and_do_not_mutate_source() {
        let project = fixture();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("external.csv");
        std::fs::write(&path, "text\nhello\nworld\n").unwrap();
        project.database.conn.execute_batch(&format!("CREATE VIEW data.external AS SELECT * FROM read_csv({}); INSERT INTO wordflow.nodes(table_name) VALUES ('external')",query::literal(&path.to_string_lossy()))).unwrap();
        let file = output(&project, ExportRequest::CompleteProject);
        std::fs::remove_file(path).unwrap();
        let copy = Project::open(file.path()).unwrap();
        assert_eq!(
            copy.database
                .conn
                .query_row("SELECT count(*) FROM data.external", [], |r| r
                    .get::<_, u64>(0))
                .unwrap(),
            2
        );
        assert!(
            project
                .database
                .conn
                .prepare("SELECT * FROM data.external")
                .is_err()
        );
    }
    #[test]
    fn required_types_are_copied_and_macro_defaults_require_complete_scope() {
        let project = fixture();
        project.database.conn.execute_batch("CREATE TYPE data.mood AS ENUM ('yes','no'); CREATE TABLE data.typed(value mood DEFAULT CAST('yes' AS mood)); INSERT INTO wordflow.nodes(table_name) VALUES ('typed'); CREATE MACRO data.custom_default(x,y:=4) AS x+y; CREATE TABLE data.macros(value BIGINT DEFAULT custom_default(3)); INSERT INTO wordflow.nodes(table_name) VALUES ('macros')").unwrap();
        let selected_copy = output(&project, selected(&["typed"]));
        let copy = Project::open(selected_copy.path()).unwrap();
        copy.database
            .conn
            .execute_batch("INSERT INTO data.typed DEFAULT VALUES")
            .unwrap();
        assert_eq!(
            copy.database
                .conn
                .query_row("SELECT value::VARCHAR FROM data.typed", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "yes"
        );
        let inspected = project
            .database
            .inspect_export(&selected(&["macros"]))
            .unwrap();
        assert!(inspected.blockers[0].message.contains("Complete project"));
        let full = output(&project, ExportRequest::CompleteProject);
        drop(project);
        let copy = Project::open(full.path()).unwrap();
        copy.database
            .conn
            .execute_batch("INSERT INTO data.macros DEFAULT VALUES")
            .unwrap();
        assert_eq!(
            copy.database
                .conn
                .query_row("SELECT value FROM data.macros", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            7
        );
    }
    #[test]
    fn qualified_sequence_defaults_rebase_without_touching_literal_data() {
        let project = fixture();
        let database: String = project
            .database
            .conn
            .query_row("SELECT current_database()", [], |r| r.get(0))
            .unwrap();
        project.database.conn.execute_batch(&format!("CREATE SEQUENCE data.ids START 42; CREATE TABLE data.qualified_default(id BIGINT DEFAULT nextval({}), label VARCHAR DEFAULT {}); INSERT INTO wordflow.nodes(table_name) VALUES ('qualified_default')",query::literal(&format!("{database}.data.ids")),query::literal(&format!("{database}.data.ids")))).unwrap();
        let files = [
            output(&project, selected(&["qualified_default"])),
            output(&project, ExportRequest::CompleteProject),
        ];
        drop(project);
        for file in files {
            let copy = Project::open(file.path()).unwrap();
            copy.database
                .conn
                .execute_batch("INSERT INTO data.qualified_default DEFAULT VALUES")
                .unwrap();
            assert_eq!(
                copy.database
                    .conn
                    .query_row("SELECT id FROM data.qualified_default", [], |r| r
                        .get::<_, i64>(0))
                    .unwrap(),
                42
            );
            assert_eq!(
                copy.database
                    .conn
                    .query_row("SELECT label FROM data.qualified_default", [], |r| r
                        .get::<_, String>(0))
                    .unwrap(),
                format!("{database}.data.ids")
            );
        }
    }
    #[test]
    fn failed_materialization_does_not_modify_source_and_releases_attachment() {
        let project = fixture();
        project.database.conn.execute_batch("CREATE SEQUENCE data.side_effect START 5; CREATE VIEW data.side_effect_view AS SELECT nextval('data.side_effect') AS id; INSERT INTO wordflow.nodes(table_name) VALUES ('side_effect_view')").unwrap();
        let error = project
            .database
            .write_export(
                &selected(&["side_effect_view"]),
                tempfile::NamedTempFile::new().unwrap(),
                None,
            )
            .unwrap_err();
        assert!(error.message.contains("side_effect_view"), "{error}");
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT nextval('data.side_effect')", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            5
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row(
                    "SELECT count(*) FROM duckdb_databases() WHERE database_name LIKE 'export_%'",
                    [],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
        let file = output(&project, selected(&["posts"]));
        assert!(Project::open(file.path()).is_ok());
    }
    #[test]
    fn export_reads_committed_data_while_another_connection_has_pending_changes() {
        let project = fixture();
        let writer = project.database.conn.try_clone().unwrap();
        writer
            .execute_batch("BEGIN; UPDATE data.posts SET text='pending'")
            .unwrap();
        for request in [selected(&["posts"]), ExportRequest::CompleteProject] {
            let file = output(&project, request);
            let copy = Project::open(file.path()).unwrap();
            assert_eq!(
                copy.database
                    .conn
                    .query_row("SELECT text FROM data.posts WHERE id>2", [], |r| r
                        .get::<_, String>(0))
                    .unwrap(),
                "你好 👋"
            );
        }
        writer.execute_batch("ROLLBACK").unwrap();
    }
    #[test]
    #[ignore = "explicit large-file export benchmark"]
    fn benchmark_exports() {
        let project = Project::untitled().unwrap();
        project.database.conn.execute_batch("CREATE TABLE data.corpus AS SELECT i::BIGINT AS id,repeat('research text ',12)||i::VARCHAR AS text, i%31 AS group_id FROM range(1000000) t(i); INSERT INTO wordflow.nodes(table_name) VALUES ('corpus'); CREATE VIEW data.subset AS SELECT * FROM data.corpus WHERE group_id<5; INSERT INTO wordflow.nodes(table_name) VALUES ('subset')").unwrap();
        for (label, request) in [
            (
                "Arrow million rows",
                ExportRequest::Files {
                    objects: vec!["corpus".into()],
                    format: ExportFormat::Ipc,
                },
            ),
            (
                "Parquet million rows",
                ExportRequest::Files {
                    objects: vec!["corpus".into()],
                    format: ExportFormat::Parquet,
                },
            ),
            (
                "CSV ZIP million plus subset",
                ExportRequest::Files {
                    objects: vec!["corpus".into(), "subset".into()],
                    format: ExportFormat::Csv,
                },
            ),
            ("Selected project", selected(&["corpus", "subset"])),
            ("Complete project", ExportRequest::CompleteProject),
        ] {
            let start = std::time::Instant::now();
            let file = output(&project, request);
            eprintln!(
                "{label}: {:.3}s; {} bytes",
                start.elapsed().as_secs_f64(),
                file.as_file().metadata().unwrap().len()
            );
        }
    }
    #[test]
    fn zip_names_are_unique_and_ipc_is_a_file_with_annotations() {
        let project = fixture();
        let file = output(
            &project,
            ExportRequest::Files {
                objects: vec!["posts".into(), "filtered".into()],
                format: ExportFormat::Ipc,
            },
        );
        let mut archive = zip::ZipArchive::new(file.reopen().unwrap()).unwrap();
        assert_eq!(archive.len(), 2);
        let mut bytes = Vec::new();
        archive
            .by_name("posts.arrow")
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        let reader =
            arrow_ipc::reader::FileReader::try_new(std::io::Cursor::new(bytes), None).unwrap();
        assert_eq!(
            reader.schema().field(1).metadata()["ARROW:extension:metadata"],
            "opaque payload"
        );
        assert_eq!(reader.map(|b| b.unwrap().num_rows()).sum::<usize>(), 2);
        assert_eq!(
            archive_names(
                ["a/b", "a_b", "a_b_2", "A_B", "CON", "../x"].into_iter(),
                "csv"
            ),
            [
                "a_b.csv",
                "a_b_2.csv",
                "a_b_2_2.csv",
                "A_B_3.csv",
                "_CON.csv",
                ".._x.csv"
            ]
        );
    }
}
