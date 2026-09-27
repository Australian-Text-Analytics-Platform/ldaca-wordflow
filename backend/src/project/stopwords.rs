//! Ordinary Data Blocks supply live stopword memberships; no separate list storage.
use super::*;
use std::collections::HashSet;

const LIMIT: usize = 100_000;
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StopwordSource {
    pub source: ObjectTarget,
    pub column: String,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct PrepareStopwords {
    pub selected: Option<StopwordSource>,
    pub inputs: Vec<StopwordSource>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct SaveStopwords {
    pub selected: StopwordSource,
    pub before: Vec<String>,
    pub after: Vec<String>,
    #[serde(default)]
    pub sort: bool,
}

fn word_expression(expression: &str) -> String {
    format!("lower(regexp_replace(CAST({expression} AS VARCHAR), '^\\s+|\\s+$', '', 'g'))")
}
/// Canonical membership and source order, retaining the first spelling for new cells.
fn normalized_sql(relation: &str, column: &str) -> String {
    let word = word_expression(column);
    format!(
        "SELECT word, first(value ORDER BY position) AS value FROM (SELECT {word} AS word, regexp_replace(CAST({column} AS VARCHAR), '^\\s+|\\s+$', '', 'g') AS value, row_number() OVER () AS position FROM {relation}) WHERE word IS NOT NULL AND word<>'' GROUP BY word ORDER BY min(position) LIMIT {}",
        LIMIT + 1
    )
}
fn check_limit(count: usize) -> Result<()> {
    if count > LIMIT {
        return Err(Error::invalid(
            "This column contains more than 100,000 stopwords. Choose a smaller list.",
        ));
    }
    Ok(())
}
/// Resolve once per read transaction, including Views with volatile/external expressions.
pub(super) fn prepare_stopwords(conn: &Connection, selected: &StopwordSource) -> Result<()> {
    let object = selected.source.resolve(conn)?.relation;
    let column = mutations::column_name(conn, &object, &selected.column)?;
    conn.execute_batch(&format!(
        "CREATE OR REPLACE TEMP TABLE __wordflow_stopwords AS SELECT word FROM ({})",
        normalized_sql(&object.sql(), &query::quote(&column))
    ))?;
    let count: usize = conn.query_row("SELECT count(*) FROM __wordflow_stopwords", [], |r| {
        r.get(0)
    })?;
    check_limit(count)
}
fn normalize_draft(conn: &Connection, words: &[String]) -> Result<Vec<(String, String)>> {
    let sql = normalized_sql(
        "(SELECT unnest(from_json(?, '[\"VARCHAR\"]')) AS value)",
        "value",
    );
    let words = conn
        .prepare(&sql)?
        .query_map([serde_json::to_string(words)?], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })?
        .collect::<duckdb::Result<Vec<_>>>()?;
    check_limit(words.len())?;
    Ok(words)
}
impl Database {
    pub(super) fn read_stopwords(&self, selected: StopwordSource) -> Result<Vec<String>> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        prepare_stopwords(&self.conn, &selected)?;
        let words = self
            .conn
            .prepare("SELECT word FROM __wordflow_stopwords")?
            .query_map([], |r| r.get(0))?
            .collect::<duckdb::Result<_>>()?;
        check_cancellation(&self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(words)
    }
    pub(super) fn writable_stopwords(
        &mut self,
        request: PrepareStopwords,
    ) -> Result<StopwordSource> {
        let tx = self.conn.transaction()?;
        let copy = if let Some(selected) = request.selected {
            let object = selected.source.resolve(&tx)?.relation;
            let column = mutations::column_name(&tx, &object, &selected.column)?;
            if query::view_query(&tx, &object)?.is_none() {
                tx.commit()?;
                return Ok(StopwordSource {
                    source: ObjectTarget {
                        schema: Some(object.schema),
                        name: object.name,
                    },
                    column,
                });
            }
            Some((object, column))
        } else {
            None
        };
        let stem = copy
            .as_ref()
            .map(|(object, _)| object.name.as_str())
            .or_else(|| {
                request
                    .inputs
                    .first()
                    .map(|input| input.source.name.as_str())
            })
            .unwrap_or("analysis");
        let name = unique_object_name(&tx, "data", &format!("{stem}_stopwords"), true, &[])?;
        let relation = Relation {
            schema: "data".into(),
            name: name.clone(),
        };
        let pending = PendingChange::new(
            &tx,
            ChangeScope::object(relation.clone()),
            &self.cancellation,
        );
        let column = if let Some((source, column)) = &copy {
            tx.execute_batch(&format!(
                "CREATE TABLE {} AS SELECT {} FROM {}",
                relation.sql(),
                query::quote(column),
                source.sql()
            ))?;
            column.clone()
        } else {
            tx.execute_batch(&format!("CREATE TABLE {} (word VARCHAR)", relation.sql()))?;
            "word".into()
        };
        tx.execute("INSERT INTO wordflow.nodes(table_name) VALUES (?)", [&name])?;
        let parents = request
            .inputs
            .iter()
            .map(|input| input.source.clone())
            .chain(copy.map(|(source, _)| ObjectTarget {
                schema: Some(source.schema),
                name: source.name,
            }));
        for parent in parents {
            if parent
                .schema
                .as_deref()
                .unwrap_or("data")
                .eq_ignore_ascii_case("data")
            {
                tx.execute("INSERT INTO wordflow.edges(source_name,target_name) SELECT table_name, ? FROM wordflow.nodes WHERE translate(table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(?,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') AND table_name<>? ON CONFLICT DO NOTHING", params![name, parent.name, name])?;
            }
        }
        pending.commit(tx, &self.changes, &self.cancellation)?;
        Ok(StopwordSource {
            source: ObjectTarget {
                schema: Some(relation.schema),
                name,
            },
            column,
        })
    }
    pub(super) fn save_stopwords(&mut self, request: SaveStopwords) -> Result<()> {
        let tx = self.conn.transaction()?;
        let object = request.selected.source.resolve(&tx)?.relation;
        let column = mutations::column_name(&tx, &object, &request.selected.column)?;
        if query::view_query(&tx, &object)?.is_some() {
            return Err(Error::invalid(
                "Copy the stopword View to a Table before editing",
            ));
        }
        let before = normalize_draft(&tx, &request.before)?;
        let after = normalize_draft(&tx, &request.after)?;
        let previous: HashSet<_> = before.iter().map(|(word, _)| word.as_str()).collect();
        let next: HashSet<_> = after.iter().map(|(word, _)| word.as_str()).collect();
        let removed: Vec<_> = previous.difference(&next).copied().collect();
        let added: Vec<_> = after
            .iter()
            .filter(|(word, _)| !previous.contains(word.as_str()))
            .map(|(_, value)| value)
            .collect();
        if removed.is_empty() && added.is_empty() && !request.sort {
            tx.commit()?;
            return Ok(());
        }
        let pending =
            PendingChange::new(&tx, ChangeScope::object(object.clone()), &self.cancellation);
        let q = query::quote(&column);
        let word = word_expression(&q);
        let incoming = "SELECT unnest(from_json(?, '[\"VARCHAR\"]')) AS word";
        if !removed.is_empty() {
            let removal = if mutations::columns(&tx, &object)?.len() == 1 {
                format!("DELETE FROM {}", object.sql())
            } else {
                format!("UPDATE {} SET {q}=NULL", object.sql())
            };
            tx.execute(
                &format!("{removal} WHERE {word} IN ({incoming})"),
                [serde_json::to_string(&removed)?],
            )?;
        }
        if !added.is_empty() {
            tx.execute(&format!("INSERT INTO {} ({q}) SELECT incoming.word FROM ({incoming}) incoming WHERE NOT EXISTS (SELECT 1 FROM {} WHERE {word}=lower(incoming.word))", object.sql(), object.sql()), [serde_json::to_string(&added)?])?;
        }
        if request.sort {
            // Reinsert complete rows into the existing Table so its constraints,
            // defaults, registration and column metadata remain authoritative.
            tx.execute_batch(&format!(
                "CREATE TEMP TABLE __wordflow_sorted_stopwords AS SELECT * FROM {} ORDER BY {word} ASC NULLS LAST, row_number() OVER (); DELETE FROM {}; INSERT INTO {} BY NAME SELECT * FROM __wordflow_sorted_stopwords",
                object.sql(), object.sql(), object.sql()
            ))?;
        }
        // Enforce the limit against current membership, including changes since the editor was opened.
        prepare_stopwords(&tx, &request.selected)?;
        pending.commit(tx, &self.changes, &self.cancellation)
    }
}
