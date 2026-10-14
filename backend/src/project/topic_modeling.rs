//! Joint native topic models. Durable outputs own their rows; Preview owns only memory.
use super::analyses::*;
use super::document_matches::*;
use super::*;
use ldaca_rs::topic_modeling::segmentation::SegmentationConfig;
mod transport;
use ldaca_rs::topic_modeling::{self as engine, DocumentResult, TopicModelingResult, projection};
use std::collections::HashSet;
use transport::{RepresentativeWord, SegmentationMethod, TopicProjectionBasis};
mod adjustments;
mod documents;
pub(crate) use adjustments::{TopicAdjustment, TopicAdjustmentSettings};
mod metadata;
use documents::PreviewDocuments;
pub(crate) use documents::TopicDocumentQuery;
use metadata::{ColourField, ColourFieldSummary};

pub(crate) const KIND: &str = "topic-modeling";
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct EmbeddingModel {
    pub id: &'static str,
    pub label: &'static str,
    pub token_limit: usize,
}
pub(crate) const MODELS: &[EmbeddingModel] = &[
    EmbeddingModel {
        id: "sentence-transformers/all-MiniLM-L6-v2",
        label: "MiniLM · English",
        token_limit: 256,
    },
    EmbeddingModel {
        id: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        label: "MiniLM · Multilingual",
        token_limit: 128,
    },
];
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopicRequest {
    pub inputs: Vec<DocumentInput>,
    pub embedding_model: String,
    pub tokenizer: String,
    pub segmentation: SegmentationMethod,
    pub max_segment_tokens: usize,
    pub minimum_topic_size: usize,
    #[serde(default)]
    pub maximum_topic_size: Option<usize>,
    pub seed: u64,
}
impl TopicRequest {
    pub(super) fn validate(&self) -> Result<()> {
        if !(1..=2).contains(&self.inputs.len()) {
            return Err(Error::invalid("Choose one or two Data Blocks"));
        }
        let model = MODELS
            .iter()
            .find(|m| m.id == self.embedding_model)
            .ok_or_else(|| Error::invalid("Choose a supported embedding model"))?;
        if !(4..=model.token_limit).contains(&self.max_segment_tokens) {
            return Err(Error::invalid(format!(
                "Segment length must be between 4 and {} tokens",
                model.token_limit
            )));
        }
        if self.minimum_topic_size < 2 || self.tokenizer.trim().is_empty() {
            return Err(Error::invalid(
                "Choose a tokenizer and a minimum topic size of at least 2",
            ));
        }
        if self
            .maximum_topic_size
            .is_some_and(|maximum| maximum <= self.minimum_topic_size)
        {
            return Err(Error::invalid(
                "Maximum topic size must exceed the minimum topic size",
            ));
        }
        Ok(())
    }
    pub(super) fn prepare(
        &self,
        assets: Option<&ldaca_rs::model_assets::ModelAssets>,
    ) -> Result<()> {
        self.validate()?;
        match assets {
            Some(assets) => {
                ldaca_rs::embedding::Embedder::load_in(Some(&self.embedding_model), assets)
            }
            None => ldaca_rs::embedding::Embedder::load(Some(&self.embedding_model)),
        }
        .map_err(model_error)?;
        match assets {
            Some(assets) => ldaca_rs::text::Tokenizer::load_in(&self.tokenizer, assets),
            None => ldaca_rs::text::Tokenizer::load(&self.tokenizer),
        }
        .map_err(model_error)?;
        Ok(())
    }
    fn config(&self, cache: Option<PathBuf>) -> engine::RunConfig {
        engine::RunConfig {
            embedder_repo_id: Some(self.embedding_model.clone()),
            embedding_cache_path: cache,
            segmentation: SegmentationConfig {
                method: self.segmentation.into(),
                max_tokens: self.max_segment_tokens,
            },
            seed: self.seed,
            min_cluster_size: self.minimum_topic_size,
            topic_size_limit: self.maximum_topic_size.map_or(
                engine::TopicSizeLimit::Uncapped,
                engine::TopicSizeLimit::Fixed,
            ),
            vectorizer_model_id: Some(self.tokenizer.clone()),
            lowercase: true,
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum Sampling {
    Count { count: u64 },
    Percentage { percentage: f64 },
}
impl Sampling {
    fn count(&self, total: u64) -> Result<u64> {
        match self {
            Self::Count { count } if *count > 0 => Ok((*count).min(total)),
            Self::Percentage { percentage }
                if percentage.is_finite() && *percentage > 0.0 && *percentage <= 100.0 =>
            {
                Ok(if total == 0 {
                    0
                } else {
                    ((total as f64 * percentage / 100.0).ceil() as u64).clamp(1, total)
                })
            }
            _ => Err(Error::invalid(
                "Sample count must be positive; percentage must be greater than 0 and at most 100",
            )),
        }
    }
}
#[derive(Clone, Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopicPreviewRequest {
    pub request: TopicRequest,
    pub sampling: Vec<Sampling>,
}
#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub(crate) struct TopicSource {
    pub input: DocumentInput,
    pub columns: Vec<(String, String)>,
    pub document_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub processed_text_count: Option<usize>,
    pub total_count: u64,
    pub documents: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub processed_column: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub projection: Option<Uuid>,
}
impl TopicSource {
    fn processed_count(&self) -> usize {
        self.processed_text_count.unwrap_or(self.document_count)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, utoipa::ToSchema)]
pub(crate) struct TopicResultV1 {
    pub sources: Vec<TopicSource>,
    pub natural_topic_count: usize,
    pub segment_count: usize,
    pub resolved_model: String,
    pub natural_projection: Uuid,
    pub projection_context: Option<Uuid>,
    #[serde(default)]
    pub retained_stages: Option<Uuid>,
    #[serde(default)]
    pub metadata: Option<Uuid>,
    #[serde(default)]
    pub parameters: Option<TopicAdjustmentSettings>,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct PreviewSummary {
    pub sources: Vec<TopicSource>,
    pub natural_topic_count: usize,
    pub segment_count: usize,
    pub resolved_model: String,
    pub natural_projection: Uuid,
    pub parameters: Option<TopicAdjustmentSettings>,
}
#[derive(Clone)]
pub(super) struct TopicModel {
    pub(in crate::project) preview_documents: Vec<PreviewDocuments>,
    pub(in crate::project) revision: Uuid,
    metadata: Vec<ColourField>,
    population: Option<Vec<usize>>,
    parameters: Option<TopicAdjustmentSettings>,
    pub sources: Vec<TopicSource>,
    pub natural: TopicModelingResult,
    pub context: Option<projection::TopicProjectionContext>,
    pub resolved_model: String,
}
#[derive(Clone, Debug, Deserialize, utoipa::ToSchema)]
#[serde(tag = "projection", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum TopicQuery {
    Documents(TopicDocumentQuery),
    Map {
        topic_count: usize,
        #[serde(default)]
        colour_by: Option<String>,
    },
    Words {
        topic_count: usize,
        stopword_source: Option<stopwords::StopwordSource>,
    },
}
impl TopicQuery {
    pub(super) fn stopwords(&self) -> Option<&stopwords::StopwordSource> {
        match self {
            Self::Words {
                stopword_source, ..
            } => stopword_source.as_ref(),
            _ => None,
        }
    }
}
#[derive(Serialize, utoipa::ToSchema)]
#[serde(tag = "projection", rename_all = "snake_case")]
pub(crate) enum TopicProjection {
    #[serde(skip)]
    Documents(DocumentPage),
    Map {
        #[serde(flatten)]
        basis: TopicProjectionBasis,
        natural_projection: Uuid,
        dominant_counts: Vec<Vec<usize>>,
        colour_fields: Vec<ColourFieldSummary>,
        colour_counts: Option<Vec<Vec<usize>>>,
        document_counts: Vec<usize>,
        outlier_counts: Vec<usize>,
        source_columns: Vec<Vec<(String, String)>>,
        source_inputs: Vec<DocumentInput>,
    },
    Words {
        words: Vec<Vec<RepresentativeWord>>,
        natural_projection: Uuid,
    },
}
#[derive(Clone, Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopicPublishSource {
    pub source: usize,
    pub name: String,
    pub columns: Vec<String>,
    pub coverage: bool,
}
#[derive(Clone, Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopicPublish {
    #[serde(default)]
    pub expected_projection: Option<Uuid>,
    pub topic_count: usize,
    pub top_n: usize,
    pub selected_topics: Vec<usize>,
    pub sources: Vec<TopicPublishSource>,
    pub dictionary_name: String,
    /// Captured displayed candidates, including words beyond the cloud's visible limit.
    pub words: Vec<Vec<String>>,
}
pub(super) fn model_error(error: impl std::fmt::Display) -> Error {
    Error::new("topic_modeling_error", error.to_string())
}
impl TopicModel {
    pub(super) fn summary(&self) -> PreviewSummary {
        let counts = self.population_sizes();
        let mut sources = self.sources.clone();
        for (source, count) in sources.iter_mut().zip(counts) {
            source.document_count = count;
        }
        PreviewSummary {
            sources,
            natural_topic_count: self.natural.topics.len(),
            segment_count: self.natural.n_segments,
            resolved_model: self.resolved_model.clone(),
            natural_projection: self.revision,
            parameters: self.parameters.clone(),
        }
    }
    fn population_sizes(&self) -> Vec<usize> {
        let mut begin = 0;
        self.sources
            .iter()
            .map(|source| {
                let end = begin + source.processed_count();
                let count = self
                    .population
                    .as_ref()
                    .map_or(source.document_count, |weights| {
                        weights[begin..end].iter().sum()
                    });
                begin = end;
                count
            })
            .collect()
    }
    fn validate_count(&self, count: usize) -> Result<()> {
        let natural = self.natural.topics.len();
        if (natural == 0 && count != 0) || (natural > 0 && !(1..=natural).contains(&count)) {
            return Err(Error::invalid("Topic count is outside this model's range"));
        }
        Ok(())
    }
    pub(super) fn query(
        &self,
        request: TopicQuery,
        excluded: HashSet<String>,
    ) -> Result<TopicProjection> {
        match request {
            TopicQuery::Documents(_) => {
                Err(Error::invalid("Document inspection requires retained rows"))
            }
            TopicQuery::Map {
                topic_count,
                colour_by,
            } => {
                self.validate_count(topic_count)?;
                let sizes = self
                    .sources
                    .iter()
                    .map(TopicSource::processed_count)
                    .collect::<Vec<_>>();
                let adjusted = if topic_count == self.natural.topics.len() {
                    None
                } else {
                    Some(
                        projection::project(
                            self.context
                                .as_ref()
                                .ok_or_else(|| model_error("Missing projection context"))?,
                            topic_count,
                        )
                        .map_err(model_error)?,
                    )
                };
                let projected = adjusted.as_ref().unwrap_or(&self.natural);
                let basis = if let Some(weights) = &self.population {
                    projection::basis_from_result_with_weights(projected, &sizes, weights)
                } else {
                    projection::basis_from_result(projected, &sizes)
                }
                .map_err(model_error)?;
                let documents = &projected.documents;
                let selected_colour = colour_by.as_deref().filter(|column| {
                    self.population.is_none()
                        || self.metadata.iter().any(|field| field.column == *column)
                });
                let (dominant_counts, colour_counts) = metadata::counts(
                    documents,
                    &sizes,
                    &self.metadata,
                    selected_colour,
                    topic_count,
                    self.population.as_deref(),
                )?;
                let mut outlier_counts = vec![0; sizes.len()];
                let mut begin = 0;
                for (source, size) in sizes.iter().enumerate() {
                    for document in &documents[begin..begin + size] {
                        if document.dominant_topic == -1
                            && document
                                .topic_coverage
                                .iter()
                                .any(|(topic, coverage)| *topic == -1 && *coverage > 0.0)
                        {
                            outlier_counts[source] += self
                                .population
                                .as_ref()
                                .map_or(1, |weights| weights[document.doc_index]);
                        }
                    }
                    begin += size;
                }
                Ok(TopicProjection::Map {
                    basis: basis.into(),
                    natural_projection: self.revision,
                    dominant_counts,
                    colour_counts,
                    colour_fields: self.metadata.iter().map(ColourField::summary).collect(),
                    document_counts: self.population_sizes(),
                    outlier_counts,
                    source_columns: self
                        .sources
                        .iter()
                        .map(|source| source.columns.clone())
                        .collect(),
                    source_inputs: self
                        .sources
                        .iter()
                        .map(|source| source.input.clone())
                        .collect(),
                })
            }
            TopicQuery::Words { topic_count, .. } => Ok(TopicProjection::Words {
                natural_projection: self.revision,
                words: self
                    .words(topic_count, &excluded)?
                    .into_iter()
                    .map(|words| words.into_iter().map(Into::into).collect())
                    .collect(),
            }),
        }
    }
    fn words(
        &self,
        count: usize,
        excluded: &HashSet<String>,
    ) -> Result<Vec<Vec<engine::RepresentativeWord>>> {
        self.validate_count(count)?;
        match &self.context {
            Some(context) => {
                projection::project_words(context, count, excluded).map_err(model_error)
            }
            None if count == 0 => Ok(Vec::new()),
            None => Err(model_error("Missing projection context")),
        }
    }
    fn documents(&self, count: usize) -> Result<Vec<DocumentResult>> {
        self.validate_count(count)?;
        if count == self.natural.topics.len() {
            return Ok(self.natural.documents.clone());
        }
        projection::project_documents(
            self.context
                .as_ref()
                .ok_or_else(|| model_error("Missing projection context"))?,
            count,
        )
        .map_err(model_error)
    }
}

fn capture(
    conn: &Connection,
    request: &TopicRequest,
    sampling: Option<&[Sampling]>,
    cancellation: &CancellationToken,
) -> Result<(Vec<CapturedDocuments>, Vec<TopicSource>, Vec<String>)> {
    request.validate()?;
    if sampling.is_some_and(|s| s.len() != request.inputs.len()) {
        return Err(Error::invalid("Choose sampling for each input"));
    }
    let mut retained = Vec::new();
    let mut sources = Vec::new();
    let mut texts = Vec::new();
    for (index, input) in request.inputs.iter().enumerate() {
        check_cancellation(cancellation)?;
        let mut docs = capture_documents(conn, input, None)?;
        let total = docs.count;
        if let Some(choices) = sampling {
            let count = choices[index].count(total)?;
            let sample = temporary_name();
            // Hash order is deterministic for the captured row identity and seed.
            // Re-number after restoring source order; identical text remains separate.
            conn.execute_batch(&format!("CREATE TEMP TABLE {sample} AS SELECT row_number() OVER (ORDER BY document_id)::UBIGINT AS document_id,source FROM (SELECT * FROM {} ORDER BY hash(document_id, {}::UBIGINT),document_id LIMIT {count}) ORDER BY document_id",docs.name,request.seed))?;
            conn.execute_batch(&format!("DROP TABLE {}", docs.name))?;
            docs.name = sample;
            docs.count = count;
        }
        let document_count: usize = conn.query_row(
            &format!(
                "SELECT count(source.{}) FROM {}",
                query::quote(&docs.input.column),
                docs.name
            ),
            [],
            |r| r.get(0),
        )?;
        distinct_documents_in(conn, &mut docs, sampling.is_some())?;
        let mut after = 0;
        loop {
            check_cancellation(cancellation)?;
            let rows = document_batch(conn, &docs.name, &docs.input.column, after, docs.count)?;
            if rows.is_empty() {
                break;
            }
            for (id, text) in rows {
                after = id;
                texts.push(text.unwrap_or_default());
            }
        }
        sources.push(TopicSource {
            input: docs.input.clone(),
            columns: docs.columns.clone(),
            document_count,
            processed_text_count: Some(docs.count as usize),
            total_count: total,
            documents: None,
            processed_column: Some(docs.input.column.clone()),
            projection: None,
        });
        retained.push(docs);
    }
    Ok((retained, sources, texts))
}
fn fit(
    request: &TopicRequest,
    sources: Vec<TopicSource>,
    texts: &[String],
    cache: Option<PathBuf>,
    assets: Option<&ldaca_rs::model_assets::ModelAssets>,
    cancellation: &CancellationToken,
    progress: &mut impl FnMut(&str, Option<f64>),
) -> Result<TopicModel> {
    let natural = engine::run_with_progress_in(
        &texts.iter().map(String::as_str).collect::<Vec<_>>(),
        &request.config(cache),
        assets,
        &mut |stage, fraction| {
            check_cancellation(cancellation).map_err(|e| std::io::Error::other(e.message))?;
            progress(stage, fraction);
            Ok(())
        },
    );
    check_cancellation(cancellation)?;
    let natural = natural.map_err(model_error)?;
    let context = natural
        .projection_context
        .as_deref()
        .map(projection::deserialize_context)
        .transpose()
        .map_err(model_error)?;
    Ok(TopicModel {
        preview_documents: Vec::new(),
        revision: Uuid::new_v4(),
        metadata: Vec::new(),
        population: None,
        parameters: Some(TopicAdjustmentSettings::from(request)),
        sources,
        natural,
        context,
        resolved_model: format!(
            "{}@{}",
            request.embedding_model,
            match assets {
                Some(assets) =>
                    ldaca_rs::embedding::Embedder::load_in(Some(&request.embedding_model), assets),
                None => ldaca_rs::embedding::Embedder::load(Some(&request.embedding_model)),
            }
            .map_err(model_error)?
            .cache_fingerprint()
        ),
    })
}
fn manifest(conn: &Connection, id: Uuid) -> Result<TopicResultV1> {
    let analysis = read_analysis(conn, id)?;
    Ok(serde_json::from_value(analysis.output(KIND)?.clone())?)
}
pub(super) fn load_model(conn: &Connection, id: Uuid) -> Result<TopicModel> {
    let analysis = read_analysis(conn, id)?;
    let mut output = manifest(conn, id)?;
    let mut natural: TopicModelingResult =
        serde_json::from_slice(&artifact_blob(conn, id, output.natural_projection)?)?;
    natural.retained_stages = output
        .retained_stages
        .map(|artifact| {
            Ok::<_, Error>(serde_json::from_slice(&artifact_blob(conn, id, artifact)?)?)
        })
        .transpose()?;
    let mut metadata = output
        .metadata
        .map(|artifact| {
            Ok::<_, Error>(serde_json::from_slice(&artifact_blob(conn, id, artifact)?)?)
        })
        .transpose()?
        .unwrap_or_default();
    let population = if analysis
        .result
        .as_ref()
        .is_some_and(|result| result.version == 2)
    {
        let request: TopicRequest = serde_json::from_value(analysis.request)?;
        if request.inputs.len() != output.sources.len() {
            return Err(model_error(
                "Saved Topic input bindings are incomplete. Rerun this analysis.",
            ));
        }
        let mut tables = Vec::new();
        for (source, input) in output.sources.iter_mut().zip(request.inputs) {
            source.input = input;
            let relation = Relation {
                schema: source
                    .input
                    .source
                    .schema
                    .clone()
                    .unwrap_or_else(|| "data".into()),
                name: source.input.source.name.clone(),
            };
            source.columns = mutations::columns(conn, &relation)?;
            tables.push(
                artifact_relation(
                    conn,
                    id,
                    source.documents.ok_or_else(|| {
                        model_error("Processed Topic texts are unavailable. Rerun this analysis.")
                    })?,
                )?
                .sql(),
            );
        }
        natural.documents = read_document_outputs(conn, &output.sources, &tables)?;
        let (weights, fields) =
            current_population(conn, &output.sources, &tables, &vec![None; tables.len()])?;
        metadata = fields;
        Some(weights)
    } else {
        None
    };
    let context = output
        .projection_context
        .map(|artifact| {
            projection::deserialize_context(&artifact_blob(conn, id, artifact)?)
                .map_err(model_error)
        })
        .transpose()?;
    Ok(TopicModel {
        preview_documents: Vec::new(),
        revision: output.natural_projection,
        metadata,
        population,
        parameters: output.parameters,
        natural,
        context,
        sources: output.sources,
        resolved_model: output.resolved_model,
    })
}

fn current_population(
    conn: &Connection,
    sources: &[TopicSource],
    tables: &[String],
    samples: &[Option<String>],
) -> Result<(Vec<usize>, Vec<ColourField>)> {
    if sources.len() != tables.len() || sources.len() != samples.len() {
        return Err(model_error("Live Topic population bindings are incomplete"));
    }
    let mut weights = Vec::new();
    let mut fields = Vec::new();
    for (index, source) in sources.iter().enumerate() {
        let key = source.processed_column.as_deref().ok_or_else(|| {
            model_error("Processed Topic text bindings are unavailable. Rerun this analysis.")
        })?;
        let rows = live_document_rows_in(
            &source.input,
            &tables[index],
            key,
            &source.columns,
            samples[index].as_deref(),
        );
        let scalar = source
            .columns
            .iter()
            .filter(|(column, kind)| metadata::eligible(column, kind, &source.input.column))
            .map(|(column, _)| {
                format!(
                    "{} := r.source.{}",
                    query::quote(column),
                    query::quote(column)
                )
            })
            .collect::<Vec<_>>();
        let projection = if scalar.is_empty() {
            "NULL::INTEGER AS source".into()
        } else {
            format!("struct_pack({}) AS source", scalar.join(","))
        };
        let population = temporary_name();
        conn.execute_batch(&format!("CREATE TEMP TABLE {population} AS SELECT r.document_id,r.processed_id,{projection} FROM ({rows}) r"))?;
        let begin = weights.len();
        weights.resize(begin + source.processed_count(), 0);
        let grouped = conn
            .prepare(&format!(
                "SELECT processed_id,count(*)::UBIGINT FROM {population} GROUP BY processed_id"
            ))?
            .query_map([], |r| Ok((r.get::<_, u64>(0)?, r.get::<_, u64>(1)?)))?
            .collect::<duckdb::Result<Vec<_>>>()?;
        for (document, count) in grouped {
            let local = usize::try_from(document)
                .ok()
                .and_then(|id| id.checked_sub(1))
                .filter(|id| *id < source.processed_count())
                .ok_or_else(|| model_error("Processed Topic text identity is invalid"))?;
            weights[begin + local] = count as usize;
        }
        if sources.len() == 1 {
            fields = metadata::live_fields(
                conn,
                &format!("SELECT * FROM {population}"),
                &source.columns,
                &source.input.column,
            )?;
        }
        conn.execute_batch(&format!("DROP TABLE {population}"))?;
    }
    Ok((weights, fields))
}

fn document_outputs(
    conn: &Connection,
    sources: &[TopicSource],
    documents: &[DocumentResult],
) -> Result<String> {
    let name = temporary_name();
    conn.execute_batch(&format!("CREATE TEMP TABLE {name}(source_index UBIGINT,document_id UBIGINT,dominant INTEGER,coverage VARCHAR)"))?;
    let mut appender = conn.appender(&name)?;
    let mut begin: usize = 0;
    for (index, source) in sources.iter().enumerate() {
        let end = begin
            .checked_add(source.processed_count())
            .ok_or_else(|| model_error("Processed Topic output size is invalid"))?;
        for (local, document) in documents
            .get(begin..end)
            .ok_or_else(|| model_error("Processed Topic outputs are incomplete"))?
            .iter()
            .enumerate()
        {
            let coverage = document
                .topic_coverage
                .iter()
                .map(|(topic, coverage)| serde_json::json!({"topic_id":topic,"coverage":coverage}))
                .collect::<Vec<_>>();
            let dominant = document
                .topic_coverage
                .iter()
                .any(|(_, coverage)| *coverage > 0.0)
                .then_some(document.dominant_topic);
            appender.append_row(params![
                index as u64,
                local as u64 + 1,
                dominant,
                serde_json::to_string(&coverage)?
            ])?;
        }
        begin = end;
    }
    appender.flush()?;
    Ok(name)
}

fn read_document_outputs(
    conn: &Connection,
    sources: &[TopicSource],
    tables: &[String],
) -> Result<Vec<DocumentResult>> {
    let mut documents = Vec::new();
    for (source, table) in sources.iter().zip(tables) {
        let rows = conn.prepare(&format!("SELECT document_id,dominant,to_json(coverage)::VARCHAR FROM {table} ORDER BY document_id"))?.query_map([],|row|Ok((row.get::<_,u64>(0)?,row.get::<_,Option<i32>>(1)?.unwrap_or(-1),row.get::<_,String>(2)?)))?.collect::<duckdb::Result<Vec<_>>>()?;
        if rows.len() != source.processed_count() {
            return Err(model_error(
                "Processed Topic outputs are incomplete. Rerun this analysis.",
            ));
        }
        for (expected, (id, dominant, coverage)) in rows.into_iter().enumerate() {
            if id != expected as u64 + 1 {
                return Err(model_error("Processed Topic output identity is invalid"));
            }
            #[derive(Deserialize)]
            struct Coverage {
                topic_id: i32,
                coverage: f32,
            }
            let coverage: Vec<Coverage> = serde_json::from_str(&coverage)?;
            documents.push(DocumentResult {
                doc_index: documents.len(),
                dominant_topic: dominant,
                topic_coverage: coverage
                    .into_iter()
                    .map(|c| (c.topic_id, c.coverage))
                    .collect(),
            });
        }
    }
    Ok(documents)
}
fn persist_model(
    conn: &Connection,
    id: Uuid,
    model: TopicModel,
    retained: Vec<CapturedDocuments>,
) -> Result<Value> {
    let (natural_projection, projection_context, retained_stages) =
        adjustments::store_outputs(conn, id, &model)?;
    let outputs = document_outputs(conn, &model.sources, &model.natural.documents)?;
    let mut sources = model.sources;
    for (index, (source, captured)) in sources.iter_mut().zip(retained).enumerate() {
        let artifact = Uuid::new_v4();
        let relation = Relation {
            schema: "wordflow".into(),
            name: artifact_table(artifact),
        };
        conn.execute_batch(&format!(
            "CREATE TABLE {} AS SELECT d.*,a.dominant,from_json(a.coverage,'[{{\"topic_id\":\"INTEGER\",\"coverage\":\"DOUBLE\"}}]') AS coverage FROM {} d JOIN {outputs} a ON a.document_id=d.document_id AND a.source_index={index}",
            relation.sql(),
            captured.name
        ))?;
        captured
            .metadata
            .source_columns(std::slice::from_ref(&captured.input.column))
            .prefixed("source")
            .store(conn, &relation)?;
        register_table(conn, id, artifact, &format!("documents_{index}"))?;
        source.documents = Some(artifact);
        let view = Uuid::new_v4();
        conn.execute_batch(&format!(
            "CREATE VIEW wordflow.{} AS SELECT * FROM {}",
            artifact_table(view),
            relation.sql()
        ))?;
        register_table(conn, id, view, &format!("source_{index}_projection"))?;
        captured
            .metadata
            .source_columns(std::slice::from_ref(&captured.input.column))
            .prefixed("source")
            .store(
                conn,
                &Relation {
                    schema: "wordflow".into(),
                    name: artifact_table(view),
                },
            )?;
        source.projection = Some(view);
    }
    conn.execute_batch(&format!("DROP TABLE {outputs}"))?;
    Ok(serde_json::to_value(TopicResultV1 {
        sources,
        natural_topic_count: model.natural.topics.len(),
        segment_count: model.natural.n_segments,
        resolved_model: model.resolved_model,
        natural_projection,
        projection_context,
        retained_stages,
        metadata: None,
        parameters: model.parameters,
    })?)
}

impl Database {
    pub(super) fn validate_topic_request(&self, tab: Uuid, request: &TopicRequest) -> Result<()> {
        request.validate()?;
        if read_tab(&self.conn, tab)?.kind != KIND {
            return Err(Error::invalid("Choose a Topic Modelling tab"));
        }
        for input in &request.inputs {
            let source = input.source.resolve(&self.conn)?;
            mutations::column_name(&self.conn, &source.relation, &input.column)?;
        }
        Ok(())
    }
    pub(super) fn run_topic_model(
        &mut self,
        tab: Uuid,
        id: Uuid,
        request: TopicRequest,
        cache: Option<PathBuf>,
        mut progress: impl FnMut(&str, Option<f64>),
    ) -> Result<Analysis> {
        self.validate_topic_request(tab, &request)?;
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        progress("Capturing source documents", None);
        let (retained, sources, texts) = capture(&self.conn, &request, None, &self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        let model = fit(
            &request,
            sources,
            &texts,
            cache,
            self.model_assets.as_ref(),
            &self.cancellation,
            &mut progress,
        )?;
        drop(texts);
        progress("Saving model", None);
        self.publish_analysis_version(
            AcceptedAnalysis {
                id,
                tab_id: tab,
                kind: KIND,
            },
            2,
            None,
            move |conn| persist_model(conn, id, model, retained),
        )
    }
    pub(super) fn preview_topic_model(
        &mut self,
        tab: Uuid,
        input: TopicPreviewRequest,
        cache: Option<PathBuf>,
        mut progress: impl FnMut(&str, Option<f64>),
    ) -> Result<TopicModel> {
        self.validate_topic_request(tab, &input.request)?;
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        progress("Sampling documents", None);
        let (retained, sources, texts) = capture(
            &self.conn,
            &input.request,
            Some(&input.sampling),
            &self.cancellation,
        )?;
        let tables = retained
            .iter()
            .map(|docs| docs.name.clone())
            .collect::<Vec<_>>();
        let samples = retained
            .iter()
            .map(|docs| docs.population.clone())
            .collect::<Vec<_>>();
        let (population, metadata) = current_population(&self.conn, &sources, &tables, &samples)?;
        let mut preview_documents = Vec::new();
        for docs in retained {
            let rows = live_document_rows_in(
                &docs.input,
                &docs.name,
                &docs.input.column,
                &docs.columns,
                docs.population.as_deref(),
            );
            preview_documents.push(PreviewDocuments::capture_joined(
                &self.conn,
                &rows,
                &docs,
                &self.cancellation,
            )?);
            self.conn
                .execute_batch(&format!("DROP TABLE {}", docs.name))?;
            if let Some(sample) = docs.population {
                self.conn.execute_batch(&format!("DROP TABLE {sample}"))?;
            }
        }
        self.conn.execute_batch("COMMIT")?;
        let mut model = fit(
            &input.request,
            sources,
            &texts,
            cache,
            self.model_assets.as_ref(),
            &self.cancellation,
            &mut progress,
        )?;
        model.preview_documents = preview_documents;
        model.metadata = metadata;
        model.population = Some(population);
        Ok(model)
    }
    pub(super) fn topic_exclusions(
        &self,
        selected: Option<&stopwords::StopwordSource>,
    ) -> Result<HashSet<String>> {
        let Some(selected) = selected else {
            return Ok(HashSet::new());
        };
        stopwords::prepare_stopwords(&self.conn, selected)?;
        Ok(self
            .conn
            .prepare("SELECT word FROM __wordflow_stopwords")?
            .query_map([], |r| r.get(0))?
            .collect::<duckdb::Result<_>>()?)
    }
    pub(super) fn query_topic_model(
        &self,
        id: Uuid,
        request: TopicQuery,
    ) -> Result<TopicProjection> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let model = load_model(&self.conn, id)?;
        let output = self.project_topic_model(&model, Some(id), request)?;
        self.conn.execute_batch("COMMIT")?;
        check_cancellation(&self.cancellation)?;
        Ok(output)
    }
    pub(super) fn publish_topic_model(
        &mut self,
        id: Uuid,
        request: TopicPublish,
    ) -> Result<Vec<ObjectTarget>> {
        let tx = self.conn.transaction()?;
        let model = load_model(&tx, id)?;
        if request
            .expected_projection
            .is_some_and(|expected| expected != model.revision)
        {
            return Err(Error::new(
                "topic_adjustment_stale",
                "Topic results changed. Refresh the results before publishing.",
            ));
        }
        let documents = model.documents(request.topic_count)?;
        if (request.topic_count == 0 && request.top_n != 0)
            || (request.topic_count > 0 && !(1..=request.topic_count).contains(&request.top_n))
        {
            return Err(Error::invalid(
                "Top topics per document is outside this model's range",
            ));
        }
        if request.words.len() != request.topic_count
            || request.words.iter().any(|w| w.len() > 100)
            || request
                .selected_topics
                .iter()
                .any(|id| *id >= request.topic_count)
        {
            return Err(Error::invalid(
                "Topic selection or representative words do not match the projection",
            ));
        }
        if request.sources.is_empty() {
            return Err(Error::invalid("Choose at least one source to publish"));
        }
        let assignments = temporary_name();
        tx.execute_batch(&format!("CREATE TEMP TABLE {assignments}(source_index UBIGINT,document_id UBIGINT,dominant BIGINT,coverage VARCHAR,selected BOOLEAN)"))?;
        let mut counts = vec![vec![0u64; model.sources.len()]; request.topic_count];
        let mut offset = 0;
        {
            let mut appender = tx.appender(&assignments)?;
            for (source_index, source) in model.sources.iter().enumerate() {
                for local in 0..source.processed_count() {
                    check_cancellation(&self.cancellation)?;
                    let doc = documents
                        .get(offset + local)
                        .ok_or_else(|| model_error("Document identity is missing"))?;
                    let members = memberships(doc, request.top_n);
                    for &topic in &members {
                        counts[topic as usize][source_index] += model
                            .population
                            .as_ref()
                            .map_or(1, |weights| weights[doc.doc_index])
                            as u64;
                    }
                    let selected = request.selected_topics.is_empty()
                        || members
                            .iter()
                            .any(|topic| request.selected_topics.contains(&(*topic as usize)));
                    let coverage = (-1..request.topic_count as i32)
                        .map(|topic| {
                            let value = doc
                                .topic_coverage
                                .iter()
                                .find(|(id, _)| *id == topic)
                                .map_or(0.0, |(_, v)| *v);
                            serde_json::json!({"topic_id":topic,"coverage":value})
                        })
                        .collect::<Vec<_>>();
                    let dominant = if source.processed_column.is_some()
                        && !doc
                            .topic_coverage
                            .iter()
                            .any(|(_, coverage)| *coverage > 0.0)
                    {
                        None
                    } else {
                        Some(doc.dominant_topic)
                    };
                    appender.append_row(params![
                        source_index as u64,
                        local as u64 + 1,
                        dominant,
                        serde_json::to_string(&coverage)?,
                        selected
                    ])?;
                }
                offset += source.processed_count();
            }
            appender.flush()?;
        }
        let mut published = Vec::new();
        let mut used_sources = HashSet::new();
        let mut scope = ChangeScope::resource(Resource::Graph);
        for selected in &request.sources {
            if !used_sources.insert(selected.source) {
                return Err(Error::invalid("A source can be published only once"));
            }
            let source = model
                .sources
                .get(selected.source)
                .ok_or_else(|| Error::invalid("Unknown source"))?;
            let relation = artifact_relation(
                &tx,
                id,
                source
                    .documents
                    .ok_or_else(|| model_error("Source artifact is missing"))?,
            )?;
            let target = output_target(&selected.name)?;
            let mut names = HashSet::new();
            let mut columns = Vec::new();
            for requested in std::iter::once(&source.input.column).chain(&selected.columns) {
                let name = &source
                    .columns
                    .iter()
                    .find(|(name, _)| name.eq_ignore_ascii_case(requested))
                    .ok_or_else(|| Error::invalid("Unknown retained column"))?
                    .0;
                if name != &source.input.column
                    && ["TOPIC_top1", "TOPIC_coverage"]
                        .iter()
                        .any(|field| name.eq_ignore_ascii_case(field))
                {
                    return Err(Error::invalid(format!(
                        "Metadata column conflicts with a generated field: {name}"
                    )));
                }
                if names.insert(name.to_ascii_lowercase()) {
                    columns.push(name.clone());
                }
            }
            let mut fields = columns
                .iter()
                .map(|name| format!("d.source.{} AS {}", query::quote(name), query::quote(name)))
                .collect::<Vec<_>>();
            let dominant = generated_name(&mut names, "TOPIC_top1");
            let output_alias = if source.processed_column.is_some() {
                "d"
            } else {
                "a"
            };
            fields.push(format!(
                "{output_alias}.dominant AS {}",
                query::quote(&dominant)
            ));
            let mut annotations = if source.processed_column.is_some() {
                arrow_metadata::Annotations::load(
                    &tx,
                    &Relation {
                        schema: source
                            .input
                            .source
                            .schema
                            .clone()
                            .unwrap_or_else(|| "data".into()),
                        name: source.input.source.name.clone(),
                    },
                )?
                .prefixed("source")
                .source_columns(&columns)
            } else {
                arrow_metadata::Annotations::load(&tx, &relation)?.source_columns(&columns)
            };
            if selected.coverage {
                let name = generated_name(&mut names, "TOPIC_coverage");
                fields.push(format!("CAST(from_json({output_alias}.coverage,'[{{\"topic_id\":\"BIGINT\",\"coverage\":\"DOUBLE\"}}]') AS STRUCT(topic_id BIGINT,coverage DOUBLE)[{}]) AS {}",request.topic_count+1,query::quote(&name)));
                annotations.0.push(arrow_metadata::Annotation {
                    path: vec![name],
                    extension: "org.ldaca.wordflow.topic_coverage.v1".into(),
                    payload: Some("{\"version\":1}".into()),
                });
            }
            if let Some(key) = &source.processed_column {
                let outputs = copy_publication_query(
                    &tx,
                    &format!(
                        "SELECT d.document_id,d.source,a.dominant,a.coverage,a.selected FROM {} d JOIN {assignments} a ON a.document_id=d.document_id AND a.source_index={}",
                        relation.sql(),
                        selected.source
                    ),
                    &[],
                )?;
                let publication = PublicationSource::selected(&tx, &source.input, columns.clone())?;
                let rows = live_document_rows(
                    &source.input,
                    &outputs.sql(),
                    key,
                    &publication.columns(&source.columns),
                );
                let joined = format!(
                    "SELECT r.document_id,r.source,a.dominant,a.coverage,a.selected FROM ({rows}) r JOIN {} a ON a.document_id=r.processed_id",
                    outputs.sql()
                );
                publish_live_view(&tx, &target, vec![outputs], publication, &joined, |view| {
                    format!(
                        "SELECT {} FROM {} d WHERE d.selected ORDER BY d.document_id",
                        fields.join(","),
                        view.sql()
                    )
                })?;
                scope.resources.push(Resource::Project);
            } else {
                tx.execute_batch(&format!("CREATE TABLE {} AS SELECT {} FROM {} d JOIN {assignments} a ON a.document_id=d.document_id AND a.source_index={} WHERE a.selected ORDER BY d.document_id",target.sql(),fields.join(","),relation.sql(),selected.source))?;
            }
            let document = columns
                .contains(&source.input.column)
                .then_some(&source.input.column);
            tx.execute(
                "INSERT INTO wordflow.nodes(table_name,document_column) VALUES (?,?)",
                params![target.name, document],
            )?;
            annotations.store(&tx, &target)?;
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
            scope.objects.push(target.clone());
            published.push(ObjectTarget {
                schema: Some(target.schema),
                name: target.name,
            });
        }
        let dictionary = output_target(&request.dictionary_name)?;
        tx.execute_batch(&format!("CREATE TABLE {}(TOPIC BIGINT,TOPIC_meaning VARCHAR[],source_counts UBIGINT[],total_count UBIGINT)",dictionary.sql()))?;
        for (topic, words) in request.words.iter().enumerate() {
            check_cancellation(&self.cancellation)?;
            tx.execute(&format!("INSERT INTO {} SELECT ?,from_json(?,'[\"VARCHAR\"]'),from_json(?,'[\"UBIGINT\"]'),?",dictionary.sql()),params![topic as i64,serde_json::to_string(words)?,serde_json::to_string(&counts[topic])?,counts[topic].iter().sum::<u64>()])?;
        }
        tx.execute(
            "INSERT INTO wordflow.nodes(table_name) VALUES (?)",
            [&dictionary.name],
        )?;
        scope.objects.push(dictionary.clone());
        published.push(ObjectTarget {
            schema: Some(dictionary.schema),
            name: dictionary.name,
        });
        PendingChange::new(&tx, scope, &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(published)
    }
}
fn output_target(name: &str) -> Result<Relation> {
    if name.trim().is_empty() || name.contains('\0') {
        return Err(Error::invalid("Enter an output name"));
    }
    Ok(Relation {
        schema: "data".into(),
        name: name.trim().into(),
    })
}
fn memberships(document: &DocumentResult, top_n: usize) -> Vec<i32> {
    let mut positive = document
        .topic_coverage
        .iter()
        .filter(|(id, value)| *id >= 0 && *value > 0.0)
        .copied()
        .collect::<Vec<_>>();
    positive.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    if top_n == 0 {
        return Vec::new();
    }
    let cutoff = positive.get(top_n - 1).map_or(0.0, |(_, value)| *value);
    positive
        .into_iter()
        .filter_map(|(id, value)| (value >= cutoff).then_some(id))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "explicit model provisioning and acceptance; may download ONNX assets"]
    fn topic_model_acceptance() {
        let texts: Vec<Value> = serde_json::from_str(include_str!(
            "../../../frontend/e2e/fixtures/data/topic-consultation-reference.json"
        ))
        .unwrap();
        let texts = texts
            .iter()
            .map(|row| row["text"].as_str().unwrap_or_default().to_owned())
            .collect::<Vec<_>>();
        for supported in MODELS {
            let start = std::time::Instant::now();
            let model = ldaca_rs::embedding::Embedder::load(Some(supported.id)).unwrap();
            assert_eq!(model.max_length(), supported.token_limit);
            let probes = [
                "Families need affordable housing and lower rents.",
                "Residents need homes with affordable rent.",
                "Doctors treat patients in a hospital.",
                "家庭需要可负担的住房和较低的租金。",
            ]
            .map(str::to_owned);
            let vectors = model.encode_batches(&probes, 2).unwrap();
            let norm = |i: usize| {
                vectors[i]
                    .iter()
                    .map(|v| f64::from(*v).powi(2))
                    .sum::<f64>()
                    .sqrt()
            };
            let cosine = |left: usize, right: usize| {
                vectors[left]
                    .iter()
                    .zip(&vectors[right])
                    .map(|(a, b)| f64::from(*a) * f64::from(*b))
                    .sum::<f64>()
                    / (norm(left) * norm(right))
            };
            assert!(cosine(0, 1) > cosine(0, 2));
            if supported.id.contains("multilingual") {
                assert!(cosine(0, 3) > cosine(2, 3));
            }
            let mut request = request();
            request.embedding_model = supported.id.into();
            request.max_segment_tokens = supported.token_limit;
            request.prepare(None).unwrap();
            let sources = vec![TopicSource {
                input: request.inputs[0].clone(),
                columns: vec![],
                document_count: texts.len(),
                processed_text_count: None,
                total_count: texts.len() as u64,
                documents: None,
                processed_column: None,
                projection: None,
            }];
            let fitted = fit(
                &request,
                sources,
                &texts,
                None,
                None,
                &CancellationToken::new(),
                &mut |_, _| {},
            )
            .unwrap();
            assert!(!fitted.natural.topics.is_empty());
            assert_eq!(fitted.natural.documents.len(), texts.len());
            assert!(fitted.natural.n_segments > texts.len());
            eprintln!(
                "MODEL ACCEPTED {} provider={} topics={} segments={} elapsed={:?} English similarity={} cross-language similarity={}",
                supported.id,
                model.provider_id(),
                fitted.natural.topics.len(),
                fitted.natural.n_segments,
                start.elapsed(),
                cosine(0, 1),
                cosine(0, 3)
            );
        }
    }
    #[test]
    #[ignore = "explicit local model and performance acceptance"]
    fn topic_model_benchmark() {
        use std::time::Instant;
        let mut p = Project::untitled().unwrap();
        p.database.conn.execute_batch("CREATE TABLE data.texts(id BIGINT,text VARCHAR); INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('texts','text')").unwrap();
        let fixtures: Vec<Value> = serde_json::from_str(include_str!(
            "../../../frontend/e2e/fixtures/data/topic-consultation-reference.json"
        ))
        .unwrap();
        {
            let mut append = p.database.conn.appender_to_db("texts", "data").unwrap();
            for i in 0..1000 {
                let text = fixtures[i % fixtures.len()]["text"].as_str();
                append.append_row(params![i as i64, text]).unwrap();
            }
            append.flush().unwrap();
        }
        let request = request();
        request.prepare(None).unwrap();
        let start = Instant::now();
        let (_, sampled, _) = capture(
            &p.database.conn,
            &request,
            Some(&[Sampling::Count { count: 100 }]),
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(sampled[0].document_count, 100);
        eprintln!("TOPIC BENCH sample 100/1000 {:?}", start.elapsed());
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
            .begin_analysis_run(tab, KIND, serde_json::to_value(&request).unwrap())
            .unwrap();
        let cache = tempfile::tempdir().unwrap();
        let cache_path = cache.path().join("embedding.duckdb");
        let start = Instant::now();
        p.database
            .run_topic_model(
                tab,
                id,
                request.clone(),
                Some(cache_path.clone()),
                |_, _| {},
            )
            .unwrap();
        let manifest = manifest(&p.database.conn, id).unwrap();
        assert_eq!(manifest.sources[0].document_count, 1000);
        let count = manifest.natural_topic_count;
        eprintln!(
            "TOPIC BENCH full fit 1000 rows {} segments {} topics {:?}",
            manifest.segment_count,
            count,
            start.elapsed()
        );
        let start = Instant::now();
        let map = p
            .database
            .query_topic_model(
                id,
                TopicQuery::Map {
                    topic_count: count,
                    colour_by: None,
                },
            )
            .unwrap();
        eprintln!(
            "TOPIC BENCH map {:?} bytes={}",
            start.elapsed(),
            serde_json::to_vec(&map).unwrap().len()
        );
        let start = Instant::now();
        let TopicProjection::Words { words, .. } = p
            .database
            .query_topic_model(
                id,
                TopicQuery::Words {
                    topic_count: count,
                    stopword_source: None,
                },
            )
            .unwrap()
        else {
            panic!("words")
        };
        eprintln!("TOPIC BENCH words {:?}", start.elapsed());
        let start = Instant::now();
        p.database
            .publish_topic_model(
                id,
                TopicPublish {
                    expected_projection: None,
                    topic_count: count,
                    top_n: count.min(2),
                    selected_topics: vec![],
                    sources: vec![TopicPublishSource {
                        source: 0,
                        name: "published".into(),
                        columns: vec!["id".into(), "text".into()],
                        coverage: true,
                    }],
                    dictionary_name: "dictionary".into(),
                    words: words
                        .into_iter()
                        .map(|topic| topic.into_iter().map(|word| word.word).collect())
                        .collect(),
                },
            )
            .unwrap();
        eprintln!("TOPIC BENCH publication {:?}", start.elapsed());
        let (_, sources, texts) =
            capture(&p.database.conn, &request, None, &CancellationToken::new()).unwrap();
        let cancellation = CancellationToken::new();
        let mut cancelled_at = None;
        let stopped = fit(
            &request,
            sources,
            &texts,
            Some(cache_path),
            None,
            &cancellation,
            &mut |stage, _| {
                if stage == "Reducing embeddings" {
                    cancelled_at = Some(Instant::now());
                    cancellation.cancel();
                }
            },
        );
        assert!(stopped.is_err());
        eprintln!(
            "TOPIC BENCH cancellation during reduction {:?}",
            cancelled_at.expect("reduction reached").elapsed()
        );
    }
    fn request() -> TopicRequest {
        TopicRequest {
            inputs: vec![DocumentInput {
                source: ObjectTarget {
                    schema: Some("data".into()),
                    name: "texts".into(),
                },
                column: "text".into(),
            }],
            embedding_model: MODELS[0].id.into(),
            tokenizer: "native:plain_words_en".into(),
            segmentation: SegmentationMethod::Automatic,
            max_segment_tokens: 256,
            minimum_topic_size: 10,
            maximum_topic_size: None,
            seed: 7,
        }
    }
    fn source() -> Project {
        let p = Project::untitled().unwrap();
        p.database.conn.execute_batch("CREATE TABLE data.texts AS SELECT range AS id,CASE WHEN range=1 THEN NULL WHEN range=2 THEN '' ELSE 'repeated 😀 文本' END AS text FROM range(25); INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('texts','text')").unwrap();
        p
    }
    #[test]
    fn count_and_percentage_sampling_are_bounded_seeded_and_source_ordered() {
        let p = source();
        let cancel = CancellationToken::new();
        let sample = |choice| {
            let (retained, sources, _) =
                capture(&p.database.conn, &request(), Some(&[choice]), &cancel).unwrap();
            let ids = p
                .database
                .conn
                .prepare(&format!(
                    "SELECT source.id FROM {} ORDER BY document_id",
                    retained[0].population.as_ref().unwrap()
                ))
                .unwrap()
                .query_map([], |r| r.get::<_, i64>(0))
                .unwrap()
                .collect::<duckdb::Result<Vec<_>>>()
                .unwrap();
            assert_eq!(sources[0].total_count, 25);
            assert!(ids.windows(2).all(|pair| pair[0] < pair[1]));
            ids
        };
        let first = sample(Sampling::Count { count: 10 });
        assert_eq!(first, sample(Sampling::Count { count: 10 }));
        assert_eq!(sample(Sampling::Count { count: 1000 }).len(), 25);
        assert_eq!(sample(Sampling::Percentage { percentage: 0.1 }).len(), 1);
        assert_eq!(sample(Sampling::Percentage { percentage: 10.0 }).len(), 3);
        assert_eq!(
            Sampling::Percentage { percentage: 10.0 }.count(0).unwrap(),
            0
        );
        assert!(
            Sampling::Percentage {
                percentage: f64::NAN
            }
            .count(10)
            .is_err()
        );
        assert!(Sampling::Count { count: 0 }.count(10).is_err());
    }
    #[test]
    fn full_capture_deduplicates_exact_text_and_preview_creates_no_project_records() {
        let p = source();
        let (retained, sources, texts) = capture(
            &p.database.conn,
            &request(),
            None,
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(sources[0].document_count, 24);
        assert_eq!(sources[0].processed_text_count, Some(2));
        assert_eq!(texts, ["repeated 😀 文本", ""]);
        let (population, fields) = current_population(
            &p.database.conn,
            &sources,
            &[retained[0].name.clone()],
            &[None],
        )
        .unwrap();
        assert_eq!(population, [23, 1]);
        assert!(fields.is_empty());
        for table in ["analyses", "artifacts"] {
            let count: i64 = p
                .database
                .conn
                .query_row(&format!("SELECT count(*) FROM wordflow.{table}"), [], |r| {
                    r.get(0)
                })
                .unwrap();
            assert_eq!(count, 0);
        }
    }
    #[test]
    fn live_topic_population_uses_current_rows_but_preview_uses_only_sampled_rows() {
        let mut p = source();
        p.database.conn.execute_batch("ALTER TABLE data.texts ADD COLUMN category VARCHAR; UPDATE data.texts SET category=CASE WHEN id%2=0 THEN 'a' ELSE 'b' END").unwrap();
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
            .begin_analysis_run(tab, KIND, serde_json::to_value(request()).unwrap())
            .unwrap();
        let (retained, sources, _) = capture(
            &p.database.conn,
            &request(),
            None,
            &CancellationToken::new(),
        )
        .unwrap();
        let model = TopicModel {
            revision: Uuid::new_v4(),
            parameters: None,
            metadata: vec![],
            population: None,
            preview_documents: vec![],
            sources,
            natural: TopicModelingResult {
                topics: vec![],
                documents: vec![
                    DocumentResult {
                        doc_index: 0,
                        dominant_topic: -1,
                        topic_coverage: vec![(-1, 1.0)],
                    },
                    DocumentResult {
                        doc_index: 1,
                        dominant_topic: -1,
                        topic_coverage: vec![],
                    },
                ],
                n_segments: 1,
                max_topic_size: None,
                projection_context: None,
                retained_stages: None,
            },
            context: None,
            resolved_model: MODELS[0].id.into(),
        };
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
        let map = |p: &mut Project| {
            p.database
                .query_topic_model(
                    id,
                    TopicQuery::Map {
                        topic_count: 0,
                        colour_by: None,
                    },
                )
                .unwrap()
        };
        let TopicProjection::Map {
            document_counts,
            outlier_counts,
            colour_fields,
            ..
        } = map(&mut p)
        else {
            panic!("map")
        };
        assert_eq!(document_counts, [24]);
        assert_eq!(outlier_counts, [23]);
        assert_eq!(
            colour_fields
                .iter()
                .find(|f| f.column == "category")
                .unwrap()
                .groups
                .iter()
                .map(|g| g.count)
                .sum::<usize>(),
            24
        );
        p.database.conn.execute_batch("UPDATE data.texts SET text='unprocessed' WHERE id IN (3,4); INSERT INTO data.texts VALUES (25,'repeated 😀 文本','c')").unwrap();
        let TopicProjection::Map {
            document_counts,
            outlier_counts,
            colour_fields,
            ..
        } = map(&mut p)
        else {
            panic!("map")
        };
        assert_eq!(document_counts, [23]);
        assert_eq!(outlier_counts, [22]);
        assert_eq!(
            colour_fields
                .iter()
                .find(|f| f.column == "category")
                .unwrap()
                .groups
                .len(),
            3
        );
        p.database
            .publish_topic_model(
                id,
                TopicPublish {
                    expected_projection: None,
                    topic_count: 0,
                    top_n: 0,
                    selected_topics: vec![],
                    sources: vec![TopicPublishSource {
                        source: 0,
                        name: "live_topics".into(),
                        columns: vec!["id".into(), "category".into()],
                        coverage: true,
                    }],
                    dictionary_name: "dictionary".into(),
                    words: vec![],
                },
            )
            .unwrap();
        assert_eq!(
            p.database
                .conn
                .query_row("SELECT count(*) FROM data.live_topics", [], |r| r
                    .get::<_, u64>(0))
                .unwrap(),
            23
        );
        assert_eq!(
            p.database
                .conn
                .query_row(
                    "SELECT count(*) FROM data.live_topics WHERE text='' AND TOPIC_top1 IS NULL",
                    [],
                    |r| r.get::<_, u64>(0)
                )
                .unwrap(),
            1
        );
        p.database.clear_analysis_tab(tab).unwrap();
        assert_eq!(
            p.database
                .conn
                .query_row("SELECT count(*) FROM data.live_topics", [], |r| r
                    .get::<_, u64>(0))
                .unwrap(),
            23
        );
        let (sample, sources, _) = capture(
            &p.database.conn,
            &request(),
            Some(&[Sampling::Count { count: 5 }]),
            &CancellationToken::new(),
        )
        .unwrap();
        let (weights, _) = current_population(
            &p.database.conn,
            &sources,
            &[sample[0].name.clone()],
            &[sample[0].population.clone()],
        )
        .unwrap();
        assert!(weights.iter().sum::<usize>() <= 5);
        assert!(weights.iter().sum::<usize>() < 23);
    }
    #[test]
    fn publication_membership_includes_cutoff_ties_but_never_outliers_or_zero() {
        let doc = DocumentResult {
            doc_index: 0,
            dominant_topic: -1,
            topic_coverage: vec![(-1, 0.5), (0, 0.2), (1, 0.2), (2, 0.1), (3, 0.0)],
        };
        assert_eq!(memberships(&doc, 1), vec![0, 1]);
        assert_eq!(memberships(&doc, 2), vec![0, 1]);
        assert_eq!(memberships(&doc, 3), vec![0, 1, 2]);
    }
    #[test]
    fn publication_is_atomic_collision_safe_and_independent() {
        let mut p = source();
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
            .begin_analysis_run(tab, KIND, serde_json::to_value(request()).unwrap())
            .unwrap();
        let docs = Uuid::new_v4();
        let natural = Uuid::new_v4();
        p.database.publish_analysis(AcceptedAnalysis { id,tab_id:tab,kind:KIND },|conn| {
            conn.execute_batch(&format!("CREATE TABLE wordflow.{} AS SELECT row_number() OVER ()::UBIGINT document_id,t AS source FROM data.texts t",artifact_table(docs)))?;
            register_table(conn,id,docs,"documents_0")?;
            let result=TopicModelingResult { topics:vec![],documents:(0..25).map(|doc_index|DocumentResult {doc_index,dominant_topic:-1,topic_coverage:if doc_index==1 || doc_index==2 {vec![]} else {vec![(-1,1.0)]}}).collect(),n_segments:23,max_topic_size:None,projection_context:None,retained_stages:None };
            register_blob(conn,id,natural,"natural_projection","application/json",&serde_json::to_vec(&result)?)?;
            Ok(serde_json::to_value(TopicResultV1 { sources:vec![TopicSource { input:request().inputs.remove(0),columns:vec![("id".into(),"BIGINT".into()),("text".into(),"VARCHAR".into())],document_count:25,processed_text_count:None,total_count:25,documents:Some(docs),processed_column:None,projection:None }],natural_topic_count:0,segment_count:23,resolved_model:MODELS[0].id.into(),natural_projection:natural,projection_context:None,retained_stages:None,metadata:None,parameters:None })?)
        }).unwrap();
        let publish = |dictionary_name: &str| TopicPublish {
            expected_projection: None,
            topic_count: 0,
            top_n: 0,
            selected_topics: vec![],
            sources: vec![TopicPublishSource {
                source: 0,
                name: "annotated".into(),
                columns: vec!["id".into(), "text".into()],
                coverage: true,
            }],
            dictionary_name: dictionary_name.into(),
            words: vec![],
        };
        assert!(
            p.database
                .publish_topic_model(id, publish("texts"))
                .is_err()
        );
        assert!(
            p.database
                .conn
                .prepare("SELECT * FROM data.annotated")
                .is_err()
        );
        p.database
            .conn
            .execute_batch(
                "DROP TABLE data.texts; DELETE FROM wordflow.nodes WHERE table_name='texts'",
            )
            .unwrap();
        p.database
            .publish_topic_model(id, publish("dictionary"))
            .unwrap();
        p.database.clear_analysis_tab(tab).unwrap();
        let rows: i64 = p
            .database
            .conn
            .query_row("SELECT count(*) FROM data.annotated", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 25);
        let dictionary: i64 = p
            .database
            .conn
            .query_row("SELECT count(*) FROM data.dictionary", [], |r| r.get(0))
            .unwrap();
        assert_eq!(dictionary, 0);
        let metadata = arrow_metadata::Annotations::load(
            &p.database.conn,
            &Relation {
                schema: "data".into(),
                name: "annotated".into(),
            },
        )
        .unwrap();
        assert_eq!(
            metadata.0[0].extension,
            "org.ldaca.wordflow.topic_coverage.v1"
        );
        assert!(
            p.database
                .analysis_tab(tab)
                .unwrap()
                .analysis
                .is_some_and(|a| !a.has_result)
        );
    }
}
