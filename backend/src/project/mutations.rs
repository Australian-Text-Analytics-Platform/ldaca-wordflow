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
    TransformMany {
        columns: Vec<ColumnExpression>,
    },
    DeleteMany {
        columns: Vec<String>,
    },
    OrderCategories {
        column: String,
        values: Vec<String>,
    },
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ColumnExpression {
    pub column: String,
    pub expression: String,
    #[serde(default)]
    pub replace: bool,
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
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateViews {
    pub views: Vec<CreateView>,
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
    ) -> Result<Uuid> {
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
            }
            | ColumnChange::OrderCategories { .. } => scope.resources.push(Resource::SqlTypes),
            _ => {}
        }
        if let Some(rename) = scope.renames.first() {
            scope.analysis_ids = renames::reconcile(&tx, rename)?;
        }
        let change_id = scope.id;
        let pending = PendingChange::new(&tx, scope, &self.cancellation);
        let previous = query::view_query(&tx, relation)?;
        let fields = columns(&tx, relation)?;
        if let ColumnChange::OrderCategories { column, values } = &change {
            let column = column_name(&tx, relation, column)?;
            let unique = values.iter().collect::<std::collections::HashSet<_>>();
            if unique.len() != values.len() {
                return Err(Error::invalid("Each category must appear exactly once"));
            }
            let categorical = fields
                .iter()
                .any(|(name, kind)| name == &column && kind.starts_with("ENUM("));
            let current_sql = if categorical {
                format!(
                    "SELECT unnest(enum_range(first({}))) FROM {}",
                    query::quote(&column),
                    relation.sql()
                )
            } else {
                format!(
                    "SELECT DISTINCT CAST({} AS VARCHAR) FROM {} WHERE {} IS NOT NULL",
                    query::quote(&column),
                    relation.sql(),
                    query::quote(&column)
                )
            };
            let current = tx
                .prepare(&current_sql)?
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<duckdb::Result<std::collections::HashSet<_>>>()?;
            if current.len() != unique.len() || current.iter().any(|value| !unique.contains(value))
            {
                return Err(Error::invalid(
                    "Category values changed. Refresh and review their order.",
                ));
            }
            let sql_type = format!(
                "wordflow.{}",
                query::quote(&format!("enum_{}", Uuid::new_v4().simple()))
            );
            let definition = if values.is_empty() {
                "SELECT NULL::VARCHAR WHERE FALSE".into()
            } else {
                format!(
                    "SELECT value FROM (VALUES {}) AS categories(value)",
                    values
                        .iter()
                        .map(|value| format!("({})", query::literal(value)))
                        .collect::<Vec<_>>()
                        .join(",")
                )
            };
            tx.execute_batch(&format!("CREATE TYPE {sql_type} AS ENUM ({definition})"))?;
            let q = query::quote(&column);
            let expression = format!("CAST(CAST({q} AS VARCHAR) AS {sql_type})");
            if let Some(previous) = previous.as_deref() {
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
            metadata::transformed_column(&tx, &object, &column, true)?;
            pending.commit(tx, &self.changes, &self.cancellation)?;
            return Ok(change_id);
        }
        if matches!(
            &change,
            ColumnChange::TransformMany { .. } | ColumnChange::DeleteMany { .. }
        ) {
            // One transaction and one View layer cover the complete submitted edit.
            match &change {
                ColumnChange::TransformMany { columns } => {
                    transform_columns(&tx, &object, previous.as_deref(), &fields, columns)?
                }
                ColumnChange::DeleteMany { columns } => {
                    delete_columns(&tx, &object, previous.as_deref(), columns)?
                }
                _ => unreachable!(),
            }
            pending.commit(tx, &self.changes, &self.cancellation)?;
            return Ok(change_id);
        }
        let requested = match &change {
            ColumnChange::Add { column, .. }
            | ColumnChange::Cast { column, .. }
            | ColumnChange::Rename { column, .. }
            | ColumnChange::Delete { column }
            | ColumnChange::Transform { column, .. } => column,
            ColumnChange::TransformMany { .. }
            | ColumnChange::DeleteMany { .. }
            | ColumnChange::OrderCategories { .. } => unreachable!(),
        };
        let requested = if matches!(change, ColumnChange::Add { .. }) {
            requested.trim()
        } else {
            requested.as_str()
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
                if fields
                    .iter()
                    .any(|(field, _)| field.eq_ignore_ascii_case(requested.trim()))
                {
                    return Err(Error::invalid("A column with this name already exists"));
                }
                requested.trim().to_owned()
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
                // Conversion is the explicit full-source validation exception for live Views.
                let checked = expression.replacen("CAST(", "TRY_CAST(", 1).replacen(
                    "strptime(",
                    "try_strptime(",
                    1,
                );
                let invalid = format!("{q} IS NOT NULL AND ({checked}) IS NULL");
                let failures: u64 = tx.query_row(
                    &format!("SELECT count(*) FROM {} WHERE {invalid}", relation.sql()),
                    [],
                    |row| row.get(0),
                )?;
                if failures > 0 {
                    let examples = tx
                        .prepare(&format!(
                            "SELECT CAST({q} AS VARCHAR) FROM {} WHERE {invalid} LIMIT 5",
                            relation.sql()
                        ))?
                        .query_map([], |row| row.get::<_, String>(0))?
                        .collect::<duckdb::Result<Vec<_>>>()?;
                    let error = tx
                        .query_row(
                            &format!(
                                "SELECT {expression} FROM {} WHERE {invalid} LIMIT 1",
                                relation.sql()
                            ),
                            [],
                            |_| Ok(()),
                        )
                        .err()
                        .map(Error::from)
                        .unwrap_or_else(|| Error::invalid("Conversion failed"));
                    return Err(Error {
                        message: format!(
                            "{}\n\n{failures} values could not be converted. Examples: {}",
                            error.message,
                            examples.join(", ")
                        ),
                        ..error
                    });
                }
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
                if fields
                    .iter()
                    .any(|(field, _)| field != &column && field.eq_ignore_ascii_case(name))
                {
                    return Err(Error::invalid("A column with this name already exists"));
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
            ColumnChange::TransformMany { .. }
            | ColumnChange::DeleteMany { .. }
            | ColumnChange::OrderCategories { .. } => unreachable!(),
        }
        pending.commit(tx, &self.changes, &self.cancellation)?;
        Ok(change_id)
    }
    pub(super) fn create_view(&mut self, request: CreateView) -> Result<String> {
        Ok(self
            .create_views(CreateViews {
                views: vec![request],
            })?
            .remove(0))
    }
    pub(super) fn create_views(&mut self, request: CreateViews) -> Result<Vec<String>> {
        if request.views.is_empty() || request.views.len() > 50 {
            return Err(Error::invalid(
                "Create between 1 and 50 Data Blocks at once",
            ));
        }
        let tx = self.conn.transaction()?;
        let mut scope = ChangeScope::resource(Resource::Graph);
        for view in &request.views {
            scope.objects.push(Relation {
                schema: "data".into(),
                name: view.name.trim().into(),
            });
        }
        let pending = PendingChange::new(&tx, scope, &self.cancellation);
        let mut names = Vec::new();
        for view in request.views {
            let name = view.name.trim();
            if name.is_empty() {
                return Err(Error::invalid("Enter a Data Block name"));
            }
            let relation = Relation {
                schema: "data".into(),
                name: name.into(),
            };
            let sql = query::render(&tx, &query::parse(&tx, &view.sql)?)?;
            tx.execute_batch(&format!("CREATE VIEW {} AS {sql}", relation.sql()))?;
            tx.execute("INSERT INTO wordflow.nodes(table_name) VALUES (?)", [name])?;
            metadata::copy_columns(&tx, name, &view.mappings, &view.computed_columns)?;
            names.push(name.into());
        }
        pending.commit(tx, &self.changes, &self.cancellation)?;
        Ok(names)
    }
}

fn delete_columns(
    conn: &Connection,
    object: &objects::ResolvedObject,
    previous: Option<&str>,
    requested: &[String],
) -> Result<()> {
    if requested.is_empty() {
        return Err(Error::invalid("Choose columns to delete"));
    }
    let relation = &object.relation;
    let mut names = Vec::new();
    for name in requested {
        let name = column_name(conn, relation, name)?;
        if names.contains(&name) {
            return Err(Error::invalid("Choose each column only once"));
        }
        names.push(name);
    }
    if names.len() == columns(conn, relation)?.len() {
        return Err(Error::invalid("Keep at least one column"));
    }
    if let Some(previous) = previous {
        let excluded = names
            .iter()
            .map(|name| query::quote(name))
            .collect::<Vec<_>>()
            .join(", ");
        edit_view(
            conn,
            relation,
            previous,
            &format!("SELECT * EXCLUDE ({excluded}) FROM __wf_current"),
        )?;
    } else {
        for name in &names {
            conn.execute_batch(&format!(
                "ALTER TABLE {} DROP COLUMN {}",
                relation.sql(),
                query::quote(name)
            ))?;
        }
    }
    for name in &names {
        metadata::remove_column(conn, relation, name)?;
    }
    Ok(())
}

fn transform_columns(
    conn: &Connection,
    object: &objects::ResolvedObject,
    previous: Option<&str>,
    fields: &[(String, String)],
    requested: &[ColumnExpression],
) -> Result<()> {
    if requested.is_empty() || requested.len() > 50 {
        return Err(Error::invalid("Change between 1 and 50 columns at once"));
    }
    let relation = &object.relation;
    let mut resolved: Vec<(String, String, bool)> = Vec::new();
    let annotations = arrow_metadata::Annotations::load(conn, relation)?;
    let mut copied_annotations = Vec::new();
    for item in requested {
        let existing = fields
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(&item.column));
        let column = if item.replace {
            existing
                .ok_or_else(|| Error::invalid(format!("Column is unavailable: {}", item.column)))?
                .0
                .clone()
        } else {
            let name = item.column.trim();
            if name.is_empty() {
                return Err(Error::invalid("Enter a column name"));
            }
            if fields
                .iter()
                .any(|(field, _)| field.eq_ignore_ascii_case(name))
            {
                return Err(Error::invalid("A column with this name already exists"));
            }
            name.into()
        };
        if resolved
            .iter()
            .any(|(name, _, _)| name.eq_ignore_ascii_case(&column))
        {
            return Err(Error::invalid("Output column names must be unique"));
        }
        let expression = crate::expressions::parse(conn, &item.expression)?;
        if let Some(source) = expression.source_column().and_then(|source| {
            fields
                .iter()
                .find(|(name, _)| name.eq_ignore_ascii_case(source))
        }) {
            for annotation in annotations.0.iter().filter(|a| a.path[0] == source.0) {
                let mut annotation = annotation.clone();
                annotation.path[0] = column.clone();
                copied_annotations.push(annotation);
            }
        }
        resolved.push((column, expression.sql, item.replace));
    }
    // Bind against the original schema, before adding any columns. DuckDB owns types.
    let projection = resolved
        .iter()
        .map(|(name, expression, _)| format!("{expression} AS {}", query::quote(name)))
        .collect::<Vec<_>>()
        .join(", ");
    let types = conn
        .prepare(&format!(
            "DESCRIBE SELECT {projection} FROM {}",
            relation.sql()
        ))?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<duckdb::Result<Vec<_>>>()?;
    if let Some(previous) = previous {
        let replacements = resolved
            .iter()
            .filter(|(_, _, replace)| *replace)
            .map(|(name, expression, _)| format!("{expression} AS {}", query::quote(name)))
            .collect::<Vec<_>>();
        let additions = resolved
            .iter()
            .filter(|(_, _, replace)| !replace)
            .map(|(name, expression, _)| format!(", {expression} AS {}", query::quote(name)))
            .collect::<String>();
        let replace = if replacements.is_empty() {
            String::new()
        } else {
            format!(" REPLACE ({})", replacements.join(", "))
        };
        edit_view(
            conn,
            relation,
            previous,
            &format!("SELECT *{replace}{additions} FROM __wf_current"),
        )?;
    } else {
        for (index, (name, _, replace)) in resolved.iter().enumerate() {
            if !replace {
                // Render a native SQL type, preserving decimal, nested and temporal precision.
                let sql_type = &types[index];
                conn.execute_batch(&format!(
                    "ALTER TABLE {} ADD COLUMN {} {sql_type}",
                    relation.sql(),
                    query::quote(name)
                ))?;
            }
        }
        let assignments = resolved
            .iter()
            .map(|(name, expression, _)| format!("{}={expression}", query::quote(name)))
            .collect::<Vec<_>>()
            .join(", ");
        conn.execute_batch(&format!("UPDATE {} SET {assignments}", relation.sql()))?;
    }
    for (name, _, _) in &resolved {
        metadata::transformed_column(conn, object, name, true)?;
    }
    arrow_metadata::Annotations(copied_annotations).store(conn, relation)?;
    Ok(())
}

#[cfg(test)]
mod mutation_tests {
    use super::*;

    #[test]
    fn category_order_preserves_exact_labels_and_rejects_stale_values_atomically() {
        let mut p = Project::untitled().unwrap();
        p.database.conn.execute_batch("CREATE TABLE data.categories(value VARCHAR); INSERT INTO data.categories VALUES ('B'),(''),(' '),('A'),(NULL); INSERT INTO wordflow.nodes(table_name) VALUES ('categories'); CREATE VIEW data.category_view AS SELECT * FROM data.categories; INSERT INTO wordflow.nodes(table_name) VALUES ('category_view')").unwrap();
        for target in ["category_view", "categories"] {
            p.database
                .change_column(
                    target.into(),
                    ColumnChange::OrderCategories {
                        column: "value".into(),
                        values: vec!["B".into(), " ".into(), "".into(), "A".into()],
                    },
                )
                .unwrap();
            let values = p
                .database
                .conn
                .prepare(&format!("SELECT value FROM data.{target} ORDER BY value"))
                .unwrap()
                .query_map([], |r| r.get::<_, Option<String>>(0))
                .unwrap()
                .collect::<duckdb::Result<Vec<_>>>()
                .unwrap();
            assert_eq!(
                values,
                vec![
                    Some("B".into()),
                    Some(" ".into()),
                    Some("".into()),
                    Some("A".into()),
                    None
                ]
            );
            assert!(
                p.database
                    .change_column(
                        target.into(),
                        ColumnChange::OrderCategories {
                            column: "value".into(),
                            values: vec!["A".into()]
                        }
                    )
                    .unwrap_err()
                    .message
                    .contains("changed")
            );
        }
    }

    #[test]
    fn category_order_retains_unused_enum_labels() {
        let mut p = Project::untitled().unwrap();
        p.database.conn.execute_batch("CREATE TYPE wordflow.categories AS ENUM ('used','unused'); CREATE TABLE data.categories(value wordflow.categories); INSERT INTO data.categories VALUES ('used'); INSERT INTO wordflow.nodes(table_name) VALUES ('categories')").unwrap();
        p.database
            .change_column(
                "categories".into(),
                ColumnChange::OrderCategories {
                    column: "value".into(),
                    values: vec!["unused".into(), "used".into()],
                },
            )
            .unwrap();
        let labels: String = p
            .database
            .conn
            .query_row(
                "SELECT array_to_string(enum_range(first(value)),',') FROM data.categories",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(labels, "unused,used");
    }

    fn expression(column: &str, sql: &str, replace: bool) -> ColumnExpression {
        ColumnExpression {
            column: column.into(),
            expression: sql.into(),
            replace,
        }
    }

    #[test]
    fn multi_column_changes_preserve_types_and_roll_back_table_failures() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        db.conn.execute_batch("CREATE TABLE data.corpus(text VARCHAR, id BIGINT, exact DECIMAL(30,8)); INSERT INTO data.corpus VALUES ('猫 dog',9007199254740993,1.12345678),(NULL,2,NULL); INSERT INTO wordflow.nodes(table_name) VALUES ('corpus')").unwrap();
        let mut changes = db.changes.subscribe();
        let error = db
            .change_column(
                "corpus".into(),
                ColumnChange::TransformMany {
                    columns: vec![
                        expression("new", "length(text)", false),
                        expression("id", "CAST(text AS BIGINT)", true),
                    ],
                },
            )
            .unwrap_err();
        assert!(error.message.contains("Conversion Error"));
        assert_eq!(
            columns(
                &db.conn,
                &Relation {
                    schema: "data".into(),
                    name: "corpus".into()
                }
            )
            .unwrap()
            .len(),
            3
        );
        assert!(changes.try_recv().is_err());
        db.conn.execute_batch("INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','corpus','[\"exact\"]','test.decimal','{\"scale\":8}')").unwrap();
        db.change_column(
            "corpus".into(),
            ColumnChange::TransformMany {
                columns: vec![
                    expression("chars", "length(text)", false),
                    expression("copy", "exact", false),
                ],
            },
        )
        .unwrap();
        assert_eq!(db.conn.query_row("SELECT extension_metadata FROM wordflow.arrow_metadata WHERE relation_name='corpus' AND field_path='[\"copy\"]'", [], |row| row.get::<_, String>(0)).unwrap(), "{\"scale\":8}");
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT chars FROM data.corpus WHERE id=9007199254740993",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            5
        );
        assert_eq!(
            db.conn
                .query_row("SELECT typeof(copy) FROM data.corpus LIMIT 1", [], |row| {
                    row.get::<_, String>(0)
                })
                .unwrap(),
            "DECIMAL(30,8)"
        );
        assert!(
            db.change_column(
                "corpus".into(),
                ColumnChange::TransformMany {
                    columns: vec![expression(" CHARS ", "0", false)]
                }
            )
            .is_err()
        );
        assert!(
            db.change_column(
                "corpus".into(),
                ColumnChange::DeleteMany {
                    columns: vec!["copy".into(), "missing".into()]
                }
            )
            .is_err()
        );
        assert_eq!(
            db.conn
                .query_row("SELECT count(copy) FROM data.corpus", [], |row| row
                    .get::<_, u64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn multi_column_view_edits_are_lazy_live_and_one_undo_layer() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        db.conn.execute_batch("CREATE TABLE data.raw(a VARCHAR,b BIGINT,c BIGINT); INSERT INTO data.raw VALUES ('one',1,2); CREATE VIEW data.corpus AS SELECT * FROM data.raw; INSERT INTO wordflow.nodes(table_name) VALUES ('corpus')").unwrap();
        db.change_column(
            "corpus".into(),
            ColumnChange::TransformMany {
                columns: vec![
                    expression("a", "upper(a)", true),
                    expression("next", "b+c", false),
                ],
            },
        )
        .unwrap();
        db.conn
            .execute_batch("INSERT INTO data.raw VALUES ('two',3,4)")
            .unwrap();
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT a || CAST(next AS VARCHAR) FROM data.corpus WHERE b=3",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "TWO7"
        );
        db.undo("corpus").unwrap();
        assert_eq!(
            columns(
                &db.conn,
                &Relation {
                    schema: "data".into(),
                    name: "corpus".into()
                }
            )
            .unwrap()
            .len(),
            3
        );
        db.change_column(
            "corpus".into(),
            ColumnChange::DeleteMany {
                columns: vec!["b".into(), "c".into()],
            },
        )
        .unwrap();
        assert_eq!(
            columns(
                &db.conn,
                &Relation {
                    schema: "data".into(),
                    name: "corpus".into()
                }
            )
            .unwrap()
            .len(),
            1
        );
        db.undo("corpus").unwrap();
        assert_eq!(
            columns(
                &db.conn,
                &Relation {
                    schema: "data".into(),
                    name: "corpus".into()
                }
            )
            .unwrap()
            .len(),
            3
        );
        db.change_column(
            "corpus".into(),
            ColumnChange::TransformMany {
                columns: vec![expression("lazy", "CAST(a AS BIGINT)", false)],
            },
        )
        .unwrap();
        assert!(
            db.conn
                .query_row("SELECT lazy FROM data.corpus", [], |row| row
                    .get::<_, i64>(0))
                .is_err()
        );
    }

    #[test]
    fn view_batches_commit_all_outputs_or_none_and_enforce_the_group_limit() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        let view = |name: &str, sql: &str| CreateView {
            name: name.into(),
            sql: sql.into(),
            mappings: vec![],
            computed_columns: vec![],
        };
        let mut changes = db.changes.subscribe();
        assert!(
            db.create_views(CreateViews {
                views: vec![
                    view("first", "SELECT 1 AS value"),
                    view("second", "SELECT * FROM unavailable")
                ]
            })
            .is_err()
        );
        assert!(changes.try_recv().is_err());
        assert_eq!(
            db.conn
                .query_row("SELECT count(*) FROM wordflow.nodes", [], |row| row
                    .get::<_, u64>(0))
                .unwrap(),
            0
        );
        assert!(
            db.create_views(CreateViews {
                views: (0..51)
                    .map(|n| view(&format!("group_{n}"), "SELECT 1 AS value"))
                    .collect()
            })
            .is_err()
        );
        assert_eq!(
            db.create_views(CreateViews {
                views: vec![
                    view(" first ", "SELECT 1 AS value"),
                    view("second", "SELECT 2 AS value")
                ]
            })
            .unwrap(),
            vec!["first", "second"]
        );
        assert!(changes.try_recv().is_ok());
        assert!(changes.try_recv().is_err());
    }

    #[test]
    fn new_names_trim_only_outer_space_and_view_rename_rejects_collisions() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        db.conn.execute_batch("CREATE TABLE data.raw(\" text \" VARCHAR, count INTEGER); INSERT INTO data.raw VALUES ('original', 1); CREATE VIEW data.corpus AS SELECT * FROM data.raw; INSERT INTO wordflow.nodes(table_name) VALUES ('corpus')").unwrap();
        let target = ObjectTarget {
            schema: Some("data".into()),
            name: "corpus".into(),
        };
        let error = db
            .change_column(
                target.clone(),
                ColumnChange::Rename {
                    column: " text ".into(),
                    name: "  COUNT ".into(),
                },
            )
            .unwrap_err();
        assert!(error.message.contains("already exists"));
        assert_eq!(
            columns(&db.conn, &target.resolve(&db.conn).unwrap().relation).unwrap()[0].0,
            " text "
        );
        db.change_column(
            target.clone(),
            ColumnChange::Rename {
                column: " text ".into(),
                name: "  Full  text  ".into(),
            },
        )
        .unwrap();
        db.change_column(
            target.clone(),
            ColumnChange::Transform {
                column: "Full  text".into(),
                expression: "upper(\"Full  text\")".into(),
            },
        )
        .unwrap();
        assert_eq!(
            db.conn
                .query_row("SELECT \"Full  text\" FROM data.corpus", [], |row| row
                    .get::<_, String>(
                    0
                ))
                .unwrap(),
            "ORIGINAL"
        );
        db.change_column(
            target.clone(),
            ColumnChange::Add {
                column: "  New  field  ".into(),
                sql_type: "VARCHAR".into(),
            },
        )
        .unwrap();
        assert_eq!(
            columns(&db.conn, &target.resolve(&db.conn).unwrap().relation).unwrap()[2].0,
            "New  field"
        );
    }

    #[test]
    fn view_cast_validates_all_values_before_change_and_notifies_only_on_success() {
        let mut project = Project::untitled().unwrap();
        let db = &mut project.database;
        db.conn.execute_batch("CREATE TABLE data.raw(created_at VARCHAR); INSERT INTO data.raw VALUES ('2020-10-17 00:52:37.000 +0000'),(NULL); CREATE VIEW data.corpus AS SELECT * FROM data.raw; INSERT INTO wordflow.nodes(table_name) VALUES ('corpus')").unwrap();
        let target = ObjectTarget {
            schema: Some("data".into()),
            name: "corpus".into(),
        };
        let mut changes = db.changes.subscribe();
        let error = db
            .change_column(
                target.clone(),
                ColumnChange::Cast {
                    column: "created_at".into(),
                    target: CastType::Sql {
                        sql_type: "TIMESTAMP".into(),
                    },
                    format: None,
                },
            )
            .unwrap_err();
        assert!(error.message.contains("Conversion Error"));
        assert!(error.message.contains("1 values could not be converted"));
        assert!(changes.try_recv().is_err());
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT typeof(created_at) FROM data.corpus LIMIT 1",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "VARCHAR"
        );
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
