use super::{Token, TokenizeOptions, Tokenizer};
use crate::cache::{get_or_insert_text_values, hash_text, stage_requested_hashes, TextCacheTable};
use crate::tokenizer::{tokenizer_cache_fingerprint, TokenizerBackend};
use anyhow::{Context, Result as AnyhowResult};
use duckdb::{params, Connection};
use std::{collections::HashMap, path::Path, sync::Arc};
const TOKEN_CACHE_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS token_cache (
    model VARCHAR NOT NULL,
    fingerprint VARCHAR NOT NULL,
    params_hash VARCHAR NOT NULL,
    content_hash VARCHAR NOT NULL,
    tokens VARCHAR[] NOT NULL,
    start_offsets BIGINT[] NOT NULL,
    end_offsets BIGINT[] NOT NULL,
    PRIMARY KEY (model, fingerprint, params_hash, content_hash)
)
"#;

#[derive(serde::Serialize)]
struct TokenCacheParams {
    lowercase: bool,
    remove_punct: bool,
}

struct TokenCacheEntry {
    tokens: Vec<String>,
    starts: Vec<i64>,
    ends: Vec<i64>,
}

impl TokenCacheEntry {
    fn from_offsets(offsets: Vec<(String, i64, i64)>) -> Self {
        let mut tokens = Vec::with_capacity(offsets.len());
        let mut starts = Vec::with_capacity(offsets.len());
        let mut ends = Vec::with_capacity(offsets.len());
        for (token, start, end) in offsets {
            tokens.push(token);
            starts.push(start);
            ends.push(end);
        }
        Self {
            tokens,
            starts,
            ends,
        }
    }
}
struct TokenCacheTable<'a> {
    model_id: &'a str,
    fingerprint: &'a str,
    params_hash: &'a str,
}

impl TextCacheTable for TokenCacheTable<'_> {
    type Value = TokenCacheEntry;

    fn schema_sql(&self) -> &'static str {
        TOKEN_CACHE_SCHEMA_SQL
    }

    fn fetch_cached(
        &self,
        conn: &Connection,
        hashes: &[String],
    ) -> AnyhowResult<HashMap<String, Arc<Self::Value>>> {
        stage_requested_hashes(conn, hashes)?;
        let mut out = HashMap::new();
        let mut stmt = conn
            .prepare(
                r#"
                SELECT cache.content_hash, to_json(cache.tokens),
                       to_json(cache.start_offsets), to_json(cache.end_offsets)
                FROM token_cache AS cache
                INNER JOIN requested_hashes AS requested USING (content_hash)
                WHERE cache.model = ? AND cache.fingerprint = ? AND cache.params_hash = ?
                "#,
            )
            .context("prepare token cache lookup")?;
        let mut rows = stmt.query(params![self.model_id, self.fingerprint, self.params_hash])?;
        while let Some(row) = rows.next()? {
            let hash: String = row.get(0)?;
            let tokens_json: String = row.get(1)?;
            let starts_json: String = row.get(2)?;
            let ends_json: String = row.get(3)?;
            let entry = TokenCacheEntry {
                tokens: serde_json::from_str(&tokens_json).context("decode token cache tokens")?,
                starts: serde_json::from_str(&starts_json).context("decode token cache starts")?,
                ends: serde_json::from_str(&ends_json).context("decode token cache ends")?,
            };
            out.insert(hash, Arc::new(entry));
        }

        Ok(out)
    }

    fn persist_new(
        &self,
        conn: &Connection,
        entries: &[(String, Arc<Self::Value>)],
    ) -> AnyhowResult<()> {
        if entries.is_empty() {
            return Ok(());
        }
        conn.execute_batch(
            "BEGIN; DROP TABLE IF EXISTS staged_token_cache;
             CREATE TEMP TABLE staged_token_cache (
               model VARCHAR, fingerprint VARCHAR, params_hash VARCHAR, content_hash VARCHAR,
               tokens VARCHAR[], start_offsets BIGINT[], end_offsets BIGINT[]
             );",
        )?;
        let result = (|| -> AnyhowResult<()> {
            let mut appender = conn.appender("staged_token_cache")?;
            for (hash, entry) in entries {
                let tokens_json = serde_json::to_string(&entry.tokens)?;
                let starts_json = serde_json::to_string(&entry.starts)?;
                let ends_json = serde_json::to_string(&entry.ends)?;
                appender.append_row(params![
                    self.model_id,
                    self.fingerprint,
                    self.params_hash,
                    hash,
                    tokens_json,
                    starts_json,
                    ends_json,
                ])?;
            }
            appender.flush()?;
            drop(appender);
            conn.execute_batch(
                "INSERT OR IGNORE INTO token_cache
                 SELECT model, fingerprint, params_hash, content_hash, tokens, start_offsets, end_offsets
                 FROM staged_token_cache; COMMIT;",
            )?;
            Ok(())
        })();
        if result.is_err() {
            let _ = conn.execute_batch("ROLLBACK");
        }
        result
    }
}

fn token_params_hash(lowercase: bool, remove_punct: bool) -> AnyhowResult<String> {
    let params = TokenCacheParams {
        lowercase,
        remove_punct,
    };
    Ok(hash_text(&serde_json::to_string(&params)?))
}

fn tokenize_uncached_entries(
    backend: &TokenizerBackend,
    texts: &[String],
    lowercase: bool,
    remove_punct: bool,
) -> AnyhowResult<Vec<TokenCacheEntry>> {
    texts
        .iter()
        .map(|text| {
            backend
                .tokenize_text_with_offsets(text, lowercase, remove_punct)
                .map(TokenCacheEntry::from_offsets)
        })
        .collect()
}

/// Tokenize through a dedicated disposable cache, retaining duplicates and input order.
pub fn tokenize_cached(
    tokenizer: &Tokenizer,
    path: &Path,
    texts: &[String],
    options: TokenizeOptions,
) -> AnyhowResult<Vec<Vec<Token>>> {
    let fingerprint = tokenizer_cache_fingerprint(tokenizer.model_id())?;
    let params_hash = token_params_hash(options.lowercase, options.remove_punctuation)?;
    let table = TokenCacheTable {
        model_id: tokenizer.model_id(),
        fingerprint: &fingerprint,
        params_hash: &params_hash,
    };
    let entries = get_or_insert_text_values(path, &table, texts, |misses| {
        tokenize_uncached_entries(
            &tokenizer.backend,
            misses,
            options.lowercase,
            options.remove_punctuation,
        )
    })?;
    entries
        .into_iter()
        .map(|entry| {
            anyhow::ensure!(
                entry.tokens.len() == entry.starts.len() && entry.tokens.len() == entry.ends.len(),
                "invalid token cache offsets"
            );
            Ok(entry
                .tokens
                .iter()
                .zip(&entry.starts)
                .zip(&entry.ends)
                .map(|((token, start), end)| Token {
                    token: token.clone(),
                    start: *start,
                    end: *end,
                })
                .collect())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cached_and_uncached_tokens_preserve_order_options_and_duplicates() {
        let model = Tokenizer::load("native:plain_words_en").unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("tokens.duckdb");
        let texts: Vec<String> = vec!["Café cat!".into(), "".into(), "Café cat!".into()];
        for options in [
            TokenizeOptions::default(),
            TokenizeOptions {
                lowercase: false,
                remove_punctuation: false,
            },
        ] {
            let expected: Vec<_> = texts
                .iter()
                .map(|text| model.tokenize(text, options).unwrap())
                .collect();
            assert_eq!(
                tokenize_cached(&model, &path, &texts, options).unwrap(),
                expected
            );
            assert_eq!(
                tokenize_cached(&model, &path, &texts, options).unwrap(),
                expected
            );
        }
    }
}
