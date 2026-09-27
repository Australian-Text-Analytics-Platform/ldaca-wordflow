//! Annotation captures inference context once and stages predictions before one atomic label update.
use super::*;
use crate::ai::inference::{Example, Inference, Label, Prediction};
use duckdb::arrow::{
    array::{Array, StringArray},
    datatypes::Schema,
    record_batch::RecordBatch,
};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Processing {
    #[default]
    All,
    Missing,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ExampleSelection {
    #[default]
    Random,
    First,
    Last,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[schema(as = AnnotationExamples)]
#[serde(deny_unknown_fields)]
pub(crate) struct Examples {
    pub source: ObjectTarget,
    pub text: String,
    pub label: String,
    pub selection: ExampleSelection,
    pub per_code: usize,
    pub seed: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[schema(as = AnnotationRequest)]
#[serde(deny_unknown_fields)]
pub(crate) struct Request {
    pub setup: ManualSetup,
    pub inference: Inference,
    pub examples: Option<Examples>,
    #[serde(default)]
    pub processing: Processing,
}
#[derive(Clone, Deserialize, utoipa::ToSchema)]
#[schema(as = AnnotationPreviewRequest)]
#[serde(deny_unknown_fields)]
pub(crate) struct PreviewRequest {
    pub request: Request,
    pub page: u64,
    pub page_size: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub(crate) struct Context {
    pub codes: Vec<Label>,
    pub examples: Vec<Example>,
    pub excluded_examples: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[schema(as = AnnotationReport)]
pub(crate) struct Report {
    pub processed: u64,
    pub preserved: u64,
    pub skipped: u64,
    pub failed: u64,
    pub context: Uuid,
    pub diagnostics: Uuid,
}
pub(in crate::project) struct Run {
    pub db: Database,
    pub request: Request,
    pub context: Context,
    relation: Relation,
    row_type: String,
    total: u64,
    eligible: u64,
    skipped: u64,
    after: Option<String>,
    processed: u64,
    failed: u64,
}
pub(in crate::project) struct Batch {
    pub refs: Vec<String>,
    pub texts: Vec<String>,
}
pub(in crate::project) struct Preview {
    pub db: Database,
    pub request: PreviewRequest,
    pub context: Context,
    pub texts: Vec<String>,
    pub text_rows: Vec<usize>,
    batches: Vec<RecordBatch>,
    schema: Arc<Schema>,
    rows: usize,
    has_next: bool,
    row_refs: Vec<Option<String>>,
    stamp: changes::MutationStamp,
    relation: Relation,
}
fn fields(conn: &Connection, source: &ObjectTarget, names: &[&str]) -> Result<Relation> {
    let relation = source.resolve(conn)?.relation;
    let columns = mutations::columns(conn, &relation)?;
    for name in names {
        if !columns
            .iter()
            .any(|(column, ty)| column == name && ty == "VARCHAR")
        {
            return Err(Error::invalid(format!(
                "Column {name} must be a string column"
            )));
        }
    }
    Ok(relation)
}
impl Request {
    pub(in crate::project) fn validate(
        &self,
        conn: &Connection,
        tab: Uuid,
        writes: bool,
    ) -> Result<Relation> {
        if analyses::read_tab(conn, tab)?.kind != "annotation" {
            return Err(Error::invalid("This tab is not Annotation"));
        }
        let relation = fields(conn, &self.setup.source, &[&self.setup.document])?;
        if self.setup.codebook.is_none() {
            return Err(Error::invalid("Choose a Codebook"));
        }
        if writes {
            EditRequest::Manual {
                setup: self.setup.clone(),
            }
            .validate(conn)?;
            let is_table: bool = conn.query_row("SELECT count(*)=1 FROM duckdb_tables() WHERE database_name=current_database() AND schema_name=? AND table_name=?", params![relation.schema, relation.name], |r| r.get(0))?;
            if !is_table {
                return Err(Error::invalid(
                    "Materialize this View in place before running Annotation",
                ));
            }
            if self.setup.annotation.eq_ignore_ascii_case("rowid") {
                return Err(Error::invalid(
                    "The row identifier cannot be an annotation destination",
                ));
            }
        }
        Ok(relation)
    }
    pub(in crate::project) fn capture_context(&self, conn: &Connection) -> Result<Context> {
        let book = self
            .setup
            .codebook
            .as_ref()
            .ok_or_else(|| Error::invalid("Choose a Codebook"))?;
        let codes = read_codebook(conn, book)?
            .into_iter()
            .map(|c| Label {
                code: c.code,
                description: c.description,
            })
            .collect::<Vec<_>>();
        let mut context = Context {
            codes,
            examples: Vec::new(),
            excluded_examples: 0,
        };
        let Some(examples) = &self.examples else {
            return Ok(context);
        };
        if examples.per_code == 0 || examples.per_code > 10 {
            return Err(Error::invalid("Choose 1–10 examples per code"));
        }
        let relation = fields(conn, &examples.source, &[&examples.text, &examples.label])?;
        let text = query::quote(&examples.text);
        let label = trimmed(&query::quote(&examples.label));
        let usable_text = trimmed(&text);
        let codes = context
            .codes
            .iter()
            .map(|c| query::literal(&c.code))
            .collect::<Vec<_>>();
        let valid = if codes.is_empty() {
            "FALSE".into()
        } else {
            format!("{label} IN ({})", codes.join(","))
        };
        context.excluded_examples = conn.query_row(&format!("SELECT count(*) FROM {} WHERE {label} IS NOT NULL AND {label}<>'' AND NOT ({valid})",relation.sql()),[],|r|r.get(0))?;
        let order = match examples.selection {
            ExampleSelection::First => "position ASC".into(),
            ExampleSelection::Last => "position DESC".into(),
            ExampleSelection::Random => {
                format!("hash(position, {}) ASC, position ASC", examples.seed)
            }
        };
        // Duplicate texts remain distinct examples; original scan order breaks seeded ties.
        let sql = format!(
            "WITH source AS (SELECT row_number() OVER () AS position, {text} AS text, {label} AS label FROM {} WHERE {text} IS NOT NULL AND {usable_text}<>'' AND ({valid})), selected AS (SELECT *, row_number() OVER(PARTITION BY label ORDER BY {order}) AS rank FROM source) SELECT text,label FROM selected WHERE rank <= {} ORDER BY position",
            relation.sql(),
            examples.per_code
        );
        context.examples = conn
            .prepare(&sql)?
            .query_map([], |r| {
                Ok(Example {
                    text: r.get(0)?,
                    label: r.get(1)?,
                })
            })?
            .collect::<duckdb::Result<Vec<_>>>()?;
        Ok(context)
    }
}
fn eligible(request: &Request) -> String {
    let document = trimmed(&query::quote(&request.setup.document));
    let label = trimmed(&query::quote(&request.setup.annotation));
    let missing = match request.processing {
        Processing::All => "TRUE".into(),
        Processing::Missing => format!("({label} IS NULL OR {label}='')"),
    };
    format!("{document} IS NOT NULL AND {document}<>'' AND {missing}")
}
impl Run {
    pub(in crate::project) fn capture(
        mut db: Database,
        request: Request,
        tab: Uuid,
    ) -> Result<Self> {
        let relation = request.validate(&db.conn, tab, true)?;
        let row_type = mutations::columns(&db.conn, &relation)?
            .into_iter()
            .find(|(name, _)| name.eq_ignore_ascii_case("rowid"))
            .map(|(_, ty)| ty)
            .unwrap_or_else(|| "BIGINT".into());
        if !cell_edit::editable_type(&row_type) && row_type != "UUID" {
            return Err(Error::invalid(
                "The rowid column has an unsupported editing identifier type",
            ));
        }
        cell_edit::validate_identifiers(&db.conn, &relation)?;
        let tx = db.conn.transaction()?;
        let context = request.capture_context(&tx)?;
        let document = trimmed(&query::quote(&request.setup.document));
        let (total, eligible, skipped) = tx.query_row(&format!("SELECT count(*),count(*) FILTER(WHERE {}),count(*) FILTER(WHERE {document} IS NULL OR {document}='') FROM {}",eligible(&request),relation.sql()),[],|r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)))?;
        tx.commit()?;
        db.conn.execute_batch("CREATE TEMP TABLE annotation_predictions(row_ref VARCHAR PRIMARY KEY, label VARCHAR, failure VARCHAR)")?;
        Ok(Self {
            db,
            request,
            context,
            relation,
            row_type,
            total,
            eligible,
            skipped,
            after: None,
            processed: 0,
            failed: 0,
        })
    }
    pub(in crate::project) fn next(&mut self) -> Result<Batch> {
        check_cancellation(&self.db.cancellation)?;
        let limit = self.request.inference.batch_size * self.request.inference.concurrency;
        let after = self.after.as_ref().map_or_else(String::new, |value| {
            format!(
                " AND rowid > CAST({} AS {})",
                query::literal(value),
                self.row_type
            )
        });
        let sql = format!(
            "SELECT CAST(rowid AS VARCHAR),{} FROM {} WHERE {}{after} ORDER BY rowid LIMIT {limit}",
            query::quote(&self.request.setup.document),
            self.relation.sql(),
            eligible(&self.request)
        );
        let rows = self
            .db
            .conn
            .prepare(&sql)?
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<duckdb::Result<Vec<_>>>()?;
        if let Some((id, _)) = rows.last() {
            self.after = Some(id.clone());
        }
        let (refs, texts) = rows.into_iter().unzip();
        Ok(Batch { refs, texts })
    }
    pub(in crate::project) fn stage(
        &mut self,
        refs: Vec<String>,
        predictions: Vec<Prediction>,
    ) -> Result<()> {
        if refs.len() != predictions.len() {
            return Err(Error::new(
                "worker_failed",
                "Annotation lost prediction alignment",
            ));
        }
        let mut appender = self.db.conn.appender("annotation_predictions")?;
        for (row_ref, prediction) in refs.into_iter().zip(predictions) {
            check_cancellation(&self.db.cancellation)?;
            let (label, error) = match prediction {
                Prediction::Success { label } => {
                    self.processed += 1;
                    (label, None)
                }
                Prediction::Failed { error } => {
                    self.failed += 1;
                    (None, Some(serde_json::to_string(&error)?))
                }
            };
            appender.append_row(params![row_ref, label, error])?;
        }
        appender.flush()?;
        Ok(())
    }
    pub(in crate::project) fn fraction(&self) -> f64 {
        if self.eligible == 0 {
            1.0
        } else {
            (self.processed + self.failed) as f64 / self.eligible as f64
        }
    }
    pub(in crate::project) fn publish(mut self, tab: Uuid, id: Uuid) -> Result<analyses::Analysis> {
        check_cancellation(&self.db.cancellation)?;
        let context_id = Uuid::new_v4();
        let diagnostics_id = Uuid::new_v4();
        let report = Report {
            processed: self.processed,
            preserved: self.total - self.eligible - self.skipped,
            skipped: self.skipped,
            failed: self.failed,
            context: context_id,
            diagnostics: diagnostics_id,
        };
        let context = serde_json::to_vec(&self.context)?;
        self.db.publish_analysis_with_scope(analyses::AcceptedAnalysis {id,tab_id:tab,kind:"annotation"},Some(self.relation.clone()),|conn| {
            let label=query::quote(&self.request.setup.annotation);
            conn.execute_batch(&format!("UPDATE {} AS target SET {label}=predictions.label FROM annotation_predictions AS predictions WHERE predictions.failure IS NULL AND target.rowid=CAST(predictions.row_ref AS {}) AND CAST(target.rowid AS VARCHAR)=predictions.row_ref",self.relation.sql(),self.row_type))?;
            analyses::register_blob(conn,id,context_id,"inference_context","application/json",&context)?;
            // Diagnostics retain historical references only; live review never joins them to current rows.
            let diagnostics = analyses::artifact_table(diagnostics_id);
            conn.execute_batch(&format!("CREATE TABLE wordflow.{} AS SELECT row_ref, failure FROM annotation_predictions WHERE failure IS NOT NULL", query::quote(&diagnostics)))?;
            analyses::register_table(conn,id,diagnostics_id,"diagnostics")?;
            Ok(serde_json::to_value(report)?)
        })
    }
}
impl Preview {
    pub(in crate::project) fn capture(
        mut db: Database,
        request: PreviewRequest,
        tab: Uuid,
    ) -> Result<Self> {
        if request.page == 0 || ![10, 20, 50, 100].contains(&request.page_size) {
            return Err(Error::invalid("Choose a valid Preview page and page size"));
        }
        let relation = request.request.validate(&db.conn, tab, false)?;
        let stamp = db.changes.stamp(&relation);
        let offset = (request.page - 1)
            .checked_mul(request.page_size)
            .ok_or_else(|| Error::invalid("Preview page is too large"))?;
        let tx = db.conn.transaction()?;
        let context = request.request.capture_context(&tx)?;
        let is_table: bool = tx.query_row("SELECT count(*)=1 FROM duckdb_tables() WHERE database_name=current_database() AND schema_name=? AND table_name=?", params![relation.schema, relation.name], |r|r.get(0))?;
        let identity = if is_table {
            ", CAST(rowid AS VARCHAR)"
        } else {
            ""
        };
        let mut statement = tx.prepare(&format!(
            "SELECT *{identity} FROM {} LIMIT {} OFFSET {offset}",
            relation.sql(),
            request.page_size + 1
        ))?;
        let data = statement.query_arrow([])?;
        let raw_schema = data.get_schema();
        let field_count = raw_schema.fields().len() - usize::from(is_table);
        let projection = (0..field_count).collect::<Vec<_>>();
        let schema = raw_schema.project(&projection).map_err(arrow_error)?;
        let schema = Arc::new(
            arrow_metadata::Annotations::load(&tx, &relation)?
                .enrich(&schema, schema.fields().len())?,
        );
        let index = schema
            .index_of(&request.request.setup.document)
            .map_err(arrow_error)?;
        let mut batches = Vec::new();
        let mut texts = Vec::new();
        let mut text_rows = Vec::new();
        let mut rows = 0;
        let mut has_next = false;
        let mut row_refs = Vec::new();
        for batch in data {
            let available = (request.page_size as usize).saturating_sub(rows);
            has_next |= batch.num_rows() > available;
            let batch = batch.slice(0, batch.num_rows().min(available));
            if is_table {
                let identity = batch
                    .column(field_count)
                    .as_any()
                    .downcast_ref::<StringArray>()
                    .ok_or_else(|| Error::invalid("Unexpected row identifier representation"))?;
                row_refs.extend(identity.iter().map(|value| value.map(str::to_owned)));
            }
            let batch = batch.project(&projection).map_err(arrow_error)?;
            let column = batch
                .column(index)
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or_else(|| {
                    Error::invalid("Document text did not have the expected Arrow string type")
                })?;
            for i in 0..batch.num_rows() {
                if !column.is_null(i) && !column.value(i).trim().is_empty() {
                    text_rows.push(rows + i);
                    texts.push(column.value(i).into());
                }
            }
            rows += batch.num_rows();
            batches.push(arrow_metadata::enrich_batch(batch, schema.clone())?);
        }
        drop(statement);
        tx.commit()?;
        Ok(Self {
            db,
            request,
            context,
            texts,
            text_rows,
            batches,
            schema,
            rows,
            has_next,
            row_refs,
            stamp,
            relation,
        })
    }
    pub(in crate::project) fn finish(
        self,
        predictions: Vec<Prediction>,
    ) -> Result<tempfile::NamedTempFile> {
        check_cancellation(&self.db.cancellation)?;
        if predictions.len() != self.text_rows.len() {
            return Err(Error::new(
                "worker_failed",
                "Annotation lost prediction alignment",
            ));
        }
        let mut rows = vec![None; self.rows];
        for (index, prediction) in self.text_rows.into_iter().zip(predictions) {
            rows[index] = Some(prediction);
        }
        let mut metadata = self.schema.metadata().clone();
        metadata.insert(
            "wordflow:annotation-preview".into(),
            serde_json::to_string(&PreviewMetadata {
                predictions: rows,
                row_refs: self.row_refs,
                mutation_stamp: self.stamp,
                outdated: self.stamp != self.db.changes.stamp(&self.relation),
                has_next: self.has_next,
                page: self.request.page,
                skipped: self.rows - self.texts.len(),
                excluded_examples: self.context.excluded_examples,
            })?,
        );
        let schema = Arc::new(Schema::new_with_metadata(
            self.schema.fields().clone(),
            metadata,
        ));
        let mut file = tempfile::NamedTempFile::new()?;
        let mut writer = StreamWriter::try_new(file.as_file_mut(), &schema).map_err(arrow_error)?;
        for batch in self.batches {
            writer
                .write(&arrow_metadata::enrich_batch(batch, schema.clone())?)
                .map_err(arrow_error)?;
        }
        writer.finish().map_err(arrow_error)?;
        Ok(file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Project, Uuid, Request) {
        let mut project = Project::untitled().unwrap();
        project.database.conn.execute_batch("CREATE TABLE data.docs(rowid VARCHAR PRIMARY KEY,text VARCHAR,label VARCHAR,extra INTEGER CHECK(extra>0)); INSERT INTO data.docs VALUES ('01','same','old',1),('1','same',NULL,2),('2','', 'keep',3),('3',NULL,'keep',4),('4','no code','old',5); CREATE TABLE data.codes(code VARCHAR,description VARCHAR); INSERT INTO data.codes VALUES ('A','first'),('B','second'); INSERT INTO wordflow.nodes(table_name) VALUES ('docs'),('codes')").unwrap();
        let tab = project
            .database
            .create_analysis_tab(analyses::CreateTab {
                kind: "annotation".into(),
                name: None,
            })
            .unwrap()
            .id;
        let request = Request {
            setup: ManualSetup {
                source: "docs".into(),
                document: "text".into(),
                annotation: "label".into(),
                correction: None,
                codebook: Some(Codebook {
                    source: "codes".into(),
                    code: "code".into(),
                    description: "description".into(),
                }),
            },
            inference: Inference {
                provider: Uuid::new_v4(),
                model: "fixture".into(),
                prompt: "test".into(),
                temperature: None,
                reasoning: Default::default(),
                batch_size: 2,
                retries: 0,
                concurrency: 2,
            },
            examples: None,
            processing: Processing::All,
        };
        (project, tab, request)
    }
    #[test]
    fn bounded_batches_keep_typed_identifier_order_without_skipping_duplicates() {
        let (project, tab, mut request) = fixture();
        request.inference.batch_size = 1;
        request.inference.concurrency = 1;
        let mut run = Run::capture(
            project
                .database
                .connection(CancellationToken::new())
                .unwrap(),
            request,
            tab,
        )
        .unwrap();
        let mut ids = Vec::new();
        loop {
            let batch = run.next().unwrap();
            assert!(batch.refs.len() <= 1);
            if batch.refs.is_empty() {
                break;
            }
            ids.extend(batch.refs);
        }
        assert_eq!(ids, ["01", "1", "4"]);
    }
    #[test]
    #[ignore = "explicit local Annotation database benchmark"]
    fn annotation_database_benchmark() {
        let (mut project, tab, mut request) = fixture();
        project.database.conn.execute_batch("DELETE FROM data.docs; INSERT INTO data.docs SELECT 'row-'||lpad(i::VARCHAR, 8, '0'),repeat('Synthetic text. ',10),NULL,1 FROM range(100000) r(i)").unwrap();
        project.database.conn.execute_batch("ALTER TABLE data.docs ADD COLUMN reference VARCHAR; UPDATE data.docs SET reference=CASE WHEN CAST(right(rowid,1) AS INTEGER)%2=0 THEN 'A' ELSE 'B' END").unwrap();
        request.inference.batch_size = 100;
        request.inference.concurrency = 10;
        let started = std::time::Instant::now();
        let mut run = Run::capture(
            project
                .database
                .connection(CancellationToken::new())
                .unwrap(),
            request,
            tab,
        )
        .unwrap();
        let captured = started.elapsed();
        let id = run
            .db
            .begin_analysis_run(
                tab,
                "annotation",
                serde_json::to_value(&run.request).unwrap(),
            )
            .unwrap();
        let mut peak_batch = 0;
        loop {
            let batch = run.next().unwrap();
            if batch.refs.is_empty() {
                break;
            }
            peak_batch = peak_batch.max(batch.refs.len());
            let predictions = vec![
                Prediction::Success {
                    label: Some("A".into())
                };
                batch.refs.len()
            ];
            run.stage(batch.refs, predictions).unwrap();
        }
        let staged = started.elapsed();
        let report = run.publish(tab, id).unwrap();
        assert_eq!(report.result.unwrap().payload["processed"], 100000);
        let published = started.elapsed();
        let page = project
            .database
            .query_annotation(
                id,
                super::super::review::Query::Rows {
                    page: 1,
                    page_size: 10,
                    sorting: vec![],
                    review: Review {
                        compare: vec!["reference".into()],
                        changes: vec![],
                        filter: Some(RowFilter {
                            column: "reference".into(),
                            differs: true,
                            existence: Existence::Present,
                        }),
                    },
                    correction: None,
                },
            )
            .unwrap();
        let super::super::review::Output::Page(file) = page else {
            panic!("Expected an Arrow review page");
        };
        let reader =
            arrow_ipc::reader::StreamReader::try_new(file.reopen().unwrap(), None).unwrap();
        let summary: Value =
            serde_json::from_str(&reader.schema().metadata()["wordflow:annotation-review"])
                .unwrap();
        assert_eq!(summary["filtered_rows"], 50000);
        assert_eq!(summary["comparisons"][0]["included"], 100000);
        eprintln!(
            "Annotation 100000 rows: capture={captured:?}, through staging={staged:?}, published={published:?}, comparison/filter/page={:?}, largest text batch={peak_batch}",
            started.elapsed() - published
        );
    }
    #[test]
    fn run_stages_typed_references_and_publishes_labels_and_report_atomically() {
        let (project, tab, request) = fixture();
        let mut run = Run::capture(
            project
                .database
                .connection(CancellationToken::new())
                .unwrap(),
            request,
            tab,
        )
        .unwrap();
        let id = run
            .db
            .begin_analysis_run(
                tab,
                "annotation",
                serde_json::to_value(&run.request).unwrap(),
            )
            .unwrap();
        let batch = run.next().unwrap();
        assert_eq!(batch.refs, vec!["01", "1", "4"]);
        run.stage(
            batch.refs,
            vec![
                Prediction::Success {
                    label: Some("A".into()),
                },
                Prediction::Failed {
                    error: Error::invalid("bad row"),
                },
                Prediction::Success { label: None },
            ],
        )
        .unwrap();
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT label FROM data.docs WHERE rowid='01'", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap(),
            "old"
        );
        let analysis = run.publish(tab, id).unwrap();
        let report: Report = serde_json::from_value(analysis.result.unwrap().payload).unwrap();
        assert_eq!(
            (
                report.processed,
                report.failed,
                report.skipped,
                report.preserved
            ),
            (2, 1, 2, 0)
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT label FROM data.docs WHERE rowid='01'", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap(),
            "A"
        );
        assert!(
            project
                .database
                .conn
                .query_row(
                    "SELECT label IS NULL FROM data.docs WHERE rowid='4'",
                    [],
                    |r| r.get::<_, bool>(0)
                )
                .unwrap()
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT sum(extra) FROM data.docs", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            15
        );
    }
    #[test]
    fn missing_mode_preserves_nonblank_invalid_labels_and_clear_retains_labels() {
        let (mut project, tab, mut request) = fixture();
        request.processing = Processing::Missing;
        let mut run = Run::capture(
            project
                .database
                .connection(CancellationToken::new())
                .unwrap(),
            request,
            tab,
        )
        .unwrap();
        let id = run
            .db
            .begin_analysis_run(
                tab,
                "annotation",
                serde_json::to_value(&run.request).unwrap(),
            )
            .unwrap();
        let batch = run.next().unwrap();
        assert_eq!(batch.refs, vec!["1"]);
        run.stage(
            batch.refs,
            vec![Prediction::Success {
                label: Some("B".into()),
            }],
        )
        .unwrap();
        let report: Report =
            serde_json::from_value(run.publish(tab, id).unwrap().result.unwrap().payload).unwrap();
        assert_eq!(
            (report.processed, report.preserved, report.skipped),
            (1, 2, 2)
        );
        project.database.clear_analysis_tab(tab).unwrap();
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT label FROM data.docs WHERE rowid='1'", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap(),
            "B"
        );
        assert!(project.database.analysis(id).unwrap().result.is_none());
    }
    #[test]
    fn deleted_tab_and_constraint_failure_leave_every_label_unchanged() {
        for delete in [false, true] {
            let (mut project, tab, request) = fixture();
            let mut run = Run::capture(
                project
                    .database
                    .connection(CancellationToken::new())
                    .unwrap(),
                request,
                tab,
            )
            .unwrap();
            let id = run
                .db
                .begin_analysis_run(
                    tab,
                    "annotation",
                    serde_json::to_value(&run.request).unwrap(),
                )
                .unwrap();
            let batch = run.next().unwrap();
            run.stage(
                batch.refs,
                vec![
                    Prediction::Success {
                        label: Some("A".into())
                    };
                    3
                ],
            )
            .unwrap();
            if delete {
                project.database.delete_analysis_tab(tab).unwrap();
            } else {
                project.database.conn.execute_batch("DROP TABLE data.docs; CREATE TABLE data.docs(rowid VARCHAR PRIMARY KEY,text VARCHAR,label VARCHAR CHECK(label='old'),extra INTEGER); INSERT INTO data.docs VALUES ('01','same','old',1),('1','same',NULL,2),('4','no code','old',5)").unwrap();
            }
            assert!(run.publish(tab, id).is_err());
            assert_eq!(
                project
                    .database
                    .conn
                    .query_row("SELECT label FROM data.docs WHERE rowid='01'", [], |r| {
                        r.get::<_, String>(0)
                    })
                    .unwrap(),
                "old"
            );
            if !delete {
                assert!(project.database.analysis(id).unwrap().result.is_none());
            }
        }
    }
    #[test]
    fn preview_captures_one_page_with_aligned_identity_and_writes_no_analysis() {
        let (project, tab, mut request) = fixture();
        request.setup.annotation = String::new();
        let preview = Preview::capture(
            project
                .database
                .connection(CancellationToken::new())
                .unwrap(),
            PreviewRequest {
                request,
                page: 1,
                page_size: 10,
            },
            tab,
        )
        .unwrap();
        assert_eq!(preview.texts, vec!["same", "same", "no code"]);
        assert_eq!(
            preview.row_refs,
            vec![
                Some("01".into()),
                Some("1".into()),
                Some("2".into()),
                Some("3".into()),
                Some("4".into())
            ]
        );
        let file = preview
            .finish(vec![Prediction::Success { label: None }; 3])
            .unwrap();
        let reader =
            arrow_ipc::reader::StreamReader::try_new(file.reopen().unwrap(), None).unwrap();
        let metadata: Value =
            serde_json::from_str(&reader.schema().metadata()["wordflow:annotation-preview"])
                .unwrap();
        assert_eq!(metadata["skipped"], 2);
        assert_eq!(metadata["predictions"][0]["status"], "success");
        assert!(metadata["predictions"][2].is_null());
        assert!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .is_none()
        );
    }
}

#[derive(Serialize, utoipa::ToSchema)]
#[schema(as = AnnotationPreviewMetadata)]
pub(crate) struct PreviewMetadata {
    predictions: Vec<Option<Prediction>>,
    row_refs: Vec<Option<String>>,
    mutation_stamp: changes::MutationStamp,
    outdated: bool,
    has_next: bool,
    page: u64,
    skipped: usize,
    excluded_examples: u64,
}
