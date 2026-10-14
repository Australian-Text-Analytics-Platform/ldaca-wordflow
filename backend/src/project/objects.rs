//! Catalogue objects share the Data Block operations without acquiring a registration.
use super::*;

#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ObjectTarget {
    pub schema: Option<String>,
    /// Canonical name. Input also accepts the legacy `table_name` spelling.
    #[serde(alias = "table_name")]
    pub name: String,
}
impl From<String> for ObjectTarget {
    fn from(name: String) -> Self {
        Self { schema: None, name }
    }
}
impl From<&str> for ObjectTarget {
    fn from(name: &str) -> Self {
        name.to_owned().into()
    }
}
impl From<&String> for ObjectTarget {
    fn from(name: &String) -> Self {
        name.as_str().into()
    }
}
impl From<&ObjectTarget> for ObjectTarget {
    fn from(target: &ObjectTarget) -> Self {
        target.clone()
    }
}
impl std::fmt::Display for ObjectTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(schema) = &self.schema {
            write!(f, "{schema}.{}", self.name)
        } else {
            f.write_str(&self.name)
        }
    }
}

pub(super) struct ResolvedObject {
    pub relation: Relation,
    pub registered: bool,
}
impl ObjectTarget {
    pub(super) fn resolve(&self, conn: &Connection) -> Result<ResolvedObject> {
        let Some(schema) = &self.schema else {
            return Ok(ResolvedObject {
                relation: node(conn, &self.name)?.relation(),
                registered: true,
            });
        };
        if schema.eq_ignore_ascii_case("wordflow") {
            return Err(Error::invalid("Wordflow metadata is not a data object"));
        }
        let relation = conn.query_row(
            "SELECT schema_name, table_name FROM duckdb_tables() WHERE database_name=current_database() AND NOT internal AND NOT temporary AND translate(schema_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(?,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') AND translate(table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(?,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') UNION ALL SELECT schema_name,view_name FROM duckdb_views() WHERE database_name=current_database() AND NOT internal AND NOT temporary AND translate(schema_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(?,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') AND translate(view_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(?,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')",
            params![schema, self.name, schema, self.name],
            |r| Ok(Relation { schema: r.get(0)?, name: r.get(1)? }),
        ).optional()?.ok_or_else(|| Error::new("object_not_found", "Database object is unavailable"))?;
        let registered = relation.schema.eq_ignore_ascii_case("data") && conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM wordflow.nodes WHERE translate(table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(?,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'))",
            [&relation.name], |r| r.get::<_, bool>(0),
        )?;
        Ok(ResolvedObject {
            relation,
            registered,
        })
    }
}

#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct DependencyNode {
    pub object: Relation,
    #[schema(schema_with = object_kind_schema)]
    pub kind: String,
    #[schema(required = true)]
    pub column_count: Option<u64>,
    pub registered: bool,
    pub visible: bool,
    #[schema(required = true)]
    pub color: Option<String>,
    pub can_undo: bool,
    #[serde(skip)]
    pub(super) uncertain: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<Error>,
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct DependencyEdge {
    pub(super) source: Relation,
    pub(super) target: Relation,
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct DependencyGraph {
    pub(super) nodes: Vec<DependencyNode>,
    pub(super) edges: Vec<DependencyEdge>,
}

pub(super) fn catalogue_relations(conn: &Connection) -> Result<Vec<Relation>> {
    Ok(conn.prepare("SELECT schema_name,table_name FROM duckdb_tables() WHERE database_name=current_database() AND NOT internal AND NOT temporary UNION ALL SELECT schema_name,view_name FROM duckdb_views() WHERE database_name=current_database() AND NOT internal AND NOT temporary")?
        .query_map([], |r| Ok(Relation { schema: r.get(0)?, name: r.get(1)? }))?
        .collect::<duckdb::Result<_>>()?)
}

impl Database {
    /// Drop a confirmed dependent closure in one transaction, rechecking the current catalogue.
    pub(super) fn delete_objects(&mut self, targets: Vec<ObjectTarget>) -> Result<Vec<Relation>> {
        if targets.is_empty() {
            return Err(Error::invalid("Select at least one Data Block"));
        }
        let tx = self.conn.transaction()?;
        let graph = inspect_dependencies(&tx, &self.cancellation)?;
        let selected = targets
            .iter()
            .map(|target| {
                graph
                    .nodes
                    .iter()
                    .find(|node| {
                        node.object
                            .schema
                            .eq_ignore_ascii_case(target.schema.as_deref().unwrap_or("data"))
                            && node.object.name.eq_ignore_ascii_case(&target.name)
                            && (target.schema.is_some() || node.registered)
                    })
                    .map(|node| node.object.clone())
                    .ok_or_else(|| Error::new("object_not_found", "Database object is unavailable"))
            })
            .collect::<Result<std::collections::HashSet<_>>>()?;
        for edge in &graph.edges {
            if selected.contains(&edge.source) && !selected.contains(&edge.target) {
                return Err(Error::new(
                    "dependent_objects",
                    format!(
                        "{} also depends on this selection. Review the dependent Data Blocks again.",
                        edge.target.sql()
                    ),
                ));
            }
        }
        if graph
            .nodes
            .iter()
            .any(|node| !selected.contains(&node.object) && node.uncertain)
        {
            return Err(Error::new(
                "uncertain_dependencies",
                "A View has dynamic SQL dependencies. Resolve them before deleting this selection.",
            ));
        }
        let mut remaining = selected.clone();
        let mut ordered = Vec::new();
        while !remaining.is_empty() {
            let mut leaves = remaining
                .iter()
                .filter(|object| {
                    !graph
                        .edges
                        .iter()
                        .any(|edge| &edge.source == *object && remaining.contains(&edge.target))
                })
                .cloned()
                .collect::<Vec<_>>();
            if leaves.is_empty() {
                return Err(Error::invalid("Dependent Data Blocks contain a cycle"));
            }
            leaves.sort_by_key(Relation::sql);
            for object in leaves {
                remaining.remove(&object);
                ordered.push(object);
            }
        }
        let change = PendingChange::new(
            &tx,
            ChangeScope {
                objects: ordered.clone(),
                resources: vec![changes::Resource::Graph],
                ..Default::default()
            },
            &self.cancellation,
        );
        for relation in &ordered {
            let node = graph
                .nodes
                .iter()
                .find(|node| &node.object == relation)
                .ok_or_else(|| Error::invalid("Data Block is unavailable"))?;
            arrow_metadata::delete_relation(&tx, relation)?;
            if node.registered {
                metadata::delete_node(&tx, &relation.name)?;
            }
            if node.kind != "missing" {
                let kind = if node.kind == "view" { "VIEW" } else { "TABLE" };
                tx.execute_batch(&format!("DROP {kind} {}", relation.sql()))?;
            }
            super::document_matches::delete_publication(&tx, relation)?;
        }
        check_cancellation(&self.cancellation)?;
        change.commit(tx, &self.changes, &self.cancellation)?;
        Ok(ordered)
    }

    pub(super) fn dependency_graph(&self) -> Result<DependencyGraph> {
        self.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
        let graph = inspect_dependencies(&self.conn, &self.cancellation)?;
        self.conn.execute_batch("COMMIT")?;
        Ok(graph)
    }
}

/// Inspect the current catalogue inside the caller's transaction, without evaluating Views.
pub(super) fn inspect_dependencies(
    conn: &Connection,
    cancellation: &CancellationToken,
) -> Result<DependencyGraph> {
    let database: String = conn.query_row("SELECT current_database()", [], |r| r.get(0))?;
    let search_path: Vec<String> = conn
        .prepare("SELECT unnest(current_schemas(true))")?
        .query_map([], |r| r.get(0))?
        .collect::<duckdb::Result<_>>()?;
    let catalogue = catalogue_relations(conn)?;
    let mut statement = conn.prepare("WITH objects AS (SELECT schema_name,table_name AS name,'table' AS kind,column_count,NULL::VARCHAR AS sql FROM duckdb_tables() WHERE database_name=current_database() AND NOT internal AND NOT temporary UNION ALL SELECT schema_name,view_name,'view',column_count,sql FROM duckdb_views() WHERE database_name=current_database() AND NOT internal AND NOT temporary) SELECT o.schema_name,o.name,o.kind,o.column_count,o.sql,n.table_name IS NOT NULL,coalesce(n.visible,false),n.color FROM objects o LEFT JOIN wordflow.nodes n ON o.schema_name='data' AND translate(o.name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(n.table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') WHERE o.schema_name<>'wordflow' ORDER BY o.schema_name,o.name")?;
    let entries = statement
        .query_map([], |r| {
            Ok((
                DependencyNode {
                    object: Relation {
                        schema: r.get(0)?,
                        name: r.get(1)?,
                    },
                    kind: r.get(2)?,
                    column_count: r.get(3)?,
                    registered: r.get(5)?,
                    visible: r.get(6)?,
                    color: r.get(7)?,
                    can_undo: false,
                    uncertain: false,
                    diagnostic: None,
                },
                r.get::<_, Option<String>>(4)?,
            ))
        })?
        .collect::<duckdb::Result<Vec<_>>>()?;
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    for (mut node, ddl) in entries {
        check_cancellation(cancellation)?;
        if let Some(ddl) = ddl {
            match query::select_body(&ddl).and_then(|sql| query::parse(conn, &sql)) {
                Ok(mut tree) => {
                    node.can_undo = query::can_undo(&tree);
                    node.uncertain = changes::uncertain_references(&tree);
                    let context = query::ReferenceContext {
                        database: &database,
                        schema: &node.object.schema,
                        search_path: &search_path,
                        catalogue: Some(&catalogue),
                    };
                    let mut seen = std::collections::HashSet::new();
                    let mut missing = Vec::new();
                    for source in query::references_in(&mut tree, &context, None) {
                        if !seen.insert(source.clone()) {
                            continue;
                        }
                        if !catalogue.contains(&source) {
                            missing.push(source.sql());
                        } else if !source.schema.eq_ignore_ascii_case("wordflow") {
                            edges.push(DependencyEdge {
                                source,
                                target: node.object.clone(),
                            });
                        }
                    }
                    if !missing.is_empty() {
                        node.diagnostic = Some(Error::new(
                            "unresolved_dependency",
                            format!("Unresolved references: {}", missing.join(", ")),
                        ));
                    }
                }
                Err(error) => node.diagnostic = Some(error),
            }
        }
        nodes.push(node);
    }
    // A registered Data Block can outlive its SQL object. Keep it selectable for
    // atomic metadata cleanup, as the original single-Block deletion allowed.
    let registered = conn
        .prepare("SELECT table_name,visible,color,document_column FROM wordflow.nodes")?
        .query_map([], read_node)?
        .collect::<duckdb::Result<Vec<_>>>()?;
    for node in registered {
        if !nodes.iter().any(|entry| {
            entry.object.schema.eq_ignore_ascii_case("data")
                && entry.object.name.eq_ignore_ascii_case(&node.table_name)
        }) {
            nodes.push(DependencyNode {
                object: node.relation(),
                kind: "missing".into(),
                column_count: None,
                registered: true,
                visible: node.visible,
                color: node.color,
                can_undo: false,
                uncertain: false,
                diagnostic: Some(Error::new(
                    "object_unavailable",
                    "Registered object is unavailable",
                )),
            });
        }
    }
    nodes.sort_by_key(|node| node.object.sql());
    Ok(DependencyGraph { nodes, edges })
}

fn object_kind_schema() -> utoipa::openapi::schema::Object {
    crate::openapi::string_enum(&["table", "view", "missing"])
}
