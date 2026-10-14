//! Read-only inspection uses the same positive Top-N memberships as publication.
use super::*;
use duckdb::arrow::{
    array::{Array, ArrayRef, Float64Array, StructArray, UInt64Array},
    compute::concat_batches,
    datatypes::{DataType, Field, Schema, SchemaRef},
    record_batch::RecordBatch,
};

#[derive(Clone, Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopicDocumentQuery {
    pub source: usize,
    pub topic: usize,
    pub topic_count: usize,
    pub top_n: usize,
    pub page: u64,
    pub page_size: u64,
    pub metadata: Vec<String>,
}

#[derive(Clone)]
pub(in crate::project) struct PreviewDocuments {
    schema: SchemaRef,
    batches: Vec<RecordBatch>,
    temporary: PathBuf,
    processed_ids: Option<Vec<u64>>,
}
impl PreviewDocuments {
    pub(in crate::project) fn texts(&self, column: &str) -> Result<Vec<String>> {
        let mut texts = Vec::new();
        for batch in &self.batches {
            let source = batch
                .column(0)
                .as_any()
                .downcast_ref::<StructArray>()
                .ok_or_else(|| model_error("Retained source is not a struct"))?;
            let values = source
                .column_by_name(column)
                .ok_or_else(|| model_error("Retained document column is unavailable"))?;
            for index in 0..values.len() {
                texts.push(if values.is_null(index) {
                    String::new()
                } else {
                    duckdb::arrow::util::display::array_value_to_string(values, index)
                        .map_err(arrow_error)?
                });
            }
        }
        if let Some(ids) = &self.processed_ids {
            let mut distinct = std::collections::BTreeMap::new();
            for (id, text) in ids.iter().copied().zip(texts) {
                distinct.entry(id).or_insert(text);
            }
            Ok(distinct.into_values().collect())
        } else {
            Ok(texts)
        }
    }
    #[cfg(test)]
    pub(super) fn capture(
        conn: &Connection,
        docs: &CapturedDocuments,
        cancellation: &CancellationToken,
    ) -> Result<Self> {
        Self::capture_sql(
            conn,
            &format!("SELECT source FROM {} ORDER BY document_id", docs.name),
            &docs.metadata,
            cancellation,
        )
    }
    pub(super) fn capture_joined(
        conn: &Connection,
        rows: &str,
        docs: &CapturedDocuments,
        cancellation: &CancellationToken,
    ) -> Result<Self> {
        Self::capture_sql(
            conn,
            &format!("SELECT source,processed_id FROM ({rows}) ORDER BY document_id"),
            &docs.metadata,
            cancellation,
        )
    }
    fn capture_sql(
        conn: &Connection,
        sql: &str,
        metadata: &arrow_metadata::Annotations,
        cancellation: &CancellationToken,
    ) -> Result<Self> {
        let mut statement = conn.prepare(sql)?;
        let raw = statement.query_arrow([])?.get_schema();
        let schema = Arc::new(metadata.enrich(&raw, raw.fields().len())?);
        let mut batches = Vec::new();
        let mut processed_ids = raw.field_with_name("processed_id").ok().map(|_| Vec::new());
        while let Some(array) = statement.step()? {
            check_cancellation(cancellation)?;
            let batch = RecordBatch::from(&array);
            if let Some(ids) = processed_ids.as_mut() {
                let column = batch
                    .column_by_name("processed_id")
                    .and_then(|array| array.as_any().downcast_ref::<UInt64Array>())
                    .ok_or_else(|| model_error("Sampled processed-text identity is unavailable"))?;
                ids.extend(column.values().iter().copied());
            }
            batches.push(arrow_metadata::enrich_batch(batch, schema.clone())?);
        }
        Ok(Self {
            schema,
            batches,
            temporary: temporary_directory(conn)?,
            processed_ids,
        })
    }
    fn expand_selection(&self, selected: &[(u64, f64)]) -> Vec<(u64, f64)> {
        let Some(ids) = &self.processed_ids else {
            return selected.to_vec();
        };
        let selected = selected
            .iter()
            .copied()
            .collect::<std::collections::BTreeMap<_, _>>();
        let mut rows = ids
            .iter()
            .enumerate()
            .filter_map(|(index, id)| {
                selected
                    .get(id)
                    .map(|coverage| (index as u64 + 1, *coverage))
            })
            .collect::<Vec<_>>();
        rows.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        rows
    }

    fn page(&self, selected: &[(u64, f64)], columns: &[String]) -> Result<tempfile::NamedTempFile> {
        let DataType::Struct(fields) = self.schema.field(0).data_type() else {
            return Err(model_error("Retained source is not a struct"));
        };
        let indices = columns
            .iter()
            .map(|column| {
                fields
                    .iter()
                    .position(|f| f.name() == column)
                    .ok_or_else(|| Error::invalid("Unknown retained column"))
            })
            .collect::<Result<Vec<_>>>()?;
        let fields = indices
            .iter()
            .map(|i| fields[*i].clone())
            .collect::<Vec<_>>();
        let schema = Arc::new(Schema::new(vec![
            Field::new("document_id", DataType::UInt64, false),
            Field::new("coverage", DataType::Float64, false),
            Field::new("source", DataType::Struct(fields.clone().into()), false),
        ]));
        let mut rows = Vec::new();
        for &(id, coverage) in selected {
            let mut offset = id as usize - 1;
            let batch = self
                .batches
                .iter()
                .find(|batch| {
                    if offset < batch.num_rows() {
                        true
                    } else {
                        offset -= batch.num_rows();
                        false
                    }
                })
                .ok_or_else(|| model_error("Retained document is unavailable"))?;
            let source = batch
                .column(0)
                .as_any()
                .downcast_ref::<StructArray>()
                .ok_or_else(|| model_error("Retained source is not a struct"))?;
            let values = indices
                .iter()
                .map(|i| source.column(*i).slice(offset, 1))
                .collect();
            rows.push(
                RecordBatch::try_new(
                    schema.clone(),
                    vec![
                        Arc::new(UInt64Array::from(vec![id])) as ArrayRef,
                        Arc::new(Float64Array::from(vec![coverage])),
                        Arc::new(StructArray::new(fields.clone().into(), values, None)),
                    ],
                )
                .map_err(arrow_error)?,
            );
        }
        let batch = concat_batches(&schema, rows.iter()).map_err(arrow_error)?;
        let mut file = tempfile::NamedTempFile::new_in(&self.temporary)?;
        let mut writer = StreamWriter::try_new(file.as_file_mut(), &schema).map_err(arrow_error)?;
        writer.write(&batch).map_err(arrow_error)?;
        writer.finish().map_err(arrow_error)?;
        drop(writer);
        Ok(file)
    }
}

impl Database {
    pub(in crate::project) fn project_topic_model(
        &self,
        model: &TopicModel,
        analysis: Option<Uuid>,
        request: TopicQuery,
    ) -> Result<TopicProjection> {
        self.project_topic_rows(model, analysis, request, false)
    }
    pub(in crate::project) fn project_topic_rows(
        &self,
        model: &TopicModel,
        analysis: Option<Uuid>,
        request: TopicQuery,
        all: bool,
    ) -> Result<TopicProjection> {
        let TopicQuery::Documents(input) = request else {
            let excluded = self.topic_exclusions(request.stopwords())?;
            return model.query(request, excluded);
        };
        let offset = if all {
            0
        } else {
            page_offset(input.page, input.page_size)?
        };
        let page_size = if all {
            usize::MAX
        } else {
            input.page_size as usize
        };
        model.validate_count(input.topic_count)?;
        if input.topic >= input.topic_count || !(1..=input.topic_count).contains(&input.top_n) {
            return Err(Error::invalid("Choose a valid topic and Top-N membership"));
        }
        let source = model
            .sources
            .get(input.source)
            .ok_or_else(|| Error::invalid("Unknown source"))?;
        let mut columns = vec![source.input.column.clone()];
        for requested in input.metadata {
            let name = &source
                .columns
                .iter()
                .find(|(name, _)| name == &requested)
                .ok_or_else(|| Error::invalid("Unknown retained column"))?
                .0;
            if !columns.contains(name) {
                columns.push(name.clone());
            }
        }
        let begin = model.sources[..input.source]
            .iter()
            .map(TopicSource::processed_count)
            .sum::<usize>();
        let documents = model.documents(input.topic_count)?;
        let mut selected = documents
            .iter()
            .filter(|doc| {
                doc.doc_index >= begin && doc.doc_index < begin + source.processed_count()
            })
            .filter(|doc| memberships(doc, input.top_n).contains(&(input.topic as i32)))
            .map(|doc| {
                (
                    (doc.doc_index - begin + 1) as u64,
                    doc.topic_coverage
                        .iter()
                        .find(|(id, _)| *id == input.topic as i32)
                        .map_or(0.0, |(_, value)| f64::from(*value)),
                )
            })
            .collect::<Vec<_>>();
        selected.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        if let Some(key) = &source.processed_column {
            let (file, total_rows) = if let Some(analysis) = analysis {
                let relation = artifact_relation(
                    &self.conn,
                    analysis,
                    source
                        .documents
                        .ok_or_else(|| model_error("Processed Topic outputs are unavailable"))?,
                )?;
                let chosen = temporary_name();
                self.conn.execute_batch(&format!(
                    "CREATE TEMP TABLE {chosen}(document_id UBIGINT,coverage DOUBLE)"
                ))?;
                {
                    let mut appender = self.conn.appender(&chosen)?;
                    for (id, coverage) in &selected {
                        check_cancellation(&self.cancellation)?;
                        appender.append_row(params![id, coverage])?;
                    }
                    appender.flush()?;
                }
                let rows = live_document_rows(&source.input, &relation.sql(), key, &source.columns);
                let fields = columns
                    .iter()
                    .map(|name| {
                        format!("{} := r.source.{}", query::quote(name), query::quote(name))
                    })
                    .collect::<Vec<_>>()
                    .join(",");
                let captured = temporary_name();
                self.conn.execute_batch(&format!("CREATE TEMP TABLE {captured} AS SELECT r.document_id,p.coverage,struct_pack({fields}) AS source FROM ({rows}) r JOIN {chosen} p ON p.document_id=r.processed_id"))?;
                let total_rows: u64 =
                    self.conn
                        .query_row(&format!("SELECT count(*) FROM {captured}"), [], |r| {
                            r.get(0)
                        })?;
                let original = Relation {
                    schema: source
                        .input
                        .source
                        .schema
                        .clone()
                        .unwrap_or_else(|| "data".into()),
                    name: source.input.source.name.clone(),
                };
                let annotations =
                    arrow_metadata::Annotations::load(&self.conn, &original)?.prefixed("source");
                let file = arrow_page(
                    &self.conn,
                    &format!(
                        "SELECT * FROM {captured} ORDER BY coverage DESC,document_id{}",
                        if all {
                            String::new()
                        } else {
                            format!(" LIMIT {} OFFSET {offset}", input.page_size)
                        }
                    ),
                    &[],
                    &annotations,
                    &self.cancellation,
                )?;
                self.conn
                    .execute_batch(&format!("DROP TABLE {captured}; DROP TABLE {chosen}"))?;
                (file, total_rows)
            } else {
                let preview = model
                    .preview_documents
                    .get(input.source)
                    .ok_or_else(|| model_error("Preview documents are unavailable"))?;
                let selected = preview.expand_selection(&selected);
                let total_rows = selected.len() as u64;
                let page = selected
                    .into_iter()
                    .skip(usize::try_from(offset).unwrap_or(usize::MAX))
                    .take(page_size)
                    .collect::<Vec<_>>();
                (preview.page(&page, &columns)?, total_rows)
            };
            check_cancellation(&self.cancellation)?;
            return Ok(TopicProjection::Documents(DocumentPage {
                file,
                total_rows,
                has_next: offset.saturating_add(input.page_size) < total_rows,
                document_count: total_rows,
                match_count: total_rows,
            }));
        }
        let total_rows = selected.len() as u64;
        let page = selected
            .iter()
            .skip(usize::try_from(offset).unwrap_or(usize::MAX))
            .take(page_size)
            .copied()
            .collect::<Vec<_>>();
        check_cancellation(&self.cancellation)?;
        let file = if let Some(analysis) = analysis {
            let relation = artifact_relation(
                &self.conn,
                analysis,
                source
                    .documents
                    .ok_or_else(|| model_error("Source artifact is missing"))?,
            )?;
            let metadata = arrow_metadata::Annotations::load(&self.conn, &relation)?;
            let fields = columns
                .iter()
                .map(|name| format!("{} := d.source.{}", query::quote(name), query::quote(name)))
                .collect::<Vec<_>>()
                .join(",");
            let values = if page.is_empty() {
                "(NULL::UBIGINT,NULL::DOUBLE,0)".into()
            } else {
                page.iter()
                    .enumerate()
                    .map(|(rank, _)| format!("(?::UBIGINT,?::DOUBLE,{rank})"))
                    .collect::<Vec<_>>()
                    .join(",")
            };
            let parameters = page
                .iter()
                .flat_map(|(id, coverage)| [SqlValue::UBigInt(*id), SqlValue::Double(*coverage)])
                .collect::<Vec<_>>();
            arrow_page(
                &self.conn,
                &format!(
                    "SELECT d.document_id,p.coverage,struct_pack({fields}) AS source FROM {} d JOIN (VALUES {values}) p(id,coverage,rank) ON d.document_id=p.id ORDER BY p.rank",
                    relation.sql()
                ),
                &parameters,
                &metadata,
                &self.cancellation,
            )?
        } else {
            model
                .preview_documents
                .get(input.source)
                .ok_or_else(|| model_error("Preview documents are unavailable"))?
                .page(&page, &columns)?
        };
        Ok(TopicProjection::Documents(DocumentPage {
            file,
            total_rows,
            has_next: offset.saturating_add(input.page_size) < total_rows,
            document_count: page.len() as u64,
            match_count: 0,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow_ipc::reader::StreamReader;

    fn fixture() -> (Project, TopicModel, CapturedDocuments) {
        let p = Project::untitled().unwrap();
        p.database.conn.execute_batch("CREATE TABLE data.corpus AS SELECT * FROM (VALUES ('01','same 😀',{'when': DATE '2024-02-29'}),('1','same 😀',{'when':DATE '1969-12-31'}),('3','third',{'when':NULL::DATE}),('4',NULL,{'when':NULL::DATE})) t(id,text,metadata); INSERT INTO wordflow.nodes(table_name) VALUES ('corpus'); INSERT INTO wordflow.arrow_metadata VALUES ('data','corpus','[\"metadata\",\"when\"]','test.calendar','opaque')").unwrap();
        let docs = capture_documents(
            &p.database.conn,
            &DocumentInput {
                source: "corpus".into(),
                column: "text".into(),
            },
            None,
        )
        .unwrap();
        let preview =
            PreviewDocuments::capture(&p.database.conn, &docs, &p.database.cancellation).unwrap();
        let model = TopicModel {
            revision: Uuid::new_v4(),
            metadata: Vec::new(),
            population: None,
            parameters: None,
            preview_documents: vec![preview],
            sources: vec![TopicSource {
                input: docs.input.clone(),
                columns: docs.columns.clone(),
                document_count: 4,
                processed_text_count: None,
                total_count: 4,
                documents: None,
                processed_column: None,
                projection: None,
            }],
            natural: TopicModelingResult {
                topics: (0..2)
                    .map(|id| engine::TopicInfo {
                        id,
                        representative_words: vec![],
                        x: id as f32,
                        y: 0.0,
                    })
                    .collect(),
                documents: [
                    vec![(0, 0.4), (1, 0.4), (-1, 0.2)],
                    vec![(-1, 0.8), (0, 0.2)],
                    vec![(0, 0.4), (1, 0.6)],
                    vec![],
                ]
                .into_iter()
                .enumerate()
                .map(|(doc_index, topic_coverage)| DocumentResult {
                    doc_index,
                    dominant_topic: -1,
                    topic_coverage,
                })
                .collect(),
                n_segments: 8,
                max_topic_size: None,
                projection_context: None,
                retained_stages: None,
            },
            context: None,
            resolved_model: "test".into(),
        };
        (p, model, docs)
    }
    #[test]
    fn live_inspection_expands_duplicates_before_paging_and_download_and_keeps_nested_types() {
        let (mut p, mut model, _) = fixture();
        let request = TopicRequest {
            inputs: vec![model.sources[0].input.clone()],
            embedding_model: MODELS[0].id.into(),
            tokenizer: "native:plain_words_en".into(),
            segmentation: SegmentationMethod::Automatic,
            max_segment_tokens: 256,
            minimum_topic_size: 10,
            maximum_topic_size: None,
            seed: 7,
        };
        let (retained, sources, _) =
            capture(&p.database.conn, &request, None, &CancellationToken::new()).unwrap();
        model.sources = sources;
        model.preview_documents.clear();
        model.natural.documents = vec![
            DocumentResult {
                doc_index: 0,
                dominant_topic: 0,
                topic_coverage: vec![(0, 1.0)],
            },
            DocumentResult {
                doc_index: 1,
                dominant_topic: 1,
                topic_coverage: vec![(1, 1.0)],
            },
        ];
        let tab = p
            .database
            .create_analysis_tab(CreateTab {
                kind: KIND.into(),
                name: None,
            })
            .unwrap()
            .id;
        let id = p
            .database
            .begin_analysis_run(tab, KIND, serde_json::to_value(request).unwrap())
            .unwrap();
        p.database
            .publish_analysis_version(
                AcceptedAnalysis {
                    id,
                    tab_id: tab,
                    kind: KIND,
                },
                2,
                None,
                move |conn| persist_model(conn, id, model, retained),
            )
            .unwrap();
        let input = TopicDocumentQuery {
            source: 0,
            topic: 0,
            topic_count: 2,
            top_n: 1,
            page: 2,
            page_size: 1,
            metadata: vec!["id".into(), "metadata".into()],
        };
        let TopicProjection::Documents(page) = p
            .database
            .query_topic_model(id, TopicQuery::Documents(input.clone()))
            .unwrap()
        else {
            panic!("documents")
        };
        assert_eq!(page.total_rows, 2);
        let batch = read(&page);
        assert_eq!(batch.num_rows(), 1);
        let source = batch
            .column_by_name("source")
            .unwrap()
            .as_any()
            .downcast_ref::<StructArray>()
            .unwrap();
        let id_values = source
            .column_by_name("id")
            .unwrap()
            .as_any()
            .downcast_ref::<duckdb::arrow::array::StringArray>()
            .unwrap();
        assert_eq!(id_values.value(0), "1");
        let DataType::Struct(fields) = batch
            .schema()
            .field_with_name("source")
            .unwrap()
            .data_type()
            .clone()
        else {
            panic!("source")
        };
        let DataType::Struct(nested) = fields
            .iter()
            .find(|f| f.name() == "metadata")
            .unwrap()
            .data_type()
        else {
            panic!("metadata")
        };
        assert_eq!(nested[0].metadata()["ARROW:extension:metadata"], "opaque");
        let download = p
            .database
            .download_result(
                id,
                result_downloads::ResultDownload {
                    selection: result_downloads::ResultSelection::Topics { query: input },
                    format: ExportFormat::Json,
                    columns: vec![
                        result_downloads::ResultColumn {
                            column: "id".into(),
                            metadata: true,
                        },
                        result_downloads::ResultColumn {
                            column: "coverage".into(),
                            metadata: false,
                        },
                    ],
                },
            )
            .unwrap();
        let rows: Vec<Value> = serde_json::from_reader(download.reopen().unwrap()).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["id"], "01");
        assert_eq!(rows[1]["id"], "1");
    }
    fn request(page: u64, top_n: usize) -> TopicQuery {
        TopicQuery::Documents(TopicDocumentQuery {
            source: 0,
            topic: 0,
            topic_count: 2,
            top_n,
            page,
            page_size: 1,
            metadata: vec!["id".into(), "metadata".into()],
        })
    }
    fn read(page: &DocumentPage) -> RecordBatch {
        let mut reader = StreamReader::try_new(page.file.reopen().unwrap(), None).unwrap();
        reader
            .next()
            .map(|batch| batch.unwrap())
            .unwrap_or_else(|| RecordBatch::new_empty(reader.schema()))
    }
    #[test]
    fn preview_inspection_keeps_ties_identity_metadata_and_snapshot_without_project_writes() {
        let (p, model, docs) = fixture();
        p.database
            .conn
            .execute_batch(&format!("DROP TABLE {}; DROP TABLE data.corpus", docs.name))
            .unwrap();
        let TopicProjection::Documents(page) = p
            .database
            .project_topic_model(&model, None, request(1, 1))
            .unwrap()
        else {
            panic!("Expected documents");
        };
        assert_eq!(page.total_rows, 2);
        assert!(page.has_next);
        let batch = read(&page);
        assert_eq!(
            batch
                .column(0)
                .as_any()
                .downcast_ref::<UInt64Array>()
                .unwrap()
                .value(0),
            1
        );
        let DataType::Struct(source) = batch.schema().field(2).data_type().clone() else {
            panic!()
        };
        let metadata = source
            .iter()
            .find(|field| field.name() == "metadata")
            .unwrap();
        let DataType::Struct(fields) = metadata.data_type() else {
            panic!()
        };
        assert_eq!(fields[0].metadata()["ARROW:extension:metadata"], "opaque");
        let TopicProjection::Documents(next) = p
            .database
            .project_topic_model(&model, None, request(2, 1))
            .unwrap()
        else {
            panic!()
        };
        assert!(!next.has_next);
        assert_eq!(
            read(&next)
                .column(0)
                .as_any()
                .downcast_ref::<UInt64Array>()
                .unwrap()
                .value(0),
            2
        );
        let TopicProjection::Documents(tied) = p
            .database
            .project_topic_model(&model, None, request(2, 2))
            .unwrap()
        else {
            panic!()
        };
        assert_eq!(tied.total_rows, 3);
        assert_eq!(
            read(&tied)
                .column(0)
                .as_any()
                .downcast_ref::<UInt64Array>()
                .unwrap()
                .value(0),
            3
        );
        assert_eq!(
            p.database
                .conn
                .query_row("SELECT count(*) FROM wordflow.analyses", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            p.database
                .conn
                .query_row("SELECT count(*) FROM wordflow.artifacts", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn saved_inspection_uses_owned_rows_after_source_deletion_and_handles_empty_pages() {
        let (mut p, mut model, docs) = fixture();
        let tab = p
            .database
            .create_analysis_tab(CreateTab {
                kind: KIND.into(),
                name: None,
            })
            .unwrap()
            .id;
        let id = p
            .database
            .begin_analysis_run(tab, KIND, serde_json::json!({}))
            .unwrap();
        let artifact = Uuid::new_v4();
        model.sources[0].documents = Some(artifact);
        p.database
            .publish_analysis(
                AcceptedAnalysis {
                    id,
                    tab_id: tab,
                    kind: KIND,
                },
                |conn| {
                    conn.execute_batch(&format!(
                        "CREATE TABLE wordflow.{} AS SELECT * FROM {}",
                        artifact_table(artifact),
                        docs.name
                    ))?;
                    register_table(conn, id, artifact, "documents_0")?;
                    docs.metadata
                        .store(conn, &artifact_relation(conn, id, artifact)?)?;
                    let natural = Uuid::new_v4();
                    register_blob(
                        conn,
                        id,
                        natural,
                        "natural_projection",
                        "application/json",
                        &serde_json::to_vec(&model.natural)?,
                    )?;
                    Ok(serde_json::to_value(TopicResultV1 {
                        sources: model.sources.clone(),
                        natural_topic_count: 2,
                        segment_count: 8,
                        resolved_model: "test".into(),
                        natural_projection: natural,
                        projection_context: None,
                        retained_stages: None,
                        metadata: None,
                        parameters: None,
                    })?)
                },
            )
            .unwrap();
        p.database
            .conn
            .execute_batch("DROP TABLE data.corpus")
            .unwrap();
        let TopicProjection::Documents(page) =
            p.database.query_topic_model(id, request(1, 1)).unwrap()
        else {
            panic!()
        };
        assert_eq!(page.total_rows, 2);
        assert_eq!(read(&page).num_rows(), 1);
        let TopicProjection::Documents(empty) =
            p.database.query_topic_model(id, request(9, 1)).unwrap()
        else {
            panic!()
        };
        assert_eq!(empty.total_rows, 2);
        assert_eq!(read(&empty).num_rows(), 0);
    }
    #[test]
    #[ignore = "manual Preview row-memory and page-cost benchmark"]
    fn benchmark_preview_documents() {
        let (p, mut model, _) = fixture();
        p.database.conn.execute_batch("CREATE TABLE data.large AS SELECT i::VARCHAR AS id, repeat('Research 😀 evidence ', 30) AS text, {'score': i, 'day': DATE '2024-02-29'} AS metadata FROM range(20000) r(i); INSERT INTO wordflow.nodes(table_name) VALUES ('large')").unwrap();
        let docs = capture_documents(
            &p.database.conn,
            &DocumentInput {
                source: "large".into(),
                column: "text".into(),
            },
            None,
        )
        .unwrap();
        let started = std::time::Instant::now();
        let retained =
            PreviewDocuments::capture(&p.database.conn, &docs, &p.database.cancellation).unwrap();
        let bytes: usize = retained
            .batches
            .iter()
            .map(RecordBatch::get_array_memory_size)
            .sum();
        let capture = started.elapsed();
        model.preview_documents = vec![retained];
        model.sources[0].input = docs.input;
        model.sources[0].columns = docs.columns;
        model.sources[0].document_count = 20000;
        model.natural.documents = (0..20000)
            .map(|doc_index| DocumentResult {
                doc_index,
                dominant_topic: 0,
                topic_coverage: vec![(0, 1.0)],
            })
            .collect();
        let started = std::time::Instant::now();
        let mut response_bytes = 0;
        for page in 1..=20 {
            let TopicProjection::Documents(result) = p
                .database
                .project_topic_model(
                    &model,
                    None,
                    TopicQuery::Documents(TopicDocumentQuery {
                        source: 0,
                        topic: 0,
                        topic_count: 2,
                        top_n: 1,
                        page,
                        page_size: 20,
                        metadata: vec!["metadata".into()],
                    }),
                )
                .unwrap()
            else {
                panic!()
            };
            assert_eq!(result.document_count, 20);
            response_bytes += result.file.as_file().metadata().unwrap().len();
        }
        eprintln!(
            "20,000 retained rows: {bytes} Arrow bytes, capture {capture:?}, 20 pages {:?}, {response_bytes} response bytes",
            started.elapsed()
        );
    }
}
