//! Native document matching shared by transient previews and immutable saved results.
mod queries;
use super::analyses::*;
use super::document_matches::*;
use super::*;
use ldaca_rs::text::{
    Concordance, ConcordanceMatch, ConcordanceOptions, TokenConcordance, TokenizeOptions, Tokenizer,
};
pub(crate) use queries::*;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SearchMode {
    #[default]
    Text,
    Tokens,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct ConcordanceSearch {
    pub mode: SearchMode,
    pub query: String,
    pub whole_word: bool,
    pub regex: bool,
    pub case_sensitive: bool,
    pub ignore_punctuation: bool,
    pub left_context: usize,
    pub right_context: usize,
}
impl Default for ConcordanceSearch {
    fn default() -> Self {
        Self {
            mode: SearchMode::Text,
            query: String::new(),
            whole_word: true,
            regex: false,
            case_sensitive: false,
            ignore_punctuation: true,
            left_context: 10,
            right_context: 10,
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConcordanceInput {
    pub source: ObjectTarget,
    pub column: String,
    pub tokenizer: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConcordanceRequest {
    pub inputs: Vec<ConcordanceInput>,
    pub search: ConcordanceSearch,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ConcordancePreview {
    pub input: ConcordanceInput,
    pub search: ConcordanceSearch,
    pub page: u64,
    pub page_size: u64,
    pub sort: Option<DocumentSort>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub(crate) struct ConcordanceCorpus {
    pub input: ConcordanceInput,
    pub columns: Vec<(String, String)>,
    pub documents: Uuid,
    pub matches: Uuid,
    pub projection: Uuid,
    pub document_count: u64,
    pub matching_documents: u64,
    pub match_count: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub(crate) struct ConcordanceResultV1 {
    pub corpora: Vec<ConcordanceCorpus>,
}

pub(crate) enum DocumentMatcher {
    Text(Concordance),
    Tokens(TokenConcordance, Tokenizer),
}
impl DocumentMatcher {
    pub(crate) fn prepare(search: &ConcordanceSearch, input: &ConcordanceInput) -> Result<Self> {
        if search.query.trim().is_empty() || search.left_context > 50 || search.right_context > 50 {
            return Err(Error::invalid(
                "Enter a query and context lengths between 0 and 50",
            ));
        }
        let options = ConcordanceOptions {
            left_tokens: search.left_context,
            right_tokens: search.right_context,
            regex: search.regex,
            case_sensitive: search.case_sensitive,
            ignore_punctuation: search.ignore_punctuation,
        };
        if search.mode == SearchMode::Tokens {
            if search.regex {
                return Err(Error::invalid(
                    "Regular expressions are available in Text mode",
                ));
            }
            let tokenizer = Tokenizer::load(
                input
                    .tokenizer
                    .as_deref()
                    .ok_or_else(|| Error::invalid("Select a tokenizer"))?,
            )
            .map_err(matching_error)?;
            Ok(Self::Tokens(
                TokenConcordance::new(&search.query, options),
                tokenizer,
            ))
        } else {
            let matcher = if search.whole_word && search.regex {
                Concordance::new(&format!(r"\b(?:{})\b", search.query), options)
            } else if search.whole_word {
                Concordance::literal_whole_word(&search.query, options)
            } else {
                Concordance::new(&search.query, options)
            }
            .map_err(matching_error)?;
            Ok(Self::Text(matcher))
        }
    }
    fn find(&self, text: &str) -> Result<Vec<ConcordanceMatch>> {
        match self {
            Self::Text(matcher) => matcher.find(text).map_err(matching_error),
            Self::Tokens(matcher, tokenizer) => {
                let tokens = tokenizer
                    .tokenize(
                        text,
                        TokenizeOptions {
                            lowercase: false,
                            remove_punctuation: true,
                        },
                    )
                    .map_err(matching_error)?;
                matcher.find(text, &tokens).map_err(matching_error)
            }
        }
    }
}
fn matching_error(error: impl std::fmt::Display) -> Error {
    Error::new("concordance_error", error.to_string())
}
fn tab_check(conn: &Connection, id: Uuid) -> Result<()> {
    if read_tab(conn, id)?.kind != "concordance" {
        return Err(Error::invalid("Analysis tab is not a Concordance tab"));
    }
    Ok(())
}
struct CapturedSource {
    documents: String,
    matches: String,
    columns: Vec<(String, String)>,
    metadata: arrow_metadata::Annotations,
    input: ConcordanceInput,
    document_count: u64,
    match_count: u64,
    matching_documents: u64,
}
impl CapturedSource {
    fn capture(
        conn: &Connection,
        input: &ConcordanceInput,
        page: Option<&ConcordancePreview>,
    ) -> Result<Self> {
        let captured = capture_documents(
            conn,
            &DocumentInput {
                source: input.source.clone(),
                column: input.column.clone(),
            },
            page.map(|p| DocumentSelection {
                page: p.page,
                size: p.page_size,
                sort: p.sort.as_ref().map(|s| (s.column.as_str(), s.descending)),
            }),
        )?;
        let matches = temporary_name();
        conn.execute_batch(&format!("CREATE TEMP TABLE {matches}(document_id UBIGINT, match_order UBIGINT, left_context VARCHAR, matched_text VARCHAR, right_context VARCHAR, start_idx BIGINT, end_idx BIGINT, l1 VARCHAR, r1 VARCHAR, extraction VARCHAR)"))?;
        Ok(Self {
            documents: captured.name,
            matches,
            columns: captured.columns,
            metadata: captured.metadata,
            input: ConcordanceInput {
                source: captured.input.source,
                column: captured.input.column,
                tokenizer: input.tokenizer.clone(),
            },
            document_count: captured.count,
            match_count: 0,
            matching_documents: 0,
        })
    }
    fn calculate(
        &mut self,
        conn: &Connection,
        matcher: &DocumentMatcher,
        limit: u64,
        cancellation: &CancellationToken,
    ) -> Result<()> {
        // Read bounded batches before opening an appender; DuckDB permits one active result per connection.
        let mut after = 0u64;
        loop {
            check_cancellation(cancellation)?;
            let rows = document_batch(conn, &self.documents, &self.input.column, after, limit)?;
            if rows.is_empty() {
                break;
            }
            let mut appender = conn.appender(&self.matches)?;
            for (id, text) in rows {
                check_cancellation(cancellation)?;
                after = id;
                let Some(text) = text.filter(|text| !text.trim().is_empty()) else {
                    continue;
                };
                let hits = matcher.find(&text)?;
                if !hits.is_empty() {
                    self.matching_documents += 1;
                }
                let offsets = text
                    .char_indices()
                    .map(|(index, _)| index)
                    .chain(std::iter::once(text.len()))
                    .collect::<Vec<_>>();
                for (index, hit) in hits.into_iter().enumerate() {
                    let extraction = format!(
                        "{}{}{}",
                        hit.left_context,
                        &text[offsets[hit.start_idx as usize]..offsets[hit.end_idx as usize]],
                        hit.right_context
                    );
                    appender.append_row(params![
                        id,
                        index as u64,
                        hit.left_context,
                        hit.matched_text,
                        hit.right_context,
                        hit.start_idx,
                        hit.end_idx,
                        hit.l1,
                        hit.r1,
                        extraction
                    ])?;
                    self.match_count += 1;
                }
            }
            appender.flush()?;
        }
        Ok(())
    }
}
fn projection_sql(documents: &str, matches: &str) -> String {
    format!(
        "SELECT m.*, d.source, count(*) OVER (PARTITION BY m.l1)::UBIGINT AS l1_frequency, count(*) OVER (PARTITION BY m.r1)::UBIGINT AS r1_frequency FROM {matches} m JOIN {documents} d USING(document_id)"
    )
}
fn document_page_sql(projection: &str) -> String {
    format!(
        "SELECT document_id, first(source) AS source, list(struct_pack(match_order := match_order, left_context := left_context, matched_text := matched_text, right_context := right_context, start_idx := start_idx, end_idx := end_idx, l1 := l1, r1 := r1, l1_frequency := l1_frequency, r1_frequency := r1_frequency, extraction := extraction) ORDER BY match_order) AS matches FROM ({projection}) GROUP BY document_id ORDER BY document_id"
    )
}

impl Database {
    pub(super) fn concordance_preview(
        &mut self,
        tab: Uuid,
        request: ConcordancePreview,
        matcher: DocumentMatcher,
    ) -> Result<DocumentPage> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        tab_check(&self.conn, tab)?;
        let mut source = CapturedSource::capture(&self.conn, &request.input, Some(&request))?;
        source.calculate(&self.conn, &matcher, request.page_size, &self.cancellation)?;
        let projection = projection_sql(&source.documents, &source.matches);
        let file = arrow_page(
            &self.conn,
            &document_page_sql(&projection),
            &[],
            &source.metadata,
            &self.cancellation,
        )?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(DocumentPage {
            file,
            total_rows: source.matching_documents,
            has_next: source.document_count > request.page_size,
            document_count: source.document_count.min(request.page_size),
            match_count: source.match_count,
        })
    }
    pub(super) fn run_concordance(
        &mut self,
        tab: Uuid,
        id: Uuid,
        request: ConcordanceRequest,
        matchers: Vec<DocumentMatcher>,
        mut progress: impl FnMut(&str),
    ) -> Result<Analysis> {
        if !(1..=2).contains(&request.inputs.len()) || request.inputs.len() != matchers.len() {
            return Err(Error::invalid("Select one or two Concordance inputs"));
        }
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        tab_check(&self.conn, tab)?;
        let mut captured = request
            .inputs
            .iter()
            .map(|input| CapturedSource::capture(&self.conn, input, None))
            .collect::<Result<Vec<_>>>()?;
        for (source, matcher) in captured.iter_mut().zip(&matchers) {
            progress(&format!(
                "Matching documents in {}",
                source.input.source.name
            ));
            source.calculate(
                &self.conn,
                matcher,
                source.document_count,
                &self.cancellation,
            )?;
        }
        self.conn.execute_batch("COMMIT")?;
        check_cancellation(&self.cancellation)?;
        progress("Saving results");
        let cancellation = self.cancellation.clone();
        self.publish_analysis(AcceptedAnalysis {id,tab_id:tab,kind:"concordance"},move |conn| {
            let mut corpora = Vec::new();
            for (index,source) in captured.iter().enumerate() {
                check_cancellation(&cancellation)?;
                let documents = Uuid::new_v4(); let matches = Uuid::new_v4(); let projection = Uuid::new_v4();
                let documents_sql = format!("wordflow.{}",artifact_table(documents));
                let matches_sql = format!("wordflow.{}",artifact_table(matches));
                conn.execute_batch(&format!("CREATE TABLE {documents_sql} AS SELECT * FROM {} WHERE document_id IN (SELECT document_id FROM {}); CREATE TABLE {matches_sql} AS SELECT * FROM {}; CREATE VIEW wordflow.{} AS {}",source.documents,source.matches,source.matches,artifact_table(projection),projection_sql(&documents_sql,&matches_sql)))?;
                for (artifact,name) in [(documents,"documents"),(matches,"matches"),(projection,"projection")] { register_table(conn,id,artifact,&format!("source_{index}_{name}"))?; }
                for artifact in [documents,projection] { source.metadata.store(conn, &Relation {schema:"wordflow".into(),name:artifact_table(artifact)})?; }
                corpora.push(ConcordanceCorpus { input: source.input.clone(), columns:source.columns.clone(),  documents,matches,projection,document_count:source.document_count,matching_documents:source.matching_documents,match_count:source.match_count });
            }
            Ok(serde_json::to_value(ConcordanceResultV1 {corpora})?)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    impl Database {
        fn test_concordance(
            &mut self,
            tab: Uuid,
            request: ConcordanceRequest,
            matchers: Vec<DocumentMatcher>,
            progress: impl FnMut(&str),
        ) -> Result<Analysis> {
            let id =
                self.begin_analysis_run(tab, "concordance", serde_json::to_value(&request)?)?;
            self.run_concordance(tab, id, request, matchers, progress)
        }
    }

    fn setup() -> (Project, Uuid, ConcordanceInput, ConcordanceSearch) {
        let mut project = Project::untitled().unwrap();
        project.database.conn.execute_batch("CREATE TABLE docs(text VARCHAR, tags INTEGER[], document_id VARCHAR); INSERT INTO docs VALUES ('😀 cat cat',[1,2],'original'),('nothing',[],'second'),('😀 cat cat',[3],'repeat'),(NULL,NULL,'null'); INSERT INTO wordflow.nodes(table_name) VALUES ('docs')").unwrap();
        let tab = project
            .database
            .create_analysis_tab(CreateTab {
                kind: "concordance".into(),
                name: None,
            })
            .unwrap();
        (
            project,
            tab.id,
            ConcordanceInput {
                source: "docs".into(),
                column: "text".into(),
                tokenizer: None,
            },
            ConcordanceSearch {
                query: "cat".into(),
                ..Default::default()
            },
        )
    }

    #[test]
    fn regex_whole_words_and_token_alternatives_follow_archived_options() {
        let (_, _, mut input, mut search) = setup();
        search.regex = true;
        search.query = "cat|dog".into();
        assert_eq!(
            DocumentMatcher::prepare(&search, &input)
                .unwrap()
                .find("cats dog cat")
                .unwrap()
                .len(),
            2
        );
        search.mode = SearchMode::Tokens;
        search.regex = false;
        input.tokenizer = Some("native:plain_words_en".into());
        assert_eq!(
            DocumentMatcher::prepare(&search, &input)
                .unwrap()
                .find("cats dog cat")
                .unwrap()
                .len(),
            2
        );
    }
    #[test]
    fn filters_precede_paging_and_frequencies_remain_whole_result() {
        let (mut project, tab, input, search) = setup();
        let matcher = DocumentMatcher::prepare(&search, &input).unwrap();
        let result = project
            .database
            .test_concordance(
                tab,
                ConcordanceRequest {
                    inputs: vec![input],
                    search,
                },
                vec![matcher],
                |_| {},
            )
            .unwrap();
        let page = project
            .database
            .concordance_page(
                result.id,
                ConcordanceQuery {
                    source_index: 0,
                    projection: Projection::Matches,
                    filter: ConcordanceFilter {
                        bins: vec![1],
                        bin_count: 2,
                        ..Default::default()
                    },
                    page: 2,
                    page_size: 1,
                    sort: Some(SavedSort {
                        field: "document_id".into(),
                        metadata: true,
                        descending: true,
                    }),
                },
            )
            .unwrap();
        assert_eq!(page.total_rows, 2);
        assert!(!page.has_next);
        let manifest: ConcordanceResultV1 =
            serde_json::from_value(result.result.unwrap().payload).unwrap();
        let relation = artifact_table(manifest.corpora[0].projection);
        let frequency: u64 = project
            .database
            .conn
            .query_row(
                &format!("SELECT l1_frequency FROM wordflow.{relation} WHERE start_idx=6 LIMIT 1"),
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(frequency, 2);
        let inspected = project
            .database
            .concordance_page(
                result.id,
                ConcordanceQuery {
                    source_index: 0,
                    projection: Projection::Documents,
                    filter: ConcordanceFilter {
                        document_id: Some("1".into()),
                        ..Default::default()
                    },
                    page: 1,
                    page_size: 1,
                    sort: None,
                },
            )
            .unwrap();
        assert_eq!(inspected.match_count, 2);
        assert_eq!(inspected.document_count, 1);
    }
    #[test]
    fn publication_collision_rolls_back_all_selected_outputs() {
        let (mut project, tab, input, search) = setup();
        let matcher = DocumentMatcher::prepare(&search, &input).unwrap();
        let result = project
            .database
            .test_concordance(
                tab,
                ConcordanceRequest {
                    inputs: vec![input],
                    search,
                },
                vec![matcher],
                |_| {},
            )
            .unwrap();
        let source = |name: &str| PublishSource {
            source_index: 0,
            name: name.into(),
            metadata: vec![],
            fields: vec![],
            filter: ConcordanceFilter::default(),
        };
        assert!(
            project
                .database
                .publish_concordance(
                    result.id,
                    ConcordancePublish {
                        projection: Projection::Documents,
                        sources: vec![source("first_output"), source("docs")]
                    }
                )
                .is_err()
        );
        // Operation connections normally roll back on disposal; this direct test reuses one.
        let _ = project.database.conn.execute_batch("ROLLBACK");
        let count: u64 = project
            .database
            .conn
            .query_row(
                "SELECT count(*) FROM duckdb_tables() WHERE table_name='first_output'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
        let count: u64 = project
            .database
            .conn
            .query_row(
                "SELECT count(*) FROM wordflow.nodes WHERE table_name='first_output'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
    #[test]
    fn empty_saved_results_keep_explicit_schemas() {
        let (mut project, tab, input, mut search) = setup();
        search.query = "absent".into();
        let matcher = DocumentMatcher::prepare(&search, &input).unwrap();
        let result = project
            .database
            .test_concordance(
                tab,
                ConcordanceRequest {
                    inputs: vec![input],
                    search,
                },
                vec![matcher],
                |_| {},
            )
            .unwrap();
        let page = project
            .database
            .concordance_page(
                result.id,
                ConcordanceQuery {
                    source_index: 0,
                    projection: Projection::Documents,
                    filter: ConcordanceFilter::default(),
                    page: 1,
                    page_size: 20,
                    sort: None,
                },
            )
            .unwrap();
        assert_eq!(page.total_rows, 0);
        let reader =
            arrow_ipc::reader::StreamReader::try_new(page.file.reopen().unwrap(), None).unwrap();
        assert!(reader.schema().field_with_name("source").is_ok());
        assert!(reader.schema().field_with_name("matches").is_ok());
    }
    #[test]
    fn preview_is_page_bounded_and_writes_no_result() {
        let (mut project, tab, input, search) = setup();
        let matcher = DocumentMatcher::prepare(&search, &input).unwrap();
        let page = project
            .database
            .concordance_preview(
                tab,
                ConcordancePreview {
                    input,
                    search,
                    page: 1,
                    page_size: 2,
                    sort: None,
                },
                matcher,
            )
            .unwrap();
        assert!(page.has_next);
        assert_eq!(page.document_count, 2);
        assert_eq!(page.match_count, 2);
        assert_eq!(page.total_rows, 1);
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
        let count: u64 = project
            .database
            .conn
            .query_row("SELECT count(*) FROM wordflow.artifacts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
    #[test]
    fn semantic_metadata_survives_source_loss_and_publication() {
        let (mut project, tab, input, search) = setup();
        project.database.conn.execute_batch("ALTER TABLE docs ADD COLUMN nested STRUCT(\"text.with.dot\" VARCHAR); UPDATE docs SET nested={'text.with.dot':'retained'}; INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','docs',json_array('text'),'custom.text','{}'), ('data','docs',json_array('nested','text.with.dot'),'custom.nested','opaque non-JSON')").unwrap();
        let matcher = DocumentMatcher::prepare(&search, &input).unwrap();
        let result = project
            .database
            .test_concordance(
                tab,
                ConcordanceRequest {
                    inputs: vec![input],
                    search,
                },
                vec![matcher],
                |_| {},
            )
            .unwrap();
        project
            .database
            .conn
            .execute_batch(
                "DROP TABLE docs; DELETE FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='docs'",
            )
            .unwrap();
        let page = project
            .database
            .concordance_page(
                result.id,
                ConcordanceQuery {
                    source_index: 0,
                    projection: Projection::Matches,
                    filter: ConcordanceFilter::default(),
                    page: 1,
                    page_size: 20,
                    sort: None,
                },
            )
            .unwrap();
        let reader =
            arrow_ipc::reader::StreamReader::try_new(page.file.reopen().unwrap(), None).unwrap();
        let schema = reader.schema();
        let duckdb::arrow::datatypes::DataType::Struct(fields) =
            schema.field_with_name("source").unwrap().data_type()
        else {
            panic!("source struct missing")
        };
        assert_eq!(
            fields
                .iter()
                .find(|field| field.name() == "text")
                .unwrap()
                .metadata()["ARROW:extension:name"],
            "custom.text"
        );
        let duckdb::arrow::datatypes::DataType::Struct(nested) = fields
            .iter()
            .find(|f| f.name() == "nested")
            .unwrap()
            .data_type()
        else {
            panic!("nested field missing")
        };
        assert_eq!(
            nested[0].metadata()["ARROW:extension:metadata"],
            "opaque non-JSON"
        );
        let match_annotations: u64 = project.database.conn.query_row("SELECT count(*) FROM wordflow.arrow_metadata m JOIN wordflow.artifacts a ON m.schema_name='wordflow' AND m.relation_name=a.relation_name WHERE a.name LIKE '%matches%'",[],|row|row.get(0)).unwrap();
        assert_eq!(match_annotations, 0);
        project
            .database
            .publish_concordance(
                result.id,
                ConcordancePublish {
                    projection: Projection::Matches,
                    sources: vec![PublishSource {
                        source_index: 0,
                        name: "published_meta".into(),
                        metadata: vec!["nested".into()],
                        fields: vec!["matched_text".into()],
                        filter: ConcordanceFilter::default(),
                    }],
                },
            )
            .unwrap();
        let extension:String=project.database.conn.query_row("SELECT extension_name FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='published_meta' AND field_path=json_array('text')",[],|row|row.get(0)).unwrap();
        assert_eq!(extension, "custom.text");
        let payload: String = project.database.conn.query_row("SELECT extension_metadata FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='published_meta' AND field_path=json_array('nested','text.with.dot')",[],|row|row.get(0)).unwrap();
        assert_eq!(payload, "opaque non-JSON");
    }
    #[test]
    #[ignore = "Synthetic performance measurement, run explicitly"]
    fn benchmark_concordance_bounded_batches_and_dense_results() {
        let (mut project, tab, input, mut search) = setup();
        project.database.conn.execute_batch("DELETE FROM docs; INSERT INTO docs SELECT repeat('cat dog ',10), [i::INTEGER], i::VARCHAR FROM range(50000) t(i)").unwrap();
        search.left_context = 0;
        search.right_context = 0;
        let start = std::time::Instant::now();
        let matcher = DocumentMatcher::prepare(&search, &input).unwrap();
        let result = project
            .database
            .test_concordance(
                tab,
                ConcordanceRequest {
                    inputs: vec![input],
                    search,
                },
                vec![matcher],
                |_| {},
            )
            .unwrap();
        let elapsed = start.elapsed();
        let query = std::time::Instant::now();
        let page = project
            .database
            .concordance_page(
                result.id,
                ConcordanceQuery {
                    source_index: 0,
                    projection: Projection::Matches,
                    filter: ConcordanceFilter::default(),
                    page: 1000,
                    page_size: 20,
                    sort: None,
                },
            )
            .unwrap();
        assert_eq!(page.total_rows, 500000);
        let page_time = query.elapsed();
        let density = std::time::Instant::now();
        project
            .database
            .concordance_density(
                result.id,
                ConcordanceDensity {
                    source_index: 0,
                    bin_count: 100,
                    uncased: false,
                },
            )
            .unwrap();
        let density_time = density.elapsed();
        let publication = std::time::Instant::now();
        project
            .database
            .publish_concordance(
                result.id,
                ConcordancePublish {
                    projection: Projection::Documents,
                    sources: vec![PublishSource {
                        source_index: 0,
                        name: "benchmark_output".into(),
                        metadata: vec![],
                        fields: vec![],
                        filter: ConcordanceFilter::default(),
                    }],
                },
            )
            .unwrap();
        eprintln!(
            "50,000 documents / 500,000 matches: run={elapsed:?}, page={page_time:?}, density={density_time:?}, publication={:?}, Arrow page bytes={}",
            publication.elapsed(),
            page.file.as_file().metadata().unwrap().len()
        );
    }
    #[test]
    fn saved_filters_density_and_publication_are_independent() {
        let (mut project, tab, input, search) = setup();
        let matcher = DocumentMatcher::prepare(&search, &input).unwrap();
        let result = project
            .database
            .test_concordance(
                tab,
                ConcordanceRequest {
                    inputs: vec![input],
                    search,
                },
                vec![matcher],
                |_| {},
            )
            .unwrap();
        let filter = ConcordanceFilter {
            excluded_terms: vec!["CAT".into()],
            uncased: true,
            ..Default::default()
        };
        let page = project
            .database
            .concordance_page(
                result.id,
                ConcordanceQuery {
                    source_index: 0,
                    projection: Projection::Matches,
                    filter,
                    page: 1,
                    page_size: 20,
                    sort: None,
                },
            )
            .unwrap();
        assert_eq!(page.total_rows, 0);
        project
            .database
            .concordance_density(
                result.id,
                ConcordanceDensity {
                    source_index: 0,
                    bin_count: 20,
                    uncased: false,
                },
            )
            .unwrap();
        let output = project
            .database
            .publish_concordance(
                result.id,
                ConcordancePublish {
                    projection: Projection::Documents,
                    sources: vec![PublishSource {
                        source_index: 0,
                        name: "published".into(),
                        metadata: vec!["tags".into()],
                        fields: vec![],
                        filter: ConcordanceFilter::default(),
                    }],
                },
            )
            .unwrap();
        assert_eq!(output[0].name, "published");
        project.database.clear_analysis_tab(tab).unwrap();
        let count: u64 = project
            .database
            .conn
            .query_row("SELECT count(*) FROM published", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }
    #[test]
    fn saved_rows_have_independent_identity_and_types() {
        let (mut project, tab, input, search) = setup();
        let matcher = DocumentMatcher::prepare(&search, &input).unwrap();
        let result = project
            .database
            .test_concordance(
                tab,
                ConcordanceRequest {
                    inputs: vec![input],
                    search,
                },
                vec![matcher],
                |_| {},
            )
            .unwrap();
        let manifest: ConcordanceResultV1 =
            serde_json::from_value(result.result.unwrap().payload).unwrap();
        let source = &manifest.corpora[0];
        assert_eq!(source.match_count, 4);
        assert_eq!(source.matching_documents, 2);
        project
            .database
            .conn
            .execute_batch("DROP TABLE docs")
            .unwrap();
        let rows: (u64, u64) = project
            .database
            .conn
            .query_row(
                &format!(
                    "SELECT count(*), count(DISTINCT document_id) FROM wordflow.{}",
                    artifact_table(source.projection)
                ),
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(rows, (4, 2));
        let tags: String = project
            .database
            .conn
            .query_row(
                &format!(
                    "SELECT typeof(source.tags) FROM wordflow.{} LIMIT 1",
                    artifact_table(source.documents)
                ),
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tags, "INTEGER[]");
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("Concordance 保存.wfpj");
        project.save_as(&path).unwrap();
        drop(project);
        let mut project = Project::open(&path).unwrap();
        let reopened = project
            .database
            .concordance_page(
                result.id,
                ConcordanceQuery {
                    source_index: 0,
                    projection: Projection::Matches,
                    filter: ConcordanceFilter::default(),
                    page: 1,
                    page_size: 20,
                    sort: None,
                },
            )
            .unwrap();
        assert_eq!(reopened.total_rows, 4);
        project.database.clear_analysis_tab(tab).unwrap();
        let count: u64 = project
            .database
            .conn
            .query_row("SELECT count(*) FROM wordflow.artifacts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
