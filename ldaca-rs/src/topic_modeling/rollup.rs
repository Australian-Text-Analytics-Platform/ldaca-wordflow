//! Roll Topic Segment assignments up to per-document topic coverage.
//!
//! Why this exists: clustering labels *segments*, but the product surfaces
//! *documents*. Each non-overlapping segment contributes its owned Unicode-
//! character length to an honest coverage share.
//!
//! Outlier handling: HDBSCAN's `-1` competes normally for dominance and remains
//! in the denominator, so an outlier-heavy document stays visibly unclustered.
//!
//! Determinism: pure counting; coverage entries are emitted in ascending Topic-id
//! order and dominant-topic ties break to the smaller id, so identical input
//! always produces identical output. Fully unit-tested.
//!
//! Called by: `topic_modeling::run` after clustering, feeding the per-document
//! payload.

use std::cmp::Reverse;
use std::collections::BTreeMap;

use crate::topic_modeling::cluster::OUTLIER_LABEL;

/// One Topic's share of a document, coverage summing to 1 across the
/// document's retained segment characters. `topic_id` may be `OUTLIER_LABEL`
/// (`-1`).
#[derive(Debug, Clone, PartialEq)]
pub struct TopicCoverage {
    pub topic_id: i32,
    pub coverage: f32,
}

/// Per-document result: full coverage plus the single dominant Topic.
#[derive(Debug, Clone, PartialEq)]
pub struct DocumentTopics {
    pub topic_coverage: Vec<TopicCoverage>,
    pub dominant_topic: i32,
}

/// Aggregate segment labels into one `DocumentTopics` per document.
///
/// `n_docs` is the document count (some documents may own zero segments, e.g.
/// empty/whitespace input — those get empty coverage and `-1` dominant).
/// `segment_doc_index[i]` is the owning document of segment `i`;
/// `segment_labels[i]` is its topic; and `segment_weights[i]` is the Unicode-
/// character length of its retained text. The three segment slices must have
/// the same length.
///
/// Flow: sum each document's segment weights by label, divide by the total
/// owned-character weight to get coverage, choose the highest-weight Topic
/// (including outlier), and emit coverage sorted by Topic id.
pub fn rollup(
    n_docs: usize,
    segment_doc_index: &[usize],
    segment_labels: &[i32],
    segment_weights: &[usize],
) -> Vec<DocumentTopics> {
    debug_assert_eq!(segment_doc_index.len(), segment_labels.len());
    debug_assert_eq!(segment_doc_index.len(), segment_weights.len());

    // Per-document topic weights in ascending-id order (BTreeMap = stable output).
    let mut per_doc: Vec<BTreeMap<i32, usize>> = vec![BTreeMap::new(); n_docs];
    for ((&doc, &label), &weight) in segment_doc_index
        .iter()
        .zip(segment_labels)
        .zip(segment_weights)
    {
        if doc < n_docs {
            *per_doc[doc].entry(label).or_insert(0) += weight;
        }
    }

    per_doc
        .into_iter()
        .map(|weights| {
            let total: usize = weights.values().sum();
            if total == 0 {
                return DocumentTopics {
                    topic_coverage: Vec::new(),
                    dominant_topic: OUTLIER_LABEL,
                };
            }

            let coverage = weights
                .iter()
                .map(|(&topic_id, &weight)| TopicCoverage {
                    topic_id,
                    coverage: weight as f32 / total as f32,
                })
                .collect();

            let dominant_topic = weights
                .iter()
                .min_by_key(|(&id, &weight)| (Reverse(weight), id))
                .map(|(&id, _)| id)
                .unwrap_or(OUTLIER_LABEL);

            DocumentTopics {
                topic_coverage: coverage,
                dominant_topic,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_doc_gets_multi_topic_coverage() {
        // Document 0 has 4 segments: topics 0,0,1,-1.
        let docs = rollup(1, &[0, 0, 0, 0], &[0, 0, 1, OUTLIER_LABEL], &[1, 1, 1, 1]);
        assert_eq!(docs.len(), 1);
        let d = &docs[0];
        assert_eq!(d.dominant_topic, 0); // topic 0 has the most segments
                                         // Proportions: topic 0 = 0.5, topic 1 = 0.25, outlier = 0.25, sorted asc.
        assert_eq!(
            d.topic_coverage,
            vec![
                TopicCoverage {
                    topic_id: OUTLIER_LABEL,
                    coverage: 0.25
                },
                TopicCoverage {
                    topic_id: 0,
                    coverage: 0.5
                },
                TopicCoverage {
                    topic_id: 1,
                    coverage: 0.25
                },
            ]
        );
        let sum: f32 = d.topic_coverage.iter().map(|entry| entry.coverage).sum();
        assert!((sum - 1.0).abs() < 1e-6);
    }

    #[test]
    fn short_doc_is_near_one_hot() {
        let docs = rollup(1, &[0], &[2], &[5]);
        assert_eq!(docs[0].dominant_topic, 2);
        assert_eq!(
            docs[0].topic_coverage,
            vec![TopicCoverage {
                topic_id: 2,
                coverage: 1.0
            }]
        );
    }

    #[test]
    fn document_with_no_segments_is_outlier() {
        // Two docs, only doc 1 has a segment; doc 0 is empty.
        let docs = rollup(2, &[1], &[0], &[3]);
        assert_eq!(docs[0].dominant_topic, OUTLIER_LABEL);
        assert!(docs[0].topic_coverage.is_empty());
        assert_eq!(docs[1].dominant_topic, 0);
    }

    #[test]
    fn all_outlier_document_falls_back_to_outlier_dominant() {
        let docs = rollup(1, &[0, 0], &[OUTLIER_LABEL, OUTLIER_LABEL], &[2, 3]);
        assert_eq!(docs[0].dominant_topic, OUTLIER_LABEL);
        assert_eq!(docs[0].topic_coverage[0].topic_id, OUTLIER_LABEL);
        assert!((docs[0].topic_coverage[0].coverage - 1.0).abs() < 1e-6);
    }

    #[test]
    fn unequal_segment_lengths_control_coverage_and_dominance() {
        let docs = rollup(1, &[0, 0], &[0, 1], &[2, 8]);
        assert_eq!(docs[0].dominant_topic, 1);
        assert_eq!(docs[0].topic_coverage[0].coverage, 0.2);
        assert_eq!(docs[0].topic_coverage[1].coverage, 0.8);
    }

    #[test]
    fn outlier_weight_can_be_dominant() {
        let docs = rollup(1, &[0, 0, 0], &[OUTLIER_LABEL, 0, 1], &[8, 1, 1]);
        assert_eq!(docs[0].dominant_topic, OUTLIER_LABEL);
        let sum: f32 = docs[0]
            .topic_coverage
            .iter()
            .map(|entry| entry.coverage)
            .sum();
        assert!((sum - 1.0).abs() < 1e-6);
    }

    #[test]
    fn weighted_dominance_ties_choose_smaller_topic_id() {
        let docs = rollup(1, &[0, 0], &[4, 2], &[3, 3]);
        assert_eq!(docs[0].dominant_topic, 2);
    }
}
