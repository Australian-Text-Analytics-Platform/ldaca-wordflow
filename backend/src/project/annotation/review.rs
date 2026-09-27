//! Saved Annotation is a historical report over a live source, never a replay of old row positions.
use super::execution::{Report, Request};
use super::*;
use duckdb::arrow::{array::StringArray, datatypes::Schema};

#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = AnnotationQuery)]
#[serde(tag = "view", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum Query {
    Rows {
        page: u64,
        page_size: u64,
        #[serde(default)]
        sorting: Vec<cell_edit::Sort>,
        review: Review,
        #[serde(default)]
        correction: Option<String>,
    },
    Context,
    Diagnostics {
        page: u64,
        page_size: u64,
    },
}
pub(crate) enum Output {
    Page(tempfile::NamedTempFile),
    Context(Value),
}
impl Database {
    pub(in crate::project) fn query_annotation(
        &mut self,
        id: Uuid,
        query: Query,
    ) -> Result<Output> {
        let analysis = self.analysis(id)?;
        let report: Report = serde_json::from_value(analysis.output("annotation")?.clone())?;
        if matches!(query, Query::Context) {
            return Ok(Output::Context(serde_json::from_slice(
                &analyses::artifact_blob(&self.conn, id, report.context)?,
            )?));
        }
        if let Query::Diagnostics { page, page_size } = query {
            let offset = page_offset(page, page_size)?;
            let relation = analyses::artifact_relation(&self.conn, id, report.diagnostics)?;
            let mut file = tempfile::NamedTempFile::new()?;
            execute_statements(
                &self.conn,
                &[SqlStatement {
                    sql: format!(
                        "SELECT * FROM {} ORDER BY row_ref LIMIT {page_size} OFFSET {offset}",
                        relation.sql()
                    ),
                    parameters: vec![],
                }],
                Some(&mut file),
                &self.cancellation,
            )?;
            return Ok(Output::Page(file));
        }
        let Query::Rows {
            page,
            page_size,
            sorting,
            review,
            correction,
        } = query
        else {
            return Err(Error::invalid("Unsupported review"));
        };
        if !review.changes.is_empty() {
            return Err(Error::invalid(
                "Open Edit corrections to apply draft changes to review",
            ));
        }
        let mut request: Request = serde_json::from_value(analysis.request)?;
        request.setup.correction = correction;
        let relation = request.setup.source.resolve(&self.conn)?.relation;
        let stamp = self.changes.stamp(&relation);
        let offset = page_offset(page, page_size)?;
        let tx = self.conn.transaction()?;
        let columns = mutations::columns(&tx, &relation)?
            .into_iter()
            .map(|(name, data_type)| cell_edit::Column {
                identifier: name.eq_ignore_ascii_case("rowid"),
                name,
                data_type,
                editable: false,
            })
            .collect::<Vec<_>>();
        let rules = EditRequest::Manual {
            setup: request.setup,
        };
        let reviewed = review_query(&tx, &tx, &relation, &columns, Some(&rules), &review)?;
        let mut order = Vec::new();
        for sort in sorting {
            if !columns.iter().any(|c| c.name == sort.column) {
                return Err(Error::invalid("Unknown review sort column"));
            }
            order.push(format!(
                "{} {}",
                query::quote(&sort.column),
                if sort.descending { "DESC" } else { "ASC" }
            ));
        }
        order.push("rowid ASC".into());
        let projection = columns
            .iter()
            .map(|c| query::quote(&c.name))
            .collect::<Vec<_>>()
            .join(",");
        let mut stmt=tx.prepare(&format!("SELECT {projection},CAST(rowid AS VARCHAR) FROM {} ORDER BY {} LIMIT {page_size} OFFSET {offset}",reviewed.source,order.join(",")))?;
        let data = stmt.query_arrow([])?;
        let indices = (0..columns.len()).collect::<Vec<_>>();
        let schema = data.get_schema().project(&indices).map_err(arrow_error)?;
        let schema =
            arrow_metadata::Annotations::load(&tx, &relation)?.enrich(&schema, columns.len())?;
        let mut batches = Vec::new();
        let mut refs = Vec::new();
        for batch in data {
            check_cancellation(&self.cancellation)?;
            let identifiers = batch
                .column(columns.len())
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or_else(|| Error::invalid("Unexpected row identifier representation"))?;
            refs.extend(identifiers.iter().map(|value| value.map(str::to_owned)));
            batches.push(batch.project(&indices).map_err(arrow_error)?);
        }
        drop(stmt);
        tx.commit()?;
        let mut metadata = schema.metadata().clone();
        metadata.insert(
            "wordflow:annotation-review".into(),
            serde_json::to_string(&reviewed.summary)?,
        );
        metadata.insert(
            "wordflow:annotation-live".into(),
            serde_json::to_string(&LiveMetadata {
                row_refs: refs,
                mutation_stamp: stamp,
                outdated: self.changes.stamp(&relation) != stamp,
            })?,
        );
        let schema = Arc::new(Schema::new_with_metadata(schema.fields().clone(), metadata));
        let mut file = tempfile::NamedTempFile::new()?;
        let mut writer = StreamWriter::try_new(file.as_file_mut(), &schema).map_err(arrow_error)?;
        for batch in batches {
            writer
                .write(&arrow_metadata::enrich_batch(batch, schema.clone())?)
                .map_err(arrow_error)?;
        }
        writer.finish().map_err(arrow_error)?;
        Ok(Output::Page(file))
    }
}
fn page_offset(page: u64, size: u64) -> Result<u64> {
    if page == 0 || ![10, 20, 50, 100].contains(&size) {
        return Err(Error::invalid("Choose a valid review page and page size"));
    }
    (page - 1)
        .checked_mul(size)
        .ok_or_else(|| Error::invalid("Review page is too large"))
}

#[derive(Serialize, utoipa::ToSchema)]
#[schema(as = AnnotationLiveMetadata)]
pub(crate) struct LiveMetadata {
    row_refs: Vec<Option<String>>,
    mutation_stamp: changes::MutationStamp,
    outdated: bool,
}
