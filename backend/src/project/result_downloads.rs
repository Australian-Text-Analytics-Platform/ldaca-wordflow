//! Result downloads capture a complete ordered projection without publishing project objects.
use super::document_matches::temporary_name;
use super::*;

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ResultColumn {
    pub column: String,
    #[serde(default)]
    pub metadata: bool,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum ResultSelection {
    Concordance {
        query: concordance::ConcordanceQuery,
    },
    Quotation {
        query: quotation::QuotationQuery,
    },
    Topics {
        query: topic_modeling::TopicDocumentQuery,
    },
    Annotation {
        query: annotation::review::Query,
    },
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ResultDownload {
    pub selection: ResultSelection,
    pub format: ExportFormat,
    pub columns: Vec<ResultColumn>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct CapturedResultDownload {
    pub bytes: Vec<u8>,
    pub format: ExportFormat,
    pub document: ResultColumn,
    pub columns: Vec<ResultColumn>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopicPreviewDownload {
    pub query: topic_modeling::TopicDocumentQuery,
    pub format: ExportFormat,
    pub columns: Vec<ResultColumn>,
}

impl Database {
    pub(super) fn download_captured_result(
        &self,
        request: CapturedResultDownload,
    ) -> Result<tempfile::NamedTempFile> {
        use std::io::Write;
        let mut rows = temporary_file(&self.conn)?;
        rows.write_all(&request.bytes)?;
        export_result_rows(
            &self.conn,
            rows,
            &request.document,
            &request.columns,
            request.format,
            &self.cancellation,
        )
    }
}

impl Database {
    pub(super) fn download_result(
        &mut self,
        id: Uuid,
        request: ResultDownload,
    ) -> Result<tempfile::NamedTempFile> {
        let analysis = self.analysis(id)?;
        let (file, document) = match request.selection {
            ResultSelection::Concordance { query } => {
                let inputs: concordance::ConcordanceRequest =
                    serde_json::from_value(analysis.request)?;
                let input = inputs
                    .inputs
                    .get(query.source_index)
                    .ok_or_else(|| Error::invalid("Unknown Concordance source"))?;
                (
                    self.concordance_rows(id, query, true)?.file,
                    ResultColumn {
                        column: input.column.clone(),
                        metadata: true,
                    },
                )
            }
            ResultSelection::Quotation { query } => {
                let inputs: quotation::QuotationRequest = serde_json::from_value(analysis.request)?;
                (
                    self.quotation_rows(id, query, true)?.file,
                    ResultColumn {
                        column: inputs.input.column,
                        metadata: true,
                    },
                )
            }
            ResultSelection::Topics { query } => {
                self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
                let model = topic_modeling::load_model(&self.conn, id)?;
                let input = model
                    .sources
                    .get(query.source)
                    .ok_or_else(|| Error::invalid("Unknown Topics source"))?;
                let document = ResultColumn {
                    column: input.input.column.clone(),
                    metadata: true,
                };
                let topic_modeling::TopicProjection::Documents(page) = self.project_topic_rows(
                    &model,
                    Some(id),
                    topic_modeling::TopicQuery::Documents(query),
                    true,
                )?
                else {
                    return Err(Error::invalid("Choose Topic documents"));
                };
                self.conn.execute_batch("COMMIT")?;
                (page.file, document)
            }
            ResultSelection::Annotation { query } => {
                if !matches!(query, annotation::review::Query::Rows { .. }) {
                    return Err(Error::invalid("Choose Annotation rows"));
                }
                let inputs: annotation::execution::Request =
                    serde_json::from_value(analysis.request)?;
                let annotation::review::Output::Page(file) =
                    self.annotation_rows(id, query, true)?
                else {
                    return Err(Error::invalid("Choose Annotation rows"));
                };
                (
                    file,
                    ResultColumn {
                        column: inputs.setup.document,
                        metadata: false,
                    },
                )
            }
        };
        export_result_rows(
            &self.conn,
            file,
            &document,
            &request.columns,
            request.format,
            &self.cancellation,
        )
    }
}

/// The same bounded Arrow reader is used for imported files and already captured result rows.
pub(super) fn export_result_rows(
    conn: &Connection,
    rows: tempfile::NamedTempFile,
    document: &ResultColumn,
    columns: &[ResultColumn],
    format: ExportFormat,
    cancel: &CancellationToken,
) -> Result<tempfile::NamedTempFile> {
    use duckdb::arrow::{
        array::UInt64Array,
        datatypes::{DataType, Field, Schema},
        record_batch::{RecordBatch, RecordBatchIterator},
    };
    if columns.is_empty() {
        return Err(Error::invalid("Choose at least one download column"));
    }
    let reader =
        arrow_ipc::reader::StreamReader::try_new(rows.reopen()?, None).map_err(arrow_error)?;
    let schema = reader.schema();
    let has_document = columns
        .iter()
        .any(|c| c.metadata == document.metadata && c.column == document.column);
    let is_document = |column: &ResultColumn| {
        column.metadata == document.metadata && column.column == document.column
    };
    let mut names = columns
        .iter()
        .filter(|column| column.metadata || is_document(column))
        .map(|column| column.column.to_ascii_lowercase())
        .collect();
    let mut requested = std::collections::HashSet::new();
    let mut selected = Vec::new();
    for column in columns {
        if !requested.insert((column.metadata, &column.column)) {
            return Err(Error::invalid("Each download column may appear only once"));
        }
        let field = if column.metadata {
            let source = schema.field_with_name("source").map_err(arrow_error)?;
            let DataType::Struct(fields) = source.data_type() else {
                return Err(Error::invalid("Source metadata is unavailable"));
            };
            fields
                .iter()
                .find(|f| f.name() == &column.column)
                .ok_or_else(|| Error::invalid("Unknown metadata column"))?;
            format!("source.{}", query::quote(&column.column))
        } else {
            let expression = if schema.field_with_name(&column.column).is_ok() {
                query::quote(&column.column)
            } else {
                let nested = ["quotes", "matches"]
                    .iter()
                    .find_map(|name| {
                        let field = schema.field_with_name(name).ok()?;
                        let DataType::List(item) = field.data_type() else {
                            return None;
                        };
                        let DataType::Struct(fields) = item.data_type() else {
                            return None;
                        };
                        fields
                            .iter()
                            .any(|f| f.name() == &column.column)
                            .then_some(*name)
                    })
                    .ok_or_else(|| Error::invalid("Unknown generated download column"))?;
                format!(
                    "list_transform({}, item -> item.{})",
                    query::quote(nested),
                    query::quote(&column.column)
                )
            };
            if !has_document
                && (column.column.ends_with("_start_idx")
                    || column.column.ends_with("_end_idx")
                    || matches!(column.column.as_str(), "start_idx" | "end_idx"))
            {
                return Err(Error::invalid(
                    "Position fields require the document column",
                ));
            }
            expression
        };
        let name = if column.metadata || is_document(column) {
            column.column.clone()
        } else {
            document_matches::generated_name(&mut names, &column.column)
        };
        selected.push(format!("{field} AS {}", query::quote(&name)));
    }
    let captured = temporary_file(conn)?;
    // A transient serialization ordinal preserves requested order even with parallel Parquet reads.
    let mut root_names = schema
        .fields()
        .iter()
        .map(|f| f.name().to_ascii_lowercase())
        .collect();
    let order = document_matches::generated_name(&mut root_names, "__download_order");
    let mut fields = schema.fields().to_vec();
    fields.push(Arc::new(Field::new(&order, DataType::UInt64, false)));
    let ordered_schema = Arc::new(Schema::new_with_metadata(fields, schema.metadata().clone()));
    let batch_schema = ordered_schema.clone();
    let mut offset = 0u64;
    let ordered = reader.map(move |batch| {
        let batch = batch?;
        let end = offset + batch.num_rows() as u64;
        let mut values = batch.columns().to_vec();
        values.push(Arc::new(UInt64Array::from_iter_values(offset..end)));
        offset = end;
        RecordBatch::try_new(batch_schema.clone(), values)
    });
    imports::readers::batches(
        captured.path(),
        RecordBatchIterator::new(ordered, ordered_schema),
        cancel,
    )?;
    let relation = Relation {
        schema: "temp".into(),
        name: temporary_name(),
    };
    conn.execute_batch(&format!(
        "CREATE TEMP VIEW {} AS SELECT {} FROM read_parquet({}) ORDER BY {}",
        query::quote(&relation.name),
        selected.join(","),
        query::literal(&captured.path().to_string_lossy()),
        query::quote(&order)
    ))?;
    let output = exports::write_data(conn, &relation, format, temporary_file(conn)?, cancel);
    conn.execute_batch(&format!("DROP VIEW {}", relation.sql()))?;
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_text_keeps_its_name_even_when_a_generated_field_is_selected_first() {
        let p = Project::untitled().unwrap();
        let conn = &p.database.conn;
        let rows = document_matches::arrow_page(
            conn,
            "SELECT 'generated' AS quote,struct_pack(quote:='original') AS source",
            &[],
            &arrow_metadata::Annotations::default(),
            &CancellationToken::new(),
        )
        .unwrap();
        let document = ResultColumn {
            column: "quote".into(),
            metadata: true,
        };
        let file = export_result_rows(
            conn,
            rows,
            &document,
            &[
                ResultColumn {
                    column: "quote".into(),
                    metadata: false,
                },
                document.clone(),
            ],
            ExportFormat::Json,
            &CancellationToken::new(),
        )
        .unwrap();
        let rows: Vec<Value> = serde_json::from_reader(file.reopen().unwrap()).unwrap();
        assert_eq!(rows[0]["quote"], "original");
        assert_eq!(rows[0]["quote_2"], "generated");
    }

    #[test]
    fn download_order_survives_parallel_row_groups_and_internal_name_collisions() {
        let p = Project::untitled().unwrap();
        let conn = &p.database.conn;
        conn.execute_batch("SET preserve_insertion_order=false; SET threads=4")
            .unwrap();
        let rows=document_matches::arrow_page(conn,"SELECT i AS __download_order,struct_pack(text:='document '||i,id:=9007199254740993::BIGINT+i) AS source FROM range(5000) t(i) ORDER BY i DESC",&[],&arrow_metadata::Annotations::default(),&CancellationToken::new()).unwrap();
        let file = export_result_rows(
            conn,
            rows,
            &ResultColumn {
                column: "text".into(),
                metadata: true,
            },
            &[
                ResultColumn {
                    column: "id".into(),
                    metadata: true,
                },
                ResultColumn {
                    column: "__download_order".into(),
                    metadata: false,
                },
            ],
            ExportFormat::Json,
            &CancellationToken::new(),
        )
        .unwrap();
        let rows: Vec<Value> = serde_json::from_reader(file.reopen().unwrap()).unwrap();
        assert_eq!(rows.len(), 5000);
        assert_eq!(rows[0]["id"].as_u64(), Some(9007199254745992));
        assert_eq!(rows[4999]["id"].as_u64(), Some(9007199254740993));
        assert_eq!(rows[0]["__download_order"], 4999);
        assert!(
            rows.windows(2)
                .all(|pair| pair[0]["__download_order"].as_u64().unwrap()
                    > pair[1]["__download_order"].as_u64().unwrap())
        );
        assert!(
            !rows[0]
                .as_object()
                .unwrap()
                .contains_key("__download_order_2")
        );
    }
}
