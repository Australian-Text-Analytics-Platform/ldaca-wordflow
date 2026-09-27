//! Application metadata policy, always applied inside the owning mutation transaction.
use super::*;
use objects::ResolvedObject;

pub(super) fn delete_node(conn: &Connection, name: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM wordflow.edges WHERE source_name=? OR target_name=?",
        params![name, name],
    )?;
    for table in ["tokenizer_models", "nodes"] {
        conn.execute(
            &format!("DELETE FROM wordflow.{table} WHERE table_name=?"),
            [name],
        )?;
    }
    Ok(())
}

pub(super) fn clone_node(conn: &Connection, id: &str, name: &str) -> Result<()> {
    conn.execute("INSERT INTO wordflow.nodes(table_name,visible,color,document_column) SELECT ?,true,color,document_column FROM wordflow.nodes WHERE table_name=?", params![name,id])?;
    conn.execute("INSERT INTO wordflow.tokenizer_models(table_name,column_name,tokenizer_model) SELECT ?,column_name,tokenizer_model FROM wordflow.tokenizer_models WHERE table_name=?", params![name,id])?;
    conn.execute(
        "INSERT INTO wordflow.edges(source_name,target_name) SELECT source_name,? FROM wordflow.edges WHERE target_name=?",
        params![name, id],
    )?;
    Ok(())
}

pub(super) fn rename_node(conn: &Connection, object: &ResolvedObject, name: &str) -> Result<()> {
    let source = &object.relation;
    arrow_metadata::rename_relation(conn, source, name)?;
    if object.registered {
        for (table, columns) in [
            ("nodes", &["table_name"][..]),
            ("edges", &["source_name", "target_name"][..]),
            ("tokenizer_models", &["table_name"][..]),
        ] {
            for column in columns {
                conn.execute(
                    &format!("UPDATE wordflow.{table} SET {column}=? WHERE {column}=?"),
                    params![name, source.name],
                )?;
            }
        }
    }
    conn.execute(
        "UPDATE wordflow.tabs SET settings=json_merge_patch(settings, ?::JSON)
         WHERE json_extract_string(settings, '$.stopwordSource.source.schema')=?
         AND json_extract_string(settings, '$.stopwordSource.source.name')=?",
        params![
            serde_json::json!({"stopwordSource":{"source":{"schema":source.schema,"name":name}}})
                .to_string(),
            source.schema,
            source.name
        ],
    )?;
    let color_key = serde_json::to_string(&[&source.schema, &source.name])?;
    let renamed_key = serde_json::to_string(&[source.schema.as_str(), name])?;
    let tabs = conn
        .prepare("SELECT id::VARCHAR, settings::VARCHAR FROM wordflow.tabs WHERE kind='frequency'")?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<duckdb::Result<Vec<_>>>()?;
    for (id, settings) in tabs {
        let settings: Value = serde_json::from_str(&settings)?;
        if let Some(color) = settings
            .get("colors")
            .and_then(|colors| colors.get(&color_key))
            .filter(|color| color.is_string())
        {
            // Immutable results still describe the previous name, so retain its colour too.
            conn.execute(
                "UPDATE wordflow.tabs SET settings=json_merge_patch(settings, ?::JSON) WHERE id=?",
                params![
                    serde_json::json!({"colors":{&renamed_key:color}}).to_string(),
                    id
                ],
            )?;
        }
    }
    Ok(())
}

pub(super) fn rename_column(
    conn: &Connection,
    object: &ResolvedObject,
    before: &str,
    after: &str,
) -> Result<()> {
    let source = &object.relation;
    arrow_metadata::rename_column(conn, source, before, Some(after))?;
    if object.registered {
        conn.execute(
            "UPDATE wordflow.tokenizer_models SET column_name=? WHERE table_name=? AND column_name=?",
            params![after, source.name, before],
        )?;
        conn.execute(
            "UPDATE wordflow.nodes SET document_column=? WHERE table_name=? AND document_column=?",
            params![after, source.name, before],
        )?;
    }
    conn.execute("UPDATE wordflow.tabs SET settings=json_merge_patch(settings, ?::JSON) WHERE json_extract_string(settings, '$.stopwordSource.source.schema')=? AND json_extract_string(settings, '$.stopwordSource.source.name')=? AND json_extract_string(settings, '$.stopwordSource.column')=?",
        params![serde_json::json!({"stopwordSource":{"column":after}}).to_string(), source.schema, source.name, before])?;
    Ok(())
}

pub(super) fn remove_column(conn: &Connection, relation: &Relation, column: &str) -> Result<()> {
    arrow_metadata::rename_column(conn, relation, column, None)?;
    if relation.schema != "data" {
        return Ok(());
    }
    let name = &relation.name;
    conn.execute(
        "DELETE FROM wordflow.tokenizer_models WHERE table_name=? AND column_name=?",
        params![name, column],
    )?;
    conn.execute(
        "UPDATE wordflow.nodes SET document_column=NULL WHERE table_name=? AND document_column=?",
        params![name, column],
    )?;
    Ok(())
}

pub(super) fn transformed_column(
    conn: &Connection,
    object: &ResolvedObject,
    column: &str,
    discard_annotation: bool,
) -> Result<()> {
    if discard_annotation {
        arrow_metadata::rename_column(conn, &object.relation, column, None)?;
    }
    if !object.registered {
        return Ok(());
    }
    let name = &object.relation.name;
    let kind: String = conn.query_row("SELECT data_type FROM duckdb_columns() WHERE database_name=current_database() AND schema_name=? AND table_name=? AND column_name=?", params![object.relation.schema, name, column], |row| row.get(0))?;
    if kind != "VARCHAR" && !kind.starts_with("ENUM(") {
        conn.execute(
            "DELETE FROM wordflow.tokenizer_models WHERE table_name=? AND column_name=?",
            params![name, column],
        )?;
        conn.execute("UPDATE wordflow.nodes SET document_column=NULL WHERE table_name=? AND document_column=?", params![name, column])?;
    }
    Ok(())
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ColumnMapping {
    source: String,
    column: String,
    output: String,
}

/// Unchanged columns inherit annotations; stacked contributors must all agree.
pub(super) fn copy_columns(
    conn: &Connection,
    name: &str,
    mappings: &[ColumnMapping],
    computed: &[String],
) -> Result<()> {
    if mappings.is_empty() {
        return Ok(());
    }
    let lit = query::literal;
    let values = mappings
        .iter()
        .enumerate()
        .map(|(i, m)| {
            format!(
                "({}, {}, {}, {i})",
                lit(&m.source),
                lit(&m.column),
                lit(&m.output)
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let mapped = format!("WITH mappings(source_name, source_column, output_column, position) AS (VALUES {values}), eligible AS (
        SELECT m.*, s.data_type FROM mappings m
        JOIN duckdb_columns() s ON s.database_name=current_database() AND s.schema_name='data' AND s.table_name=m.source_name AND s.column_name=m.source_column
        JOIN duckdb_columns() d ON d.database_name=current_database() AND d.schema_name='data' AND d.table_name={} AND d.column_name=m.output_column AND d.data_type=s.data_type)", lit(name));
    let all = "count(*) = (SELECT count(*) FROM mappings original WHERE original.output_column=e.output_column)";
    let text = "(e.data_type='VARCHAR' OR starts_with(e.data_type, 'ENUM('))";
    let eligible = conn
        .prepare(&format!(
            "{mapped} SELECT source_name,source_column,output_column FROM eligible"
        ))?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<duckdb::Result<Vec<_>>>()?;
    let outputs = mappings
        .iter()
        .map(|m| &m.output)
        .collect::<std::collections::BTreeSet<_>>();
    for output in outputs {
        if computed.contains(output) {
            continue;
        }
        let contributors = eligible
            .iter()
            .filter(|(_, _, out)| out == output)
            .collect::<Vec<_>>();
        if contributors.len() != mappings.iter().filter(|m| &m.output == output).count() {
            continue;
        }
        let contributors = contributors
            .into_iter()
            .map(|(source, column, _)| {
                let mut annotations = arrow_metadata::Annotations::load(
                    conn,
                    &Relation {
                        schema: "data".into(),
                        name: source.clone(),
                    },
                )?;
                annotations.0.retain(|a| a.path[0] == *column);
                for a in &mut annotations.0 {
                    a.path[0] = output.clone();
                }
                Ok(annotations)
            })
            .collect::<Result<Vec<_>>>()?;
        if let Some(first) = contributors.first() {
            let common = arrow_metadata::Annotations(
                first
                    .0
                    .iter()
                    .filter(|a| contributors.iter().all(|c| c.0.contains(a)))
                    .cloned()
                    .collect(),
            );
            common.store(
                conn,
                &Relation {
                    schema: "data".into(),
                    name: name.into(),
                },
            )?;
        }
    }
    conn.execute_batch(&format!("{mapped} INSERT INTO wordflow.tokenizer_models(table_name,column_name,tokenizer_model) SELECT {}, e.output_column, m.tokenizer_model FROM eligible e JOIN wordflow.tokenizer_models m ON m.table_name=e.source_name AND m.column_name=e.source_column WHERE {text} GROUP BY e.output_column, m.tokenizer_model HAVING {all}", lit(name)))?;
    conn.execute_batch(&format!("{mapped} UPDATE wordflow.nodes SET document_column=(SELECT e.output_column FROM eligible e JOIN wordflow.nodes n ON n.table_name=e.source_name AND n.document_column=e.source_column WHERE {text} GROUP BY e.output_column HAVING {all} ORDER BY min(e.position) LIMIT 1) WHERE table_name={}", lit(name)))?;
    Ok(())
}
