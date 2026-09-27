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

pub(super) struct PreviewDocuments {
    schema: SchemaRef,
    batches: Vec<RecordBatch>,
}
impl PreviewDocuments {
    pub(super) fn capture(
        conn: &Connection,
        docs: &CapturedDocuments,
        cancellation: &CancellationToken,
    ) -> Result<Self> {
        let mut statement = conn.prepare(&format!(
            "SELECT source FROM {} ORDER BY document_id",
            docs.name
        ))?;
        let raw = statement.query_arrow([])?.get_schema();
        let schema = Arc::new(docs.metadata.enrich(&raw, raw.fields().len())?);
        let mut batches = Vec::new();
        while let Some(array) = statement.step()? {
            check_cancellation(cancellation)?;
            batches.push(arrow_metadata::enrich_batch(
                RecordBatch::from(&array),
                schema.clone(),
            )?);
        }
        Ok(Self { schema, batches })
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
        let mut file = tempfile::NamedTempFile::new()?;
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
        let TopicQuery::Documents(input) = request else {
            let excluded = self.topic_exclusions(request.stopwords())?;
            return model.query(request, excluded);
        };
        let offset = page_offset(input.page, input.page_size)?;
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
            .map(|s| s.document_count)
            .sum::<usize>();
        let documents = model.documents(input.topic_count)?;
        let mut selected = documents
            .iter()
            .filter(|doc| doc.doc_index >= begin && doc.doc_index < begin + source.document_count)
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
        let total_rows = selected.len() as u64;
        let page = selected
            .iter()
            .skip(usize::try_from(offset).unwrap_or(usize::MAX))
            .take(input.page_size as usize)
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
            preview_documents: vec![preview],
            sources: vec![TopicSource {
                input: docs.input.clone(),
                columns: docs.columns.clone(),
                document_count: 4,
                total_count: 4,
                documents: None,
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
                projection_context: None,
            },
            context: None,
            resolved_model: "test".into(),
        };
        (p, model, docs)
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
