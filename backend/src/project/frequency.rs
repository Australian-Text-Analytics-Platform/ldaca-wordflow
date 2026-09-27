//! Frequency calculations and typed projections over shared result ownership.
use super::analyses::*;
use super::*;
use duckdb::arrow::array::{Array, StringArray};
use ldaca_rs::text::{FrequencyAccumulator, Tokenizer};
use std::collections::HashSet;
use std::io::Write;
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct FrequencyInput {
    pub source: ObjectTarget,
    pub column: String,
    pub tokenizer: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct FrequencyRequest {
    pub inputs: Vec<FrequencyInput>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub(crate) struct FrequencyCorpus {
    pub source: ObjectTarget,
    pub column: String,
    pub tokenizer: String,
    pub label: String,
    pub color: Option<String>,
    pub artifact_id: Uuid,
    #[serde(with = "decimal_count")]
    #[schema(value_type = String)]
    pub document_count: u64,
    #[serde(with = "decimal_count")]
    #[schema(value_type = String)]
    pub total_tokens: u64,
    #[serde(with = "decimal_count")]
    #[schema(value_type = String)]
    pub vocabulary_size: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub(crate) struct FrequencyResultV1 {
    pub corpora: Vec<FrequencyCorpus>,
    pub comparison_artifact_id: Option<Uuid>,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FrequencyView {
    #[default]
    Corpus,
    Comparison,
    Juxtorpus,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FrequencyQuery {
    #[serde(default)]
    pub view: FrequencyView,
    pub corpus_index: Option<usize>,
    pub filter: Option<String>,
    pub stopword_source: Option<StopwordSource>,
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub sort: Option<String>,
    pub descending: Option<bool>,
    pub limit: Option<usize>,
}
pub use super::stopwords::StopwordSource;
use super::stopwords::prepare_stopwords;
#[derive(Clone, Copy, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum FrequencyExportFormat {
    Csv,
    Markdown,
}
impl FrequencyExportFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Csv => "csv",
            Self::Markdown => "md",
        }
    }
}
pub(crate) struct FrequencyPage {
    pub file: tempfile::NamedTempFile,
    pub total_rows: u64,
}

fn read_frequency_result(conn: &Connection, id: Uuid) -> Result<FrequencyResultV1> {
    let analysis = read_analysis(conn, id)?;
    Ok(serde_json::from_value(
        analysis.output("frequency")?.clone(),
    )?)
}
impl Database {
    pub(super) fn run_frequency(
        &mut self,
        tab_id: Uuid,
        id: Uuid,
        request: FrequencyRequest,
        tokenizers: Vec<Tokenizer>,
        mut progress: impl FnMut(&str),
    ) -> Result<Analysis> {
        if !(1..=2).contains(&request.inputs.len()) || tokenizers.len() != request.inputs.len() {
            return Err(Error::invalid(
                "Frequency analysis requires one or two inputs",
            ));
        }
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let tx = &self.conn;
        let tab = read_tab(tx, tab_id)?;
        if tab.kind != "frequency" {
            return Err(Error::invalid("Analysis tab is not a Frequency tab"));
        }
        let mut corpora = Vec::new();
        let mut counts = Vec::new();
        let mut seen = HashSet::new();
        for (input, tokenizer) in request.inputs.iter().zip(&tokenizers) {
            check_cancellation(&self.cancellation)?;
            if tokenizer.model_id() != input.tokenizer {
                return Err(Error::invalid(
                    "Loaded tokenizer differs from the requested tokenizer",
                ));
            }
            let source = input.source.resolve(tx)?;
            let key = (
                source.relation.schema.to_ascii_lowercase(),
                source.relation.name.to_ascii_lowercase(),
            );
            if !seen.insert(key) {
                return Err(Error::invalid(
                    "Frequency inputs must be distinct Data Blocks",
                ));
            }
            progress(&format!("Counting tokens in {}", source.relation.name));
            let mut counter = FrequencyAccumulator::new();
            let mut document_count = 0u64;
            let mut statement = tx.prepare(&format!(
                "SELECT CAST({} AS VARCHAR) AS document FROM {}",
                query::quote(&input.column),
                source.relation.sql()
            ))?;
            let _ = statement.stream_arrow([])?;
            while let Some(array) = statement.step()? {
                check_cancellation(&self.cancellation)?;
                let batch = duckdb::arrow::record_batch::RecordBatch::from(&array);
                let texts = batch
                    .column(0)
                    .as_any()
                    .downcast_ref::<StringArray>()
                    .ok_or_else(|| {
                        Error::new("arrow_error", "Frequency input did not yield text")
                    })?;
                for text in texts {
                    check_cancellation(&self.cancellation)?;
                    document_count = document_count
                        .checked_add(1)
                        .ok_or_else(|| Error::invalid("Document count exceeds u64"))?;
                    if let Some(text) = text {
                        counter
                            .add(text, tokenizer)
                            .map_err(|e| Error::new("analysis_failed", e.to_string()))?;
                    }
                }
            }
            drop(statement);
            let count = counter.into_counts();
            let total_tokens = count.values().try_fold(0u64, |sum, value| {
                sum.checked_add(*value)
                    .ok_or_else(|| Error::invalid("Token count exceeds u64"))
            })?;
            let artifact_id = Uuid::new_v4();
            let color = if source.registered {
                tx.query_row(
                    "SELECT color FROM wordflow.nodes WHERE table_name=?",
                    [&source.relation.name],
                    |row| row.get(0),
                )?
            } else {
                None
            };
            corpora.push(FrequencyCorpus {
                source: ObjectTarget {
                    schema: Some(source.relation.schema),
                    name: source.relation.name.clone(),
                },
                column: input.column.clone(),
                tokenizer: input.tokenizer.clone(),
                label: source.relation.name,
                color,
                artifact_id,
                document_count,
                total_tokens,
                vocabulary_size: count.len() as u64,
            });
            counts.push(count);
        }
        tx.execute_batch("COMMIT")?;
        progress("Saving Frequency result");
        check_cancellation(&self.cancellation)?;
        let cancellation = self.cancellation.clone();
        let manifest = self.publish_analysis(
            AcceptedAnalysis {
                id,
                tab_id,
                kind: "frequency",
            },
            |tx| {
                progress("Writing result tables");
                for (index, (corpus, count)) in corpora.iter().zip(&counts).enumerate() {
                    let table = artifact_table(corpus.artifact_id);
                    tx.execute_batch(&format!(
                "CREATE TABLE wordflow.{}(token VARCHAR NOT NULL,frequency UBIGINT NOT NULL)",
                query::quote(&table)
            ))?;
                    {
                        let mut appender = tx.appender_to_db(&table, "wordflow")?;
                        for (token, frequency) in count {
                            check_cancellation(&cancellation)?;
                            appender.append_row(params![token, frequency])?;
                        }
                        appender.flush()?;
                    }
                    register_table(tx, id, corpus.artifact_id, &format!("corpus-{index}"))?;
                }
                let comparison_artifact_id = if let [reference, study] = corpora.as_slice() {
                    progress("Creating comparison View");
                    Some(store_comparison(tx, id, reference, study)?)
                } else {
                    None
                };
                let result = FrequencyResultV1 {
                    corpora,
                    comparison_artifact_id,
                };
                progress("Committing Frequency result");
                Ok(serde_json::to_value(result)?)
            },
        )?;
        Ok(manifest)
    }
    pub(super) fn frequency_page(
        &self,
        id: Uuid,
        request: FrequencyQuery,
    ) -> Result<FrequencyPage> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let query = frequency_query(&self.conn, id, &request)?;
        let total_rows = self.conn.query_row(
            &format!("SELECT count(*) FROM ({})", query.count_sql),
            params_from_iter(query.parameters.iter()),
            |row| row.get(0),
        )?;
        let page = request.page.unwrap_or(1);
        let page_size = request.page_size.unwrap_or(50);
        if page == 0 || !(1..=5000).contains(&page_size) {
            return Err(Error::invalid(
                "Page must be positive and page size between 1 and 5000",
            ));
        }
        let offset = (page - 1)
            .checked_mul(page_size)
            .ok_or_else(|| Error::invalid("Page offset is too large"))?;
        let mut file = tempfile::NamedTempFile::new()?;
        execute_statements_limited(
            &self.conn,
            &[SqlStatement {
                sql: format!("{} LIMIT {page_size} OFFSET {offset}", query.sql),
                parameters: query.parameters.into_iter().map(Value::String).collect(),
            }],
            Some(&mut file),
            None,
            Some(&query.metadata),
            &self.cancellation,
        )?;
        self.conn.execute_batch("COMMIT")?;
        Ok(FrequencyPage { file, total_rows })
    }
    pub(super) fn export_frequency_into(
        &self,
        id: Uuid,
        request: FrequencyQuery,
        format: FrequencyExportFormat,
        path: &Path,
    ) -> Result<()> {
        self.export_frequency_parts(id, request, format, path, None)
    }
    pub(super) fn export_frequency_parts(
        &self,
        id: Uuid,
        request: FrequencyQuery,
        format: FrequencyExportFormat,
        path: &Path,
        words_path: Option<&Path>,
    ) -> Result<()> {
        let has_stopwords = request.stopword_source.is_some();
        let corpus = request.view == FrequencyView::Corpus;
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let query = frequency_query(
            &self.conn,
            id,
            &FrequencyQuery {
                limit: None,
                ..request
            },
        )?;
        let manifest = read_frequency_result(&self.conn, id)?;
        let sql = if corpus {
            format!("SELECT * EXCLUDE (rank) FROM ({})", query.sql)
        } else {
            query.sql
        };
        let mut statement = self.conn.prepare(&sql)?;
        let mut rows = statement.query(params_from_iter(query.parameters.iter()))?;
        let columns = rows
            .as_ref()
            .ok_or_else(|| Error::invalid("Frequency export has no columns"))?
            .column_names();
        let mut output = std::io::BufWriter::new(std::fs::File::create(path)?);
        let headers = columns
            .iter()
            .map(|column| {
                let (prefix, index) = match column.as_str() {
                    "freq_corpus_0" => ("Reference count", 0),
                    "freq_corpus_1" => ("Study count", 1),
                    "percent_corpus_0" => ("Reference %", 0),
                    "percent_corpus_1" => ("Study %", 1),
                    "expected_0" => ("Reference expected", 0),
                    "expected_1" => ("Study expected", 1),
                    "corpus_0_total" => ("Reference total", 0),
                    "corpus_1_total" => ("Study total", 1),
                    _ => return column.clone(),
                };
                format!("{prefix} ({})", manifest.corpora[index].label)
            })
            .collect::<Vec<_>>();
        write_export_row(&mut output, &headers, format)?;
        if matches!(format, FrequencyExportFormat::Markdown) {
            write_export_row(&mut output, &vec!["---".to_string(); columns.len()], format)?;
        }
        while let Some(row) = rows.next()? {
            check_cancellation(&self.cancellation)?;
            let fields = (0..columns.len())
                .map(|index| {
                    let value: SqlValue = row.get(index)?;
                    Ok(match value {
                        SqlValue::Null => String::new(),
                        SqlValue::Text(value) => value,
                        SqlValue::UBigInt(value) => value.to_string(),
                        SqlValue::BigInt(value) => value.to_string(),
                        SqlValue::Double(value) => value.to_string(),
                        other => format!("{other:?}"),
                    })
                })
                .collect::<duckdb::Result<Vec<_>>>()?;
            write_export_row(&mut output, &fields, format)?;
        }
        if let Some(path) = words_path {
            let mut words = std::io::BufWriter::new(std::fs::File::create(path)?);
            if has_stopwords {
                let mut statement = self.conn.prepare("SELECT word FROM __wordflow_stopwords")?;
                let values = statement.query_map([], |r| r.get::<_, String>(0))?;
                for value in values {
                    writeln!(words, "{}", value?)?;
                }
            }
            words.flush()?;
        }
        output.flush()?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(())
    }
}

mod decimal_count {
    use serde::{Deserialize, Deserializer, Serializer, de::Error};

    pub(super) fn serialize<S: Serializer>(value: &u64, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&value.to_string())
    }
    pub(super) fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u64, D::Error> {
        String::deserialize(deserializer)?
            .parse()
            .map_err(D::Error::custom)
    }
}
fn store_comparison(
    conn: &Connection,
    result_id: Uuid,
    reference: &FrequencyCorpus,
    study: &FrequencyCorpus,
) -> Result<Uuid> {
    let id = Uuid::new_v4();
    let sql = comparison_sql(reference, study)?;
    conn.execute_batch(&format!(
        "CREATE VIEW wordflow.{} AS {sql}",
        query::quote(&artifact_table(id))
    ))?;
    register_table(conn, result_id, id, "comparison")?;
    Ok(id)
}

fn comparison_sql(reference: &FrequencyCorpus, study: &FrequencyCorpus) -> Result<String> {
    let n0 = reference.total_tokens;
    let n1 = study.total_tokens;
    if (n0 == 0) != (n1 == 0) {
        return Err(Error::new(
            "analysis_failed",
            "both corpora must have a positive total frequency",
        ));
    }
    let grand = n0
        .checked_add(n1)
        .ok_or_else(|| Error::new("analysis_failed", "combined corpus total exceeds u64"))?;
    Ok(format!(
        include_str!("frequency_statistics.sql"),
        reference = query::quote(&artifact_table(reference.artifact_id)),
        study = query::quote(&artifact_table(study.artifact_id)),
        n0 = n0,
        n1 = n1,
        // Two empty vocabularies yield no rows; keep constant ln(grand) well-defined.
        grand = grand.max(1),
    ))
}
struct ResultQuery {
    sql: String,
    count_sql: String,
    parameters: Vec<String>,
    metadata: arrow_metadata::Annotations,
}
fn frequency_query(conn: &Connection, id: Uuid, request: &FrequencyQuery) -> Result<ResultQuery> {
    let result = read_frequency_result(conn, id)?;
    let (artifact_id, default_sort) = match request.view {
        FrequencyView::Corpus => (
            result
                .corpora
                .get(request.corpus_index.unwrap_or(0))
                .ok_or_else(|| Error::invalid("Corpus index is unavailable"))?
                .artifact_id,
            "frequency",
        ),
        FrequencyView::Comparison | FrequencyView::Juxtorpus => (
            result
                .comparison_artifact_id
                .ok_or_else(|| Error::invalid("Comparison requires two nonempty corpora"))?,
            "log_likelihood_llv",
        ),
    };
    let relation = artifact_relation(conn, id, artifact_id)?;
    let metadata = arrow_metadata::Annotations::load(conn, &relation)?;
    let table = relation.name;
    let mut sql = format!("SELECT * FROM wordflow.{}", query::quote(&table));
    let mut parameters = Vec::new();
    if let Some(selected) = &request.stopword_source {
        prepare_stopwords(conn, selected)?;
        sql.push_str(
            " WHERE NOT EXISTS (SELECT 1 FROM __wordflow_stopwords WHERE word=lower(token))",
        );
    }
    if request.view == FrequencyView::Corpus {
        sql = format!(
            "SELECT *, row_number() OVER (ORDER BY frequency DESC, token) AS rank FROM ({sql})"
        );
    }
    if let Some(filter) = request
        .filter
        .as_deref()
        .map(str::trim)
        .filter(|filter| !filter.is_empty())
    {
        let pattern = filter
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
            .replace('*', "%")
            .replace('?', "_");
        sql = format!("SELECT * FROM ({sql}) WHERE token ILIKE ? ESCAPE '\\'");
        parameters.push(pattern);
    }
    if request.limit == Some(0) {
        return Err(Error::invalid("Display limit must be positive"));
    }
    if request.view == FrequencyView::Juxtorpus {
        let scored = format!(
            "SELECT *,log10(freq_corpus_0::DOUBLE+freq_corpus_1::DOUBLE)*log_ratio AS __score FROM ({sql}) WHERE freq_corpus_0::DOUBLE+freq_corpus_1::DOUBLE>10"
        );
        sql = if let Some(limit) = request.limit {
            format!(
                "WITH scored AS ({scored}) SELECT * EXCLUDE (__score) FROM ((SELECT * FROM scored ORDER BY __score DESC,token LIMIT {limit}) UNION (SELECT * FROM scored ORDER BY __score ASC,token LIMIT {limit}))"
            )
        } else {
            format!("SELECT * EXCLUDE (__score) FROM ({scored})")
        };
        return Ok(ResultQuery {
            count_sql: sql.clone(),
            sql: format!("{sql} ORDER BY __score DESC,token"),
            parameters,
            metadata,
        });
    }
    let sort = request.sort.as_deref().unwrap_or(default_sort);
    let columns = conn
        .prepare(&format!("SELECT * FROM ({sql}) LIMIT 0"))?
        .query_arrow(params_from_iter(parameters.iter()))?
        .get_schema();
    if !columns.fields().iter().any(|field| field.name() == sort) {
        return Err(Error::invalid("Unknown frequency sort column"));
    }
    let direction = if request.descending.unwrap_or(sort != "token") {
        "DESC"
    } else {
        "ASC"
    };
    // The match count describes the filter, independently of the display limit.
    let count_sql = sql.clone();
    sql.push_str(&format!(
        " ORDER BY {} {direction},token ASC",
        query::quote(sort)
    ));
    if let Some(limit) = request.limit {
        sql = format!("SELECT * FROM ({sql} LIMIT {limit})");
    }
    Ok(ResultQuery {
        sql,
        count_sql,
        parameters,
        metadata,
    })
}
fn write_export_row(
    output: &mut impl Write,
    fields: &[String],
    format: FrequencyExportFormat,
) -> Result<()> {
    let fields = fields
        .iter()
        .map(|value| match format {
            FrequencyExportFormat::Csv => format!("\"{}\"", value.replace('"', "\"\"")),
            FrequencyExportFormat::Markdown => value
                .replace('\\', "\\\\")
                .replace('|', "\\|")
                .replace(['\n', '\r'], "<br>"),
        })
        .collect::<Vec<_>>();
    match format {
        FrequencyExportFormat::Csv => writeln!(output, "{}", fields.join(","))?,
        FrequencyExportFormat::Markdown => writeln!(output, "| {} |", fields.join(" | "))?,
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_stopwords(conn: &Connection, words: Vec<String>) -> StopwordSource {
        conn.execute_batch("CREATE OR REPLACE TABLE data.test_stopwords(word VARCHAR)")
            .unwrap();
        for word in words {
            conn.execute("INSERT INTO data.test_stopwords VALUES (?)", [word])
                .unwrap();
        }
        StopwordSource {
            source: ObjectTarget {
                schema: Some("data".into()),
                name: "test_stopwords".into(),
            },
            column: "word".into(),
        }
    }
    fn setup() -> (Project, Uuid) {
        let mut project = Project::untitled().unwrap();
        project.database.conn.execute_batch("CREATE TABLE docs(text VARCHAR); INSERT INTO docs VALUES ('Cat cat dog'),('DOG fox'),(NULL),(''); CREATE TABLE other(text VARCHAR); INSERT INTO other VALUES ('dog fox fox fox'); INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('docs','text'),('other','text')").unwrap();
        let tab = project
            .database
            .create_analysis_tab(CreateTab::default())
            .unwrap();
        (project, tab.id)
    }
    fn request(names: &[&str]) -> FrequencyRequest {
        FrequencyRequest {
            inputs: names
                .iter()
                .map(|name| FrequencyInput {
                    source: (*name).into(),
                    column: "text".into(),
                    tokenizer: "native:plain_words_en".into(),
                })
                .collect(),
        }
    }
    fn run(project: &mut Project, tab: Uuid, names: &[&str]) -> FrequencyRun {
        project
            .database
            .test_frequency(
                tab,
                request(names),
                names
                    .iter()
                    .map(|_| Tokenizer::load("native:plain_words_en").unwrap())
                    .collect(),
                |_| {},
            )
            .unwrap()
    }
    #[derive(Debug, Serialize)]
    struct FrequencyRun {
        id: Uuid,
        result: FrequencyResultV1,
    }
    impl Database {
        fn test_frequency(
            &mut self,
            tab: Uuid,
            request: FrequencyRequest,
            tokenizers: Vec<Tokenizer>,
            progress: impl FnMut(&str),
        ) -> Result<FrequencyRun> {
            let id = self.begin_analysis_run(tab, "frequency", serde_json::to_value(&request)?)?;
            let completed = self.run_frequency(tab, id, request, tokenizers, progress)?;
            Ok(FrequencyRun {
                id,
                result: serde_json::from_value(completed.output("frequency")?.clone())?,
            })
        }
    }
    fn row_count(project: &Project, table: &str) -> u64 {
        project
            .database
            .conn
            .query_row(
                &format!("SELECT count(*) FROM wordflow.{table}"),
                [],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn live_stopword_columns_normalize_types_names_and_limits() {
        let (mut project, tab) = setup();
        let result = run(&mut project, tab, &["docs"]);
        let conn = &project.database.conn;
        conn.execute_batch("CREATE SCHEMA lists; CREATE TABLE lists.\"Quoted List\"(\"W'ord\" VARCHAR); INSERT INTO lists.\"Quoted List\" VALUES (' CAT '),('cat'),(NULL),(''),('  '),('dog'); CREATE TABLE lists.numbers(n INTEGER); INSERT INTO lists.numbers VALUES (123),(NULL),(123),(456)").unwrap();
        let selected = StopwordSource {
            source: ObjectTarget {
                schema: Some("LISTS".into()),
                name: "quoted list".into(),
            },
            column: "w'ORD".into(),
        };
        let query = FrequencyQuery {
            stopword_source: Some(selected.clone()),
            ..Default::default()
        };
        assert_eq!(
            project
                .database
                .frequency_page(result.id, query.clone())
                .unwrap()
                .total_rows,
            1
        );
        conn.execute_batch("DELETE FROM lists.\"Quoted List\" WHERE lower(trim(\"W'ord\"))='dog'")
            .unwrap();
        assert_eq!(
            project
                .database
                .frequency_page(result.id, query)
                .unwrap()
                .total_rows,
            2
        );
        prepare_stopwords(
            conn,
            &StopwordSource {
                source: ObjectTarget {
                    schema: Some("lists".into()),
                    name: "numbers".into(),
                },
                column: "n".into(),
            },
        )
        .unwrap();
        let words = conn
            .prepare("SELECT word FROM __wordflow_stopwords")
            .unwrap()
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<duckdb::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(words, ["123", "456"]);
        conn.execute_batch("CREATE TABLE lists.large AS SELECT i AS word FROM range(100001) t(i)")
            .unwrap();
        let large = StopwordSource {
            source: ObjectTarget {
                schema: Some("lists".into()),
                name: "large".into(),
            },
            column: "word".into(),
        };
        assert!(
            prepare_stopwords(conn, &large)
                .unwrap_err()
                .to_string()
                .contains("100,000")
        );
        conn.execute_batch("DELETE FROM lists.large WHERE word=100000")
            .unwrap();
        prepare_stopwords(conn, &large).unwrap();
        assert!(
            prepare_stopwords(
                conn,
                &StopwordSource {
                    column: "missing".into(),
                    ..selected
                }
            )
            .is_err()
        );
        assert_eq!(
            read_frequency_result(conn, result.id).unwrap().corpora[0].total_tokens,
            5
        );
    }

    #[test]
    fn table_export_and_stopword_text_share_one_evaluation_of_a_live_view() {
        let (mut project, tab) = setup();
        let result = run(&mut project, tab, &["docs"]);
        project.database.conn.execute_batch("CREATE VIEW live_words AS SELECT CASE WHEN current_query() LIKE 'CREATE OR REPLACE TEMP TABLE%' THEN 'cat' ELSE 'dog' END AS word").unwrap();
        let query = FrequencyQuery {
            stopword_source: Some(StopwordSource {
                source: ObjectTarget {
                    schema: Some("data".into()),
                    name: "live_words".into(),
                },
                column: "word".into(),
            }),
            ..Default::default()
        };
        let table = tempfile::NamedTempFile::new().unwrap();
        let words = tempfile::NamedTempFile::new().unwrap();
        project
            .database
            .export_frequency_parts(
                result.id,
                query,
                FrequencyExportFormat::Csv,
                table.path(),
                Some(words.path()),
            )
            .unwrap();
        assert_eq!(std::fs::read_to_string(words.path()).unwrap(), "cat\n");
        let csv = std::fs::read_to_string(table.path()).unwrap();
        assert!(!csv.contains("cat"));
        assert!(csv.contains("dog"));
    }

    #[test]
    fn frequency_publishes_complete_exact_tables_and_survives_source_deletion() {
        let (mut project, tab) = setup();
        let result = run(&mut project, tab, &["docs", "other"]);
        assert_eq!(result.result.corpora[0].document_count, 4);
        assert_eq!(result.result.corpora[0].total_tokens, 5);
        assert_eq!(result.result.corpora[0].vocabulary_size, 3);
        assert!(result.result.comparison_artifact_id.is_some());
        assert_eq!(
            serde_json::to_value(&result).unwrap()["result"]["corpora"][0]["total_tokens"],
            "5"
        );
        project
            .database
            .conn
            .execute_batch("DROP TABLE docs; DELETE FROM wordflow.nodes WHERE table_name='docs'")
            .unwrap();
        assert_eq!(project.database.analysis(result.id).unwrap().id, result.id);
        let page = project
            .database
            .frequency_page(
                result.id,
                FrequencyQuery {
                    stopword_source: Some(test_stopwords(
                        &project.database.conn,
                        vec!["DOG".into()],
                    )),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(page.total_rows, 2);
        let mut reader =
            arrow_ipc::reader::StreamReader::try_new(page.file.reopen().unwrap(), None).unwrap();
        let batch = reader.next().unwrap().unwrap();
        assert_eq!(
            batch.schema().field(1).data_type(),
            &duckdb::arrow::datatypes::DataType::UInt64
        );
        assert_eq!(
            batch
                .column(1)
                .as_any()
                .downcast_ref::<duckdb::arrow::array::UInt64Array>()
                .unwrap()
                .value(0),
            2
        );
    }

    #[test]
    fn replacement_clear_and_delete_clean_tables_and_blobs_without_foreign_keys() {
        let (mut project, tab) = setup();
        let first = run(&mut project, tab, &["docs"]);
        project.database.conn.execute("INSERT INTO wordflow.artifacts(id,analysis_id,name,storage_kind,media_type,content) VALUES (?,?,'context','blob','application/octet-stream',?)",params![Uuid::new_v4().to_string(),first.id.to_string(),&[1u8,2,3][..]]).unwrap();
        let second = run(&mut project, tab, &["other"]);
        assert_eq!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .as_ref()
                .filter(|a| a.has_result)
                .map(|a| a.id),
            Some(second.id)
        );
        assert!(project.database.analysis(first.id).is_err());
        assert_eq!(row_count(&project, "artifacts"), 1);
        project.database.clear_analysis_tab(tab).unwrap();
        assert_eq!(row_count(&project, "artifacts"), 0);
        assert_eq!(row_count(&project, "analyses"), 1);
        assert_eq!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .as_ref()
                .filter(|a| a.has_result)
                .map(|a| a.id),
            None
        );
        run(&mut project, tab, &["docs"]);
        project.database.delete_analysis_tab(tab).unwrap();
        assert!(project.database.tabs(None).unwrap().is_empty());
        assert_eq!(row_count(&project, "artifacts"), 0);
        assert_eq!(project.database.conn.query_row("SELECT count(*) FROM duckdb_tables() WHERE schema_name='wordflow' AND table_name LIKE 'result_%'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    }

    #[test]
    fn failed_run_retains_request_and_empty_comparisons_use_native_statistics() {
        let (mut project, tab) = setup();
        let _first = run(&mut project, tab, &["docs"]);
        let mut invalid = request(&["docs", "other"]);
        invalid.inputs[1].column = "missing".into();
        let tokenizers = vec![Tokenizer::load("native:plain_words_en").unwrap(); 2];
        assert!(
            project
                .database
                .connection(CancellationToken::new())
                .unwrap()
                .test_frequency(tab, invalid, tokenizers, |_| {})
                .is_err()
        );
        assert_eq!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .as_ref()
                .filter(|a| a.has_result)
                .map(|a| a.id),
            None
        );
        assert_eq!(row_count(&project, "artifacts"), 0);
        project
            .database
            .conn
            .execute_batch("DELETE FROM docs")
            .unwrap();
        assert!(
            project
                .database
                .connection(CancellationToken::new())
                .unwrap()
                .test_frequency(
                    tab,
                    request(&["docs", "other"]),
                    vec![Tokenizer::load("native:plain_words_en").unwrap(); 2],
                    |_| {}
                )
                .is_err()
        );
        assert_eq!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .as_ref()
                .filter(|a| a.has_result)
                .map(|a| a.id),
            None
        );
        let empty = run(&mut project, tab, &["docs"]);
        assert_eq!(empty.result.corpora[0].total_tokens, 0);
        assert!(empty.result.comparison_artifact_id.is_none());
        assert_eq!(
            project
                .database
                .frequency_page(empty.id, FrequencyQuery::default())
                .unwrap()
                .total_rows,
            0
        );
        project
            .database
            .conn
            .execute_batch("DELETE FROM other")
            .unwrap();
        let empty_comparison = run(&mut project, tab, &["docs", "other"]);
        assert!(empty_comparison.result.comparison_artifact_id.is_some());
        assert_eq!(
            project
                .database
                .frequency_page(
                    empty_comparison.id,
                    FrequencyQuery {
                        view: FrequencyView::Comparison,
                        ..Default::default()
                    }
                )
                .unwrap()
                .total_rows,
            0
        );
    }

    #[test]
    fn comparison_direction_uses_proportions_and_exports_named_corpora() {
        let (mut project, tab) = setup();
        project.database.conn.execute_batch("DELETE FROM docs; DELETE FROM other; INSERT INTO docs VALUES (repeat('word ',10)||repeat('filler ',980)||repeat('unique ',10)); INSERT INTO other VALUES (repeat('word ',5)||repeat('filler ',95))").unwrap();
        let result = run(&mut project, tab, &["docs", "other"]);
        let query = frequency_query(
            &project.database.conn,
            result.id,
            &FrequencyQuery {
                view: FrequencyView::Comparison,
                sort: Some("signed_ll".into()),
                filter: Some("word".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let (overuse, signed, difference): (String, f64, f64) = project
            .database
            .conn
            .query_row(
                &format!("SELECT overuse,signed_ll,percent_diff FROM ({})", query.sql),
                params_from_iter(query.parameters.iter()),
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(overuse, "Study"); // Ten raw occurrences versus five, but 1% versus 5%.
        assert!(signed < 0.0);
        assert!((difference + 80.0).abs() < 1e-10);
        for format in [FrequencyExportFormat::Csv, FrequencyExportFormat::Markdown] {
            let file = tempfile::NamedTempFile::new().unwrap();
            project
                .database
                .export_frequency_into(
                    result.id,
                    FrequencyQuery {
                        view: FrequencyView::Comparison,
                        page: Some(2),
                        page_size: Some(1),
                        limit: Some(1),
                        ..Default::default()
                    },
                    format,
                    file.path(),
                )
                .unwrap();
            let text = std::fs::read_to_string(file.path()).unwrap();
            assert!(text.contains("Reference count (docs)"));
            assert!(text.contains("Study % (other)"));
            assert!(text.contains("signed_ll"));
            assert!(text.contains("overuse"));
            assert!(text.contains("word") && text.contains("filler") && text.contains("unique"));
        }
    }

    #[test]
    fn juxtorpus_retains_both_ranking_ends_neutral_words_and_deduplicates_overlap() {
        let (mut project, tab) = setup();
        project.database.conn.execute_batch("DELETE FROM docs; DELETE FROM other; INSERT INTO docs VALUES (repeat('alpha ',20)||repeat('beta ',10)||repeat('equal ',6)||repeat('boundary ',5)); INSERT INTO other VALUES (repeat('alpha ',10)||repeat('beta ',20)||repeat('equal ',6)||repeat('boundary ',5))").unwrap();
        let result = run(&mut project, tab, &["docs", "other"]);
        let tokens = |limit, stopwords: Option<Vec<String>>| {
            let query = frequency_query(
                &project.database.conn,
                result.id,
                &FrequencyQuery {
                    view: FrequencyView::Juxtorpus,
                    limit: Some(limit),
                    stopword_source: stopwords
                        .map(|words| test_stopwords(&project.database.conn, words)),
                    ..Default::default()
                },
            )
            .unwrap();
            project
                .database
                .conn
                .prepare(&query.sql)
                .unwrap()
                .query_map(params_from_iter(query.parameters.iter()), |row| {
                    row.get::<_, String>(0)
                })
                .unwrap()
                .collect::<duckdb::Result<Vec<_>>>()
                .unwrap()
        };
        assert_eq!(tokens(1, None), ["alpha", "beta"]);
        assert_eq!(tokens(2, None), ["alpha", "equal", "beta"]);
        assert_eq!(tokens(1, Some(vec!["alpha".into()])), ["equal", "beta"]);
        let query = frequency_query(
            &project.database.conn,
            result.id,
            &FrequencyQuery {
                view: FrequencyView::Comparison,
                filter: Some("equal".into()),
                sort: Some("overuse".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let (overuse, signed): (String, f64) = project
            .database
            .conn
            .query_row(
                &format!("SELECT overuse,signed_ll FROM ({})", query.sql),
                params_from_iter(query.parameters.iter()),
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(overuse, "Equal");
        assert_eq!(signed, 0.0);
    }

    #[test]
    fn corpus_rank_follows_stopwords_but_precedes_wildcard_and_display_limit() {
        let (mut project, tab) = setup();
        let result = run(&mut project, tab, &["docs"]);
        let conn = &project.database.conn;
        let rank = |selected| {
            let query = frequency_query(
                conn,
                result.id,
                &FrequencyQuery {
                    filter: Some("f*".into()),
                    stopword_source: selected,
                    limit: Some(1),
                    ..Default::default()
                },
            )
            .unwrap();
            conn.query_row(
                &query.sql,
                params_from_iter(query.parameters.iter()),
                |row| row.get::<_, i64>(2),
            )
            .unwrap()
        };
        assert_eq!(rank(None), 3);
        let selected = test_stopwords(conn, vec!["cat".into()]);
        assert_eq!(rank(Some(selected)), 2);
        let page = project
            .database
            .frequency_page(
                result.id,
                FrequencyQuery {
                    limit: Some(1),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(page.total_rows, 3);
        let mut reader =
            arrow_ipc::reader::StreamReader::try_new(page.file.reopen().unwrap(), None).unwrap();
        assert_eq!(reader.next().unwrap().unwrap().num_rows(), 1);
    }

    #[test]
    fn query_limits_filter_sort_and_exports_use_complete_matching_result() {
        let (mut project, tab) = setup();
        let result = run(&mut project, tab, &["docs", "other"]);
        let wide = project
            .database
            .frequency_page(
                result.id,
                FrequencyQuery {
                    limit: Some(10_000),
                    filter: Some("   ".into()),
                    page_size: Some(2),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(wide.total_rows, 3);
        let page = project
            .database
            .frequency_page(
                result.id,
                FrequencyQuery {
                    filter: Some(" ?o* ".into()),
                    limit: Some(1),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(page.total_rows, 2);
        let comparison = project
            .database
            .frequency_page(
                result.id,
                FrequencyQuery {
                    view: FrequencyView::Juxtorpus,
                    limit: Some(1),
                    page_size: Some(2),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(comparison.total_rows, 0);
        let file = tempfile::NamedTempFile::new().unwrap();
        project
            .database
            .export_frequency_into(
                result.id,
                FrequencyQuery {
                    limit: Some(1),
                    ..Default::default()
                },
                FrequencyExportFormat::Csv,
                file.path(),
            )
            .unwrap();
        let csv = std::fs::read_to_string(file.path()).unwrap();
        assert_eq!(csv.lines().count(), 4);
        assert!(csv.contains("\"cat\",\"2\""));
        project
            .database
            .export_frequency_into(
                result.id,
                FrequencyQuery {
                    filter: Some("d*".into()),
                    ..Default::default()
                },
                FrequencyExportFormat::Markdown,
                file.path(),
            )
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(file.path()).unwrap(),
            "| token | frequency |\n| --- | --- |\n| dog | 2 |\n"
        );
    }

    #[test]
    fn default_tab_names_use_the_first_available_number_without_renaming_existing_tabs() {
        let (mut project, first) = setup();
        assert_eq!(
            project.database.analysis_tab(first).unwrap().name,
            "Frequency 1"
        );
        let second = project
            .database
            .create_analysis_tab(CreateTab::default())
            .unwrap();
        assert_eq!(second.name, "Frequency 2");
        let custom = project
            .database
            .create_analysis_tab(CreateTab {
                kind: "frequency".into(),
                name: Some("Frequency 3".into()),
            })
            .unwrap();
        let legacy = project
            .database
            .create_analysis_tab(CreateTab {
                kind: "frequency".into(),
                name: Some("Frequency".into()),
            })
            .unwrap();
        assert_eq!(
            project
                .database
                .create_analysis_tab(CreateTab::default())
                .unwrap()
                .name,
            "Frequency 4"
        );
        project.database.delete_analysis_tab(second.id).unwrap();
        assert_eq!(
            project
                .database
                .create_analysis_tab(CreateTab::default())
                .unwrap()
                .name,
            "Frequency 2"
        );
        assert_eq!(
            project.database.analysis_tab(custom.id).unwrap().name,
            "Frequency 3"
        );
        assert_eq!(
            project.database.analysis_tab(legacy.id).unwrap().name,
            "Frequency"
        );
    }

    #[test]
    fn tab_order_names_settings_and_analyses_reopen_in_schema_one() {
        let (mut project, first) = setup();
        let second = project
            .database
            .create_analysis_tab(CreateTab {
                kind: "frequency".into(),
                name: Some("Comparison".into()),
            })
            .unwrap();
        project
            .database
            .update_analysis_tab(
                first,
                UpdateTab {
                    name: Some("My words".into()),
                    settings: Some(serde_json::json!({"stopwords":["cat"]})),
                },
            )
            .unwrap();
        project
            .database
            .reorder_tabs("frequency", vec![second.id, first])
            .unwrap();
        let result = run(&mut project, first, &["docs"]);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("saved.wfpj");
        project.save_as(&path).unwrap();
        drop(project);
        let opened = Project::open(&path).unwrap();
        assert_eq!(opened.info().schema_version, 1);
        let tabs = opened.database.tabs(None).unwrap();
        assert_eq!(tabs[0].id, second.id);
        assert_eq!(tabs[1].name, "My words");
        assert_eq!(tabs[1].settings, serde_json::json!({"stopwords":["cat"]}));
        assert_eq!(
            opened
                .database
                .analysis(result.id)
                .unwrap()
                .result
                .unwrap()
                .payload["corpora"][0]["total_tokens"],
            "5"
        );
    }

    #[test]
    fn concurrent_same_tab_publication_conflicts_without_orphans() {
        let (project, tab) = setup();
        let mut operation = project
            .database
            .connection(CancellationToken::new())
            .unwrap();
        let (claimed_tx, claimed_rx) = std::sync::mpsc::channel();
        let (continue_tx, continue_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            operation.test_frequency(
                tab,
                request(&["docs"]),
                vec![Tokenizer::load("native:plain_words_en").unwrap()],
                |stage| {
                    if stage == "Writing result tables" {
                        claimed_tx.send(()).unwrap();
                        continue_rx.recv().unwrap();
                    }
                },
            )
        });
        claimed_rx.recv().unwrap();
        let second = project
            .database
            .connection(CancellationToken::new())
            .unwrap()
            .test_frequency(
                tab,
                request(&["other"]),
                vec![Tokenizer::load("native:plain_words_en").unwrap()],
                |_| {},
            );
        continue_tx.send(()).unwrap();
        assert!(worker.join().unwrap().is_ok());
        assert!(second.is_err());
        assert_eq!(row_count(&project, "analyses"), 1);
        assert_eq!(row_count(&project, "artifacts"), 1);
    }

    #[test]
    fn deleted_tab_cannot_be_resurrected_by_accepted_computation() {
        let (mut project, tab) = setup();
        let mut operation = project
            .database
            .connection(CancellationToken::new())
            .unwrap();
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (continue_tx, continue_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            operation.test_frequency(
                tab,
                request(&["docs"]),
                vec![Tokenizer::load("native:plain_words_en").unwrap()],
                |stage| {
                    if stage == "Saving Frequency result" {
                        started_tx.send(()).unwrap();
                        continue_rx.recv().unwrap();
                    }
                },
            )
        });
        started_rx.recv().unwrap();
        project.database.delete_analysis_tab(tab).unwrap();
        continue_tx.send(()).unwrap();
        assert!(worker.join().unwrap().is_err());
        assert!(project.database.tabs(None).unwrap().is_empty());
        assert_eq!(row_count(&project, "analyses"), 0);
        assert_eq!(row_count(&project, "artifacts"), 0);
    }

    #[test]
    fn initial_run_transition_rolls_back_on_cancellation_then_cleans_all_owned_artifacts() {
        let (mut project, tab) = setup();
        let first = run(&mut project, tab, &["docs", "other"]);
        project.database.conn.execute("INSERT INTO wordflow.artifacts(id,analysis_id,name,storage_kind,media_type,content) VALUES (?,?,'binary','blob','application/octet-stream',?)", params![Uuid::new_v4().to_string(), first.id.to_string(), &[1_u8, 2][..]]).unwrap();
        let cancellation = CancellationToken::new();
        let mut connection = project.database.connection(cancellation.clone()).unwrap();
        cancellation.cancel();
        let submitted = serde_json::to_value(request(&["docs"])).unwrap();
        assert!(
            connection
                .begin_analysis_run(tab, "frequency", submitted.clone())
                .is_err()
        );
        assert_eq!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .as_ref()
                .filter(|a| a.has_result)
                .map(|a| a.id),
            Some(first.id)
        );
        assert_eq!(row_count(&project, "artifacts"), 4);
        project
            .database
            .begin_analysis_run(tab, "frequency", submitted.clone())
            .unwrap();
        assert_eq!(row_count(&project, "artifacts"), 0);
        assert_eq!(row_count(&project, "analyses"), 1);
        assert_eq!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .unwrap()
                .request,
            submitted
        );
    }

    #[test]
    fn cancellation_and_panic_retain_request_without_partial_artifacts() {
        let (mut project, tab) = setup();
        let first = run(&mut project, tab, &["docs", "other"]);
        let blob_id = Uuid::new_v4().to_string();
        let content = [0_u8, 1, 127, 255];
        project.database.conn.execute("INSERT INTO wordflow.artifacts(id,analysis_id,name,storage_kind,media_type,content) VALUES (?,?,'context','blob','application/octet-stream',?)",params![blob_id,first.id.to_string(),content.as_slice()]).unwrap();
        let token = CancellationToken::new();
        let mut operation = project.database.connection(token.clone()).unwrap();
        let failed = operation.test_frequency(
            tab,
            request(&["docs", "other"]),
            vec![Tokenizer::load("native:plain_words_en").unwrap(); 2],
            |stage| {
                if stage == "Committing Frequency result" {
                    token.cancel();
                }
            },
        );
        assert_eq!(failed.unwrap_err().code, "interrupted");
        assert_eq!(row_count(&project, "artifacts"), 0);
        let mut operation = project
            .database
            .connection(CancellationToken::new())
            .unwrap();
        let panicked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            operation.test_frequency(
                tab,
                request(&["docs", "other"]),
                vec![Tokenizer::load("native:plain_words_en").unwrap(); 2],
                |stage| {
                    assert_ne!(stage, "Committing Frequency result", "worker panic");
                },
            )
        }));
        assert!(panicked.is_err());
        assert_eq!(
            project
                .database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .as_ref()
                .filter(|a| a.has_result)
                .map(|a| a.id),
            None
        );
        assert_eq!(row_count(&project, "artifacts"), 0);
        project.database.clear_analysis_tab(tab).unwrap();
        assert_eq!(row_count(&project, "artifacts"), 0);
        assert_eq!(row_count(&project, "analyses"), 1);
        assert_eq!(project.database.conn.query_row("SELECT count(*) FROM information_schema.tables WHERE table_schema='wordflow' AND table_name LIKE 'result_%'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    }

    #[test]
    fn full_unsigned_counts_survive_json_and_exports() {
        let (mut project, tab) = setup();
        let mut result = run(&mut project, tab, &["docs"]);
        result.result.corpora[0].total_tokens = u64::MAX;
        let json = serde_json::to_string(&result.result).unwrap();
        assert_eq!(
            serde_json::from_str::<FrequencyResultV1>(&json)
                .unwrap()
                .corpora[0]
                .total_tokens,
            u64::MAX
        );
        project
            .database
            .conn
            .execute(
                &format!(
                    "UPDATE wordflow.{} SET frequency=? WHERE token='cat'",
                    query::quote(&artifact_table(result.result.corpora[0].artifact_id))
                ),
                params![u64::MAX],
            )
            .unwrap();
        let file = tempfile::NamedTempFile::new().unwrap();
        project
            .database
            .export_frequency_into(
                result.id,
                FrequencyQuery::default(),
                FrequencyExportFormat::Csv,
                file.path(),
            )
            .unwrap();
        assert!(
            std::fs::read_to_string(file.path())
                .unwrap()
                .contains("18446744073709551615")
        );
    }

    #[test]
    fn stored_artifact_metadata_enriches_arrow_fields() {
        let (mut project, tab) = setup();
        let result = run(&mut project, tab, &["docs"]);
        arrow_metadata::Annotations(vec![arrow_metadata::Annotation {
            path: vec!["token".into()],
            extension: "org.example.token".into(),
            payload: Some("{\"version\":1}".into()),
        }])
        .store(
            &project.database.conn,
            &Relation {
                schema: "wordflow".into(),
                name: artifact_table(result.result.corpora[0].artifact_id),
            },
        )
        .unwrap();
        let page = project
            .database
            .frequency_page(result.id, FrequencyQuery::default())
            .unwrap();
        let reader =
            arrow_ipc::reader::StreamReader::try_new(page.file.reopen().unwrap(), None).unwrap();
        assert_eq!(
            reader
                .schema()
                .field(0)
                .metadata()
                .get("ARROW:extension:name")
                .map(String::as_str),
            Some("org.example.token")
        );
        assert_eq!(
            reader
                .schema()
                .field(0)
                .metadata()
                .get("ARROW:extension:metadata")
                .map(String::as_str),
            Some("{\"version\":1}")
        );
    }

    #[test]
    fn both_corpora_are_counted_from_one_snapshot_during_a_concurrent_edit() {
        let (project, tab) = setup();
        let mut operation = project
            .database
            .connection(CancellationToken::new())
            .unwrap();
        let result = operation
            .test_frequency(
                tab,
                request(&["docs", "other"]),
                vec![Tokenizer::load("native:plain_words_en").unwrap(); 2],
                |stage| {
                    if stage == "Counting tokens in other" {
                        project
                            .database
                            .conn
                            .execute_batch("UPDATE other SET text='changed'")
                            .unwrap();
                    }
                },
            )
            .unwrap();
        assert_eq!(result.result.corpora[1].total_tokens, 4);
        assert_eq!(
            project
                .database
                .conn
                .query_row("SELECT text FROM other", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "changed"
        );
    }

    #[test]
    fn comparison_view_matches_native_statistics_including_special_values() {
        use std::collections::HashMap;
        let counts = |words: &[(&str, u64)]| -> HashMap<String, u64> {
            words
                .iter()
                .map(|(word, count)| ((*word).into(), *count))
                .collect()
        };
        let cases = [
            (counts(&[]), counts(&[])),
            (counts(&[("empty", 0)]), counts(&[("empty", 0)])),
            (counts(&[("word", 2)]), counts(&[("word", 2)])),
            (counts(&[("one", 1)]), counts(&[("two", 1)])),
            (counts(&[("x", 2), ("y", 2)]), counts(&[("y", 4)])),
            (
                counts(&[("word", 10), ("other", 990)]),
                counts(&[("word", 5), ("other", 95)]),
            ),
            (
                counts(&[("中文's", 17), ("Café", 3)]),
                counts(&[("中文's", 2), ("日本語", 11)]),
            ),
            (
                counts(&[("large", u64::MAX - 10), ("small", 1)]),
                counts(&[("small", 9)]),
            ),
            (
                (0..2000)
                    .filter(|i| i % 5 != 0)
                    .map(|i| (format!("word{i}"), 1 + (i * 37) % 113))
                    .collect(),
                (0..2000)
                    .filter(|i| i % 5 != 1)
                    .map(|i| (format!("word{i}"), 1 + (i * 71) % 157))
                    .collect(),
            ),
        ];
        let (mut project, tab) = setup();
        let mut result = run(&mut project, tab, &["docs", "other"]);
        let conn = &project.database.conn;
        for (a, b) in cases {
            for (corpus, words) in result.result.corpora.iter_mut().zip([&a, &b]) {
                corpus.total_tokens = words.values().sum();
                let table = artifact_table(corpus.artifact_id);
                conn.execute_batch(&format!("DELETE FROM wordflow.{}", query::quote(&table)))
                    .unwrap();
                let mut appender = conn.appender_to_db(&table, "wordflow").unwrap();
                for (token, count) in words {
                    appender.append_row(params![token, count]).unwrap();
                }
                appender.flush().unwrap();
            }
            let sql = comparison_sql(&result.result.corpora[0], &result.result.corpora[1]).unwrap();
            conn.execute_batch(&format!(
                "CREATE OR REPLACE VIEW wordflow.parity_test AS {sql}"
            ))
            .unwrap();
            let mut statement = conn
                .prepare("SELECT * FROM wordflow.parity_test ORDER BY token")
                .unwrap();
            let mut actual = statement.query([]).unwrap();
            for expected in ldaca_rs::text::frequency_stats(&a, &b).unwrap() {
                let row = actual.next().unwrap().unwrap();
                assert_eq!(row.get::<_, String>(0).unwrap(), expected.token);
                for (index, value) in [
                    (1, expected.freq_corpus_0),
                    (2, expected.freq_corpus_1),
                    (5, expected.corpus_0_total),
                    (6, expected.corpus_1_total),
                ] {
                    assert_eq!(row.get::<_, u64>(index).unwrap(), value);
                }
                assert_eq!(row.get::<_, String>(10).unwrap(), expected.significance);
                let (overuse, sign) = if expected.percent_corpus_0 > expected.percent_corpus_1 {
                    ("Reference", 1.0)
                } else if expected.percent_corpus_0 < expected.percent_corpus_1 {
                    ("Study", -1.0)
                } else {
                    ("Equal", 0.0)
                };
                assert_eq!(row.get::<_, String>(17).unwrap(), overuse);
                for (index, value) in [
                    (3, expected.expected_0),
                    (4, expected.expected_1),
                    (7, expected.log_likelihood_llv),
                    (8, expected.bayes_factor_bic),
                    (9, expected.effect_size_ell),
                    (11, expected.percent_corpus_0),
                    (12, expected.percent_corpus_1),
                    (13, expected.percent_diff),
                    (14, expected.relative_risk),
                    (15, expected.log_ratio),
                    (16, expected.odds_ratio),
                    (18, sign * expected.log_likelihood_llv.abs()),
                ] {
                    let actual: f64 = row.get(index).unwrap();
                    assert!(
                        if value.is_nan() {
                            actual.is_nan()
                        } else if value.is_infinite() {
                            actual == value
                        } else {
                            actual.is_finite()
                                && (actual - value).abs() <= 1e-11 * value.abs().max(1.0)
                        },
                        "{} column {index}: SQL {actual}, native {value}",
                        expected.token
                    );
                }
            }
            assert!(actual.next().unwrap().is_none());
        }
        result.result.corpora[0].total_tokens = u64::MAX;
        result.result.corpora[1].total_tokens = 1;
        assert!(comparison_sql(&result.result.corpora[0], &result.result.corpora[1]).is_err());
    }

    #[test]
    fn comparison_view_survives_reopen_without_sources_and_filtering_keeps_totals() {
        let (mut project, tab) = setup();
        let result = run(&mut project, tab, &["docs", "other"]);
        assert_eq!(
            project
                .database
                .analysis(result.id)
                .unwrap()
                .result
                .unwrap()
                .version,
            1
        );
        let table = artifact_table(result.result.comparison_artifact_id.unwrap());
        let conn = &project.database.conn;
        let definition: String = conn
            .query_row(
                "SELECT sql FROM duckdb_views() WHERE schema_name='wordflow' AND view_name=?",
                [&table],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!definition.contains("data"));
        let snapshot_sql = format!(
            "SELECT to_json(list(t ORDER BY token))::VARCHAR FROM wordflow.{} t",
            query::quote(&table)
        );
        let snapshot: String = conn.query_row(&snapshot_sql, [], |row| row.get(0)).unwrap();
        assert_eq!(project.database.graph().unwrap().nodes.len(), 2);
        assert_eq!(project.database.dependency_graph().unwrap().nodes.len(), 2);
        conn.execute_batch("DROP TABLE docs; DROP TABLE other; DELETE FROM wordflow.nodes")
            .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("view-result.wfpj");
        project.save_as(&path).unwrap();
        drop(project);
        let mut project = Project::open(&path).unwrap();
        let reopened: String = project
            .database
            .conn
            .query_row(
                "SELECT sql FROM duckdb_views() WHERE schema_name='wordflow' AND view_name=?",
                [&table],
                |row| row.get(0),
            )
            .unwrap();
        // DuckDB normalizes type-name quoting when serializing a View to disk.
        assert!(!reopened.contains("data"));
        for corpus in &result.result.corpora {
            assert!(reopened.contains(&artifact_table(corpus.artifact_id)));
        }
        assert_eq!(
            project
                .database
                .conn
                .query_row(&snapshot_sql, [], |row| row.get::<_, String>(0))
                .unwrap(),
            snapshot
        );
        let request = FrequencyQuery {
            view: FrequencyView::Comparison,
            stopword_source: Some(test_stopwords(&project.database.conn, vec!["cat".into()])),
            filter: Some("dog".into()),
            sort: Some("overuse".into()),
            ..Default::default()
        };
        let query = frequency_query(&project.database.conn, result.id, &request).unwrap();
        let (n0, n1, p0, p1): (u64,u64,f64,f64) = project.database.conn.query_row(&format!("SELECT corpus_0_total,corpus_1_total,percent_corpus_0,percent_corpus_1 FROM ({})", query.sql), params_from_iter(query.parameters.iter()), |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).unwrap();
        assert_eq!((n0, n1, p0, p1), (5, 4, 40.0, 25.0));
        assert_eq!(
            project
                .database
                .frequency_page(result.id, request)
                .unwrap()
                .total_rows,
            1
        );
        project.database.clear_analysis_tab(tab).unwrap();
        assert_eq!(project.database.conn.query_row("SELECT count(*) FROM information_schema.tables WHERE table_schema='wordflow' AND table_name LIKE 'result_%'", [], |row| row.get::<_,u64>(0)).unwrap(), 0);
    }
}
