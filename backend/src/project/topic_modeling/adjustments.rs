//! Retained-stage adjustment replaces only derived outputs, never captured rows.
use super::*;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopicAdjustmentSettings {
    pub minimum_topic_size: usize,
    #[serde(default)]
    pub maximum_topic_size: Option<usize>,
    pub tokenizer: String,
}
impl From<&TopicRequest> for TopicAdjustmentSettings {
    fn from(value: &TopicRequest) -> Self {
        Self {
            minimum_topic_size: value.minimum_topic_size,
            maximum_topic_size: value.maximum_topic_size,
            tokenizer: value.tokenizer.clone(),
        }
    }
}
#[derive(Clone, Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TopicAdjustment {
    pub expected_projection: Uuid,
    pub settings: TopicAdjustmentSettings,
}

impl TopicModel {
    pub(in crate::project) fn adjusted(
        &self,
        texts: &[String],
        request: &TopicAdjustment,
        cache: Option<&std::path::Path>,
        assets: Option<&ldaca_rs::model_assets::ModelAssets>,
        cancellation: &CancellationToken,
    ) -> Result<Self> {
        if self.revision != request.expected_projection {
            return Err(Error::new(
                "topic_adjustment_stale",
                "The Topic result changed. Refresh and retry this adjustment.",
            ));
        }
        let stages = self.natural.retained_stages.as_ref().ok_or_else(|| {
            model_error("Required Topic intermediates are unavailable. Rerun this analysis.")
        })?;
        let cache = cache.ok_or_else(|| {
            model_error("Required segment embedding cache is unavailable. Rerun this analysis.")
        })?;
        let natural = engine::adjust_with_progress_in(
            &texts.iter().map(String::as_str).collect::<Vec<_>>(),
            stages,
            &engine::Adjustment {
                minimum_topic_size: request.settings.minimum_topic_size,
                maximum_topic_size: request.settings.maximum_topic_size,
                tokenizer: request.settings.tokenizer.clone(),
            },
            cache,
            assets,
            &mut |_, _| {
                check_cancellation(cancellation)
                    .map_err(|error| std::io::Error::other(error.message).into())
            },
        )
        .map_err(model_error)?;
        let context = natural
            .projection_context
            .as_deref()
            .map(projection::deserialize_context)
            .transpose()
            .map_err(model_error)?;
        Ok(Self {
            natural,
            context,
            revision: Uuid::new_v4(),
            parameters: Some(request.settings.clone()),
            ..self.clone()
        })
    }
}

pub(super) fn store_outputs(
    conn: &Connection,
    id: Uuid,
    model: &TopicModel,
) -> Result<(Uuid, Option<Uuid>, Option<Uuid>)> {
    let natural = model.revision;
    let bytes = if model
        .sources
        .iter()
        .all(|source| source.processed_column.is_some())
    {
        let mut projection = serde_json::to_value(&model.natural)?;
        projection["documents"] = serde_json::json!([]);
        serde_json::to_vec(&projection)?
    } else {
        serde_json::to_vec(&model.natural)?
    };
    register_blob(
        conn,
        id,
        natural,
        "natural_projection",
        "application/json",
        &bytes,
    )?;
    let context = model
        .natural
        .projection_context
        .as_ref()
        .map(|bytes| {
            let artifact = Uuid::new_v4();
            register_blob(
                conn,
                id,
                artifact,
                "projection_context",
                "application/octet-stream",
                bytes,
            )?;
            Ok::<_, Error>(artifact)
        })
        .transpose()?;
    let stages = model
        .natural
        .retained_stages
        .as_ref()
        .map(|stages| {
            let artifact = Uuid::new_v4();
            register_blob(
                conn,
                id,
                artifact,
                "retained_stages",
                "application/json",
                &serde_json::to_vec(stages)?,
            )?;
            Ok::<_, Error>(artifact)
        })
        .transpose()?;
    Ok((natural, context, stages))
}

impl Database {
    pub(in crate::project) fn adjust_topic_model(
        &mut self,
        id: Uuid,
        request: TopicAdjustment,
        cache: Option<PathBuf>,
    ) -> Result<Analysis> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let model = load_model(&self.conn, id)?;
        let mut texts = Vec::new();
        for source in &model.sources {
            let relation = artifact_relation(
                &self.conn,
                id,
                source.documents.ok_or_else(|| {
                    model_error("Retained source is unavailable. Rerun this analysis.")
                })?,
            )?;
            let column = format!(
                "source.{}",
                query::quote(
                    source
                        .processed_column
                        .as_ref()
                        .unwrap_or(&source.input.column)
                )
            );
            texts.extend(
                self.conn
                    .prepare(&format!(
                        "SELECT {column} FROM {} ORDER BY document_id",
                        relation.sql()
                    ))?
                    .query_map([], |row| row.get::<_, Option<String>>(0))?
                    .map(|row| row.map(Option::unwrap_or_default))
                    .collect::<duckdb::Result<Vec<_>>>()?,
            );
        }
        self.conn.execute_batch("COMMIT")?;
        let adjusted = model.adjusted(
            &texts,
            &request,
            cache.as_deref(),
            self.model_assets.as_ref(),
            &self.cancellation,
        )?;
        self.replace_topic_outputs(id, request.expected_projection, adjusted)
    }

    fn replace_topic_outputs(
        &mut self,
        id: Uuid,
        expected: Uuid,
        model: TopicModel,
    ) -> Result<Analysis> {
        let tx = self.conn.transaction()?;
        let analysis = read_analysis(&tx, id)?;
        claim_tab(&tx, analysis.tab_id, KIND)?;
        let mut output = manifest(&tx, id)?;
        if output.natural_projection != expected {
            return Err(Error::new(
                "topic_adjustment_stale",
                "The Topic result changed. Refresh and retry this adjustment.",
            ));
        }
        for artifact in [
            Some(output.natural_projection),
            output.projection_context,
            output.retained_stages,
        ]
        .into_iter()
        .flatten()
        {
            tx.execute("DELETE FROM wordflow.artifacts WHERE id=? AND analysis_id=? AND storage_kind='blob'", params![artifact.to_string(), id.to_string()])?;
        }
        let (natural, context, stages) = store_outputs(&tx, id, &model)?;
        if output
            .sources
            .iter()
            .all(|source| source.processed_column.is_some())
        {
            let updates = document_outputs(&tx, &model.sources, &model.natural.documents)?;
            for (index, source) in model.sources.iter().enumerate() {
                let relation = artifact_relation(
                    &tx,
                    id,
                    source
                        .documents
                        .ok_or_else(|| model_error("Processed Topic outputs are unavailable"))?,
                )?;
                tx.execute_batch(&format!("UPDATE {} d SET dominant=a.dominant,coverage=from_json(a.coverage,'[{{\"topic_id\":\"INTEGER\",\"coverage\":\"DOUBLE\"}}]') FROM {updates} a WHERE a.source_index={index} AND a.document_id=d.document_id",relation.sql()))?;
            }
            tx.execute_batch(&format!("DROP TABLE {updates}"))?;
        }
        output.natural_projection = natural;
        output.projection_context = context;
        output.retained_stages = stages;
        output.natural_topic_count = model.natural.topics.len();
        output.parameters = model.parameters;
        tx.execute(
            "UPDATE wordflow.analyses SET result=?,finished_at=current_timestamp WHERE id=?",
            params![serde_json::to_string(&output)?, id.to_string()],
        )?;
        let analysis = read_analysis(&tx, id)?;
        PendingChange::new(&tx, ChangeScope::analysis(id), &self.cancellation).commit(
            tx,
            &self.changes,
            &self.cancellation,
        )?;
        Ok(analysis)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn model() -> TopicModel {
        TopicModel {
            preview_documents: Vec::new(),
            revision: Uuid::new_v4(),
            metadata: Vec::new(),
            population: None,
            parameters: None,
            sources: Vec::new(),
            natural: TopicModelingResult {
                topics: Vec::new(),
                documents: Vec::new(),
                n_segments: 0,
                max_topic_size: None,
                projection_context: None,
                retained_stages: None,
            },
            context: None,
            resolved_model: "fixture".into(),
        }
    }
    #[test]
    fn replacement_is_atomic_stale_guarded_and_clear_removes_owned_outputs() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        let tab = db
            .create_analysis_tab(CreateTab {
                kind: KIND.into(),
                name: None,
            })
            .unwrap()
            .id;
        let id = db
            .begin_analysis_run(tab, KIND, serde_json::json!({"preserved":"original Run"}))
            .unwrap();
        let initial = model();
        let revision = initial.revision;
        db.publish_analysis(
            AcceptedAnalysis {
                id,
                tab_id: tab,
                kind: KIND,
            },
            |conn| {
                let (natural_projection, projection_context, retained_stages) =
                    store_outputs(conn, id, &initial)?;
                Ok(serde_json::to_value(TopicResultV1 {
                    sources: Vec::new(),
                    natural_topic_count: 0,
                    segment_count: 0,
                    resolved_model: "fixture".into(),
                    natural_projection,
                    projection_context,
                    retained_stages,
                    metadata: None,
                    parameters: None,
                })?)
            },
        )
        .unwrap();
        let before = db.analysis(id).unwrap();
        let replacement = model();
        let replacement_revision = replacement.revision;
        db.replace_topic_outputs(id, revision, replacement).unwrap();
        assert_eq!(
            manifest(&db.conn, id).unwrap().natural_projection,
            replacement_revision
        );
        assert_eq!(db.analysis(id).unwrap().request, before.request);
        assert_eq!(
            db.publish_topic_model(
                id,
                TopicPublish {
                    expected_projection: Some(revision),
                    topic_count: 0,
                    top_n: 0,
                    selected_topics: Vec::new(),
                    sources: Vec::new(),
                    dictionary_name: "stale".into(),
                    words: Vec::new(),
                }
            )
            .unwrap_err()
            .code,
            "topic_adjustment_stale"
        );
        assert_eq!(
            db.replace_topic_outputs(id, revision, model())
                .unwrap_err()
                .code,
            "topic_adjustment_stale"
        );
        assert_eq!(
            manifest(&db.conn, id).unwrap().natural_projection,
            replacement_revision
        );
        db.cancellation.cancel();
        assert!(
            db.replace_topic_outputs(id, replacement_revision, model())
                .is_err()
        );
        db.cancellation = CancellationToken::new();
        assert_eq!(
            manifest(&db.conn, id).unwrap().natural_projection,
            replacement_revision
        );
        assert_eq!(
            db.conn
                .query_row("SELECT count(*) FROM wordflow.artifacts", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        let missing = db
            .adjust_topic_model(
                id,
                TopicAdjustment {
                    expected_projection: replacement_revision,
                    settings: TopicAdjustmentSettings {
                        minimum_topic_size: 2,
                        maximum_topic_size: None,
                        tokenizer: "native:plain_words_en".into(),
                    },
                },
                None,
            )
            .unwrap_err();
        assert!(missing.message.contains("Rerun"));
        assert_eq!(
            manifest(&db.conn, id).unwrap().natural_projection,
            replacement_revision
        );
        db.clear_analysis_tab(tab).unwrap();
        assert!(db.analysis(id).unwrap().result.is_none());
        assert_eq!(
            db.conn
                .query_row("SELECT count(*) FROM wordflow.artifacts", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert!(
            db.replace_topic_outputs(id, replacement_revision, model())
                .is_err()
        );
    }
}
