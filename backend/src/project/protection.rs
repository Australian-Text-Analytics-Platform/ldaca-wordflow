//! Transient mutation permissions. DuckDB still owns conflicts between ordinary writes.
use super::*;
use std::{collections::HashMap, sync::Mutex};
use tokio::sync::Notify;

#[derive(Default)]
pub(super) struct Protection {
    entries: Mutex<HashMap<Uuid, Entry>>,
    changed: Notify,
}
struct Entry {
    // None is arbitrary SQL; application operations identify their write targets.
    targets: Option<Vec<ObjectTarget>>,
    editing: bool,
}
pub(super) struct Lease {
    owner: Arc<Protection>,
    id: Uuid,
}
impl Drop for Lease {
    fn drop(&mut self) {
        self.owner
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(&self.id);
        self.owner.changed.notify_waiters();
    }
}
fn same(a: &ObjectTarget, b: &ObjectTarget) -> bool {
    a.schema
        .as_deref()
        .unwrap_or("data")
        .eq_ignore_ascii_case(b.schema.as_deref().unwrap_or("data"))
        && a.name.eq_ignore_ascii_case(&b.name)
}
fn overlaps(a: &Option<Vec<ObjectTarget>>, b: &Option<Vec<ObjectTarget>>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => a.iter().any(|a| b.iter().any(|b| same(a, b))),
        _ => true,
    }
}
impl Protection {
    fn reserve(
        self: &Arc<Self>,
        targets: Option<Vec<ObjectTarget>>,
        editing: bool,
    ) -> Result<Lease> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| Error::new("worker_failed", "Table protection lock poisoned"))?;
        if let Some(entry) = entries
            .values()
            .find(|entry| entry.editing && overlaps(&entry.targets, &targets))
        {
            let target = entry
                .targets
                .as_ref()
                .and_then(|targets| targets.first())
                .map(ToString::to_string)
                .unwrap_or_default();
            return Err(Error::new(
                "editing_active",
                format!(
                    "Table {target} is protected by an editing operation. Finish it with Save or Cancel first"
                ),
            ));
        }
        let id = Uuid::new_v4();
        entries.insert(id, Entry { targets, editing });
        Ok(Lease {
            owner: self.clone(),
            id,
        })
    }
    pub fn mutation(self: &Arc<Self>, targets: Option<Vec<ObjectTarget>>) -> Result<Lease> {
        self.reserve(targets, false)
    }
    /// Reserve before waiting so newly arriving writes cannot overtake this editor.
    pub fn editing(self: &Arc<Self>, target: ObjectTarget) -> Result<Lease> {
        self.reserve(Some(vec![target]), true)
    }
    pub fn is_editing(&self) -> bool {
        self.entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .values()
            .any(|entry| entry.editing)
    }
}
impl Lease {
    pub async fn ready(&self, cancel: &CancellationToken) -> Result<()> {
        loop {
            let changed = self.owner.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            let busy = {
                let entries =
                    self.owner.entries.lock().map_err(|_| {
                        Error::new("worker_failed", "Table protection lock poisoned")
                    })?;
                let entry = &entries[&self.id];
                entries.iter().any(|(id, other)| {
                    id != &self.id && !other.editing && overlaps(&entry.targets, &other.targets)
                })
            };
            if !busy {
                return Ok(());
            }
            tokio::select! {
                () = changed => {},
                () = cancel.cancelled() => return Err(Error::new("interrupted", "Operation interrupted")),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn protects_only_targets_and_reserves_before_waiting() {
        let protection = Arc::new(Protection::default());
        let writer = protection.mutation(Some(vec!["docs".into()])).unwrap();
        let edit = protection.editing("DOCS".into()).unwrap();
        assert!(protection.mutation(Some(vec!["docs".into()])).is_err());
        assert!(protection.mutation(None).is_err());
        let unrelated = protection.mutation(Some(vec!["other".into()])).unwrap();
        let other = protection.editing("third".into()).unwrap();
        other.ready(&CancellationToken::new()).await.unwrap();
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                edit.ready(&CancellationToken::new())
            )
            .await
            .is_err()
        );
        drop(writer);
        edit.ready(&CancellationToken::new()).await.unwrap();
        drop((edit, other, unrelated));
        assert!(!protection.is_editing());
        assert!(protection.mutation(None).is_ok());
    }
}
