//! Typed document pages shared by Concordance and Quotation.
use super::*;
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
    let mut file = tempfile::NamedTempFile::new()?;
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

pub(crate) struct DocumentPage {
    pub file: tempfile::NamedTempFile,
    pub total_rows: u64,
    pub has_next: bool,
    pub document_count: u64,
    pub match_count: u64,
}
