//! Native quotation extraction over typed retained documents. Preview never publishes artifacts.
use super::analyses::*;
use super::document_matches::*;
use super::*;
use ldaca_rs::quotation::QuotationExtractor;

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct QuotationRequest {
    pub input: DocumentInput,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct QuotationPreview {
    pub input: DocumentInput,
    pub page: u64,
    pub page_size: u64,
    pub sort: Option<DocumentSort>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub(crate) struct QuotationResultV1 {
    pub input: DocumentInput,
    pub columns: Vec<(String, String)>,
    pub documents: Uuid,
    pub matches: Uuid,
    pub projection: Uuid,
    pub document_count: u64,
    pub matching_documents: u64,
    pub match_count: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub processed_column: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct QuotationQuery {
    #[serde(default)]
    pub projection: Projection,
    pub page: u64,
    pub page_size: u64,
    pub sort: Option<SavedSort>,
    pub document_id: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct QuotationPublish {
    pub projection: Projection,
    pub name: String,
    pub metadata: Vec<String>,
    pub fields: Vec<String>,
}
const FIELDS: &[&str] = &[
    "speaker",
    "speaker_start_idx",
    "speaker_end_idx",
    "quote",
    "quote_start_idx",
    "quote_end_idx",
    "verb",
    "verb_start_idx",
    "verb_end_idx",
    "quote_type",
    "quote_token_count",
    "is_floating_quote",
    "quote_row_idx",
];
fn quote_error(error: impl std::fmt::Display) -> Error {
    Error::new("quotation_error", error.to_string())
}
fn check_tab(conn: &Connection, tab: Uuid) -> Result<()> {
    if read_tab(conn, tab)?.kind != "quotation" {
        return Err(Error::invalid("Select a Quotation tab"));
    }
    Ok(())
}
fn projection(documents: &str, matches: &str) -> String {
    format!("SELECT m.*,d.source FROM {matches} m JOIN {documents} d USING(document_id)")
}
fn live_projection(
    input: &DocumentInput,
    documents: &str,
    matches: &str,
    processed_column: &str,
    columns: &[(String, String)],
) -> String {
    let rows = live_document_rows(input, documents, processed_column, columns);
    format!(
        "SELECT s.document_id,m.* EXCLUDE(document_id),s.source,s.processed_id FROM ({rows}) s LEFT JOIN {matches} m ON m.document_id=s.processed_id"
    )
}
fn saved_projection(source: &QuotationResultV1) -> String {
    if let Some(column) = &source.processed_column {
        live_projection(
            &source.input,
            &format!("wordflow.{}", artifact_table(source.documents)),
            &format!("wordflow.{}", artifact_table(source.matches)),
            column,
            &source.columns,
        )
    } else {
        format!(
            "SELECT * FROM wordflow.{}",
            artifact_table(source.projection)
        )
    }
}
fn source_annotations(
    conn: &Connection,
    source: &QuotationResultV1,
) -> Result<arrow_metadata::Annotations> {
    if source.processed_column.is_some() {
        arrow_metadata::Annotations::load(
            conn,
            &Relation {
                schema: source
                    .input
                    .source
                    .schema
                    .clone()
                    .unwrap_or_else(|| "data".into()),
                name: source.input.source.name.clone(),
            },
        )
        .map(|a| a.prefixed("source"))
    } else {
        arrow_metadata::Annotations::load(
            conn,
            &Relation {
                schema: "wordflow".into(),
                name: artifact_table(source.projection),
            },
        )
    }
}
fn document_rows(sql: &str) -> String {
    let fields = FIELDS
        .iter()
        .map(|field| format!("{field} := {field}"))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "SELECT document_id,first(source) AS source,list(struct_pack({fields}) ORDER BY quote_row_idx) AS quotes FROM ({sql}) GROUP BY document_id"
    )
}
fn calculate(
    conn: &Connection,
    docs: &CapturedDocuments,
    limit: u64,
    extractor: &mut QuotationExtractor,
    cancellation: &CancellationToken,
) -> Result<(String, u64, u64)> {
    let matches = temporary_name();
    conn.execute_batch(&format!("CREATE TEMP TABLE {matches}(document_id UBIGINT,speaker VARCHAR,speaker_start_idx BIGINT,speaker_end_idx BIGINT,quote VARCHAR,quote_start_idx BIGINT,quote_end_idx BIGINT,verb VARCHAR,verb_start_idx BIGINT,verb_end_idx BIGINT,quote_type VARCHAR,quote_token_count BIGINT,is_floating_quote BOOLEAN,quote_row_idx BIGINT)"))?;
    let (mut after, mut count, mut documents) = (0, 0, 0);
    loop {
        check_cancellation(cancellation)?;
        let rows = document_batch(conn, &docs.name, &docs.input.column, after, limit)?;
        if rows.is_empty() {
            break;
        }
        let mut appender = conn.appender(&matches)?;
        for (id, text) in rows {
            check_cancellation(cancellation)?;
            after = id;
            let Some(text) = text.filter(|s| !s.trim().is_empty()) else {
                continue;
            };
            let quotes = extractor.extract(&text).map_err(quote_error)?;
            documents += u64::from(!quotes.is_empty());
            for quote in quotes {
                check_cancellation(cancellation)?;
                let (speaker, ss, se) = quote
                    .speaker
                    .map_or((None, None, None), |(v, s, e)| (Some(v), Some(s), Some(e)));
                let (verb, vs, ve) = quote
                    .verb
                    .map_or((None, None, None), |(v, s, e)| (Some(v), Some(s), Some(e)));
                appender.append_row(params![
                    id,
                    speaker,
                    ss,
                    se,
                    quote.quote.0,
                    quote.quote.1,
                    quote.quote.2,
                    verb,
                    vs,
                    ve,
                    quote.kind,
                    quote.tokens,
                    quote.floating,
                    quote.index
                ])?;
                count += 1;
            }
        }
        appender.flush()?;
    }
    Ok((matches, count, documents))
}
fn manifest(conn: &Connection, id: Uuid) -> Result<QuotationResultV1> {
    let analysis = read_analysis(conn, id)?;
    let mut result: QuotationResultV1 =
        serde_json::from_value(analysis.output("quotation")?.clone())?;
    for artifact in [result.documents, result.matches, result.projection] {
        artifact_relation(conn, id, artifact)?;
    }
    if result.processed_column.is_some() {
        let request: QuotationRequest = serde_json::from_value(analysis.request)?;
        result.input = request.input;
        let relation = Relation {
            schema: result
                .input
                .source
                .schema
                .clone()
                .unwrap_or_else(|| "data".into()),
            name: result.input.source.name.clone(),
        };
        conn.prepare(&format!(
            "SELECT {} FROM {} LIMIT 0",
            query::quote(&result.input.column),
            relation.sql()
        ))?;
        result.columns = mutations::columns(conn, &relation)?;
    }
    Ok(result)
}
impl Database {
    pub(super) fn validate_quotation_input(&self, tab: Uuid, input: &DocumentInput) -> Result<()> {
        check_tab(&self.conn, tab)?;
        let source = input.source.resolve(&self.conn)?;
        mutations::column_name(&self.conn, &source.relation, &input.column)?;
        Ok(())
    }

    pub(super) fn quotation_preview(
        &mut self,
        tab: Uuid,
        request: QuotationPreview,
        mut extractor: QuotationExtractor,
    ) -> Result<DocumentPage> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        check_tab(&self.conn, tab)?;
        let docs = capture_documents(
            &self.conn,
            &request.input,
            Some(DocumentSelection {
                page: request.page,
                size: request.page_size,
                sort: request
                    .sort
                    .as_ref()
                    .map(|s| (s.column.as_str(), s.descending)),
            }),
        )?;
        let (matches, match_count, matching_documents) = calculate(
            &self.conn,
            &docs,
            request.page_size,
            &mut extractor,
            &self.cancellation,
        )?;
        let sql = format!(
            "{} ORDER BY document_id",
            document_rows(&projection(&docs.name, &matches))
        );
        let file = arrow_page(&self.conn, &sql, &[], &docs.metadata, &self.cancellation)?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(DocumentPage {
            file,
            total_rows: matching_documents,
            has_next: docs.count > request.page_size,
            document_count: docs.count.min(request.page_size),
            match_count,
        })
    }
    pub(super) fn run_quotation(
        &mut self,
        tab: Uuid,
        id: Uuid,
        request: QuotationRequest,
        mut extractor: QuotationExtractor,
        mut progress: impl FnMut(&str),
    ) -> Result<Analysis> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        check_tab(&self.conn, tab)?;
        let mut docs = capture_documents(&self.conn, &request.input, None)?;
        distinct_documents(&self.conn, &mut docs)?;
        progress("Extracting quotations");
        let (temporary_matches, _, _) = calculate(
            &self.conn,
            &docs,
            docs.count,
            &mut extractor,
            &self.cancellation,
        )?;
        self.conn.execute_batch("COMMIT")?;
        check_cancellation(&self.cancellation)?;
        progress("Saving results");
        self.publish_analysis_version(
            AcceptedAnalysis {
                id,
                tab_id: tab,
                kind: "quotation",
            },
            2,
            None,
            move |conn| {
                let documents = Uuid::new_v4();
                let matches = Uuid::new_v4();
                let view = Uuid::new_v4();
                let documents_sql = format!("wordflow.{}", artifact_table(documents));
                let matches_sql = format!("wordflow.{}", artifact_table(matches));
                conn.execute_batch(&format!(
                    "CREATE TABLE {documents_sql} AS SELECT * FROM {captured}
                       ;
                     CREATE TABLE {matches_sql} AS SELECT * FROM {temporary_matches};
                     CREATE VIEW wordflow.{view} AS {projection}",
                    captured = docs.name,
                    view = artifact_table(view),
                    projection = projection(&documents_sql,&matches_sql),
                ))?;
                for (artifact, name) in [
                    (documents, "documents"),
                    (matches, "matches"),
                    (view, "projection"),
                ] {
                    register_table(conn, id, artifact, name)?;
                }
                docs.metadata.source_columns(std::slice::from_ref(&docs.input.column)).prefixed("source").store(conn,&Relation {schema:"wordflow".into(),name:artifact_table(documents)})?;
                docs.metadata.source_columns(std::slice::from_ref(&docs.input.column)).prefixed("source").store(conn,&Relation {schema:"wordflow".into(),name:artifact_table(view)})?;
                let joined = live_projection(&docs.input,&documents_sql,&matches_sql,&docs.input.column,&docs.columns);
                let (document_count, matching_documents, match_count) = conn.query_row(&format!("SELECT count(DISTINCT document_id),count(DISTINCT document_id) FILTER(WHERE quote_row_idx IS NOT NULL),count(quote_row_idx) FROM ({joined})"), [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)))?;
                let processed_column = Some(docs.input.column.clone());
                let result = QuotationResultV1 {
                    input: docs.input,
                    columns: docs.columns,
                    documents,
                    matches,
                    projection: view,
                    document_count,
                    matching_documents,
                    match_count,
                    processed_column,
                };
                Ok(serde_json::to_value(result)?)
            },
        )
    }

    pub(super) fn quotation_page(
        &mut self,
        id: Uuid,
        request: QuotationQuery,
    ) -> Result<DocumentPage> {
        self.quotation_rows(id, request, false)
    }
    pub(super) fn quotation_rows(
        &mut self,
        id: Uuid,
        request: QuotationQuery,
        all: bool,
    ) -> Result<DocumentPage> {
        let offset = page_offset(request.page, request.page_size)?;
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let source = manifest(&self.conn, id)?;
        let mut parameters = Vec::new();
        let mut sql = format!(
            "SELECT * FROM ({}) WHERE quote_row_idx IS NOT NULL",
            saved_projection(&source)
        );
        if let Some(id) = request.document_id {
            parameters.push(SqlValue::UBigInt(
                id.parse()
                    .map_err(|_| Error::invalid("Invalid document ID"))?,
            ));
            sql.push_str(" AND document_id=?");
        }
        let (match_count, document_count): (u64, u64) = self.conn.query_row(
            &format!("SELECT count(*),count(DISTINCT document_id) FROM ({sql})"),
            params_from_iter(parameters.iter()),
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let order = if let Some(sort) = request.sort {
            let field = if sort.metadata {
                let field = source
                    .columns
                    .iter()
                    .find(|(name, _)| name.eq_ignore_ascii_case(&sort.field))
                    .ok_or_else(|| Error::invalid("Unknown metadata field"))?;
                format!("source.{}", query::quote(&field.0))
            } else {
                if request.projection == Projection::Documents
                    || !FIELDS.contains(&sort.field.as_str())
                {
                    return Err(Error::invalid("Unsupported Quotation sort"));
                }
                query::quote(&sort.field)
            };
            format!(
                "{field} {} NULLS LAST,",
                if sort.descending { "DESC" } else { "ASC" }
            )
        } else {
            String::new()
        };
        let (sql, total_rows) = if request.projection == Projection::Documents {
            (document_rows(&sql), document_count)
        } else {
            (sql, match_count)
        };
        let sql = format!(
            "SELECT * FROM ({sql}) ORDER BY {order} document_id{}{}",
            if request.projection == Projection::Matches {
                ",quote_row_idx"
            } else {
                ""
            },
            if all {
                String::new()
            } else {
                format!(" LIMIT {} OFFSET {offset}", request.page_size)
            }
        );
        let file = arrow_page(
            &self.conn,
            &sql,
            &parameters,
            &source_annotations(&self.conn, &source)?,
            &self.cancellation,
        )?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(DocumentPage {
            file,
            total_rows,
            has_next: offset.saturating_add(request.page_size) < total_rows,
            document_count,
            match_count,
        })
    }
    pub(super) fn publish_quotation(
        &mut self,
        id: Uuid,
        request: QuotationPublish,
    ) -> Result<ObjectTarget> {
        let tx = self.conn.transaction()?;
        let source = manifest(&tx, id)?;
        if request.name.trim().is_empty() || request.name.contains('\0') {
            return Err(Error::invalid("Enter an output name"));
        }
        let target = Relation {
            schema: "data".into(),
            name: request.name.trim().into(),
        };
        let reserved = FIELDS
            .iter()
            .map(|field| format!("QUOTE_{field}"))
            .chain(std::iter::once("QUOTE_extraction".into()))
            .collect::<Vec<_>>();
        let (mut names, mut fields) = publication_fields(
            &source.columns,
            &source.input.column,
            &request.metadata,
            &reserved,
        )?;
        let projection = format!(
            "SELECT * FROM wordflow.{}",
            artifact_table(source.projection)
        );
        let rows = if request.projection == Projection::Documents {
            let output = generated_name(&mut names, "QUOTE_extraction");
            fields.push(format!("QUOTE_extraction AS {}", query::quote(&output)));
            format!(
                "SELECT document_id,first(source) AS source,string_agg(quote,chr(10) ORDER BY quote_row_idx) AS QUOTE_extraction FROM ({projection}) GROUP BY document_id"
            )
        } else {
            for field in &request.fields {
                if !FIELDS.contains(&field.as_str()) {
                    return Err(Error::invalid("Unknown quotation field"));
                }
                let output = generated_name(&mut names, &format!("QUOTE_{field}"));
                fields.push(format!(
                    "{} AS {}",
                    query::quote(field),
                    query::quote(&output)
                ));
            }
            projection
        };
        if let Some(column) = &source.processed_column {
            let documents =
                copy_publication_relation(&tx, &artifact_relation(&tx, id, source.documents)?)?;
            let matches =
                copy_publication_relation(&tx, &artifact_relation(&tx, id, source.matches)?)?;
            let publication = PublicationSource::selected(
                &tx,
                &source.input,
                std::iter::once(source.input.column.clone())
                    .chain(request.metadata.iter().cloned())
                    .collect(),
            )?;
            let joined = live_projection(
                &source.input,
                &documents.sql(),
                &matches.sql(),
                column,
                &publication.columns(&source.columns),
            );
            publish_live_view(
                &tx,
                &target,
                vec![documents, matches],
                publication,
                &joined,
                |join| {
                    let rows = if request.projection == Projection::Documents {
                        format!(
                            "SELECT document_id,first(source) AS source,coalesce(string_agg(quote,chr(10) ORDER BY quote_row_idx),'') AS QUOTE_extraction FROM {} GROUP BY document_id",
                            join.sql()
                        )
                    } else {
                        format!("SELECT * FROM {}", join.sql())
                    };
                    format!(
                        "SELECT {} FROM ({rows}) ORDER BY document_id{}",
                        fields.join(","),
                        if request.projection == Projection::Matches {
                            ",quote_row_idx"
                        } else {
                            ""
                        }
                    )
                },
            )?;
        } else {
            tx.execute_batch(&format!(
                "CREATE TABLE {} AS SELECT {} FROM ({rows}) ORDER BY document_id{}",
                target.sql(),
                fields.join(","),
                if request.projection == Projection::Matches {
                    ",quote_row_idx"
                } else {
                    ""
                }
            ))?;
        }
        tx.execute(
            "INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?,?)",
            params![target.name, source.input.column],
        )?;
        let selected_columns = source
            .columns
            .iter()
            .map(|(name, _)| name)
            .filter(|name| names.contains(&name.to_ascii_lowercase()))
            .cloned()
            .collect::<Vec<_>>();
        source_annotations(&tx, &source)?
            .source_columns(&selected_columns)
            .store(&tx, &target)?;
        if source
            .input
            .source
            .schema
            .as_deref()
            .unwrap_or("data")
            .eq_ignore_ascii_case("data")
        {
            tx.execute("INSERT INTO wordflow.edges(source_name,target_name) SELECT table_name,? FROM wordflow.nodes WHERE lower(table_name)=lower(?) AND table_name<>? ON CONFLICT DO NOTHING",params![target.name,source.input.source.name,target.name])?;
        }
        let mut scope = ChangeScope::resource(Resource::Graph);
        if source.processed_column.is_some() {
            scope.resources.push(Resource::Project);
        }
        scope.objects.push(target.clone());
        PendingChange::new(&tx, scope, &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(ObjectTarget {
            schema: Some(target.schema),
            name: target.name,
        })
    }
}

pub(super) async fn prepare_extractor(
    client: reqwest::Client,
    cancellation: CancellationToken,
    path: PathBuf,
) -> Result<QuotationExtractor> {
    use ldaca_rs::quotation::{MODEL_URL, is_pinned_model};
    let existing = match tokio::fs::read(&path).await {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    let bytes = if let Some(bytes) = existing.filter(|bytes| is_pinned_model(bytes)) {
        bytes
    } else {
        let mut response = tokio::select! {_=cancellation.cancelled()=>return Err(Error::new("cancelled","Quotation preparation cancelled")),response=client.get(MODEL_URL).timeout(std::time::Duration::from_secs(120)).send()=>response.map_err(quote_error)?.error_for_status().map_err(quote_error)?};
        let mut bytes = Vec::new();
        loop {
            let chunk = tokio::select! {_=cancellation.cancelled()=>return Err(Error::new("cancelled","Quotation preparation cancelled")),chunk=response.chunk()=>chunk.map_err(quote_error)?};
            let Some(chunk) = chunk else { break };
            if bytes.len() + chunk.len() > 32 * 1024 * 1024 {
                return Err(Error::invalid("Quotation model exceeds its size limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        if !is_pinned_model(&bytes) {
            return Err(Error::invalid("Quotation model checksum mismatch"));
        }
        let copy = bytes.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            use std::io::Write;
            let parent = path
                .parent()
                .ok_or_else(|| Error::invalid("Invalid model path"))?;
            std::fs::create_dir_all(parent)?;
            let mut file = tempfile::NamedTempFile::new_in(parent)?;
            file.write_all(&copy)?;
            file.as_file().sync_all()?;
            file.persist(&path).map_err(|e| Error::from(e.error))?;
            Ok(())
        })
        .await??;
        bytes
    };
    check_cancellation(&cancellation)?;
    tokio::task::spawn_blocking(move || QuotationExtractor::from_bytes(&bytes).map_err(quote_error))
        .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    impl Database {
        fn test_quotation(
            &mut self,
            tab: Uuid,
            request: QuotationRequest,
            extractor: QuotationExtractor,
            progress: impl FnMut(&str),
        ) -> Result<Analysis> {
            let id = self.begin_analysis_run(tab, "quotation", serde_json::to_value(&request)?)?;
            self.run_quotation(tab, id, request, extractor, progress)
        }
        fn historical_quotation_v1(
            &mut self,
            tab: Uuid,
            request: QuotationRequest,
            mut extractor: QuotationExtractor,
            _progress: impl FnMut(&str),
        ) -> Result<Analysis> {
            let id = self.begin_analysis_run(tab, "quotation", serde_json::to_value(&request)?)?;
            let docs = capture_documents(&self.conn, &request.input, None)?;
            let (temporary_matches, match_count, matching_documents) = calculate(
                &self.conn,
                &docs,
                docs.count,
                &mut extractor,
                &self.cancellation,
            )?;
            self.publish_analysis(AcceptedAnalysis {id,tab_id:tab,kind:"quotation"},|conn| {
                let documents=Uuid::new_v4(); let matches=Uuid::new_v4(); let view=Uuid::new_v4();
                let documents_sql=format!("wordflow.{}",artifact_table(documents));
                let matches_sql=format!("wordflow.{}",artifact_table(matches));
                conn.execute_batch(&format!("CREATE TABLE {documents_sql} AS SELECT * FROM {} WHERE document_id IN(SELECT document_id FROM {temporary_matches}); CREATE TABLE {matches_sql} AS SELECT * FROM {temporary_matches}; CREATE VIEW wordflow.{} AS {}",docs.name,artifact_table(view),projection(&documents_sql,&matches_sql)))?;
                for (artifact,name) in [(documents,"documents"),(matches,"matches"),(view,"projection")] { register_table(conn,id,artifact,name)?; }
                for artifact in [documents,view] { docs.metadata.store(conn,&Relation {schema:"wordflow".into(),name:artifact_table(artifact)})?; }
                Ok(serde_json::to_value(QuotationResultV1 {input:docs.input,columns:docs.columns,documents,matches,projection:view,document_count:docs.count,matching_documents,match_count,processed_column:None})?)
            })
        }
    }

    const TEXT: &str = "😀 Alice said, \"The project will finish tomorrow morning.\"";
    fn extractor() -> QuotationExtractor {
        let path = std::env::var("WORDFLOW_TEST_UDPIPE_MODEL")
            .expect("provision the pinned model for this test");
        let bytes = std::fs::read(path).unwrap();
        assert!(ldaca_rs::quotation::is_pinned_model(&bytes));
        QuotationExtractor::from_bytes(&bytes).unwrap()
    }
    fn setup() -> (Project, Uuid, QuotationRequest) {
        let mut project = Project::untitled().unwrap();
        project.database.conn.execute_batch("CREATE TABLE docs(text VARCHAR, tags INTEGER[], document_id VARCHAR, recorded DATE DEFAULT DATE '2026-09-21'); INSERT INTO wordflow.nodes(table_name) VALUES ('docs')").unwrap();
        for (text, id) in [
            (Some(TEXT), "first"),
            (None, "null"),
            (Some("No quotation here."), "none"),
            (Some(TEXT), "duplicate"),
        ] {
            project
                .database
                .conn
                .execute(
                    "INSERT INTO docs(text,tags,document_id) VALUES (?,[1,2],?)",
                    params![text, id],
                )
                .unwrap();
        }
        let tab = project
            .database
            .create_analysis_tab(CreateTab {
                kind: "quotation".into(),
                name: None,
            })
            .unwrap();
        (
            project,
            tab.id,
            QuotationRequest {
                input: DocumentInput {
                    source: "docs".into(),
                    column: "text".into(),
                },
            },
        )
    }
    fn query(projection: Projection) -> QuotationQuery {
        QuotationQuery {
            projection,
            page: 1,
            page_size: 20,
            sort: None,
            document_id: None,
        }
    }
    #[test]
    fn quotation_tabs_are_numbered_without_registration_or_artifacts() {
        let (mut project, tab, _) = setup();
        assert_eq!(project.database.analysis_tab(tab).unwrap().name, "QT-1");
        let second = project
            .database
            .create_analysis_tab(CreateTab {
                kind: "quotation".into(),
                name: None,
            })
            .unwrap();
        assert_eq!(second.name, "QT-2");
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT count(*) FROM wordflow.artifacts", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    #[ignore = "requires explicitly provisioned WORDFLOW_TEST_UDPIPE_MODEL"]
    fn live_quotation_checks_empty_texts_and_publishes_independent_current_source_views() {
        let (mut p, tab, request) = setup();
        let analysis = p
            .database
            .test_quotation(tab, request, extractor(), |_| {})
            .unwrap();
        assert_eq!(analysis.result.as_ref().unwrap().version, 2);
        let result: QuotationResultV1 =
            serde_json::from_value(analysis.result.unwrap().payload).unwrap();
        assert_eq!(
            p.database
                .conn
                .query_row(
                    &format!(
                        "SELECT count(*) FROM wordflow.{}",
                        artifact_table(result.documents)
                    ),
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            2
        );
        let page = p
            .database
            .quotation_page(analysis.id, query(Projection::Documents))
            .unwrap();
        assert_eq!(page.document_count, 2);
        p.database
            .publish_quotation(
                analysis.id,
                QuotationPublish {
                    name: "live_quotes".into(),
                    projection: Projection::Documents,
                    metadata: vec!["tags".into()],
                    fields: vec![],
                },
            )
            .unwrap();
        assert_eq!(
            p.database
                .conn
                .query_row("SELECT count(*) FROM data.live_quotes", [], |r| r
                    .get::<_, u64>(0))
                .unwrap(),
            3
        );
        assert_eq!(
            p.database
                .conn
                .query_row(
                    "SELECT QUOTE_extraction FROM data.live_quotes WHERE text='No quotation here.'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            ""
        );
        p.database.clear_analysis_tab(tab).unwrap();
        p.database.conn.execute("INSERT INTO data.docs(text,tags,document_id) VALUES (?,[3],'later'),('unchecked',[4],'new')",[TEXT]).unwrap();
        assert_eq!(
            p.database
                .conn
                .query_row("SELECT count(*) FROM data.live_quotes", [], |r| r
                    .get::<_, u64>(0))
                .unwrap(),
            4
        );
        p.database
            .conn
            .execute_batch("UPDATE data.docs SET tags=[9] WHERE document_id='none'")
            .unwrap();
        assert_eq!(
            p.database
                .conn
                .query_row(
                    "SELECT count(*) FROM data.live_quotes WHERE tags=[9]",
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            1
        );
    }
    #[test]
    #[ignore = "requires explicitly provisioned WORDFLOW_TEST_UDPIPE_MODEL"]
    fn quotation_preview_pages_and_saved_typed_results_survive_sources() {
        let (mut project, tab, request) = setup();
        let page = project
            .database
            .quotation_preview(
                tab,
                QuotationPreview {
                    input: request.input.clone(),
                    page: 1,
                    page_size: 1,
                    sort: None,
                },
                extractor(),
            )
            .unwrap();
        assert_eq!(page.document_count, 1);
        assert!(page.has_next);
        assert!(page.match_count > 0);
        assert!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .as_ref()
                .filter(|a| a.has_result)
                .map(|a| a.id)
                .is_none()
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT count(*) FROM wordflow.artifacts", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        let empty = project
            .database
            .quotation_preview(
                tab,
                QuotationPreview {
                    input: request.input.clone(),
                    page: 2,
                    page_size: 1,
                    sort: None,
                },
                extractor(),
            )
            .unwrap();
        assert_eq!(empty.match_count, 0);
        assert!(empty.has_next);
        let first = project
            .database
            .historical_quotation_v1(tab, request.clone(), extractor(), |_| {})
            .unwrap();
        let result = project
            .database
            .historical_quotation_v1(tab, request, extractor(), |_| {})
            .unwrap();
        assert!(project.database.analysis(first.id).is_err());
        let manifest: QuotationResultV1 =
            serde_json::from_value(result.result.clone().unwrap().payload).unwrap();
        assert_eq!(manifest.document_count, 4);
        assert_eq!(manifest.matching_documents, 2);
        project
            .database
            .conn
            .execute_batch("DROP TABLE docs")
            .unwrap();
        let matches = project
            .database
            .quotation_page(result.id, query(Projection::Matches))
            .unwrap();
        assert_eq!(matches.document_count, 2);
        assert!(matches.match_count >= 2);
        let (text, start, end): (String, i64, i64) = project
            .database
            .conn
            .query_row(
                &format!(
                    "SELECT quote,quote_start_idx,quote_end_idx FROM wordflow.{} LIMIT 1",
                    artifact_table(manifest.matches)
                ),
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            TEXT.chars()
                .skip(start as usize)
                .take((end - start) as usize)
                .collect::<String>(),
            text
        );
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Quotes saved 😀.wfpj");
        project.save_as(&path).unwrap();
        drop(project);
        let mut project = Project::open(&path).unwrap();
        let published = project
            .database
            .publish_quotation(
                result.id,
                QuotationPublish {
                    projection: Projection::Documents,
                    name: "quote documents".into(),
                    metadata: vec!["tags".into(), "document_id".into(), "recorded".into()],
                    fields: vec![],
                },
            )
            .unwrap();
        assert_eq!(
            project
                .database
                .conn
                .query_row(
                    &format!(
                        "SELECT count(*) FROM {}",
                        published
                            .resolve(&project.database.conn)
                            .unwrap()
                            .relation
                            .sql()
                    ),
                    [],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            2
        );
        assert_eq!(
            mutations::columns(
                &project.database.conn,
                &published.resolve(&project.database.conn).unwrap().relation
            )
            .unwrap()[1]
                .1,
            "INTEGER[]"
        );
        assert_eq!(
            mutations::columns(
                &project.database.conn,
                &published.resolve(&project.database.conn).unwrap().relation
            )
            .unwrap()[3]
                .1,
            "DATE"
        );
        assert!(
            project
                .database
                .publish_quotation(
                    result.id,
                    QuotationPublish {
                        projection: Projection::Matches,
                        name: "quote documents".into(),
                        metadata: vec![],
                        fields: vec!["quote".into()]
                    }
                )
                .is_err()
        );
        project.database.clear_analysis_tab(tab).unwrap();
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT count(*) FROM wordflow.artifacts", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT count(*) FROM \"quote documents\"", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }
    #[test]
    #[ignore = "requires explicitly provisioned WORDFLOW_TEST_UDPIPE_MODEL"]
    fn quotation_empty_results_keep_typed_schema() {
        let (mut project, tab, request) = setup();
        project
            .database
            .conn
            .execute("DELETE FROM docs", [])
            .unwrap();
        let result = project
            .database
            .test_quotation(tab, request, extractor(), |_| {})
            .unwrap();
        let page = project
            .database
            .quotation_page(result.id, query(Projection::Documents))
            .unwrap();
        assert_eq!(
            (page.total_rows, page.document_count, page.match_count),
            (0, 0, 0)
        );
        assert!(!page.has_next);
        let reader =
            arrow_ipc::reader::StreamReader::try_new(page.file.reopen().unwrap(), None).unwrap();
        assert_eq!(reader.schema().fields().len(), 3);
        assert_eq!(reader.count(), 0);
        project
            .database
            .publish_quotation(
                result.id,
                QuotationPublish {
                    projection: Projection::Matches,
                    name: "empty quotes".into(),
                    metadata: vec!["recorded".into()],
                    fields: vec!["quote".into()],
                },
            )
            .unwrap();
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT count(*) FROM \"empty quotes\"", [], |row| row
                    .get::<_, u64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    #[ignore = "requires explicitly provisioned WORDFLOW_TEST_UDPIPE_MODEL"]
    fn quotation_cancellation_keeps_new_request_without_output() {
        let (mut project, tab, request) = setup();
        let first = project
            .database
            .test_quotation(tab, request.clone(), extractor(), |_| {})
            .unwrap();
        let cancellation = project.database.cancellation.clone();
        let error = project
            .database
            .test_quotation(tab, request, extractor(), |stage| {
                if stage == "Extracting quotations" {
                    cancellation.cancel();
                }
            });
        assert!(error.is_err());
        project.database.conn.execute_batch("ROLLBACK").unwrap();
        let pending = project
            .database
            .analysis_tab(tab)
            .unwrap()
            .analysis
            .unwrap();
        assert_ne!(pending.id, first.id);
        assert!(!pending.has_result);
        assert_eq!(pending.request, first.request);
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT count(*) FROM wordflow.artifacts", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
