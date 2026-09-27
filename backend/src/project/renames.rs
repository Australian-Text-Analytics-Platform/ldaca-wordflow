//! App-driven identity changes preserve View interfaces and recognized request references.
use super::*;

pub(super) fn column_views(
    conn: &Connection,
    source: &Relation,
    before: &str,
    after: &str,
    fields: &[(String, String)],
) -> Result<Vec<(Relation, String)>> {
    let select = fields
        .iter()
        .map(|(name, _)| {
            if name == before {
                format!("{} AS {}", query::quote(after), query::quote(before))
            } else {
                query::quote(name)
            }
        })
        .collect::<Vec<_>>()
        .join(",");
    let projection = query::parse(
        conn,
        &format!(
            "SELECT * FROM (SELECT {select} FROM {}) AS source",
            source.sql()
        ),
    )?["statements"][0]["node"]["from_table"]
        .clone();
    let database: String = conn.query_row("SELECT current_database()", [], |r| r.get(0))?;
    let catalogue = objects::catalogue_relations(conn)?;
    let search_path = conn
        .prepare("SELECT unnest(current_schemas(true))")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<duckdb::Result<Vec<_>>>()?;
    let views = conn.prepare("SELECT schema_name,view_name FROM duckdb_views() WHERE database_name=current_database() AND NOT internal AND NOT temporary")?.query_map([],|r|Ok(Relation {schema:r.get(0)?,name:r.get(1)?}))?.collect::<duckdb::Result<Vec<_>>>()?;
    let mut rewrites = Vec::new();
    for view in views {
        if same(&view, source) {
            continue;
        }
        let sql = query::view_query(conn, &view)?
            .ok_or_else(|| Error::invalid("Dependent View is unavailable"))?;
        let mut tree = query::parse(conn, &sql)?;
        let refs = query::project_references_in(
            &mut tree,
            &query::ReferenceContext {
                database: &database,
                schema: &view.schema,
                search_path: &search_path,
                catalogue: Some(&catalogue),
            },
            source,
            &projection,
        );
        if refs.iter().any(|r| same(r, source)) {
            rewrites.push((view, query::render(conn, &tree)?));
        }
    }
    Ok(rewrites)
}
fn same(a: &Relation, b: &Relation) -> bool {
    a.schema.eq_ignore_ascii_case(&b.schema) && a.name.eq_ignore_ascii_case(&b.name)
}

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[schema(as = ReferenceRename)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum Rename {
    Table {
        source: Relation,
        name: String,
    },
    Column {
        source: Relation,
        before: String,
        after: String,
    },
}
impl Rename {
    fn source(&self) -> &Relation {
        match self {
            Self::Table { source, .. } | Self::Column { source, .. } => source,
        }
    }
    fn input(&self, value: &mut Value, fields: &[&str]) -> bool {
        let Some(source) = value.get("source") else {
            return false;
        };
        let Some(name) = source
            .get("name")
            .and_then(Value::as_str)
            .or_else(|| source.get("table_name").and_then(Value::as_str))
        else {
            return false;
        };
        let schema = source
            .get("schema")
            .and_then(Value::as_str)
            .unwrap_or("data");
        if !name.eq_ignore_ascii_case(&self.source().name)
            || !schema.eq_ignore_ascii_case(&self.source().schema)
        {
            return false;
        }
        match self {
            Self::Table { name, .. } => {
                let field = if value["source"].get("name").is_some() {
                    "name"
                } else {
                    "table_name"
                };
                value["source"][field] = Value::String(name.clone());
            }
            Self::Column { before, after, .. } => {
                for field in fields {
                    if let Some(value) = value.get_mut(*field) {
                        rename_field(value, before, after);
                    }
                }
            }
        }
        true
    }
    pub(super) fn request(&self, kind: &str, value: &mut Value) -> bool {
        match kind {
            "frequency" | "concordance" | "topic-modeling" => value
                .get_mut("inputs")
                .and_then(Value::as_array_mut)
                .is_some_and(|inputs| {
                    inputs
                        .iter_mut()
                        .map(|input| self.input(input, &["column"]))
                        .fold(false, |a, b| a | b)
                }),
            "annotation" => {
                let mut changed = false;
                if let Some(setup) = value.get_mut("setup") {
                    changed |= self.input(setup, &["document", "annotation", "correction"]);
                    if let Some(codebook) = setup.get_mut("codebook") {
                        changed |= self.input(codebook, &["code", "description"]);
                    }
                }
                if let Some(codebook) = value.get_mut("codebook") {
                    changed |= self.input(codebook, &["code", "description"]);
                }
                if let Some(examples) = value.get_mut("examples") {
                    changed |= self.input(examples, &["text", "label"]);
                }
                changed
            }
            "quotation" => value
                .get_mut("input")
                .is_some_and(|input| self.input(input, &["column"])),
            "trends" | "compare" | "scatter" | "heatmap" | "sankey" => {
                self.input(value, plot_fields(kind))
            }
            _ => false,
        }
    }
}
fn rename_field(value: &mut Value, before: &str, after: &str) {
    match value {
        Value::String(name) if name.eq_ignore_ascii_case(before) => *name = after.into(),
        Value::Array(values) => {
            for value in values {
                rename_field(value, before, after);
            }
        }
        _ => {}
    }
}
pub(super) fn plot_fields(kind: &str) -> &'static [&'static str] {
    match kind {
        "trends" => &["axis", "groups", "value"],
        "compare" => &["category", "stack", "value"],
        "scatter" => &["x", "y", "color", "size", "label"],
        "heatmap" => &["row", "column", "value"],
        "sankey" => &["stages", "value"],
        _ => &[],
    }
}
pub(super) fn reconcile(conn: &Connection, rename: &Rename) -> Result<Vec<Uuid>> {
    let rows = conn.prepare("SELECT a.id::VARCHAR,t.kind,a.request::VARCHAR,a.result::VARCHAR FROM wordflow.analyses a JOIN wordflow.tabs t ON t.id=a.tab_id")?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,Option<String>>(3)?)))?.collect::<duckdb::Result<Vec<_>>>()?;
    let mut affected = Vec::new();
    for (id, kind, request, result) in rows {
        let mut request: Value = serde_json::from_str(&request)?;
        let original = request.clone();
        if !rename.request(&kind, &mut request) || original == request {
            continue;
        }
        if let (Rename::Column { before, after, .. }, Some(result)) = (rename, result)
            && !plot_fields(&kind).is_empty()
        {
            let mut result: Value = serde_json::from_str(&result)?;
            // Bind only source fields used by saved projections, never duplicate the request.
            let object = result.as_object_mut().ok_or_else(|| {
                Error::invalid(format!(
                    "Cannot preserve saved bindings for analysis {id}: result is not an object"
                ))
            })?;
            let bindings = object
                .entry("field_bindings")
                .or_insert_with(|| serde_json::json!({}))
                .as_object_mut()
                .ok_or_else(|| {
                    Error::invalid(format!("Cannot preserve saved bindings for analysis {id}"))
                })?;
            let captured = bindings
                .remove(before)
                .unwrap_or_else(|| Value::String(before.clone()));
            bindings.insert(after.clone(), captured);
            conn.execute(
                "UPDATE wordflow.analyses SET result=? WHERE id=?",
                params![result.to_string(), id],
            )?;
        }
        conn.execute(
            "UPDATE wordflow.analyses SET request=? WHERE id=?",
            params![request.to_string(), id],
        )?;
        affected.push(Uuid::parse_str(&id).map_err(|e| Error::invalid(e.to_string()))?);
    }
    let tabs = conn
        .prepare(
            "SELECT id::VARCHAR, settings::VARCHAR FROM wordflow.tabs WHERE kind='annotation'",
        )?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<duckdb::Result<Vec<_>>>()?;
    for (id, settings) in tabs {
        let mut settings: Value = serde_json::from_str(&settings)?;
        let original = settings.clone();
        if let Some(manual) = settings.get_mut("manual") {
            rename.request("annotation", manual);
        }
        if original != settings {
            conn.execute(
                "UPDATE wordflow.tabs SET settings=? WHERE id=?",
                params![settings.to_string(), id],
            )?;
        }
    }
    Ok(affected)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renamed_column_preserves_views_and_unknown_request_fields() {
        let mut p = Project::untitled().unwrap();
        let db = &mut p.database;
        db.conn.execute_batch("CREATE TABLE data.docs(text VARCHAR, category VARCHAR); INSERT INTO data.docs VALUES ('hello','A'); INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('docs','text'); CREATE VIEW data.v AS SELECT d.*,length(d.text) AS length FROM data.docs d; CREATE VIEW data.child AS SELECT text FROM data.v; CREATE VIEW data.shadow AS WITH docs AS (SELECT 'literal' AS text) SELECT text FROM docs").unwrap();
        let tab = db
            .create_analysis_tab(CreateTab {
                kind: "concordance".into(),
                name: None,
            })
            .unwrap();
        let request = serde_json::json!({"inputs":[{"source":{"name":"docs"},"column":"text","future":true}],"search":{"query":"text"},"future":{"column":"text"}});
        db.begin_analysis_run(tab.id, "concordance", request)
            .unwrap();
        db.change_column(
            "docs".into(),
            mutations::ColumnChange::Rename {
                column: "text".into(),
                name: "content".into(),
            },
        )
        .unwrap();
        assert_eq!(
            db.conn
                .query_row("SELECT text FROM data.child", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "hello"
        );
        assert_eq!(
            db.conn
                .query_row("SELECT text FROM data.shadow", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "literal"
        );
        assert_eq!(
            mutations::columns(
                &db.conn,
                &Relation {
                    schema: "data".into(),
                    name: "v".into()
                }
            )
            .unwrap()
            .iter()
            .map(|(n, _)| n.as_str())
            .collect::<Vec<_>>(),
            vec!["text", "category", "length"]
        );
        let request = db.analysis_tab(tab.id).unwrap().analysis.unwrap().request;
        assert_eq!(request["inputs"][0]["column"], "content");
        assert_eq!(request["inputs"][0]["future"], true);
        assert_eq!(request["search"]["query"], "text");
        assert_eq!(request["future"]["column"], "text");
    }
}

/// Recognize only the exact rename wrapper produced by the app, in either direction.
pub(super) fn view_rename(
    conn: &Connection,
    source: &Relation,
    old: &str,
    new: &str,
) -> Result<Option<Rename>> {
    fn wrapper(conn: &Connection, wrapped: &str, inner: &str) -> Result<Option<(String, String)>> {
        let tree = query::parse(conn, wrapped)?;
        if !query::can_undo(&tree) {
            return Ok(None);
        }
        let previous = query::unwrap(conn, wrapped)?;
        if query::render(conn, &query::parse(conn, &previous)?)?
            != query::render(conn, &query::parse(conn, inner)?)?
        {
            return Ok(None);
        }
        let Some(fields) = tree["statements"][0]["node"]["select_list"].as_array() else {
            return Ok(None);
        };
        let mut rename = None;
        for field in fields {
            if field["class"] != "COLUMN_REF" {
                return Ok(None);
            }
            let Some(names) = field["column_names"].as_array() else {
                return Ok(None);
            };
            if names.len() != 1 {
                return Ok(None);
            }
            let Some(before) = names[0].as_str() else {
                return Ok(None);
            };
            let after = field["alias"].as_str().unwrap_or("");
            if !after.is_empty() && before != after {
                if rename.is_some() {
                    return Ok(None);
                }
                rename = Some((before.to_string(), after.to_string()));
            }
        }
        Ok(rename)
    }
    let pair = if let Some((before, after)) = wrapper(conn, old, new)? {
        Some((after, before))
    } else {
        wrapper(conn, new, old)?
    };
    Ok(pair.map(|(before, after)| Rename::Column {
        source: source.clone(),
        before,
        after,
    }))
}

#[cfg(test)]
mod undo_tests {
    use super::*;
    #[test]
    fn view_column_rename_undo_and_redo_reconcile_dependents_and_document_preferences() {
        let mut p = Project::untitled().unwrap();
        let db = &mut p.database;
        db.conn.execute_batch("CREATE TABLE data.raw(text VARCHAR); INSERT INTO data.raw VALUES ('hello'); CREATE VIEW data.docs AS SELECT * FROM data.raw; CREATE VIEW data.child AS SELECT text FROM data.docs; INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('docs','text')").unwrap();
        db.change_column(
            "docs".into(),
            mutations::ColumnChange::Rename {
                column: "text".into(),
                name: "content".into(),
            },
        )
        .unwrap();
        let redo = db.view_definition("docs").unwrap();
        db.undo("docs").unwrap();
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT document_column FROM wordflow.nodes WHERE table_name='docs'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "text"
        );
        assert_eq!(
            db.conn
                .query_row("SELECT text FROM data.child", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "hello"
        );
        db.replace_view_definition("docs", &redo).unwrap();
        assert_eq!(
            db.conn
                .query_row(
                    "SELECT document_column FROM wordflow.nodes WHERE table_name='docs'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "content"
        );
        assert_eq!(
            db.conn
                .query_row("SELECT text FROM data.child", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "hello"
        );
    }
}

pub(super) struct ViewInterfaces(Vec<(Relation, Vec<(String, String)>)>);
impl ViewInterfaces {
    pub fn capture(conn: &Connection, source: &Relation) -> Result<Self> {
        let views=conn.prepare("SELECT schema_name,view_name FROM duckdb_views() WHERE database_name=current_database() AND NOT internal AND NOT temporary")?.query_map([],|r|Ok(Relation{schema:r.get(0)?,name:r.get(1)?}))?.collect::<duckdb::Result<Vec<_>>>()?;
        let mut interfaces = vec![];
        for view in views {
            if !same(&view, source)
                && conn
                    .prepare(&format!("SELECT * FROM {}", view.sql()))
                    .is_ok()
                && let Ok(columns) = mutations::columns(conn, &view)
            {
                interfaces.push((view, columns));
            }
        }
        Ok(Self(interfaces))
    }
    pub fn validate(self, conn: &Connection) -> Result<()> {
        for (view, before) in self.0 {
            conn.prepare(&format!("SELECT * FROM {}", view.sql()))
                .map_err(|error| {
                    Error::invalid(format!(
                        "Cannot reconcile View {} after rename: {error}",
                        view.sql()
                    ))
                })?;
            let after = mutations::columns(conn, &view).map_err(|error| {
                Error::invalid(format!(
                    "Cannot reconcile View {} after rename: {}",
                    view.sql(),
                    error.message
                ))
            })?;
            if before != after {
                return Err(Error::invalid(format!(
                    "Rename would change the output interface of View {}",
                    view.sql()
                )));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod complex_tests {
    use super::*;
    #[test]
    fn joins_qualified_stars_and_correlated_queries_keep_their_interfaces() {
        let mut p = Project::untitled().unwrap();
        let db = &mut p.database;
        db.conn.execute_batch("CREATE TABLE data.docs(id INT,text VARCHAR); INSERT INTO data.docs VALUES (1,'hello'); CREATE TABLE data.tags(id INT,tag VARCHAR); INSERT INTO data.tags VALUES (1,'g'); INSERT INTO wordflow.nodes(table_name) VALUES ('docs'); CREATE VIEW data.joined AS SELECT docs.*, t.tag, (SELECT length(d.text) FROM data.docs d WHERE d.id=t.id) AS len FROM data.docs JOIN data.tags t USING(id); CREATE VIEW data.ctes AS WITH first AS (SELECT text FROM data.docs), docs AS (SELECT 'literal' AS text) SELECT first.text,docs.text AS literal FROM first,docs").unwrap();
        db.change_column(
            "docs".into(),
            mutations::ColumnChange::Rename {
                column: "text".into(),
                name: "content".into(),
            },
        )
        .unwrap();
        assert_eq!(
            db.conn
                .query_row("SELECT text||tag||len::VARCHAR FROM data.joined", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "hellog5"
        );
        assert_eq!(
            db.conn
                .query_row("SELECT text||literal FROM data.ctes", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "helloliteral"
        );
    }
    #[test]
    fn unsupported_macro_dependency_rolls_back_the_rename() {
        let mut p = Project::untitled().unwrap();
        let db = &mut p.database;
        db.conn.execute_batch("CREATE TABLE data.docs(text VARCHAR); CREATE MACRO data.reader() AS TABLE SELECT text FROM data.docs; CREATE VIEW data.v AS SELECT * FROM data.reader(); INSERT INTO wordflow.nodes(table_name) VALUES ('docs')").unwrap();
        assert!(
            db.change_column(
                "docs".into(),
                mutations::ColumnChange::Rename {
                    column: "text".into(),
                    name: "content".into()
                }
            )
            .is_err()
        );
        assert_eq!(
            mutations::columns(
                &db.conn,
                &Relation {
                    schema: "data".into(),
                    name: "docs".into()
                }
            )
            .unwrap()[0]
                .0,
            "text"
        );
    }
}
