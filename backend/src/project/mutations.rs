//! Explicit application changes keep SQL and metadata in the same transaction.
use super::*;

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum ColumnChange {
    Add {
        column: String,
        sql_type: String,
    },
    Cast {
        column: String,
        target: CastType,
        format: Option<String>,
    },
    Rename {
        column: String,
        name: String,
    },
    Delete {
        column: String,
    },
    Transform {
        column: String,
        expression: String,
    },
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(untagged)]
pub(crate) enum CastType {
    Shortcut(CastShortcut),
    Sql {
        #[serde(rename = "sqlType")]
        sql_type: String,
    },
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CastShortcut {
    String,
    Integer,
    Float,
    Datetime,
    Categorical,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateView {
    pub name: String,
    pub sql: String,
    pub mappings: Vec<metadata::ColumnMapping>,
    #[serde(default)]
    pub computed_columns: Vec<String>,
}

pub(super) fn columns(conn: &Connection, relation: &Relation) -> Result<Vec<(String, String)>> {
    Ok(conn.prepare("SELECT column_name,data_type FROM duckdb_columns() WHERE database_name=current_database() AND schema_name=? AND table_name=? ORDER BY column_index")?
        .query_map(params![relation.schema, relation.name], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<duckdb::Result<_>>()?)
}
pub(super) fn column_name(conn: &Connection, relation: &Relation, input: &str) -> Result<String> {
    columns(conn, relation)?
        .into_iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(input))
        .map(|(name, _)| name)
        .ok_or_else(|| Error::invalid(format!("Column is unavailable: {input}")))
}
fn edit_view(conn: &Connection, relation: &Relation, previous: &str, select: &str) -> Result<()> {
    redefine(conn, relation, &query::wrap(conn, select, previous)?)
}
impl Database {
    pub(super) fn change_column(
        &mut self,
        target: ObjectTarget,
        change: ColumnChange,
    ) -> Result<()> {
        let tx = self.conn.transaction()?;
        let object = target.resolve(&tx)?;
        let relation = &object.relation;
        let mut scope = ChangeScope::object(relation.clone());
        match &change {
            ColumnChange::Rename { column, name } => {
                scope.resources.push(Resource::Tabs);
                scope.renames.push(renames::Rename::Column {
                    source: relation.clone(),
                    before: column_name(&tx, relation, column)?,
                    after: name.trim().into(),
                });
            }
            ColumnChange::Cast {
                target: CastType::Shortcut(CastShortcut::Categorical),
                ..
            } => scope.resources.push(Resource::SqlTypes),
            _ => {}
        }
        if let Some(rename) = scope.renames.first() {
            scope.analysis_ids = renames::reconcile(&tx, rename)?;
        }
        let pending = PendingChange::new(&tx, scope, &self.cancellation);
        let previous = query::view_query(&tx, relation)?;
        let fields = columns(&tx, relation)?;
        let requested = match &change {
            ColumnChange::Add { column, .. }
            | ColumnChange::Cast { column, .. }
            | ColumnChange::Rename { column, .. }
            | ColumnChange::Delete { column }
            | ColumnChange::Transform { column, .. } => column,
        };
        let existing = fields
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(requested));
        let column = match (existing, &change) {
            (Some(_), ColumnChange::Add { .. }) => {
                return Err(Error::invalid("A column with this name already exists"));
            }
            (Some((name, _)), _) => name.clone(),
            (None, ColumnChange::Transform { .. } | ColumnChange::Add { .. })
                if !requested.trim().is_empty() =>
            {
                requested.clone()
            }
            _ => {
                return Err(Error::invalid(format!(
                    "Column is unavailable: {requested}"
                )));
            }
        };
        let q = query::quote(&column);
        match change {
            ColumnChange::Add { sql_type, .. } => {
                let sql_type = crate::expressions::cast_type(&tx, &sql_type)?;
                if let Some(previous) = previous {
                    edit_view(
                        &tx,
                        relation,
                        &previous,
                        &format!("SELECT *, CAST(NULL AS {sql_type}) AS {q} FROM __wf_current"),
                    )?;
                } else {
                    tx.execute_batch(&format!(
                        "ALTER TABLE {} ADD COLUMN {q} {sql_type}",
                        relation.sql()
                    ))?;
                }
            }
            ColumnChange::Cast { target, format, .. } => {
                let categorical = matches!(target, CastType::Shortcut(CastShortcut::Categorical));
                let datetime = matches!(target, CastType::Shortcut(CastShortcut::Datetime));
                let sql_type = match target {
                    CastType::Shortcut(CastShortcut::String) => "VARCHAR".into(),
                    CastType::Shortcut(CastShortcut::Integer) => "BIGINT".into(),
                    CastType::Shortcut(CastShortcut::Float) => "DOUBLE".into(),
                    CastType::Shortcut(CastShortcut::Datetime) => "TIMESTAMP".into(),
                    CastType::Shortcut(CastShortcut::Categorical) => {
                        let name = format!(
                            "wordflow.{}",
                            query::quote(&format!("enum_{}", Uuid::new_v4().simple()))
                        );
                        tx.execute_batch(&format!("CREATE TYPE {name} AS ENUM (SELECT DISTINCT CAST({q} AS VARCHAR) FROM {} WHERE {q} IS NOT NULL ORDER BY 1)", relation.sql()))?;
                        name
                    }
                    CastType::Sql { sql_type } => crate::expressions::cast_type(&tx, &sql_type)?,
                };
                let expression = if datetime {
                    datetime_cast::expression(
                        &tx,
                        relation,
                        &q,
                        format.as_deref().filter(|s| !s.is_empty()),
                    )?
                } else if categorical {
                    format!("CAST(CAST({q} AS VARCHAR) AS {sql_type})")
                } else {
                    format!("CAST({q} AS {sql_type})")
                };
                let resolved_type: String = tx.query_row(
                    &format!(
                        "SELECT typeof(first({expression})) FROM {} WHERE false",
                        relation.sql()
                    ),
                    [],
                    |r| r.get(0),
                )?;
                let sql_type = if datetime {
                    resolved_type.clone()
                } else {
                    sql_type
                };
                let changed = existing.is_some_and(|(_, kind)| kind != &resolved_type);
                if let Some(previous) = &previous {
                    edit_view(
                        &tx,
                        relation,
                        previous,
                        &format!("SELECT * REPLACE ({expression} AS {q}) FROM __wf_current"),
                    )?;
                } else {
                    tx.execute_batch(&format!(
                        "ALTER TABLE {} ALTER COLUMN {q} TYPE {sql_type} USING {expression}",
                        relation.sql()
                    ))?;
                }
                metadata::transformed_column(&tx, &object, &column, changed)?;
            }
            ColumnChange::Rename { name, .. } => {
                let name = name.trim();
                if name.is_empty() {
                    return Err(Error::invalid("Column name cannot be empty"));
                }
                let interfaces = renames::ViewInterfaces::capture(&tx, relation)?;
                let rewrites = renames::column_views(&tx, relation, &column, name, &fields)?;
                if let Some(previous) = &previous {
                    let select = fields
                        .iter()
                        .map(|(field, _)| {
                            if field == &column {
                                format!("{q} AS {}", query::quote(name))
                            } else {
                                query::quote(field)
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(",");
                    edit_view(
                        &tx,
                        relation,
                        previous,
                        &format!("SELECT {select} FROM __wf_current"),
                    )?;
                } else {
                    tx.execute_batch(&format!(
                        "ALTER TABLE {} RENAME COLUMN {q} TO {}",
                        relation.sql(),
                        query::quote(name)
                    ))?;
                }
                for (view, sql) in rewrites {
                    redefine(&tx, &view, &sql).map_err(|error| {
                        Error::invalid(format!(
                            "Cannot reconcile dependent View {}: {}",
                            view.sql(),
                            error.message
                        ))
                    })?;
                }
                interfaces.validate(&tx)?;
                metadata::rename_column(&tx, &object, &column, name)?;
            }
            ColumnChange::Delete { .. } => {
                if let Some(previous) = &previous {
                    edit_view(
                        &tx,
                        relation,
                        previous,
                        &format!("SELECT * EXCLUDE ({q}) FROM __wf_current"),
                    )?;
                } else {
                    tx.execute_batch(&format!("ALTER TABLE {} DROP COLUMN {q}", relation.sql()))?;
                }
                metadata::remove_column(&tx, relation, &column)?;
            }
            ColumnChange::Transform { expression, .. } => {
                let expression = crate::expressions::parse(&tx, &expression)?.sql;
                if let Some(previous) = &previous {
                    let projection = if existing.is_some() {
                        format!("* REPLACE ({expression} AS {q})")
                    } else {
                        format!("*, {expression} AS {q}")
                    };
                    edit_view(
                        &tx,
                        relation,
                        previous,
                        &format!("SELECT {projection} FROM __wf_current"),
                    )?;
                } else {
                    tx.execute_batch(&format!("ALTER TABLE {} ADD COLUMN IF NOT EXISTS {q} VARCHAR; UPDATE {} SET {q}={expression}", relation.sql(), relation.sql()))?;
                }
                metadata::transformed_column(&tx, &object, &column, true)?;
            }
        }
        pending.commit(tx, &self.changes, &self.cancellation)
    }
    pub(super) fn create_view(&mut self, request: CreateView) -> Result<String> {
        let name = request.name.trim();
        if name.is_empty() {
            return Err(Error::invalid("Enter a Data Block name"));
        }
        let tx = self.conn.transaction()?;
        let relation = Relation {
            schema: "data".into(),
            name: name.into(),
        };
        let pending = PendingChange::new(
            &tx,
            ChangeScope::object(relation.clone()),
            &self.cancellation,
        );
        let sql = query::render(&tx, &query::parse(&tx, &request.sql)?)?;
        tx.execute_batch(&format!("CREATE VIEW {} AS {sql}", relation.sql()))?;
        tx.execute("INSERT INTO wordflow.nodes(table_name) VALUES (?)", [name])?;
        metadata::copy_columns(&tx, name, &request.mappings, &request.computed_columns)?;
        pending.commit(tx, &self.changes, &self.cancellation)?;
        Ok(name.into())
    }
}

#[cfg(test)]
mod lazy_cast_tests {
    use super::*;

    #[test]
    fn view_cast_commits_lazily_and_notifies_before_rows_are_evaluated() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        db.conn.execute_batch("CREATE TABLE data.raw(created_at VARCHAR); INSERT INTO data.raw VALUES ('2020-10-17 00:52:37.000 +0000'),(NULL); CREATE VIEW data.corpus AS SELECT * FROM data.raw; INSERT INTO wordflow.nodes(table_name) VALUES ('corpus')").unwrap();
        let target = ObjectTarget {
            schema: Some("data".into()),
            name: "corpus".into(),
        };
        let mut changes = db.changes.subscribe();
        db.change_column(
            target.clone(),
            ColumnChange::Cast {
                column: "created_at".into(),
                target: CastType::Sql {
                    sql_type: "TIMESTAMP".into(),
                },
                format: None,
            },
        )
        .unwrap();
        let change = changes.try_recv().unwrap();
        assert!(
            change
                .objects
                .iter()
                .any(|r| r.schema == "data" && r.name == "corpus")
        );
        let error = db
            .conn
            .query_row("SELECT created_at FROM data.corpus LIMIT 1", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap_err();
        assert!(error.to_string().contains("Conversion Error"));
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT typeof(created_at) FROM data.corpus LIMIT 1",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "TIMESTAMP"
        );
        db.conn
            .execute_batch("CREATE OR REPLACE VIEW data.corpus AS SELECT * FROM data.raw")
            .unwrap();
        db.change_column(
            target,
            ColumnChange::Cast {
                column: "created_at".into(),
                target: CastType::Shortcut(CastShortcut::Datetime),
                format: Some("%Y-%m-%d %H:%M:%S.%f %z".into()),
            },
        )
        .unwrap();
        assert_eq!(
            db.conn
                .query_row("SELECT count(created_at) FROM data.corpus", [], |r| r
                    .get::<_, u64>(0))
                .unwrap(),
            1
        );
        assert_eq!(db.conn.query_row("SELECT CAST(created_at AT TIME ZONE 'UTC' AS VARCHAR) FROM data.corpus WHERE created_at IS NOT NULL",[],|r|r.get::<_,String>(0)).unwrap(),"2020-10-17 00:52:37");
    }
}
