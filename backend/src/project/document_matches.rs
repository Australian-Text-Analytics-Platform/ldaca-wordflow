//! Typed document pages shared by Concordance and Quotation.
use super::*;

/// Native v1 files remain untouched until their first independently owned live publication.
fn publication_format(conn: &Connection) -> Result<()> {
    let version: i32 = conn.query_row("SELECT schema_version FROM wordflow.project", [], |r| {
        r.get(0)
    })?;
    if version == 2 {
        return Ok(());
    }
    if version != 1 {
        return Err(Error::invalid("Unsupported Wordflow project format"));
    }
    conn.execute_batch("CREATE TABLE wordflow.project_v2(singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),schema_version INTEGER NOT NULL CHECK(schema_version=2),description VARCHAR NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp); INSERT INTO wordflow.project_v2 SELECT singleton,2,description,created_at FROM wordflow.project; DROP TABLE wordflow.project; ALTER TABLE wordflow.project_v2 RENAME TO project; CREATE TABLE wordflow.publications(node_name VARCHAR PRIMARY KEY,relations JSON NOT NULL CHECK(json_type(relations)='ARRAY'),bindings JSON NOT NULL CHECK(json_type(bindings)='OBJECT'))")?;
    Ok(())
}

fn publication_relation() -> Relation {
    Relation {
        schema: "wordflow".into(),
        name: format!("published_{}", Uuid::new_v4().simple()),
    }
}

pub(super) fn copy_publication_relation(conn: &Connection, source: &Relation) -> Result<Relation> {
    let target = publication_relation();
    conn.execute_batch(&format!(
        "CREATE TABLE {} AS SELECT * FROM {}",
        target.sql(),
        source.sql()
    ))?;
    arrow_metadata::Annotations::load(conn, source)?.store(conn, &target)?;
    Ok(target)
}

pub(super) fn copy_publication_query(
    conn: &Connection,
    sql: &str,
    parameters: &[SqlValue],
) -> Result<Relation> {
    let target = publication_relation();
    conn.execute(
        &format!("CREATE TABLE {} AS {sql}", target.sql()),
        params_from_iter(parameters.iter()),
    )?;
    Ok(target)
}

/// Source field bindings keep live Arrow annotations separate from fixed generated outputs.
#[derive(Serialize, Deserialize)]
pub(super) struct PublicationSource {
    input: DocumentInput,
    fields: Vec<(String, String)>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct PublicationOwnership {
    pub source: DocumentInput,
    pub columns: Vec<(String, String)>,
    pub relation_count: usize,
}

pub(super) fn publication_ownership(
    conn: &Connection,
) -> Result<std::collections::HashMap<String, PublicationOwnership>> {
    if !publication_registry_exists(conn)? {
        return Ok(Default::default());
    }
    let entries=conn.prepare("SELECT node_name,bindings::VARCHAR,json_array_length(relations)::UBIGINT FROM wordflow.publications")?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,u64>(2)?)))?.collect::<duckdb::Result<Vec<_>>>()?;
    entries
        .into_iter()
        .map(|(name, binding, count)| {
            let binding: PublicationSource = serde_json::from_str(&binding)?;
            Ok((
                name,
                PublicationOwnership {
                    source: binding.input,
                    columns: binding.fields,
                    relation_count: count as usize,
                },
            ))
        })
        .collect()
}
impl PublicationSource {
    pub fn columns(&self, all: &[(String, String)]) -> Vec<(String, String)> {
        all.iter()
            .filter(|(name, _)| self.fields.iter().any(|(field, _)| field == name))
            .cloned()
            .collect()
    }
    pub fn selected(conn: &Connection, input: &DocumentInput, fields: Vec<String>) -> Result<Self> {
        let relation = Relation {
            schema: input.source.schema.clone().unwrap_or_else(|| "data".into()),
            name: input.source.name.clone(),
        };
        let columns = mutations::columns(conn, &relation)?;
        let mut names = std::collections::HashSet::new();
        let fields = fields
            .iter()
            .map(|field| {
                columns
                    .iter()
                    .find(|(name, _)| name.eq_ignore_ascii_case(field))
                    .map(|(name, _)| name.clone())
                    .ok_or_else(|| Error::invalid("Unknown source metadata field"))
            })
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .filter(|name| names.insert(name.clone()))
            .map(|name| (name.clone(), name))
            .collect();
        Ok(Self {
            input: input.clone(),
            fields,
        })
    }
}
/// The private join keeps source lookup failures separate from ordinary Builder dependencies.
pub(super) fn publish_live_view(
    conn: &Connection,
    target: &Relation,
    mut owned: Vec<Relation>,
    source: PublicationSource,
    joined: &str,
    select: impl FnOnce(&Relation) -> String,
) -> Result<()> {
    publication_format(conn)?;
    let joined_view = publication_relation();
    conn.execute_batch(&format!("CREATE VIEW {} AS {joined}", joined_view.sql()))?;
    conn.execute_batch(&format!(
        "CREATE VIEW {} AS {}",
        target.sql(),
        select(&joined_view)
    ))?;
    owned.push(joined_view);
    conn.execute(
        "INSERT INTO wordflow.publications VALUES (?,?::JSON,?::JSON)",
        params![
            target.name,
            serde_json::to_string(&owned)?,
            serde_json::to_string(&source)?
        ],
    )?;
    Ok(())
}

pub(super) fn rename_publication_source(conn: &Connection, rename: &renames::Rename) -> Result<()> {
    if !publication_registry_exists(conn)? {
        return Ok(());
    }
    let entries = conn
        .prepare("SELECT node_name,bindings::VARCHAR FROM wordflow.publications")?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<duckdb::Result<Vec<_>>>()?;
    for (name, binding) in entries {
        let mut binding: PublicationSource = serde_json::from_str(&binding)?;
        let source = match rename {
            renames::Rename::Table { source, .. } | renames::Rename::Column { source, .. } => {
                source
            }
        };
        let bound = binding
            .input
            .source
            .schema
            .as_deref()
            .unwrap_or("data")
            .eq_ignore_ascii_case(&source.schema)
            && binding.input.source.name.eq_ignore_ascii_case(&source.name);
        match rename {
            renames::Rename::Table { name, .. } if bound => {
                binding.input.source.name = name.clone()
            }
            renames::Rename::Column { before, after, .. } => {
                if bound {
                    if binding.input.column.eq_ignore_ascii_case(before) {
                        binding.input.column = after.clone();
                    }
                    for (field, _) in &mut binding.fields {
                        if field.eq_ignore_ascii_case(before) {
                            *field = after.clone();
                        }
                    }
                }
                if source.schema.eq_ignore_ascii_case("data")
                    && source.name.eq_ignore_ascii_case(&name)
                {
                    for (_, output) in &mut binding.fields {
                        if output.eq_ignore_ascii_case(before) {
                            *output = after.clone();
                        }
                    }
                }
            }
            _ => {}
        }
        conn.execute(
            "UPDATE wordflow.publications SET bindings=?::JSON WHERE node_name=?",
            params![serde_json::to_string(&binding)?, name],
        )?;
    }
    Ok(())
}

pub(super) fn rename_publication(conn: &Connection, source: &Relation, name: &str) -> Result<()> {
    if source.schema == "data" && publication_registry_exists(conn)? {
        conn.execute(
            "UPDATE wordflow.publications SET node_name=? WHERE node_name=?",
            params![name, source.name],
        )?;
    }
    Ok(())
}

fn publication_registry_exists(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM duckdb_tables() WHERE database_name=current_database() AND schema_name='wordflow' AND table_name='publications')", [], |r| r.get(0))?)
}

/// Lookup edges invalidate live publications but never enlarge a deletion closure.
pub(super) fn publication_dependencies(conn: &Connection) -> Result<Vec<objects::DependencyEdge>> {
    if !publication_registry_exists(conn)? {
        return Ok(vec![]);
    }
    let database: String = conn.query_row("SELECT current_database()", [], |r| r.get(0))?;
    let catalogue = objects::catalogue_relations(conn)?;
    let search_path = conn
        .prepare("SELECT unnest(current_schemas(true))")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<duckdb::Result<Vec<_>>>()?;
    let entries = conn
        .prepare("SELECT node_name,relations::VARCHAR FROM wordflow.publications")?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<duckdb::Result<Vec<_>>>()?;
    let mut edges = Vec::new();
    for (name, owned) in entries {
        let owned: Vec<Relation> = serde_json::from_str(&owned)?;
        let joined = owned
            .last()
            .ok_or_else(|| Error::invalid("Published output ownership is incomplete"))?;
        let sql = query::view_query(conn, joined)?
            .ok_or_else(|| Error::invalid("Published output join is unavailable"))?;
        let mut tree = query::parse(conn, &sql)?;
        let context = query::ReferenceContext {
            database: &database,
            schema: &joined.schema,
            search_path: &search_path,
            catalogue: Some(&catalogue),
        };
        for source in query::references_in(&mut tree, &context, None)
            .into_iter()
            .filter(|r| !r.schema.eq_ignore_ascii_case("wordflow"))
        {
            edges.push(objects::DependencyEdge {
                source,
                target: Relation {
                    schema: "data".into(),
                    name: name.clone(),
                },
            });
        }
    }
    Ok(edges)
}

/// Rebind cached View types after valid source schema edits. Missing references stay errors.
pub(super) fn refresh_publications(
    conn: &Connection,
    affected: &[Relation],
    all: bool,
) -> Result<()> {
    if !publication_registry_exists(conn)? {
        return Ok(());
    }
    let entries = conn
        .prepare(
            "SELECT node_name,relations::VARCHAR,bindings::VARCHAR FROM wordflow.publications",
        )?
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?
        .collect::<duckdb::Result<Vec<_>>>()?;
    for (name, owned, binding) in entries {
        let target = Relation {
            schema: "data".into(),
            name,
        };
        if !all && !affected.contains(&target) {
            continue;
        }
        let owned: Vec<Relation> = serde_json::from_str(&owned)?;
        let joined = owned
            .last()
            .ok_or_else(|| Error::invalid("Published output ownership is incomplete"))?;
        let Some(join_sql) = query::view_query(conn, joined)? else {
            continue;
        };
        let Some(public_sql) = query::view_query(conn, &target)? else {
            continue;
        };
        if conn.prepare(&join_sql).is_err() {
            continue;
        }
        let before = mutations::columns(conn, &target)?;
        conn.execute_batch(&format!(
            "CREATE OR REPLACE VIEW {} AS {join_sql}",
            joined.sql()
        ))?;
        if conn.prepare(&public_sql).is_err() {
            continue;
        }
        conn.execute_batch(&format!(
            "CREATE OR REPLACE VIEW {} AS {public_sql}",
            target.sql()
        ))?;
        let after = mutations::columns(conn, &target)?;
        for (column, kind) in before {
            if !after
                .iter()
                .any(|(name, new_kind)| name == &column && new_kind == &kind)
            {
                arrow_metadata::rename_column(conn, &target, &column, None)?;
            }
        }
        let binding: PublicationSource = serde_json::from_str(&binding)?;
        let source = Relation {
            schema: binding.input.source.schema.unwrap_or_else(|| "data".into()),
            name: binding.input.source.name,
        };
        let source_columns = mutations::columns(conn, &source)?;
        let annotations = arrow_metadata::Annotations::load(conn, &source)?;
        for (field, output) in binding.fields {
            arrow_metadata::rename_column(conn, &target, &output, None)?;
            if !source_columns.iter().any(|(name, kind)| {
                name == &field
                    && after
                        .iter()
                        .any(|(column, output_kind)| column == &output && output_kind == kind)
            }) {
                continue;
            }
            let mut inherited = annotations.clone();
            inherited.0.retain(|a| a.path[0] == field);
            for annotation in &mut inherited.0 {
                annotation.path[0] = output.clone();
            }
            inherited.store(conn, &target)?;
        }
    }
    Ok(())
}

pub(super) fn delete_publication(conn: &Connection, target: &Relation) -> Result<()> {
    if target.schema != "data" || !publication_registry_exists(conn)? {
        return Ok(());
    }
    let owned: Option<String> = conn
        .query_row(
            "SELECT relations::VARCHAR FROM wordflow.publications WHERE node_name=?",
            [&target.name],
            |r| r.get(0),
        )
        .optional()?;
    let Some(owned) = owned else {
        return Ok(());
    };
    let relations: Vec<Relation> = serde_json::from_str(&owned)?;
    for relation in &relations {
        if relation.schema != "wordflow"
            || relation
                .name
                .strip_prefix("published_")
                .and_then(|id| Uuid::parse_str(id).ok())
                .is_none()
        {
            return Err(Error::new(
                "publication_corrupt",
                "Published output ownership is invalid",
            ));
        }
    }
    for relation in relations.iter().rev() {
        let view: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM duckdb_views() WHERE database_name=current_database() AND schema_name=? AND view_name=?)", params![relation.schema,relation.name], |r| r.get(0))?;
        conn.execute_batch(&format!(
            "DROP {} IF EXISTS {}",
            if view { "VIEW" } else { "TABLE" },
            relation.sql()
        ))?;
        arrow_metadata::delete_relation(conn, relation)?;
    }
    conn.execute(
        "DELETE FROM wordflow.publications WHERE node_name=?",
        [&target.name],
    )?;
    Ok(())
}

/// Original text keeps its name. Optional metadata cannot claim selected generated names.
pub(super) fn publication_fields(
    columns: &[(String, String)],
    text: &str,
    selected: &[String],
    generated: &[String],
) -> Result<(std::collections::HashSet<String>, Vec<String>)> {
    let mut names = std::collections::HashSet::new();
    let mut fields = Vec::new();
    for requested in std::iter::once(text).chain(selected.iter().map(String::as_str)) {
        let name = &columns
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(requested))
            .ok_or_else(|| Error::invalid("Unknown retained column"))?
            .0;
        if !name.eq_ignore_ascii_case(text)
            && generated
                .iter()
                .any(|field| field.eq_ignore_ascii_case(name))
        {
            return Err(Error::invalid(format!(
                "Metadata column conflicts with a generated field: {name}"
            )));
        }
        if names.insert(name.to_ascii_lowercase()) {
            fields.push(format!(
                "source.{} AS {}",
                query::quote(name),
                query::quote(name)
            ));
        }
    }
    Ok((names, fields))
}
pub(super) fn generated_name(names: &mut std::collections::HashSet<String>, stem: &str) -> String {
    let mut name = stem.to_owned();
    let mut suffix = 2;
    while !names.insert(name.to_ascii_lowercase()) {
        name = format!("{stem}_{suffix}");
        suffix += 1;
    }
    name
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct DocumentSort {
    pub column: String,
    #[serde(default)]
    pub descending: bool,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Projection {
    #[default]
    Matches,
    Documents,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct SavedSort {
    pub field: String,
    #[serde(default)]
    pub metadata: bool,
    #[serde(default)]
    pub descending: bool,
}

pub(super) fn page_offset(page: u64, size: u64) -> Result<u64> {
    if page == 0 || !(1..=1000).contains(&size) {
        return Err(Error::invalid(
            "Page must be positive and page size between 1 and 1000",
        ));
    }
    (page - 1)
        .checked_mul(size)
        .filter(|n| *n <= i64::MAX as u64)
        .ok_or_else(|| Error::invalid("Page offset is too large"))
}
pub(super) fn temporary_name() -> String {
    format!("documents_{}", Uuid::new_v4().simple())
}
pub(super) fn arrow_page(
    conn: &Connection,
    sql: &str,
    parameters: &[SqlValue],
    metadata: &arrow_metadata::Annotations,
    cancellation: &CancellationToken,
) -> Result<tempfile::NamedTempFile> {
    use duckdb::arrow::record_batch::RecordBatch;
    let mut statement = conn.prepare(sql)?;
    let raw_schema = statement
        .query_arrow(params_from_iter(parameters.iter()))?
        .get_schema();
    let schema = Arc::new(metadata.enrich(&raw_schema, raw_schema.fields().len())?);
    let mut file = temporary_file(conn)?;
    let mut writer = StreamWriter::try_new(file.as_file_mut(), &schema).map_err(arrow_error)?;
    while let Some(array) = statement.step()? {
        check_cancellation(cancellation)?;
        let batch = RecordBatch::from(&array);
        writer
            .write(&arrow_metadata::enrich_batch(batch, schema.clone())?)
            .map_err(arrow_error)?;
    }
    writer.finish().map_err(arrow_error)?;
    drop(writer);
    Ok(file)
}

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct DocumentInput {
    pub source: ObjectTarget,
    pub column: String,
}
pub(super) struct CapturedDocuments {
    pub name: String,
    pub input: DocumentInput,
    pub columns: Vec<(String, String)>,
    pub metadata: arrow_metadata::Annotations,
    pub count: u64,
    pub population: Option<String>,
}
pub(super) struct DocumentSelection<'a> {
    pub page: u64,
    pub size: u64,
    pub sort: Option<(&'a str, bool)>,
}
/// Capture original typed rows once. The STRUCT isolates all source names from generated fields.
pub(super) fn capture_documents(
    conn: &Connection,
    input: &DocumentInput,
    page: Option<DocumentSelection<'_>>,
) -> Result<CapturedDocuments> {
    let object = input.source.resolve(conn)?;
    let column = mutations::column_name(conn, &object.relation, &input.column)?;
    let columns = mutations::columns(conn, &object.relation)?;
    let metadata = arrow_metadata::Annotations::load(conn, &object.relation)?.prefixed("source");
    let name = temporary_name();
    let selection = if let Some(DocumentSelection { page, size, sort }) = page {
        let offset = page_offset(page, size)?;
        let order = sort
            .map(|(field, descending)| {
                Ok::<_, Error>(format!(
                    "ORDER BY {} {}",
                    query::quote(&mutations::column_name(conn, &object.relation, field)?),
                    if descending { "DESC" } else { "ASC" }
                ))
            })
            .transpose()?
            .unwrap_or_default();
        format!("{order} LIMIT {} OFFSET {offset}", size + 1)
    } else {
        String::new()
    };
    conn.execute_batch(&format!("CREATE TEMP TABLE {name} AS SELECT row_number() OVER ()::UBIGINT AS document_id,s AS source FROM (SELECT * FROM {} {selection}) s",object.relation.sql()))?;
    let count = conn.query_row(&format!("SELECT count(*) FROM {name}"), [], |row| {
        row.get(0)
    })?;
    Ok(CapturedDocuments {
        name,
        input: DocumentInput {
            source: ObjectTarget {
                schema: Some(object.relation.schema),
                name: object.relation.name,
            },
            column,
        },
        columns,
        metadata,
        count,
        population: None,
    })
}
pub(super) fn document_batch(
    conn: &Connection,
    table: &str,
    column: &str,
    after: u64,
    limit: u64,
) -> Result<Vec<(u64, Option<String>)>> {
    Ok(conn.prepare(&format!("SELECT document_id, CAST(source.{} AS VARCHAR) FROM {table} WHERE document_id > ? AND document_id <= ? ORDER BY document_id LIMIT 256", query::quote(column)))?.query_map(params![after,limit], |row| Ok((row.get(0)?,row.get(1)?)))?.collect::<duckdb::Result<Vec<_>>>()?)
}

/// Keep one exact text per input. Numeric document IDs link native outputs only.
pub(super) fn distinct_documents(conn: &Connection, docs: &mut CapturedDocuments) -> Result<()> {
    distinct_documents_in(conn, docs, false)
}
pub(super) fn distinct_documents_in(
    conn: &Connection,
    docs: &mut CapturedDocuments,
    keep_population: bool,
) -> Result<()> {
    let name = temporary_name();
    let column = query::quote(&docs.input.column);
    conn.execute_batch(&format!("CREATE TEMP TABLE {name} AS SELECT row_number() OVER ()::UBIGINT AS document_id,struct_pack({column}:=text) AS source FROM (SELECT first(CAST(source.{column} AS VARCHAR) ORDER BY document_id) AS text,min(document_id) AS first_row FROM {} WHERE source.{column} IS NOT NULL GROUP BY encode(CAST(source.{column} AS VARCHAR)) ORDER BY first_row)", docs.name))?;
    if keep_population {
        docs.population = Some(docs.name.clone());
    } else {
        conn.execute_batch(&format!("DROP TABLE {}", docs.name))?;
    }
    docs.name = name;
    docs.count = conn.query_row(&format!("SELECT count(*) FROM {}", docs.name), [], |row| {
        row.get(0)
    })?;
    Ok(())
}

pub(super) fn live_document_rows(
    input: &DocumentInput,
    processed: &str,
    processed_column: &str,
    columns: &[(String, String)],
) -> String {
    live_document_rows_in(input, processed, processed_column, columns, None)
}
pub(super) fn live_document_rows_in(
    input: &DocumentInput,
    processed: &str,
    processed_column: &str,
    columns: &[(String, String)],
    population: Option<&str>,
) -> String {
    let relation = Relation {
        schema: input.source.schema.clone().unwrap_or_else(|| "data".into()),
        name: input.source.name.clone(),
    };
    let fields = if columns.is_empty() {
        "*".into()
    } else {
        columns
            .iter()
            .map(|(name, _)| query::quote(name))
            .collect::<Vec<_>>()
            .join(",")
    };
    let rows = population.map_or_else(|| format!("SELECT row_number() OVER ()::UBIGINT AS document_id,s AS source FROM (SELECT {fields} FROM {}) s", relation.sql()), |table| format!("SELECT document_id,source FROM {table}"));
    format!(
        "SELECT s.document_id,d.document_id AS processed_id,s.source FROM ({rows}) s JOIN {processed} d ON encode(CAST(s.source.{} AS VARCHAR))=encode(d.source.{})",
        query::quote(&input.column),
        query::quote(processed_column)
    )
}

pub(crate) struct DocumentPage {
    pub file: tempfile::NamedTempFile,
    pub total_rows: u64,
    pub has_next: bool,
    pub document_count: u64,
    pub match_count: u64,
}

#[cfg(test)]
mod publication_tests {
    use super::*;

    #[test]
    fn processed_text_equality_is_exact_even_with_case_insensitive_source_collations() {
        let p = Project::untitled().unwrap();
        let conn = &p.database.conn;
        conn.execute_batch("SET default_collation='nocase'; CREATE TABLE data.texts(text VARCHAR COLLATE nocase); INSERT INTO data.texts VALUES ('A'),('a'),('A'),('é'),('é'),(''),(' '); INSERT INTO wordflow.nodes(table_name) VALUES ('texts')").unwrap();
        let input = DocumentInput {
            source: "texts".into(),
            column: "text".into(),
        };
        let mut documents = capture_documents(conn, &input, None).unwrap();
        distinct_documents(conn, &mut documents).unwrap();
        assert_eq!(documents.count, 6);
        let rows = live_document_rows(&input, &documents.name, "text", &documents.columns);
        let counts: (u64, u64) = conn
            .query_row(
                &format!("SELECT count(DISTINCT processed_id),count(*) FROM ({rows})"),
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(counts, (6, 7));
        conn.execute_batch("UPDATE data.texts SET text='á' WHERE rowid=0")
            .unwrap();
        assert_eq!(
            conn.query_row(&format!("SELECT count(*) FROM ({rows})"), [], |r| r
                .get::<_, u64>(0))
                .unwrap(),
            6
        );
    }

    #[test]
    fn first_publication_upgrade_rolls_back_on_failure_and_reopens_only_after_success() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("project.wfpj");
        let mut p = Project::create(&path).unwrap();
        p.database
            .conn
            .execute_batch(
                "CREATE TABLE data.source(text VARCHAR); CREATE TABLE data.taken(value INTEGER)",
            )
            .unwrap();
        assert_eq!(p.info().unwrap().schema_version, 1);
        assert!(!publication_registry_exists(&p.database.conn).unwrap());
        {
            let tx = p.database.conn.transaction().unwrap();
            let target = Relation {
                schema: "data".into(),
                name: "taken".into(),
            };
            assert!(
                publish_live_view(
                    &tx,
                    &target,
                    vec![],
                    PublicationSource::selected(
                        &tx,
                        &DocumentInput {
                            source: "source".into(),
                            column: "text".into()
                        },
                        vec!["text".into()]
                    )
                    .unwrap(),
                    "SELECT * FROM data.source",
                    |relation| format!("SELECT * FROM {}", relation.sql())
                )
                .is_err()
            );
        }
        assert_eq!(p.info().unwrap().schema_version, 1);
        assert!(!publication_registry_exists(&p.database.conn).unwrap());
        {
            let tx = p.database.conn.transaction().unwrap();
            let target = Relation {
                schema: "data".into(),
                name: "published".into(),
            };
            publish_live_view(
                &tx,
                &target,
                vec![],
                PublicationSource::selected(
                    &tx,
                    &DocumentInput {
                        source: "source".into(),
                        column: "text".into(),
                    },
                    vec!["text".into()],
                )
                .unwrap(),
                "SELECT * FROM data.source",
                |relation| format!("SELECT * FROM {}", relation.sql()),
            )
            .unwrap();
            tx.commit().unwrap();
        }
        drop(p);
        let reopened = Project::open(&path).unwrap();
        assert_eq!(reopened.info().unwrap().schema_version, 2);
        assert!(publication_registry_exists(&reopened.database.conn).unwrap());
    }
}
