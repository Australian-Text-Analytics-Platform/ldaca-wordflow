//! DuckDB-backed embedding vector cache.
//!
//! Why this exists: ONNX inference is the expensive part of topic modeling and
//! the public `embedding` expression, while the existing tokenization cache must
//! remain a separate `tokens.duckdb` file. This module owns the Rust-side
//! `embeddings.duckdb` schema and keeps cache keys tied to the model pipeline,
//! execution-provider label, and text content hash.
//!
//! Used by: `expressions::embedding` and `topic_modeling::run`, with the backend
//! passing a per-user embedding cache path into the pipeline.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use duckdb::{params, Connection};

use crate::cache::{get_or_insert_text_values, stage_requested_hashes, TextCacheTable};

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS embedding_cache (
    model VARCHAR NOT NULL,
    fingerprint VARCHAR NOT NULL,
    provider VARCHAR NOT NULL,
    content_hash VARCHAR NOT NULL,
    dim UBIGINT NOT NULL,
    embedding BLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model, fingerprint, provider, content_hash)
)
"#;

/// Stable dimensions of a cache namespace. The provider is included because
/// acceleration backends can differ slightly in floating-point output.
#[derive(Clone, Copy)]
pub struct CacheScope<'a> {
    pub model_id: &'a str,
    pub fingerprint: &'a str,
    pub provider_id: &'a str,
}

/// Return embeddings for `texts`, computing and inserting only unique misses.
///
/// Flow: create/open the requested DuckDB file, fetch cached blobs for unique
/// text hashes, run the caller's miss encoder, persist new blobs, then expand
/// duplicates back to input order.
pub fn get_or_insert_embeddings(
    path: &Path,
    scope: CacheScope<'_>,
    texts: &[String],
    compute_misses: impl FnOnce(&[String]) -> Result<Vec<Vec<f32>>>,
) -> Result<Vec<Arc<Vec<f32>>>> {
    let table = EmbeddingCacheTable { scope };
    get_or_insert_text_values(path, &table, texts, compute_misses)
}

struct EmbeddingCacheTable<'a> {
    scope: CacheScope<'a>,
}

impl TextCacheTable for EmbeddingCacheTable<'_> {
    type Value = Vec<f32>;

    fn schema_sql(&self) -> &'static str {
        SCHEMA_SQL
    }

    fn fetch_cached(
        &self,
        conn: &Connection,
        hashes: &[String],
    ) -> Result<HashMap<String, Arc<Self::Value>>> {
        stage_requested_hashes(conn, hashes)?;
        let mut out = HashMap::new();
        let mut stmt = conn
            .prepare(
                r#"
                SELECT cache.content_hash, cache.dim, cache.embedding
                FROM embedding_cache AS cache
                INNER JOIN requested_hashes AS requested USING (content_hash)
                WHERE cache.model = ?
                  AND cache.fingerprint = ?
                  AND cache.provider = ?
                "#,
            )
            .context("prepare embedding cache lookup")?;
        let mut rows = stmt.query(params![
            self.scope.model_id,
            self.scope.fingerprint,
            self.scope.provider_id
        ])?;
        while let Some(row) = rows.next()? {
            let hash: String = row.get(0)?;
            let dim: u64 = row.get(1)?;
            let blob: Vec<u8> = row.get(2)?;
            if let Some(vector) = blob_to_vector(&blob, dim as usize) {
                out.insert(hash, Arc::new(vector));
            }
        }

        Ok(out)
    }

    fn persist_new(&self, conn: &Connection, entries: &[(String, Arc<Self::Value>)]) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }
        conn.execute_batch(
            r#"
            BEGIN;
            DROP TABLE IF EXISTS staged_embedding_cache;
            CREATE TEMP TABLE staged_embedding_cache (
                model VARCHAR, fingerprint VARCHAR, provider VARCHAR,
                content_hash VARCHAR, dim UBIGINT, embedding BLOB
            );
            "#,
        )?;
        let result = (|| -> Result<()> {
            let mut appender = conn.appender("staged_embedding_cache")?;
            for (hash, vector) in entries {
                let blob = vector_to_blob(vector);
                appender.append_row(params![
                    self.scope.model_id,
                    self.scope.fingerprint,
                    self.scope.provider_id,
                    hash,
                    vector.len() as u64,
                    blob,
                ])?;
            }
            appender.flush()?;
            drop(appender);
            conn.execute_batch(
                r#"
                INSERT OR IGNORE INTO embedding_cache
                    (model, fingerprint, provider, content_hash, dim, embedding)
                SELECT model, fingerprint, provider, content_hash, dim, embedding
                FROM staged_embedding_cache;
                COMMIT;
                "#,
            )?;
            Ok(())
        })();
        if result.is_err() {
            let _ = conn.execute_batch("ROLLBACK");
        }
        result
    }
}

fn vector_to_blob(vector: &[f32]) -> Vec<u8> {
    let mut blob = Vec::with_capacity(std::mem::size_of_val(vector));
    for value in vector {
        blob.extend_from_slice(&value.to_le_bytes());
    }
    blob
}

fn blob_to_vector(blob: &[u8], dim: usize) -> Option<Vec<f32>> {
    if blob.len() != dim * std::mem::size_of::<f32>() {
        return None;
    }
    let mut vector = Vec::with_capacity(dim);
    for chunk in blob.as_chunks::<4>().0 {
        vector.push(f32::from_le_bytes(*chunk));
    }
    Some(vector)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_cache_path(test_name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("ldaca-rs-{test_name}-{unique}.duckdb"))
    }

    #[test]
    fn vector_blob_round_trips_little_endian_f32s() {
        let vector = vec![0.25_f32, -1.5, 3.75];
        let blob = vector_to_blob(&vector);
        assert_eq!(blob_to_vector(&blob, vector.len()).unwrap(), vector);
    }

    #[test]
    fn blob_to_vector_rejects_wrong_dimension() {
        let blob = vector_to_blob(&[1.0_f32, 2.0]);
        assert!(blob_to_vector(&blob, 3).is_none());
    }

    #[test]
    fn cache_computes_only_misses_and_preserves_input_order() -> Result<()> {
        let path = temp_cache_path("embedding-cache-misses");
        let scope = CacheScope {
            model_id: "test-model",
            fingerprint: "test-fingerprint",
            provider_id: "test-provider",
        };

        let first_texts = vec!["alpha".to_string(), "beta".to_string(), "alpha".to_string()];
        let mut first_misses = Vec::new();
        let first = get_or_insert_embeddings(&path, scope, &first_texts, |misses| {
            first_misses = misses.to_vec();
            Ok(misses
                .iter()
                .map(|text| match text.as_str() {
                    "alpha" => vec![1.0, 1.5],
                    "beta" => vec![2.0, 2.5],
                    _ => unreachable!("unexpected first miss {text}"),
                })
                .collect())
        })?;
        assert_eq!(first_misses, vec!["alpha".to_string(), "beta".to_string()]);
        assert_eq!(
            first
                .iter()
                .map(|value| value.as_slice())
                .collect::<Vec<_>>(),
            vec![&[1.0, 1.5][..], &[2.0, 2.5][..], &[1.0, 1.5][..]]
        );

        let second_texts = vec!["beta".to_string(), "gamma".to_string(), "alpha".to_string()];
        let mut second_misses = Vec::new();
        let second = get_or_insert_embeddings(&path, scope, &second_texts, |misses| {
            second_misses = misses.to_vec();
            Ok(misses
                .iter()
                .map(|text| match text.as_str() {
                    "gamma" => vec![3.0, 3.5],
                    _ => unreachable!("cached text was recomputed: {text}"),
                })
                .collect())
        })?;
        assert_eq!(second_misses, vec!["gamma".to_string()]);
        assert_eq!(
            second
                .iter()
                .map(|value| value.as_slice())
                .collect::<Vec<_>>(),
            vec![&[2.0, 2.5][..], &[3.0, 3.5][..], &[1.0, 1.5][..]]
        );

        let conn = Connection::open(&path)?;
        let row_count: u64 =
            conn.query_row("SELECT count(*) FROM embedding_cache", [], |row| row.get(0))?;
        assert_eq!(row_count, 3);
        drop(conn);
        let _ = std::fs::remove_file(path);
        Ok(())
    }
}
