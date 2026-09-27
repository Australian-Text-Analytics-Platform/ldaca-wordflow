//! HDBSCAN clustering of reduced Topic Segment embeddings into topics.
//!
//! Why this exists: after PaCMAP reduction, Topic Segments that discuss the same
//! thing sit close together; HDBSCAN turns those density peaks into topics and,
//! crucially, leaves genuinely off-topic segments as noise (label `-1`) instead of
//! forcing every point into a cluster. That noise handling is why BERTopic uses
//! HDBSCAN rather than k-means, and it carries straight over here.
//!
//! Determinism: HDBSCAN is deterministic given identical input, so topic
//! assignments are reproducible without a seed (PaCMAP upstream supplies the
//! seeded randomness).
//!
//! Distance metric: embeddings are L2-normalized upstream, so Euclidean distance
//! is monotonic with cosine distance and we can use the Euclidean metric the
//! crate provides directly.
//!
//! Called by: `topic_modeling::run` after `reduce`, on the reduced segment points.

use anyhow::Result;
use hdbscan::{DistanceMetric, Hdbscan, HdbscanHyperParams};

/// Outlier/noise label emitted by HDBSCAN for segments that belong to no topic.
/// Mirrors BERTopic's `-1` outlier topic so the rest of the pipeline (rollup,
/// payload, frontend) can treat it the same way.
pub const OUTLIER_LABEL: i32 = -1;

/// Result of clustering: one label per input point. Labels are contiguous
/// `0..n_topics` for real topics, or `OUTLIER_LABEL` for noise. `n_topics` is
/// the count of distinct non-outlier labels, precomputed for the orchestrator.
#[derive(Debug, Clone)]
pub struct ClusterResult {
    pub labels: Vec<i32>,
    pub n_topics: usize,
}

/// Cluster `points` into topics.
///
/// Flow: build HDBSCAN hyper-parameters (clamping `min_cluster_size`
/// to the valid `>= 2` range and never exceeding the point count), run the
/// clusterer, and count distinct non-outlier labels. The crate's labels are
/// already contiguous from zero, which projection and rollup rely on for indexing.
pub fn cluster(points: &[Vec<f32>], min_cluster_size: usize) -> Result<ClusterResult> {
    let n = points.len();
    if n < 2 {
        return Ok(ClusterResult {
            labels: vec![OUTLIER_LABEL; n],
            n_topics: 0,
        });
    }

    let min_cluster_size = min_cluster_size.clamp(2, n);
    let params = HdbscanHyperParams::builder()
        .min_cluster_size(min_cluster_size)
        .dist_metric(DistanceMetric::Euclidean)
        .build();

    let clusterer = Hdbscan::new(points, params);
    let labels = clusterer
        .cluster()
        .map_err(|e| anyhow::anyhow!("HDBSCAN clustering failed: {e}"))?;

    let n_topics = labels
        .iter()
        .filter(|&&l| l != OUTLIER_LABEL)
        .collect::<std::collections::HashSet<_>>()
        .len();

    Ok(ClusterResult { labels, n_topics })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Two tight, well-separated blobs plus one far-flung outlier should yield
    /// two topics and a noise label. Values are fixed, so this is deterministic
    /// and safe for CI (unlike embedding/quality assertions).
    #[test]
    fn separates_two_blobs_and_marks_outlier() {
        let mut points: Vec<Vec<f32>> = Vec::new();
        for i in 0..10 {
            points.push(vec![0.0 + (i as f32) * 0.01, 0.0]);
        }
        for i in 0..10 {
            points.push(vec![10.0 + (i as f32) * 0.01, 10.0]);
        }
        points.push(vec![100.0, 100.0]); // lone outlier

        let res = cluster(&points, 5).unwrap();
        assert_eq!(res.n_topics, 2, "labels: {:?}", res.labels);
        assert_eq!(res.labels.len(), points.len());
        assert!(res.labels[..10].iter().all(|label| *label == res.labels[0]));
        assert!(res.labels[10..20]
            .iter()
            .all(|label| *label == res.labels[10]));
        assert_ne!(res.labels[0], res.labels[10]);
        assert_eq!(*res.labels.last().unwrap(), OUTLIER_LABEL);
        // Real labels are contiguous from zero.
        assert!(res
            .labels
            .iter()
            .all(|&l| l == OUTLIER_LABEL || (0..2).contains(&l)));
    }

    #[test]
    fn single_point_is_an_outlier_without_a_fabricated_topic() {
        let res = cluster(&[vec![1.0, 2.0]], 10).unwrap();
        assert_eq!(res.n_topics, 0);
        assert_eq!(res.labels, vec![OUTLIER_LABEL]);
    }

    #[test]
    fn empty_input_is_no_topics() {
        let res = cluster(&[], 10).unwrap();
        assert_eq!(res.n_topics, 0);
        assert!(res.labels.is_empty());
    }
}
