//! Shared DuckDB-backed text cache primitives.
//!
//! Tokenization and embedding keep separate DuckDB files and value schemas, but
//! both are content-addressed per-text computations. This module owns the common
//! flow: hash text, fetch cached values, compute unique misses outside every DB
//! lock, insert with conflict-safe semantics, then expand to input order.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[cfg(test)]
use crate::file_lock::lock_path_for;
use crate::file_lock::with_file_lock;
pub(crate) use crate::fingerprint::hash_text;
use anyhow::{Context, Result};
use duckdb::Connection;

const CACHE_SCHEMA_VERSION: u32 = 2;
const CACHE_META_TABLE: &str = "ldaca_cache_meta";

/// Table-specific codec and namespace for one cached value type.
pub trait TextCacheTable {
    type Value;

    /// SQL that creates this table and its primary key if it does not exist.
    fn schema_sql(&self) -> &'static str;

    /// Fetch cached values for unique text hashes in this table's namespace.
    fn fetch_cached(
        &self,
        conn: &Connection,
        hashes: &[String],
    ) -> Result<HashMap<String, Arc<Self::Value>>>;

    /// Persist newly computed values. Implementations should use conflict-safe
    /// insert semantics so duplicate miss computation is harmless.
    fn persist_new(&self, conn: &Connection, entries: &[(String, Arc<Self::Value>)]) -> Result<()>;
}

/// Return values for `texts`, computing and inserting only unique cache misses.
pub fn get_or_insert_text_values<T>(
    path: &Path,
    table: &T,
    texts: &[String],
    compute_misses: impl FnOnce(&[String]) -> Result<Vec<T::Value>>,
) -> Result<Vec<Arc<T::Value>>>
where
    T: TextCacheTable,
{
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    let hashes = texts.iter().map(|text| hash_text(text)).collect::<Vec<_>>();
    let mut cached = with_file_lock(path, || {
        let conn = open_cache(path, table.schema_sql())?;
        table.fetch_cached(&conn, &hashes)
    })?;

    let (miss_hashes, miss_texts) = unique_misses(texts, &hashes, &cached);
    let computed = if miss_texts.is_empty() {
        Vec::new()
    } else {
        let values = compute_misses(&miss_texts)?;
        if values.len() != miss_texts.len() {
            anyhow::bail!(
                "cache miss encoder returned {} values for {} texts",
                values.len(),
                miss_texts.len()
            );
        }
        values
    };

    if !computed.is_empty() {
        let entries = miss_hashes
            .iter()
            .cloned()
            .zip(computed.into_iter().map(Arc::new))
            .collect::<Vec<_>>();
        with_file_lock(path, || {
            let conn = open_cache(path, table.schema_sql())?;
            table.persist_new(&conn, &entries)
        })?;
        for (hash, value) in entries {
            cached.insert(hash, value);
        }
    }

    hashes
        .iter()
        .map(|hash| {
            cached
                .get(hash)
                .map(Arc::clone)
                .ok_or_else(|| anyhow::anyhow!("cache missing computed hash {hash}"))
        })
        .collect()
}

fn unique_misses<V>(
    texts: &[String],
    hashes: &[String],
    cached: &HashMap<String, Arc<V>>,
) -> (Vec<String>, Vec<String>) {
    let mut seen_misses = HashSet::new();
    let mut miss_hashes = Vec::new();
    let mut miss_texts = Vec::new();
    for (hash, text) in hashes.iter().zip(texts) {
        if !cached.contains_key(hash) && seen_misses.insert(hash.clone()) {
            miss_hashes.push(hash.clone());
            miss_texts.push(text.clone());
        }
    }
    (miss_hashes, miss_texts)
}

fn open_cache(path: &Path, schema_sql: &str) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create cache dir {}", parent.display()))?;
    }
    if !cache_schema_is_current(path)? {
        rebuild_cache(path, schema_sql)?;
    }
    let conn = Connection::open(path).with_context(|| format!("open cache {}", path.display()))?;
    conn.execute_batch(schema_sql)
        .context("initialize cache schema")?;
    Ok(conn)
}

fn cache_schema_is_current(path: &Path) -> Result<bool> {
    if !path.exists() {
        return Ok(false);
    }
    let conn = match Connection::open(path) {
        Ok(conn) => conn,
        Err(_) => return Ok(false),
    };
    let query = format!("SELECT schema_version FROM {CACHE_META_TABLE} LIMIT 1");
    match conn.query_row(&query, [], |row| row.get::<_, u32>(0)) {
        Ok(version) => Ok(version == CACHE_SCHEMA_VERSION),
        Err(_) => Ok(false),
    }
}

fn rebuild_cache(path: &Path, schema_sql: &str) -> Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let temporary = tempfile::Builder::new()
        .prefix(".ldaca-cache-")
        .tempfile_in(parent)
        .with_context(|| format!("create temporary cache in {}", parent.display()))?;
    let temporary = temporary.into_temp_path();
    let temporary_path = temporary.to_path_buf();
    std::fs::remove_file(&temporary_path)
        .with_context(|| format!("prepare temporary cache {}", temporary_path.display()))?;

    let initialize = (|| -> Result<()> {
        let conn = Connection::open(&temporary_path)
            .with_context(|| format!("open temporary cache {}", temporary_path.display()))?;
        conn.execute_batch(&format!(
            "BEGIN;\nCREATE TABLE {CACHE_META_TABLE} (schema_version INTEGER NOT NULL);\nINSERT INTO {CACHE_META_TABLE} VALUES ({CACHE_SCHEMA_VERSION});\n{schema_sql};\nCOMMIT;"
        ))
        .context("initialize replacement cache schema")?;
        drop(conn);
        Ok(())
    })();
    initialize?;

    remove_if_exists(&wal_path_for(path))?;
    temporary.persist(path).map_err(|error| {
        anyhow::anyhow!(
            "atomically replace cache {} with {}: {}",
            path.display(),
            temporary_path.display(),
            error
        )
    })?;
    Ok(())
}

fn wal_path_for(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".wal");
    PathBuf::from(value)
}

fn remove_if_exists(path: &Path) -> Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("remove {}", path.display())),
    }
}

/// Load unique hashes into a connection-local table for one set-based lookup.
pub fn stage_requested_hashes(conn: &Connection, hashes: &[String]) -> Result<()> {
    conn.execute_batch(
        "DROP TABLE IF EXISTS requested_hashes;\nCREATE TEMP TABLE requested_hashes (content_hash VARCHAR PRIMARY KEY);",
    )
    .context("create requested cache hash table")?;
    let mut appender = conn
        .appender("requested_hashes")
        .context("open requested hash appender")?;
    let mut seen = HashSet::new();
    for hash in hashes {
        if seen.insert(hash.as_str()) {
            appender
                .append_row([hash.as_str()])
                .context("append requested cache hash")?;
        }
    }
    appender.flush().context("flush requested cache hashes")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use duckdb::params;
    use std::cell::Cell;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    const STRING_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS string_cache (
    namespace VARCHAR NOT NULL,
    content_hash VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    PRIMARY KEY (namespace, content_hash)
)
"#;

    struct StringTable<'a> {
        namespace: &'a str,
    }

    impl TextCacheTable for StringTable<'_> {
        type Value = String;

        fn schema_sql(&self) -> &'static str {
            STRING_SCHEMA
        }

        fn fetch_cached(
            &self,
            conn: &Connection,
            hashes: &[String],
        ) -> Result<HashMap<String, Arc<Self::Value>>> {
            stage_requested_hashes(conn, hashes)?;
            let mut out = HashMap::new();
            let mut stmt = conn.prepare(
                "SELECT cache.content_hash, cache.value
                 FROM string_cache AS cache
                 INNER JOIN requested_hashes AS requested USING (content_hash)
                 WHERE cache.namespace = ?",
            )?;
            let mut rows = stmt.query(params![self.namespace])?;
            while let Some(row) = rows.next()? {
                let hash: String = row.get(0)?;
                let value: String = row.get(1)?;
                out.insert(hash, Arc::new(value));
            }
            Ok(out)
        }

        fn persist_new(
            &self,
            conn: &Connection,
            entries: &[(String, Arc<Self::Value>)],
        ) -> Result<()> {
            conn.execute_batch(
                "BEGIN;
                 DROP TABLE IF EXISTS staged_string_cache;
                 CREATE TEMP TABLE staged_string_cache (
                    namespace VARCHAR, content_hash VARCHAR, value VARCHAR
                 );",
            )?;
            let result = (|| -> Result<()> {
                let mut appender = conn.appender("staged_string_cache")?;
                for (hash, value) in entries {
                    appender.append_row(params![self.namespace, hash, value.as_str()])?;
                }
                appender.flush()?;
                drop(appender);
                conn.execute_batch(
                    "INSERT OR IGNORE INTO string_cache
                     SELECT namespace, content_hash, value FROM staged_string_cache;
                     COMMIT;",
                )?;
                Ok(())
            })();
            if result.is_err() {
                let _ = conn.execute_batch("ROLLBACK");
            }
            result
        }
    }

    fn temp_cache_path(test_name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("ldaca-cache-{test_name}-{unique}.duckdb"))
    }

    #[test]
    fn json_cache_queries_work_without_extension_installation() -> Result<()> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(
            "SET autoinstall_known_extensions=false; SET autoload_known_extensions=false;",
        )?;
        let value: String = conn.query_row(
            "SELECT json_extract_string('{\"token\":\"café\"}', '$.token')",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(value, "café");
        Ok(())
    }

    #[test]
    fn cache_flow_computes_unique_misses_and_preserves_order() -> Result<()> {
        let path = temp_cache_path("flow");
        let table = StringTable { namespace: "a" };
        let texts = vec!["alpha".to_string(), "beta".to_string(), "alpha".to_string()];
        let mut misses_seen = Vec::new();
        let values = get_or_insert_text_values(&path, &table, &texts, |misses| {
            misses_seen = misses.to_vec();
            Ok(misses.iter().map(|text| format!("value:{text}")).collect())
        })?;

        assert_eq!(misses_seen, vec!["alpha".to_string(), "beta".to_string()]);
        assert_eq!(
            values
                .iter()
                .map(|value| value.as_str())
                .collect::<Vec<_>>(),
            vec!["value:alpha", "value:beta", "value:alpha"]
        );

        let mut second_misses = Vec::new();
        let second = get_or_insert_text_values(&path, &table, &texts, |misses| {
            second_misses = misses.to_vec();
            Ok(misses
                .iter()
                .map(|text| format!("unexpected:{text}"))
                .collect())
        })?;
        assert!(second_misses.is_empty());
        assert_eq!(second, values);

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(lock_path_for(&path));
        Ok(())
    }

    #[test]
    fn compute_runs_outside_cache_lock() -> Result<()> {
        let path = temp_cache_path("outside-lock");
        let outer = StringTable { namespace: "outer" };
        let inner = StringTable { namespace: "inner" };
        let nested_completed = Cell::new(false);

        let outer_texts = vec!["outer-text".to_string()];
        let outer_values = get_or_insert_text_values(&path, &outer, &outer_texts, |misses| {
            let inner_texts = vec!["inner-text".to_string()];
            let inner_values =
                get_or_insert_text_values(&path, &inner, &inner_texts, |inner_misses| {
                    Ok(inner_misses
                        .iter()
                        .map(|text| format!("inner:{text}"))
                        .collect())
                })?;
            assert_eq!(inner_values[0].as_str(), "inner:inner-text");
            nested_completed.set(true);
            Ok(misses.iter().map(|text| format!("outer:{text}")).collect())
        })?;

        assert!(nested_completed.get());
        assert_eq!(outer_values[0].as_str(), "outer:outer-text");

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(lock_path_for(&path));
        Ok(())
    }

    #[test]
    fn legacy_database_is_replaced_completely() -> Result<()> {
        let path = temp_cache_path("legacy-replacement");
        let legacy = Connection::open(&path)?;
        legacy.execute_batch("CREATE TABLE unrelated_user_table (value INTEGER);")?;
        drop(legacy);

        let table = StringTable { namespace: "new" };
        let values = get_or_insert_text_values(&path, &table, &["alpha".to_string()], |misses| {
            Ok(misses.iter().map(|text| format!("new:{text}")).collect())
        })?;
        assert_eq!(values[0].as_str(), "new:alpha");

        let current = Connection::open(&path)?;
        let unrelated_count: u64 = current.query_row(
            "SELECT count(*) FROM duckdb_tables() WHERE table_name = 'unrelated_user_table'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(unrelated_count, 0);
        let schema_version: u32 = current.query_row(
            &format!("SELECT schema_version FROM {CACHE_META_TABLE}"),
            [],
            |row| row.get(0),
        )?;
        assert_eq!(schema_version, CACHE_SCHEMA_VERSION);
        drop(current);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(lock_path_for(&path));
        Ok(())
    }

    #[test]
    fn failed_replacement_initialization_preserves_original_bytes() -> Result<()> {
        let path = temp_cache_path("failed-replacement");
        let original = b"not a duckdb database but still user-owned bytes";
        std::fs::write(&path, original)?;

        let error = rebuild_cache(&path, "THIS IS NOT VALID SQL").unwrap_err();
        assert!(error.to_string().contains("replacement cache"));
        assert_eq!(std::fs::read(&path)?, original);

        let _ = std::fs::remove_file(path);
        Ok(())
    }

    #[test]
    fn concurrent_writers_preserve_all_unique_rows() -> Result<()> {
        let path = Arc::new(temp_cache_path("concurrent-writers"));
        let mut handles = Vec::new();
        for texts in [
            vec!["alpha".to_string(), "shared".to_string()],
            vec!["beta".to_string(), "shared".to_string()],
        ] {
            let path = Arc::clone(&path);
            handles.push(std::thread::spawn(move || -> Result<()> {
                let table = StringTable {
                    namespace: "concurrent",
                };
                get_or_insert_text_values(&path, &table, &texts, |misses| {
                    Ok(misses.iter().map(|text| format!("value:{text}")).collect())
                })?;
                Ok(())
            }));
        }
        for handle in handles {
            handle
                .join()
                .map_err(|_| anyhow::anyhow!("cache writer thread panicked"))??;
        }

        let conn = Connection::open(path.as_ref())?;
        let row_count: u64 = conn.query_row(
            "SELECT count(*) FROM string_cache WHERE namespace = 'concurrent'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(row_count, 3);
        let mut statement = conn.prepare(
            "SELECT value FROM string_cache WHERE namespace = 'concurrent' ORDER BY value",
        )?;
        let values = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        assert_eq!(values, ["value:alpha", "value:beta", "value:shared"]);
        drop(statement);
        drop(conn);
        let _ = std::fs::remove_file(path.as_ref());
        let _ = std::fs::remove_file(lock_path_for(path.as_ref()));
        Ok(())
    }
}
