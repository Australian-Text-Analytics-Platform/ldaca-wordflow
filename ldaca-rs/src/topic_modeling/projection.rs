//! Immutable Topic projection context.
//!
//! HDBSCAN's natural Topics are retained as the maximum-resolution leaves.
//! A deterministic cosine average-linkage tree records how those leaves merge.
//! Cuts aggregate sufficient statistics, so Result queries never need source
//! text, segment embeddings, or HDBSCAN.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::io::Cursor;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use super::cluster::OUTLIER_LABEL;
use super::ctfidf;
use super::reduce;
use super::rollup;
use super::{DocumentResult, TopicInfo, TopicModelingResult};

const CONTEXT_VERSION: u8 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Leaf {
    id: usize,
    segment_count: usize,
    embedding_sum: Vec<f64>,
    term_counts: Vec<(u32, usize)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SegmentFact {
    document_index: usize,
    leaf_id: i32,
    owned_character_weight: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Merge {
    left: usize,
    right: usize,
    minimum_leaf_id: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicProjectionContext {
    version: u8,
    document_count: usize,
    natural_cluster_count: usize,
    vocabulary: Vec<String>,
    leaves: Vec<Leaf>,
    merges: Vec<Merge>,
    segments: Vec<SegmentFact>,
    n_segments: usize,
    seed: u64,
}

pub struct ProjectionInput<'a> {
    pub document_count: usize,
    pub labels: &'a [i32],
    pub embedding_points: &'a [&'a [f32]],
    pub document_indices: &'a [usize],
    pub owned_character_weights: &'a [usize],
    pub per_leaf_term_counts: &'a [HashMap<String, usize>],
    pub seed: u64,
}

/// Compact, N-independent input for Result-time Topic bubble counts.
///
/// Each activation is `[corpus_index, topic_id, minimum_n, row_count]`, where
/// `minimum_n` is one plus the number of strictly higher positive real-Topic
/// coverage values in the row. Equal values activate at the same cutoff.
#[derive(Debug, Clone, Serialize)]
pub struct TopicProjectionBasis {
    pub topics: Vec<TopicInfo>,
    pub activations: Vec<[usize; 4]>,
    pub has_outlier: bool,
}

#[derive(Debug, Clone)]
struct ActiveNode {
    minimum_leaf_id: usize,
    leaf_count: usize,
}

pub fn prepare_context(input: ProjectionInput<'_>) -> Result<TopicProjectionContext> {
    let ProjectionInput {
        document_count,
        labels,
        embedding_points,
        document_indices,
        owned_character_weights,
        per_leaf_term_counts,
        seed,
    } = input;
    let segment_count = labels.len();
    if embedding_points.len() != segment_count
        || document_indices.len() != segment_count
        || owned_character_weights.len() != segment_count
    {
        bail!("Topic projection inputs must align by Topic Segment");
    }
    if document_indices
        .iter()
        .any(|&index| index >= document_count)
    {
        bail!("Topic projection document index is outside the corpus");
    }

    let natural_cluster_count = labels
        .iter()
        .filter(|&&label| label >= 0)
        .map(|&label| usize::try_from(label))
        .collect::<std::result::Result<Vec<_>, _>>()?
        .into_iter()
        .max()
        .map_or(0, |maximum| maximum + 1);
    if natural_cluster_count == 0 {
        bail!("Topic projection requires at least one real Topic");
    }
    if per_leaf_term_counts.len() != natural_cluster_count {
        bail!("Topic projection term counts must align with real Topic leaves");
    }

    let embedding_width = embedding_points.first().map_or(0, |point| point.len());
    if embedding_width == 0
        || embedding_points.iter().any(|point| {
            point.len() != embedding_width || point.iter().any(|value| !value.is_finite())
        })
    {
        bail!("Topic projection embeddings must be finite, non-empty, and rectangular");
    }

    let vocabulary = per_leaf_term_counts
        .iter()
        .flat_map(|counts| counts.keys().cloned())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let vocabulary_indices = vocabulary
        .iter()
        .enumerate()
        .map(|(index, term)| {
            Ok((
                term.as_str(),
                u32::try_from(index).context("Topic projection vocabulary is too large")?,
            ))
        })
        .collect::<Result<HashMap<_, _>>>()?;

    let mut embedding_sums = vec![vec![0.0f64; embedding_width]; natural_cluster_count];
    let mut segment_counts = vec![0usize; natural_cluster_count];
    for (&label, point) in labels.iter().zip(embedding_points) {
        if label == OUTLIER_LABEL {
            continue;
        }
        let leaf = usize::try_from(label).context("Topic projection label is invalid")?;
        let count = segment_counts
            .get_mut(leaf)
            .context("Topic projection label is outside the natural Topic count")?;
        *count += 1;
        for (sum, &value) in embedding_sums[leaf].iter_mut().zip(*point) {
            *sum += f64::from(value);
        }
    }

    let leaves = (0..natural_cluster_count)
        .map(|id| {
            if segment_counts[id] == 0 {
                bail!("Topic projection real Topic leaf has no Topic Segments");
            }
            validate_nonzero_vector(&embedding_sums[id], "natural Topic embedding")?;
            Ok(Leaf {
                id,
                segment_count: segment_counts[id],
                embedding_sum: embedding_sums[id].clone(),
                term_counts: per_leaf_term_counts[id]
                    .iter()
                    .map(|(term, &occurrences)| {
                        Ok((
                            *vocabulary_indices
                                .get(term.as_str())
                                .context("Topic projection vocabulary term is missing")?,
                            occurrences,
                        ))
                    })
                    .collect::<Result<Vec<_>>>()?,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let segments = labels
        .iter()
        .zip(document_indices)
        .zip(owned_character_weights)
        .map(
            |((&leaf_id, &document_index), &owned_character_weight)| SegmentFact {
                document_index,
                leaf_id,
                owned_character_weight,
            },
        )
        .collect();
    let merges = build_average_linkage_tree(&leaves)?;

    Ok(TopicProjectionContext {
        version: CONTEXT_VERSION,
        document_count,
        natural_cluster_count,
        vocabulary,
        leaves,
        merges,
        segments,
        n_segments: segment_count,
        seed,
    })
}

fn validate_nonzero_vector(vector: &[f64], name: &str) -> Result<()> {
    let squared_norm = vector.iter().map(|value| value * value).sum::<f64>();
    if !squared_norm.is_finite() || squared_norm <= f64::EPSILON {
        bail!("Topic projection {name} has zero or invalid norm");
    }
    Ok(())
}

fn cosine_distance(left: &[f64], right: &[f64]) -> Result<f64> {
    if left.len() != right.len() || left.is_empty() {
        bail!("Topic projection embedding dimensions differ");
    }
    validate_nonzero_vector(left, "left embedding")?;
    validate_nonzero_vector(right, "right embedding")?;
    let dot = left.iter().zip(right).map(|(a, b)| a * b).sum::<f64>();
    let left_norm = left.iter().map(|value| value * value).sum::<f64>().sqrt();
    let right_norm = right.iter().map(|value| value * value).sum::<f64>().sqrt();
    Ok(1.0 - (dot / (left_norm * right_norm)).clamp(-1.0, 1.0))
}

fn pair_key(left: usize, right: usize) -> (usize, usize) {
    if left < right {
        (left, right)
    } else {
        (right, left)
    }
}

/// Build a deterministic average-linkage hierarchy over natural Topic
/// centroids using cosine distance. Every natural Topic has equal weight;
/// segment population affects coverage, not semantic merge priority.
fn build_average_linkage_tree(leaves: &[Leaf]) -> Result<Vec<Merge>> {
    let mut active = leaves
        .iter()
        .map(|leaf| {
            (
                leaf.id,
                ActiveNode {
                    minimum_leaf_id: leaf.id,
                    leaf_count: 1,
                },
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut distances = HashMap::<(usize, usize), f64>::new();
    for left in 0..leaves.len() {
        for right in left + 1..leaves.len() {
            distances.insert(
                (left, right),
                cosine_distance(&leaves[left].embedding_sum, &leaves[right].embedding_sum)?,
            );
        }
    }

    let mut merges = Vec::with_capacity(leaves.len().saturating_sub(1));
    while active.len() > 1 {
        let active_ids = active.keys().copied().collect::<Vec<_>>();
        let mut best: Option<(f64, usize, usize, usize, usize)> = None;
        for (position, &left_id) in active_ids.iter().enumerate() {
            for &right_id in &active_ids[position + 1..] {
                let left = &active[&left_id];
                let right = &active[&right_id];
                let minimum_ids = if left.minimum_leaf_id <= right.minimum_leaf_id {
                    (left.minimum_leaf_id, right.minimum_leaf_id)
                } else {
                    (right.minimum_leaf_id, left.minimum_leaf_id)
                };
                let distance = *distances
                    .get(&pair_key(left_id, right_id))
                    .context("Topic projection linkage distance is missing")?;
                let candidate = (distance, minimum_ids.0, minimum_ids.1, left_id, right_id);
                if best.as_ref().is_none_or(|current| {
                    candidate.0.total_cmp(&current.0).is_lt()
                        || (candidate.0.total_cmp(&current.0).is_eq()
                            && (candidate.1, candidate.2, candidate.3, candidate.4)
                                < (current.1, current.2, current.3, current.4))
                }) {
                    best = Some(candidate);
                }
            }
        }

        let (_, _, _, left_id, right_id) =
            best.context("Topic projection linkage tree has no merge pair")?;
        let left = active
            .remove(&left_id)
            .context("Topic projection left merge node is missing")?;
        let right = active
            .remove(&right_id)
            .context("Topic projection right merge node is missing")?;
        let new_id = leaves.len() + merges.len();
        let leaf_count = left
            .leaf_count
            .checked_add(right.leaf_count)
            .context("Topic projection leaf count overflow")?;

        for &other_id in active.keys() {
            let left_distance = *distances
                .get(&pair_key(left_id, other_id))
                .context("Topic projection left linkage distance is missing")?;
            let right_distance = *distances
                .get(&pair_key(right_id, other_id))
                .context("Topic projection right linkage distance is missing")?;
            let distance = (left_distance * left.leaf_count as f64
                + right_distance * right.leaf_count as f64)
                / leaf_count as f64;
            distances.insert(pair_key(new_id, other_id), distance);
        }

        let minimum_leaf_id = left.minimum_leaf_id.min(right.minimum_leaf_id);
        merges.push(Merge {
            left: left_id,
            right: right_id,
            minimum_leaf_id,
        });
        active.insert(
            new_id,
            ActiveNode {
                minimum_leaf_id,
                leaf_count,
            },
        );
    }
    Ok(merges)
}

fn leaf_projection_ids(context: &TopicProjectionContext, topic_count: usize) -> Result<Vec<i32>> {
    let natural = context.natural_cluster_count;
    if topic_count == 0 || topic_count > natural {
        bail!("topic_count {topic_count} is outside the supported range 1..={natural}");
    }

    let mut members = (0..natural).map(|leaf| vec![leaf]).collect::<Vec<_>>();
    let mut active = (0..natural).collect::<BTreeSet<_>>();
    for (merge_index, merge) in context
        .merges
        .iter()
        .take(natural.saturating_sub(topic_count))
        .enumerate()
    {
        if !active.remove(&merge.left) || !active.remove(&merge.right) {
            bail!("Topic projection merge references an inactive node");
        }
        let mut combined = members
            .get(merge.left)
            .context("Topic projection merge references an unknown left node")?
            .clone();
        combined.extend(
            members
                .get(merge.right)
                .context("Topic projection merge references an unknown right node")?,
        );
        let node_id = natural + merge_index;
        if members.len() != node_id {
            bail!("Topic projection merge ordering is invalid");
        }
        members.push(combined);
        active.insert(node_id);
    }

    if active.len() != topic_count {
        bail!("Topic projection cut did not produce the requested Topic count");
    }
    let mut ordered = active
        .into_iter()
        .map(|node| {
            let minimum = *members[node]
                .iter()
                .min()
                .context("Topic projection node has no leaves")?;
            Ok((minimum, node))
        })
        .collect::<Result<Vec<_>>>()?;
    ordered.sort_unstable();

    let mut projected = vec![OUTLIER_LABEL; natural];
    for (projected_id, (_, node)) in ordered.into_iter().enumerate() {
        let projected_id =
            i32::try_from(projected_id).context("Topic projection count exceeds i32")?;
        for &leaf in &members[node] {
            projected[leaf] = projected_id;
        }
    }
    Ok(projected)
}

fn normalize_embedding(embedding: &[f64]) -> Result<Vec<f32>> {
    validate_nonzero_vector(embedding, "projected Topic embedding")?;
    let norm = embedding
        .iter()
        .map(|value| value * value)
        .sum::<f64>()
        .sqrt();
    Ok(embedding
        .iter()
        .map(|value| (value / norm) as f32)
        .collect())
}

fn topic_coordinates(embedding_sums: &[Vec<f64>], seed: u64) -> Result<Vec<[f32; 2]>> {
    match embedding_sums.len() {
        0 => Ok(Vec::new()),
        1 => Ok(vec![[0.0, 0.0]]),
        2 => {
            let distance = cosine_distance(&embedding_sums[0], &embedding_sums[1])? as f32;
            Ok(vec![[-distance / 2.0, 0.0], [distance / 2.0, 0.0]])
        }
        _ => {
            let normalized = embedding_sums
                .iter()
                .map(|embedding| normalize_embedding(embedding))
                .collect::<Result<Vec<_>>>()?;
            let reduced = reduce::reduce(&normalized, 2, seed)?;
            reduced
                .into_iter()
                .map(|point| {
                    if point.len() != 2 || point.iter().any(|value| !value.is_finite()) {
                        bail!("Topic coordinate reduction returned invalid output");
                    }
                    Ok([point[0], point[1]])
                })
                .collect()
        }
    }
}

pub fn project(
    context: &TopicProjectionContext,
    topic_count: usize,
) -> Result<TopicModelingResult> {
    validate_context(context)?;
    let projection_ids = leaf_projection_ids(context, topic_count)?;
    let mut term_counts = vec![HashMap::<String, usize>::new(); topic_count];
    let embedding_width = context
        .leaves
        .first()
        .map(|leaf| leaf.embedding_sum.len())
        .context("Topic projection context has no leaves")?;
    let mut embedding_sums = vec![vec![0.0f64; embedding_width]; topic_count];
    for leaf in &context.leaves {
        let projected_id = usize::try_from(projection_ids[leaf.id])
            .context("Topic projection produced an invalid Topic id")?;
        for (sum, value) in embedding_sums[projected_id]
            .iter_mut()
            .zip(&leaf.embedding_sum)
        {
            *sum += value;
        }
        for &(term_index, occurrences) in &leaf.term_counts {
            let term = context
                .vocabulary
                .get(term_index as usize)
                .context("Topic projection term index is outside the vocabulary")?;
            *term_counts[projected_id].entry(term.clone()).or_insert(0) += occurrences;
        }
    }

    let representative_words = ctfidf::representative_words(&term_counts);
    let coordinates = topic_coordinates(&embedding_sums, context.seed)?;
    let topics = (0..topic_count)
        .map(|id| {
            Ok(TopicInfo {
                id: i32::try_from(id).context("Topic count exceeds i32")?,
                representative_words: representative_words[id].clone(),
                x: coordinates[id][0],
                y: coordinates[id][1],
            })
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(TopicModelingResult {
        topics,
        documents: project_documents(context, topic_count)?,
        n_segments: context.n_segments,
        projection_context: None,
    })
}

/// Project memberships without calculating map coordinates or word labels.
pub fn project_documents(
    context: &TopicProjectionContext,
    topic_count: usize,
) -> Result<Vec<DocumentResult>> {
    validate_context(context)?;
    let projection_ids = leaf_projection_ids(context, topic_count)?;
    let document_indices = context
        .segments
        .iter()
        .map(|fact| fact.document_index)
        .collect::<Vec<_>>();
    let labels = context
        .segments
        .iter()
        .map(|fact| {
            if fact.leaf_id == OUTLIER_LABEL {
                Ok(OUTLIER_LABEL)
            } else {
                let leaf = usize::try_from(fact.leaf_id)
                    .context("Topic projection segment leaf id is invalid")?;
                projection_ids
                    .get(leaf)
                    .copied()
                    .context("Topic projection segment leaf id is outside the context")
            }
        })
        .collect::<Result<Vec<_>>>()?;
    let weights = context
        .segments
        .iter()
        .map(|fact| fact.owned_character_weight)
        .collect::<Vec<_>>();
    let documents = rollup::rollup(context.document_count, &document_indices, &labels, &weights)
        .into_iter()
        .enumerate()
        .map(|(doc_index, topics)| DocumentResult {
            doc_index,
            dominant_topic: topics.dominant_topic,
            topic_coverage: topics
                .topic_coverage
                .into_iter()
                .map(|entry| (entry.topic_id, entry.coverage))
                .collect(),
        })
        .collect();
    Ok(documents)
}

/// Rank the complete merged vocabulary, excluding words only after scoring.
pub fn project_words(
    context: &TopicProjectionContext,
    topic_count: usize,
    excluded: &HashSet<String>,
) -> Result<Vec<Vec<ctfidf::RepresentativeWord>>> {
    validate_context(context)?;
    let ids = leaf_projection_ids(context, topic_count)?;
    let mut counts = vec![HashMap::new(); topic_count];
    for leaf in &context.leaves {
        for &(term, count) in &leaf.term_counts {
            let word = context
                .vocabulary
                .get(term as usize)
                .context("Topic term outside vocabulary")?;
            *counts[ids[leaf.id] as usize]
                .entry(word.clone())
                .or_insert(0) += count;
        }
    }
    Ok(ctfidf::representative_words_filtered(&counts, excluded))
}

fn validate_context(context: &TopicProjectionContext) -> Result<()> {
    if context.version != CONTEXT_VERSION {
        bail!(
            "unsupported Topic projection context version {}",
            context.version
        );
    }
    if context.natural_cluster_count == 0
        || context.leaves.len() != context.natural_cluster_count
        || context.merges.len() != context.natural_cluster_count.saturating_sub(1)
        || context
            .leaves
            .iter()
            .enumerate()
            .any(|(id, leaf)| leaf.id != id)
    {
        bail!("Topic projection context structure is invalid");
    }
    for leaf in &context.leaves {
        validate_nonzero_vector(&leaf.embedding_sum, "stored leaf embedding")?;
    }
    Ok(())
}

pub fn serialize_context(context: &TopicProjectionContext) -> Result<Vec<u8>> {
    validate_context(context)?;
    let message_pack =
        rmp_serde::to_vec_named(context).context("encode Topic projection context")?;
    zstd::stream::encode_all(Cursor::new(message_pack), 9)
        .context("compress Topic projection context")
}

pub fn deserialize_context(bytes: &[u8]) -> Result<TopicProjectionContext> {
    let message_pack = zstd::stream::decode_all(Cursor::new(bytes))
        .context("decompress Topic projection context")?;
    let context: TopicProjectionContext =
        rmp_serde::from_slice(&message_pack).context("decode Topic projection context")?;
    validate_context(&context)?;
    Ok(context)
}

pub fn project_serialized_context(bytes: &[u8], topic_count: usize) -> Result<TopicModelingResult> {
    project(&deserialize_context(bytes)?, topic_count)
}

pub fn project_basis(
    context: &TopicProjectionContext,
    topic_count: usize,
    corpus_sizes: &[usize],
) -> Result<TopicProjectionBasis> {
    basis_from_result(&project(context, topic_count)?, corpus_sizes)
}

/// Compact a completed fit without refitting or recalculating its layout.
pub fn basis_from_result(
    projected: &TopicModelingResult,
    corpus_sizes: &[usize],
) -> Result<TopicProjectionBasis> {
    let topic_count = projected.topics.len();
    let document_count = corpus_sizes.iter().try_fold(0usize, |total, size| {
        total
            .checked_add(*size)
            .context("Topic corpus sizes overflow")
    })?;
    if document_count != projected.documents.len() {
        bail!("Topic projection documents do not align with corpus sizes");
    }

    let corpus_by_document = corpus_sizes
        .iter()
        .enumerate()
        .flat_map(|(corpus_index, size)| std::iter::repeat_n(corpus_index, *size))
        .collect::<Vec<_>>();
    let mut activation_counts = BTreeMap::<(usize, usize, usize), usize>::new();
    let mut has_outlier = false;
    for (expected_index, document) in projected.documents.iter().enumerate() {
        if document.doc_index != expected_index {
            bail!("Topic projection document indices are invalid");
        }
        let maximum_topic_id =
            i32::try_from(topic_count).context("Topic projection count exceeds i32")?;
        if document.topic_coverage.iter().any(|&(topic_id, coverage)| {
            topic_id < OUTLIER_LABEL
                || topic_id >= maximum_topic_id
                || !coverage.is_finite()
                || coverage < 0.0
        }) {
            bail!("Topic projection coverage contains an invalid entry");
        }
        has_outlier |= document
            .topic_coverage
            .iter()
            .any(|&(topic_id, coverage)| topic_id == OUTLIER_LABEL && coverage > 0.0);

        let mut ranked = document
            .topic_coverage
            .iter()
            .filter_map(|&(topic_id, coverage)| {
                (topic_id >= 0 && coverage > 0.0).then_some((topic_id, coverage))
            })
            .collect::<Vec<_>>();
        ranked.sort_by(|left, right| {
            right
                .1
                .total_cmp(&left.1)
                .then_with(|| left.0.cmp(&right.0))
        });

        let mut rank_start = 0;
        while rank_start < ranked.len() {
            let coverage = ranked[rank_start].1;
            let mut rank_end = rank_start + 1;
            while rank_end < ranked.len() && ranked[rank_end].1 == coverage {
                rank_end += 1;
            }
            let minimum_n = rank_start + 1;
            for &(topic_id, _) in &ranked[rank_start..rank_end] {
                *activation_counts
                    .entry((
                        corpus_by_document[document.doc_index],
                        topic_id as usize,
                        minimum_n,
                    ))
                    .or_insert(0) += 1;
            }
            rank_start = rank_end;
        }
    }

    Ok(TopicProjectionBasis {
        topics: projected.topics.clone(),
        activations: activation_counts
            .into_iter()
            .map(|((corpus_index, topic_id, minimum_n), count)| {
                [corpus_index, topic_id, minimum_n, count]
            })
            .collect(),
        has_outlier,
    })
}

pub fn project_serialized_context_basis(
    bytes: &[u8],
    topic_count: usize,
    corpus_sizes: &[usize],
) -> Result<TopicProjectionBasis> {
    project_basis(&deserialize_context(bytes)?, topic_count, corpus_sizes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn independent_words_and_documents_match_full_projection() {
        let context = fixture();
        for count in 1..=context.natural_cluster_count {
            let full = project(&context, count).unwrap();
            let documents = project_documents(&context, count).unwrap();
            let words = project_words(&context, count, &HashSet::new()).unwrap();
            assert_eq!(
                serde_json::to_value(&documents).unwrap(),
                serde_json::to_value(&full.documents).unwrap()
            );
            assert_eq!(
                serde_json::to_value(&words).unwrap(),
                serde_json::to_value(
                    full.topics
                        .iter()
                        .map(|t| &t.representative_words)
                        .collect::<Vec<_>>()
                )
                .unwrap()
            );
        }
    }

    fn fixture() -> TopicProjectionContext {
        let labels = vec![0, 0, 1, 1, 2, 2, OUTLIER_LABEL];
        let embeddings = [
            vec![1.0, 0.0],
            vec![0.9, 0.1],
            vec![0.95, 0.05],
            vec![0.85, 0.15],
            vec![-1.0, 0.0],
            vec![-0.9, -0.1],
            vec![0.0, 1.0],
        ];
        let embedding_points = embeddings.iter().map(Vec::as_slice).collect::<Vec<_>>();
        let counts = vec![
            HashMap::from([("alpha".to_string(), 4)]),
            HashMap::from([("beta".to_string(), 3)]),
            HashMap::from([("gamma".to_string(), 2)]),
        ];
        prepare_context(ProjectionInput {
            document_count: 2,
            labels: &labels,
            embedding_points: &embedding_points,
            document_indices: &[0, 0, 0, 0, 1, 1, 1],
            owned_character_weights: &[1, 1, 1, 1, 2, 2, 4],
            per_leaf_term_counts: &counts,
            seed: 7,
        })
        .unwrap()
    }

    #[test]
    fn cosine_average_linkage_merges_nearest_topics_first() {
        let context = fixture();
        let projected = leaf_projection_ids(&context, 2).unwrap();
        assert_eq!(projected, vec![0, 0, 1]);
    }

    #[test]
    fn deterministic_cuts_are_exact_and_canonical() {
        let context = fixture();
        let first = project(&context, 2).unwrap();
        let second = project(&context, 2).unwrap();
        assert_eq!(first.topics.len(), 2);
        assert_eq!(first.documents[0].dominant_topic, 0);
        assert_eq!(first.documents[1].dominant_topic, OUTLIER_LABEL);
        for (left, right) in first.topics.iter().zip(&second.topics) {
            assert_eq!((left.id, left.x, left.y), (right.id, right.x, right.y));
        }
    }

    #[test]
    fn serialization_round_trip_rejects_corruption_and_old_versions() {
        let context = fixture();
        let bytes = serialize_context(&context).unwrap();
        let restored = project_serialized_context(&bytes, 2).unwrap();
        let expected = project(&context, 2).unwrap();
        assert_eq!(
            serde_json::to_value(&restored).unwrap(),
            serde_json::to_value(&expected).unwrap()
        );
        assert!(project_serialized_context(b"not zstd", 2).is_err());

        let mut old = context;
        old.version = 1;
        let encoded = rmp_serde::to_vec_named(&old).unwrap();
        let compressed = zstd::stream::encode_all(Cursor::new(encoded), 1).unwrap();
        let error = deserialize_context(&compressed).unwrap_err();
        assert!(error.to_string().contains("unsupported"));
    }

    #[test]
    fn projection_keeps_outlier_weight_in_coverage() {
        let projected = project(&fixture(), 2).unwrap();
        let document = &projected.documents[1];
        let outlier = document
            .topic_coverage
            .iter()
            .find(|(id, _)| *id == OUTLIER_LABEL)
            .unwrap();
        assert!((outlier.1 - 0.5).abs() < 1e-6);
    }

    #[test]
    fn compact_basis_aggregates_ties_and_marks_any_outlier_coverage() {
        let context = fixture();
        let basis = project_basis(&context, 3, &[1, 1]).unwrap();
        assert_eq!(basis.topics.len(), 3);
        assert_eq!(
            basis.activations,
            vec![[0, 0, 1, 1], [0, 1, 1, 1], [1, 2, 1, 1]]
        );
        assert!(basis.has_outlier);
        assert!(project_basis(&context, 3, &[1]).is_err());
    }

    #[test]
    fn one_topic_projection_uses_origin() {
        let projected = project(&fixture(), 1).unwrap();
        assert_eq!(projected.topics.len(), 1);
        assert_eq!((projected.topics[0].x, projected.topics[0].y), (0.0, 0.0));
    }
}
