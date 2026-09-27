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

/// Auto only intervenes when one topic holds more than this share of all
/// segments. Excess-of-mass selection can pick one blob that swallows the
/// corpus when short segments form a continuous cloud.
const AUTO_DOMINANT_SHARE: f64 = 0.5;

/// Bounded number of Auto refinement passes; each pass descends one level into
/// the dominant topic.
const AUTO_MAX_PASSES: usize = 8;

/// Clustering policy selected by the host. The desktop keeps its established
/// uncapped behavior, while the Polars adapter offers Auto and fixed caps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TopicSizeLimit {
    Uncapped,
    Auto,
    Fixed(usize),
}

/// Result of clustering: one label per input point. Labels are contiguous
/// `0..n_topics` for real topics, or `OUTLIER_LABEL` for noise. `n_topics` is
/// the count of distinct non-outlier labels, precomputed for the orchestrator.
/// `max_cluster_size` is the cap that produced these labels, if any: the
/// user's fixed Max topic size, or the size Auto settled on (`None` when Auto
/// found no dominant topic or kept the uncapped result).
#[derive(Debug, Clone)]
pub struct ClusterResult {
    pub labels: Vec<i32>,
    pub n_topics: usize,
    pub max_cluster_size: Option<usize>,
}

/// Cluster `points` into topics.
///
/// Flow: with a fixed Max topic size, run HDBSCAN once with that cap (never
/// below `min_cluster_size + 1`). With Auto, run uncapped; while one
/// topic holds more than half of all points, re-run with the cap just below
/// that topic's size and keep the capped labels only when `accept_capped`
/// approves them. The crate's labels are already contiguous from zero, which
/// projection and rollup rely on for indexing.
pub fn cluster(
    points: &[Vec<f32>],
    min_cluster_size: usize,
    limit: TopicSizeLimit,
) -> Result<ClusterResult> {
    let n = points.len();
    if n < 2 {
        return Ok(ClusterResult {
            labels: vec![OUTLIER_LABEL; n],
            n_topics: 0,
            max_cluster_size: None,
        });
    }
    let min_cluster_size = min_cluster_size.clamp(2, n);
    match limit {
        TopicSizeLimit::Uncapped => return run_hdbscan(points, min_cluster_size, None),
        TopicSizeLimit::Fixed(requested) => {
            return run_hdbscan(
                points,
                min_cluster_size,
                Some(requested.max(min_cluster_size + 1)),
            );
        }
        TopicSizeLimit::Auto => {}
    }

    let mut best = run_hdbscan(points, min_cluster_size, None)?;
    for _ in 0..AUTO_MAX_PASSES {
        let Some((dominant, dominant_size)) = largest_topic(&best.labels) else {
            break;
        };
        if (dominant_size as f64) <= n as f64 * AUTO_DOMINANT_SHARE {
            break;
        }
        let cap = dominant_size.saturating_sub(1).max(min_cluster_size + 1);
        if cap >= dominant_size {
            break;
        }
        let capped = run_hdbscan(points, min_cluster_size, Some(cap))?;
        if !accept_capped(&best, &capped, dominant) {
            break;
        }
        best = capped;
    }
    Ok(best)
}

fn run_hdbscan(
    points: &[Vec<f32>],
    min_cluster_size: usize,
    max_cluster_size: Option<usize>,
) -> Result<ClusterResult> {
    let n = points.len();
    let mut builder = HdbscanHyperParams::builder()
        .min_cluster_size(min_cluster_size)
        .dist_metric(DistanceMetric::Euclidean);
    let applied = max_cluster_size.filter(|&cap| cap < n);
    if let Some(cap) = applied {
        builder = builder.max_cluster_size(cap);
    }
    let clusterer = Hdbscan::new(points, builder.build());
    let labels = clusterer
        .cluster()
        .map_err(|e| anyhow::anyhow!("HDBSCAN clustering failed: {e}"))?;
    let n_topics = labels
        .iter()
        .filter(|&&l| l != OUTLIER_LABEL)
        .collect::<std::collections::HashSet<_>>()
        .len();
    Ok(ClusterResult {
        labels,
        n_topics,
        max_cluster_size: applied,
    })
}

/// The label and size of the largest non-outlier topic.
fn largest_topic(labels: &[i32]) -> Option<(i32, usize)> {
    let mut sizes = std::collections::HashMap::<i32, usize>::new();
    for &label in labels.iter().filter(|&&label| label != OUTLIER_LABEL) {
        *sizes.entry(label).or_default() += 1;
    }
    sizes
        .into_iter()
        .max_by_key(|&(label, size)| (size, std::cmp::Reverse(label)))
}

/// Accepts a capped re-clustering only when it finds more topics and keeps at
/// least half of the previously dominant topic's points in topics, so a
/// genuine large theme is never dissolved into outliers.
fn accept_capped(previous: &ClusterResult, capped: &ClusterResult, dominant: i32) -> bool {
    if capped.n_topics <= previous.n_topics {
        return false;
    }
    let (members, kept) = previous
        .labels
        .iter()
        .zip(&capped.labels)
        .filter(|(&before, _)| before == dominant)
        .fold((0usize, 0usize), |(members, kept), (_, &after)| {
            (members + 1, kept + usize::from(after != OUTLIER_LABEL))
        });
    kept * 2 >= members
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

        let res = cluster(&points, 5, TopicSizeLimit::Auto).unwrap();
        assert_eq!(res.n_topics, 2, "labels: {:?}", res.labels);
        assert_eq!(*res.labels.last().unwrap(), OUTLIER_LABEL);
        // Real labels are contiguous from zero.
        assert!(res
            .labels
            .iter()
            .all(|&l| l == OUTLIER_LABEL || (0..2).contains(&l)));
    }

    #[test]
    fn single_point_is_an_outlier_without_a_fabricated_topic() {
        let res = cluster(&[vec![1.0, 2.0]], 10, TopicSizeLimit::Auto).unwrap();
        assert_eq!(res.n_topics, 0);
        assert_eq!(res.labels, vec![OUTLIER_LABEL]);
    }

    #[test]
    fn empty_input_is_no_topics() {
        let res = cluster(&[], 10, TopicSizeLimit::Auto).unwrap();
        assert_eq!(res.n_topics, 0);
        assert!(res.labels.is_empty());
    }

    /// A large blob made of two nearby tight groups: without a cap HDBSCAN may
    /// select the whole blob, with a cap below its size it must select the
    /// groups inside it.
    #[test]
    fn max_cluster_size_forces_selection_below_a_giant_blob() {
        let mut points: Vec<Vec<f32>> = Vec::new();
        for i in 0..30 {
            points.push(vec![(i as f32) * 0.001, 0.0]);
        }
        for i in 0..30 {
            points.push(vec![0.5 + (i as f32) * 0.001, 0.0]);
        }
        let capped = cluster(&points, 5, TopicSizeLimit::Fixed(40)).unwrap();
        assert!(capped.n_topics >= 2, "labels: {:?}", capped.labels);
        let largest = (0..capped.n_topics as i32)
            .map(|topic| {
                capped
                    .labels
                    .iter()
                    .filter(|&&label| label == topic)
                    .count()
            })
            .max()
            .unwrap();
        assert!(largest <= 40, "largest cluster {largest}");
    }

    #[test]
    fn auto_keeps_genuine_large_topics_that_are_not_dominant() {
        // Two real clusters of 10 plus an outlier: neither holds more than half
        // of the points, so Auto must not cap them away.
        let mut points: Vec<Vec<f32>> = Vec::new();
        for i in 0..10 {
            points.push(vec![(i as f32) * 0.01, 0.0]);
        }
        for i in 0..10 {
            points.push(vec![10.0 + (i as f32) * 0.01, 10.0]);
        }
        points.push(vec![100.0, 100.0]);
        let res = cluster(&points, 5, TopicSizeLimit::Auto).unwrap();
        assert_eq!(res.n_topics, 2, "labels: {:?}", res.labels);
        assert_eq!(res.max_cluster_size, None);
    }

    fn result(labels: &[i32]) -> ClusterResult {
        ClusterResult {
            n_topics: labels
                .iter()
                .filter(|&&label| label != OUTLIER_LABEL)
                .collect::<std::collections::HashSet<_>>()
                .len(),
            labels: labels.to_vec(),
            max_cluster_size: None,
        }
    }

    #[test]
    fn accepts_a_split_that_keeps_the_dominant_topic_in_topics() {
        let previous = result(&[0, 0, 0, 0, 0, 0, 1, 1]);
        let capped = result(&[0, 0, 0, 2, 2, -1, 1, 1]);
        assert!(accept_capped(&previous, &capped, 0));
    }

    #[test]
    fn rejects_a_split_that_turns_the_dominant_topic_into_outliers() {
        let previous = result(&[0, 0, 0, 0, 0, 0, 1, 1]);
        let capped = result(&[2, 3, -1, -1, -1, -1, 1, 1]);
        assert!(!accept_capped(&previous, &capped, 0));
    }

    #[test]
    fn rejects_a_cap_that_finds_no_more_topics() {
        let previous = result(&[0, 0, 0, 0, 1, 1]);
        let capped = result(&[0, 0, 0, -1, 1, 1]);
        assert!(!accept_capped(&previous, &capped, 0));
    }

    #[test]
    fn largest_topic_ignores_outliers() {
        assert_eq!(largest_topic(&[-1, -1, -1, 0, 1, 1]), Some((1, 2)));
        assert_eq!(largest_topic(&[-1, -1]), None);
    }
}
