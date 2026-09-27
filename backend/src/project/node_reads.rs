//! Snapshot-consistent node data and schema reads.
use super::*;
use duckdb::arrow::record_batch::RecordBatch;

#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = NodePage)]
#[serde(deny_unknown_fields)]
pub(crate) struct Page {
    pub page: u64,
    pub page_size: u64,
    #[serde(default)]
    pub sorting: Vec<cell_edit::Sort>,
}

impl Database {
    pub(super) fn node_page(
        &self,
        name: impl Into<ObjectTarget>,
        page: Option<Page>,
    ) -> Result<tempfile::NamedTempFile> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let object = name.into().resolve(&self.conn)?;
        let relation = object.relation;
        let (limit, offset, order) = if let Some(page) = page {
            if page.page == 0 || !(1..=1000).contains(&page.page_size) {
                return Err(Error::invalid(
                    "Page must be positive and page size must be between 1 and 1000",
                ));
            }
            let offset = (page.page - 1)
                .checked_mul(page.page_size)
                .and_then(|n| i64::try_from(n).ok())
                .ok_or_else(|| Error::invalid("Page offset is too large"))?;
            let order = page
                .sorting
                .iter()
                .map(|sort| {
                    format!(
                        "{} {}",
                        query::quote(&sort.column),
                        if sort.descending { "DESC" } else { "ASC" }
                    )
                })
                .collect::<Vec<_>>();
            (
                page.page_size + 1,
                offset,
                if order.is_empty() {
                    String::new()
                } else {
                    format!(" ORDER BY {}", order.join(","))
                },
            )
        } else {
            (0, 0, String::new())
        };
        let mut statement = self.conn.prepare(&format!(
            "SELECT * FROM {}{order} LIMIT ? OFFSET ?",
            relation.sql()
        ))?;
        let schema = statement.query_arrow(params![limit, offset])?.get_schema();
        let schema = Arc::new(
            arrow_metadata::Annotations::load(&self.conn, &relation)?
                .enrich(&schema, schema.fields().len())?,
        );
        let mut file = tempfile::NamedTempFile::new()?;
        let mut writer = StreamWriter::try_new(file.as_file_mut(), &schema).map_err(arrow_error)?;
        while let Some(array) = statement.step()? {
            check_cancellation(&self.cancellation)?;
            let batch = RecordBatch::from(&array);
            let batch = arrow_metadata::enrich_batch(batch, schema.clone())?;
            writer.write(&batch).map_err(arrow_error)?;
        }
        writer.finish().map_err(arrow_error)?;
        drop(writer);
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(file)
    }
}
