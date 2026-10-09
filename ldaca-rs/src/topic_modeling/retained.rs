//! Concrete downstream Topic stages. Full embeddings remain in the text cache.
use super::*;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetainedStages {
    version: u8,
    segments: Vec<segmentation::TopicSegment>,
    reduced: Vec<Vec<f32>>,
    labels: Vec<i32>,
    seed: u64,
    minimum_topic_size: usize,
    maximum_topic_size: Option<usize>,
    #[serde(default)]
    automatic_limit: bool,
    tokenizer: String,
    lowercase: bool,
    model: String,
    fingerprint: String,
    provider: String,
}

#[derive(Debug, Clone)]
pub struct Adjustment {
    pub minimum_topic_size: usize,
    pub maximum_topic_size: Option<usize>,
    pub tokenizer: String,
}

impl RetainedStages {
    pub(super) fn new(
        segments: Vec<segmentation::TopicSegment>,
        reduced: Vec<Vec<f32>>,
        cfg: &RunConfig,
        model: &str,
        fingerprint: &str,
        provider: &str,
    ) -> Self {
        Self {
            version: 1,
            segments,
            reduced,
            labels: Vec::new(),
            seed: cfg.seed,
            minimum_topic_size: cfg.min_cluster_size,
            maximum_topic_size: match cfg.topic_size_limit {
                TopicSizeLimit::Fixed(size) => Some(size),
                _ => None,
            },
            automatic_limit: matches!(cfg.topic_size_limit, TopicSizeLimit::Auto),
            tokenizer: cfg
                .vectorizer_model_id
                .clone()
                .unwrap_or_else(|| PLAIN_WORDS_EN_MODEL_ID.into()),
            lowercase: cfg.lowercase,
            model: model.into(),
            fingerprint: fingerprint.into(),
            provider: provider.into(),
        }
    }
}

/// Reuse the earliest retained stage affected by clustering or word settings.
/// Missing exact cached embeddings fail without inference or automatic backfill.
#[cfg(feature = "cache")]
pub fn adjust_with_progress_in(
    documents: &[&str],
    retained: &RetainedStages,
    adjustment: &Adjustment,
    cache: &std::path::Path,
    assets: Option<&crate::model_assets::ModelAssets>,
    progress: &mut impl FnMut(&str, Option<f64>) -> Result<()>,
) -> Result<TopicModelingResult> {
    progress("Reading retained Topic stages", None)?;
    anyhow::ensure!(
        retained.version == 1
            && retained.segments.len() == retained.reduced.len()
            && retained.labels.len() == retained.segments.len(),
        "Required Topic intermediates are unavailable. Rerun this analysis."
    );
    anyhow::ensure!(
        adjustment.minimum_topic_size >= 2
            && adjustment
                .maximum_topic_size
                .is_none_or(|size| size > adjustment.minimum_topic_size),
        "Maximum topic size must exceed the minimum topic size"
    );
    let texts = retained
        .segments
        .iter()
        .map(|segment| {
            segment
                .text(
                    documents
                        .get(segment.doc_index)
                        .context("Retained Topic source is unavailable. Rerun this analysis.")?,
                )
                .map(str::to_owned)
        })
        .collect::<Result<Vec<_>>>()?;
    let embeddings = get_or_insert_embeddings_in(
        cache,
        CacheScope {
            model_id: &retained.model,
            fingerprint: &retained.fingerprint,
            provider_id: &retained.provider,
        },
        &texts,
        assets.map(|assets| assets.temporary.as_path()),
        |_| {
            anyhow::bail!(
                "Required cached segment embeddings are unavailable. Rerun this analysis."
            )
        },
    )?;
    let recluster = retained.minimum_topic_size != adjustment.minimum_topic_size
        || retained.maximum_topic_size != adjustment.maximum_topic_size
        || retained.automatic_limit;
    let mut stages = retained.clone();
    stages.minimum_topic_size = adjustment.minimum_topic_size;
    stages.maximum_topic_size = adjustment.maximum_topic_size;
    stages.automatic_limit = false;
    stages.tokenizer.clone_from(&adjustment.tokenizer);
    finish(documents, stages, &embeddings, recluster, assets, progress)
}

pub(super) fn finish(
    documents: &[&str],
    mut stages: RetainedStages,
    embeddings: &[Arc<Vec<f32>>],
    recluster: bool,
    assets: Option<&crate::model_assets::ModelAssets>,
    progress: &mut impl FnMut(&str, Option<f64>) -> Result<()>,
) -> Result<TopicModelingResult> {
    let mut max_topic_size = stages.maximum_topic_size;
    if recluster {
        progress("Clustering segments", None)?;
        let clustered = if stages.reduced.len() < stages.minimum_topic_size {
            cluster::ClusterResult {
                labels: vec![-1; stages.reduced.len()],
                n_topics: 0,
                max_cluster_size: None,
            }
        } else {
            cluster::cluster(
                &stages.reduced,
                stages.minimum_topic_size,
                if stages.automatic_limit {
                    TopicSizeLimit::Auto
                } else {
                    stages
                        .maximum_topic_size
                        .map_or(TopicSizeLimit::Uncapped, TopicSizeLimit::Fixed)
                },
            )?
        };
        stages.labels = clustered.labels;
        max_topic_size = clustered.max_cluster_size;
    }
    let doc_indices = stages
        .segments
        .iter()
        .map(|segment| segment.doc_index)
        .collect::<Vec<_>>();
    let weights = stages
        .segments
        .iter()
        .map(|segment| segment.owned_character_count)
        .collect::<Vec<_>>();
    let count = stages
        .labels
        .iter()
        .filter(|label| **label >= 0)
        .max()
        .map_or(0, |label| *label as usize + 1);
    let mut result = if count == 0 {
        no_topic_result(documents.len(), &doc_indices, &weights)
    } else {
        progress("Counting representative words", None)?;
        let texts = stages
            .segments
            .iter()
            .map(|segment| segment.text(documents[segment.doc_index]))
            .collect::<Result<Vec<_>>>()?;
        let terms = ctfidf::count_topic_terms_with_assets(
            count,
            stages.labels.iter().copied().zip(texts),
            &stages.tokenizer,
            stages.lowercase,
            assets,
            &mut || progress("Counting representative words", None),
        )?;
        let spans = stages
            .segments
            .iter()
            .map(|segment| {
                let start = documents[segment.doc_index]
                    .get(..segment.start_byte)
                    .context("Invalid retained Topic span")?
                    .chars()
                    .count();
                Ok((start, start + segment.owned_character_count))
            })
            .collect::<Result<Vec<_>>>()?;
        progress("Preparing topic hierarchy", None)?;
        let points = embeddings
            .iter()
            .map(|embedding| embedding.as_slice())
            .collect::<Vec<_>>();
        let context = projection::prepare_context(projection::ProjectionInput {
            document_count: documents.len(),
            labels: &stages.labels,
            embedding_points: &points,
            document_indices: &doc_indices,
            owned_character_weights: &weights,
            character_spans: &spans,
            per_leaf_term_counts: &terms,
            seed: stages.seed,
        })?;
        progress("Projecting topics", None)?;
        let mut result = projection::project(&context, count)?;
        result.projection_context = Some(projection::serialize_context(&context)?);
        result
    };
    result.max_topic_size = max_topic_size;
    result.retained_stages = Some(stages);
    progress("Model complete", Some(1.0))?;
    Ok(result)
}

#[cfg(all(test, feature = "cache"))]
mod tests {
    use super::*;

    #[test]
    fn adjustments_reuse_reduction_and_exact_embeddings_without_inference() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let cache = directory.path().join("embeddings.duckdb");
        let documents = (0..40)
            .map(|i| {
                if i < 20 {
                    format!("cats home {i}")
                } else {
                    format!("ships ocean {i}")
                }
            })
            .collect::<Vec<_>>();
        let config = RunConfig {
            embedder_repo_id: None,
            embedding_cache_path: None,
            segmentation: SegmentationConfig::default(),
            seed: 7,
            min_cluster_size: 3,
            topic_size_limit: TopicSizeLimit::Uncapped,
            vectorizer_model_id: None,
            lowercase: true,
        };
        let segments = documents
            .iter()
            .enumerate()
            .map(|(doc_index, text)| segmentation::TopicSegment {
                doc_index,
                start_byte: 0,
                end_byte: text.len(),
                owned_character_count: text.chars().count(),
            })
            .collect();
        let points = (0..40)
            .map(|i| {
                vec![
                    (if i < 20 { 0.0 } else { 10.0 }) + (i % 20) as f32 * 0.001,
                    1.0,
                ]
            })
            .collect::<Vec<_>>();
        let embeddings = get_or_insert_embeddings_in(
            &cache,
            CacheScope {
                model_id: "fixture",
                fingerprint: "exact",
                provider_id: "cpu",
            },
            &documents,
            None,
            |_| Ok(points.clone()),
        )?;
        let retained =
            RetainedStages::new(segments, points.clone(), &config, "fixture", "exact", "cpu");
        let inputs = documents.iter().map(String::as_str).collect::<Vec<_>>();
        let initial = finish(&inputs, retained, &embeddings, true, None, &mut |_, _| {
            Ok(())
        })?;
        assert_eq!(initial.topics.len(), 2);
        let retained = initial.retained_stages.as_ref().unwrap();
        let mut automatic = retained.clone();
        automatic.automatic_limit = true;
        let expected = cluster::cluster(&points, config.min_cluster_size, TopicSizeLimit::Auto)?;
        let auto = finish(&inputs, automatic, &embeddings, true, None, &mut |_, _| {
            Ok(())
        })?;
        assert_eq!(auto.max_topic_size, expected.max_cluster_size);
        assert_eq!(auto.retained_stages.unwrap().labels, expected.labels);
        let mut stages = Vec::new();
        let adjusted = adjust_with_progress_in(
            &inputs,
            retained,
            &Adjustment {
                minimum_topic_size: 4,
                maximum_topic_size: Some(25),
                tokenizer: PLAIN_WORDS_EN_MODEL_ID.into(),
            },
            &cache,
            None,
            &mut |stage, _| {
                stages.push(stage.to_owned());
                Ok(())
            },
        )?;
        assert!(stages.iter().any(|stage| stage == "Clustering segments"));
        assert!(!stages.iter().any(|stage| stage.contains("Embedding")
            || stage.contains("Reducing")
            || stage.contains("Segmenting")));
        assert_eq!(adjusted.retained_stages.as_ref().unwrap().reduced, points);
        stages.clear();
        let words = adjust_with_progress_in(
            &inputs,
            adjusted.retained_stages.as_ref().unwrap(),
            &Adjustment {
                minimum_topic_size: 4,
                maximum_topic_size: Some(25),
                tokenizer: PLAIN_WORDS_EN_MODEL_ID.into(),
            },
            &cache,
            None,
            &mut |stage, _| {
                stages.push(stage.to_owned());
                Ok(())
            },
        )?;
        assert!(!stages.iter().any(|stage| stage == "Clustering segments"));
        assert_eq!(
            serde_json::to_value(&adjusted)?,
            serde_json::to_value(&words)?
        );
        let error = adjust_with_progress_in(
            &inputs,
            retained,
            &Adjustment {
                minimum_topic_size: 4,
                maximum_topic_size: None,
                tokenizer: PLAIN_WORDS_EN_MODEL_ID.into(),
            },
            &directory.path().join("missing.duckdb"),
            None,
            &mut |_, _| Ok(()),
        )
        .unwrap_err();
        assert!(error.to_string().contains("Rerun"));
        Ok(())
    }
}
