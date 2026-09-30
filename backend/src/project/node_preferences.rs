//! Shared Data Block defaults, independent of submitted analysis requests.
use super::*;
#[cfg(test)]
use std::collections::BTreeMap;

#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(tag = "preference", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum NodePreference {
    DocumentColumn {
        value: Option<String>,
    },
    Color {
        value: Option<String>,
    },
    Tokenizer {
        column: String,
        value: Option<String>,
    },
}

#[cfg(test)]
fn tokenizers(conn: &Connection, name: &str) -> Result<BTreeMap<String, String>> {
    Ok(conn
        .prepare(
            "SELECT column_name,tokenizer_model FROM wordflow.tokenizer_models WHERE table_name=?",
        )?
        .query_map([name], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<duckdb::Result<_>>()?)
}

impl Database {
    pub(super) fn set_node_preference(&mut self, name: &str, input: NodePreference) -> Result<()> {
        let tx = self.conn.transaction()?;
        let name = node(&tx, name)?.table_name;
        let column = match &input {
            NodePreference::DocumentColumn { value } => value.as_deref(),
            NodePreference::Tokenizer { column, .. } => Some(column.as_str()),
            NodePreference::Color { .. } => None,
        };
        if let Some(column) = column {
            let kind: Option<String> = tx.query_row("SELECT data_type FROM duckdb_columns() WHERE database_name=current_database() AND schema_name='data' AND table_name=? AND column_name=?", params![name, column], |row| row.get(0)).optional()?;
            if kind.as_deref() != Some("VARCHAR") {
                return Err(Error::new(
                    "invalid_preference",
                    "Choose an existing text column",
                ));
            }
        }
        match input {
            NodePreference::DocumentColumn { value } => {
                tx.execute(
                    "UPDATE wordflow.nodes SET document_column=? WHERE table_name=?",
                    params![value, name],
                )?;
            }
            NodePreference::Color { value } => {
                if value.as_ref().is_some_and(|v| {
                    v.len() != 7
                        || !v.starts_with('#')
                        || !v[1..].bytes().all(|c| c.is_ascii_hexdigit())
                }) {
                    return Err(Error::new(
                        "invalid_preference",
                        "Color must be a six-digit hexadecimal color",
                    ));
                }
                tx.execute(
                    "UPDATE wordflow.nodes SET color=? WHERE table_name=?",
                    params![value, name],
                )?;
            }
            NodePreference::Tokenizer { column, value } => {
                if let Some(value) = value {
                    if !ldaca_rs::text::TOKENIZER_MODELS
                        .iter()
                        .any(|model| model.model_id == value)
                    {
                        return Err(Error::new("invalid_preference", "Unknown tokenizer model"));
                    }
                    tx.execute("INSERT INTO wordflow.tokenizer_models(table_name,column_name,tokenizer_model) VALUES (?,?,?) ON CONFLICT(table_name,column_name) DO UPDATE SET tokenizer_model=excluded.tokenizer_model", params![name,column,value])?;
                } else {
                    tx.execute("DELETE FROM wordflow.tokenizer_models WHERE table_name=? AND column_name=?", params![name,column])?;
                }
            }
        }
        PendingChange::new(
            &tx,
            ChangeScope::resource(Resource::Graph),
            &self.cancellation,
        )
        .commit(tx, &self.changes, &self.cancellation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preferences_save_without_analysis_and_invalid_changes_are_atomic() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        db.conn.execute_batch("CREATE TABLE data.documents(text VARCHAR, other VARCHAR, amount INTEGER); INSERT INTO wordflow.nodes(table_name) VALUES ('documents')").unwrap();
        db.set_node_preference(
            "DOCUMENTS",
            NodePreference::DocumentColumn {
                value: Some("text".into()),
            },
        )
        .unwrap();
        db.set_node_preference(
            "documents",
            NodePreference::Color {
                value: Some("#123abc".into()),
            },
        )
        .unwrap();
        let model = ldaca_rs::text::TOKENIZER_MODELS[0].model_id;
        db.set_node_preference(
            "documents",
            NodePreference::Tokenizer {
                column: "text".into(),
                value: Some(model.into()),
            },
        )
        .unwrap();
        assert_eq!(
            node(&db.conn, "documents")
                .unwrap()
                .document_column
                .as_deref(),
            Some("text")
        );
        assert_eq!(
            node(&db.conn, "documents").unwrap().color.as_deref(),
            Some("#123abc")
        );
        assert_eq!(tokenizers(&db.conn, "documents").unwrap()["text"], model);
        assert_eq!(
            db.conn
                .query_row("SELECT count(*) FROM wordflow.analyses", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        for invalid in [
            NodePreference::DocumentColumn {
                value: Some("amount".into()),
            },
            NodePreference::Color {
                value: Some("invalid".into()),
            },
            NodePreference::Tokenizer {
                column: "text".into(),
                value: Some("unknown".into()),
            },
        ] {
            assert!(db.set_node_preference("documents", invalid).is_err());
        }
        assert_eq!(
            node(&db.conn, "documents")
                .unwrap()
                .document_column
                .as_deref(),
            Some("text")
        );
        assert_eq!(tokenizers(&db.conn, "documents").unwrap()["text"], model);
        db.set_node_preference(
            "documents",
            NodePreference::Tokenizer {
                column: "text".into(),
                value: None,
            },
        )
        .unwrap();
        db.set_node_preference("documents", NodePreference::DocumentColumn { value: None })
            .unwrap();
        assert!(tokenizers(&db.conn, "documents").unwrap().is_empty());
        assert!(
            node(&db.conn, "documents")
                .unwrap()
                .document_column
                .is_none()
        );
    }
}
