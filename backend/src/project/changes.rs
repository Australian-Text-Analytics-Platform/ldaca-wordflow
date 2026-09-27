//! Commit notifications are transient cache hints, never a database history.
use super::*;
use std::{collections::BTreeMap, sync::Mutex};
use tokio::sync::broadcast;

/// The same commit boundary updates editor preconditions before notifying UI consumers.
#[derive(Clone)]
pub(super) struct Notifications {
    sender: broadcast::Sender<ChangeScope>,
    stamps: Arc<Mutex<Stamps>>,
}
#[derive(Default)]
struct Stamps {
    broad: u64,
    sequence: u64,
    objects: BTreeMap<(String, String), u64>,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, utoipa::ToSchema)]
pub(crate) struct MutationStamp {
    broad: u64,
    object: u64,
}
impl Default for Notifications {
    fn default() -> Self {
        Self {
            sender: broadcast::channel(128).0,
            stamps: Arc::default(),
        }
    }
}
impl Notifications {
    pub fn subscribe(&self) -> broadcast::Receiver<ChangeScope> {
        self.sender.subscribe()
    }
    pub fn stamp(&self, relation: &Relation) -> MutationStamp {
        let stamps = self
            .stamps
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        MutationStamp {
            broad: stamps.broad,
            object: *stamps
                .objects
                .get(&(
                    relation.schema.to_ascii_lowercase(),
                    relation.name.to_ascii_lowercase(),
                ))
                .unwrap_or(&0),
        }
    }
    fn publish(&self, scope: ChangeScope) {
        {
            let mut stamps = self
                .stamps
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            stamps.sequence += 1;
            let sequence = stamps.sequence;
            if scope.all {
                stamps.broad = sequence;
                stamps.objects.clear();
            } else {
                for object in &scope.objects {
                    stamps.objects.insert(
                        (
                            object.schema.to_ascii_lowercase(),
                            object.name.to_ascii_lowercase(),
                        ),
                        sequence,
                    );
                }
            }
        }
        let _ = self.sender.send(scope);
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Resource {
    Graph,
    Tabs,
    SqlCells,
    Project,
    SqlTypes,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct ChangeScope {
    #[schema(required = false)]
    pub all: bool,
    #[schema(required = false)]
    pub objects: Vec<Relation>,
    #[schema(required = false)]
    pub resources: Vec<Resource>,
    #[schema(required = false)]
    pub analysis_ids: Vec<Uuid>,
    #[schema(required = false)]
    pub renames: Vec<renames::Rename>,
}
impl ChangeScope {
    pub fn analysis(id: Uuid) -> Self {
        Self {
            analysis_ids: vec![id],
            ..Self::resource(Resource::Tabs)
        }
    }
    pub fn all() -> Self {
        Self {
            all: true,
            ..Self::default()
        }
    }
    pub fn object(object: Relation) -> Self {
        Self {
            objects: vec![object],
            resources: vec![Resource::Graph],
            ..Self::default()
        }
    }
    pub fn resource(resource: Resource) -> Self {
        Self {
            resources: vec![resource],
            ..Self::default()
        }
    }
    pub(super) fn publish(self, sender: &Notifications) {
        if self.all
            || !self.objects.is_empty()
            || !self.resources.is_empty()
            || !self.analysis_ids.is_empty()
        {
            // No subscribers is normal while a window is connecting or closing.
            sender.publish(self);
        }
    }
}

pub(super) struct PendingChange {
    scope: ChangeScope,
    before: Option<objects::DependencyGraph>,
}
impl PendingChange {
    pub fn new(conn: &Connection, mut scope: ChangeScope, cancel: &CancellationToken) -> Self {
        let before = if !scope.all && !scope.objects.is_empty() {
            match objects::inspect_dependencies(conn, cancel) {
                Ok(graph) => Some(graph),
                Err(_) => {
                    scope.all = true;
                    None
                }
            }
        } else {
            None
        };
        Self { scope, before }
    }
    fn finish(mut self, conn: &Connection, cancel: &CancellationToken) -> ChangeScope {
        if !self.scope.all && !self.scope.objects.is_empty() {
            match objects::inspect_dependencies(conn, cancel) {
                Ok(after) => {
                    let graphs = self
                        .before
                        .iter()
                        .chain(std::iter::once(&after))
                        .collect::<Vec<_>>();
                    for graph in &graphs {
                        for node in &graph.nodes {
                            if node.diagnostic.is_some() || node.uncertain {
                                include(&mut self.scope.objects, &node.object);
                            }
                        }
                    }
                    loop {
                        let previous = self.scope.objects.len();
                        for graph in &graphs {
                            for edge in &graph.edges {
                                if self.scope.objects.iter().any(|r| same(r, &edge.source)) {
                                    include(&mut self.scope.objects, &edge.target);
                                }
                            }
                        }
                        if previous == self.scope.objects.len() {
                            break;
                        }
                    }
                }
                Err(_) => self.scope.all = true,
            }
        }
        self.scope
    }
    pub fn commit(
        self,
        tx: duckdb::Transaction<'_>,
        sender: &Notifications,
        cancel: &CancellationToken,
    ) -> Result<()> {
        let scope = self.finish(&tx, cancel);
        check_cancellation(cancel)?;
        tx.commit()?;
        scope.publish(sender);
        Ok(())
    }
    pub fn commit_sql(
        self,
        conn: &Connection,
        sender: &Notifications,
        cancel: &CancellationToken,
    ) -> Result<()> {
        let scope = self.finish(conn, cancel);
        check_cancellation(cancel)?;
        conn.execute_batch("COMMIT")?;
        scope.publish(sender);
        Ok(())
    }
}
fn same(a: &Relation, b: &Relation) -> bool {
    a.schema.eq_ignore_ascii_case(&b.schema) && a.name.eq_ignore_ascii_case(&b.name)
}
fn include(objects: &mut Vec<Relation>, object: &Relation) {
    if !objects.iter().any(|r| same(r, object)) {
        objects.push(object.clone());
    }
}

/// Functions may hide references (macros and query_table); do not infer independence.
pub(super) fn uncertain_references(value: &Value) -> bool {
    value.get("type").and_then(Value::as_str) == Some("TABLE_FUNCTION")
        || match value {
            Value::Object(map) => map.values().any(uncertain_references),
            Value::Array(items) => items.iter().any(uncertain_references),
            _ => false,
        }
}

#[cfg(test)]
mod tests;
