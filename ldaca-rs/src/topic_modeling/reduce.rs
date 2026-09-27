//! PaCMAP dimensionality reduction for topic-modeling segment embeddings.
//!
//! Why this exists: density-based clustering (HDBSCAN) degrades in the raw
//! 384-dim embedding space (the curse of dimensionality flattens density
//! contrast), so BERTopic reduces to a handful of dimensions first. This module
//! is that step. Per the design decision it uses **PaCMAP only** — there is no
//! PCA-to-50-dims escape hatch; PaCMAP's internal PCA *initialization* is part
//! of the algorithm, not a fallback for it.
//!
//! PaCMAP (JMLR 2021) is the selected Rust-native reducer, not an assumed UMAP
//! equivalent. The repository's one-time quality audit compares this choice
//! with UMAP and PCA. Output is seeded for reproducibility.
//!
//! Called by: `topic_modeling::run` between embedding and clustering and by the
//! projector for merged-Topic coordinates. Corpora below three points are
//! handled explicitly by their caller.

use anyhow::Result;
use ndarray::Array2;
use pacmap::{fit_transform, Configuration, Initialization, PairConfiguration};

/// Reduce `points` (each a same-length embedding row) to `output_dims`.
///
/// Flow: pack the rows into an `ndarray` matrix, run PaCMAP with PCA
/// initialization and a fixed seed, then unpack the reduced matrix back into row
/// vectors for the clusterer. Neighbour counts are reduced for small inputs so
/// PaCMAP never requests more unique far points than exist.
pub fn reduce<T: AsRef<Vec<f32>>>(
    points: &[T],
    output_dims: usize,
    seed: u64,
) -> Result<Vec<Vec<f32>>> {
    let n = points.len();
    if n < 3 {
        anyhow::bail!("PaCMAP reduction requires at least 3 points; received {n}");
    }
    let dim = points[0].as_ref().len();
    if dim == 0 {
        anyhow::bail!("reduce called with zero-dimensional points");
    }
    if points.iter().any(|p| p.as_ref().len() != dim) {
        anyhow::bail!("reduce called with ragged embedding rows");
    }
    if points
        .iter()
        .flat_map(|point| point.as_ref())
        .any(|value| !value.is_finite())
    {
        anyhow::bail!("reduce called with non-finite embedding values");
    }
    if output_dims < 2 {
        anyhow::bail!("PaCMAP output dimensions must be at least 2");
    }
    let max_output_dims = dim.min(n).min(if dim > 100 { 100 } else { dim });
    if output_dims > max_output_dims {
        anyhow::bail!(
            "PaCMAP output dimensions {} exceed the usable rank {max_output_dims} for {n}x{dim} input",
            output_dims
        );
    }

    let flat: Vec<f32> = points
        .iter()
        .flat_map(|point| point.as_ref())
        .copied()
        .collect();
    let matrix = Array2::from_shape_vec((n, dim), flat)
        .map_err(|e| anyhow::anyhow!("failed to build embedding matrix: {e}"))?;

    let (n_neighbors, far_pair_ratio) = if n == 3 {
        (1, 1.0)
    } else {
        (10.min((n - 1) / 3).max(1), 2.0)
    };
    let config = Configuration {
        embedding_dimensions: output_dims,
        // PCA init is PaCMAP's standard, deterministic starting point — this is
        // the algorithm's own initialization, not the rejected PCA fallback.
        initialization: Initialization::Pca,
        mid_near_ratio: 0.5,
        far_pair_ratio,
        override_neighbors: Some(n_neighbors),
        seed: Some(seed),
        pair_configuration: PairConfiguration::Generate,
        learning_rate: 1.0,
        num_iters: (100, 100, 250),
        snapshots: None,
        approx_threshold: 8_000,
    };

    let (embedding, _snapshots) = fit_transform(matrix.view(), config)
        .map_err(|e| anyhow::anyhow!("PaCMAP fit_transform failed: {e}"))?;

    if embedding.nrows() != n || embedding.ncols() != output_dims {
        anyhow::bail!(
            "PaCMAP returned shape {}x{}; expected {n}x{}",
            embedding.nrows(),
            embedding.ncols(),
            output_dims
        );
    }
    let reduced = embedding
        .rows()
        .into_iter()
        .map(|row| row.to_vec())
        .collect::<Vec<_>>();
    Ok(reduced)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reduce_rejects_too_few_points() {
        let pts = vec![vec![0.0f32, 1.0]; 2];
        let err = reduce(&pts, 5, 42).unwrap_err();
        assert!(err.to_string().contains("at least 3"), "{err}");
    }

    #[test]
    fn reduce_outputs_requested_dimensionality() {
        // Two well-separated Gaussians-ish blobs in 8-dim, enough points for
        // PaCMAP. We only assert shape + determinism here, never exact values.
        let mut pts: Vec<Vec<f32>> = Vec::new();
        for i in 0..40 {
            let base = if i % 2 == 0 { 0.0 } else { 5.0 };
            pts.push((0..8).map(|j| base + (i * j % 3) as f32 * 0.01).collect());
        }
        let a = reduce(&pts, 3, 7).unwrap();
        assert_eq!(a.len(), pts.len());
        assert!(a.iter().all(|r| r.len() == 3));
        // Same seed + input => stable embedding. PaCMAP's parallel float
        // reductions make it close-but-not-bit-exact across runs, so we assert
        // approximate (not exact) reproducibility; this is enough for stable
        // downstream clustering.
        let b = reduce(&pts, 3, 7).unwrap();
        for (ra, rb) in a.iter().zip(&b) {
            for (x, y) in ra.iter().zip(rb) {
                assert!((x - y).abs() < 1e-2, "{x} vs {y}");
            }
        }
    }

    #[test]
    fn reduce_rejects_single_output_dimension() {
        let pts = vec![vec![0.0f32, 1.0]; 12];
        let err = reduce(&pts, 1, 42).unwrap_err();
        assert!(err.to_string().contains("at least 2"), "{err}");
    }

    #[test]
    fn reduce_rejects_output_wider_than_input_rank() {
        let pts = vec![vec![0.0f32, 1.0]; 12];
        let err = reduce(&pts, 3, 42).unwrap_err();
        assert!(err.to_string().contains("usable rank 2"), "{err}");
    }

    #[test]
    fn reduce_rejects_non_finite_values() {
        let mut pts = vec![vec![0.0f32, 1.0]; 12];
        pts[0][0] = f32::NAN;
        let err = reduce(&pts, 5, 42).unwrap_err();
        assert!(err.to_string().contains("non-finite"), "{err}");
    }
}
