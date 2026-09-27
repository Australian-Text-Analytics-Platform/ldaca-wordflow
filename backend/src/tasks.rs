//! Runtime-local execution summaries. Application results belong to their consumers.
use crate::{
    Operation,
    error::{Error, Result},
};
use serde::Serialize;
use std::{
    future::Future,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::{oneshot, watch};
use tokio_util::{
    sync::CancellationToken,
    task::{TaskTracker, task_tracker::TaskTrackerToken},
};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum TaskState {
    Queued,
    Running,
    Cancelling,
    Succeeded,
    Failed,
    Cancelled,
}
impl TaskState {
    pub fn is_finished(self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Cancelled)
    }
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub struct TaskProgress {
    pub message: String,
    #[schema(required = true)]
    pub fraction: Option<f64>,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
pub struct TaskSummary {
    pub id: Uuid,
    pub label: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<Uuid>,
    pub state: TaskState,
    pub created_at: u64,
    #[schema(required = true)]
    pub started_at: Option<u64>,
    #[schema(required = true)]
    pub finished_at: Option<u64>,
    #[schema(required = true)]
    pub progress: Option<TaskProgress>,
    #[schema(required = true)]
    pub error: Option<Error>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, utoipa::ToSchema)]
pub struct TaskSnapshot {
    pub revision: u64,
    pub tasks: Vec<TaskSummary>,
}
struct Entry {
    summary: TaskSummary,
    cancellation: CancellationToken,
}
#[derive(Clone)]
pub(crate) struct Tasks {
    entries: Arc<Mutex<Vec<Entry>>>,
    changes: watch::Sender<TaskSnapshot>,
    closed: CancellationToken,
}

/// A typed result receiver. Dropping it does not cancel accepted execution.
pub struct TaskHandle<T> {
    pub id: Uuid,
    result: oneshot::Receiver<Result<T>>,
}
impl<T> TaskHandle<T> {
    pub async fn wait(self) -> Result<T> {
        self.result
            .await
            .map_err(|_| Error::new("worker_failed", "Task result unavailable"))?
    }
}
/// Cooperative progress and cancellation for one execution, independent of its HTTP caller.
#[derive(Clone)]
pub struct TaskContext {
    id: Uuid,
    tasks: Tasks,
    cancellation: CancellationToken,
    children: TaskTracker,
}
tokio::task_local! { static CURRENT: TaskContext; }
pub(crate) fn current() -> Option<TaskContext> {
    CURRENT.try_with(Clone::clone).ok()
}
impl TaskContext {
    pub fn cancellation(&self) -> &CancellationToken {
        &self.cancellation
    }
    pub fn check_cancelled(&self) -> Result<()> {
        if self.cancellation.is_cancelled() {
            Err(Error::new("interrupted", "Task cancelled"))
        } else {
            Ok(())
        }
    }
    pub(crate) fn track(&self) -> TaskTrackerToken {
        self.children.token()
    }
    pub fn progress(&self, message: impl Into<String>, fraction: Option<f64>) {
        let progress = TaskProgress {
            message: message.into(),
            fraction: fraction.filter(|v| v.is_finite() && (0.0..=1.0).contains(v)),
        };
        self.tasks.update(self.id, |task| {
            if !task.state.is_finished() {
                task.progress = Some(progress);
            }
        });
    }
    pub fn notice(&self, message: String) {
        self.tasks
            .update(self.id, |task| task.notice = Some(message));
    }
    /// A cancelled caller cannot abandon the blocking worker's ownership or cleanup.
    pub async fn run_blocking<T: Send + 'static>(
        &self,
        f: impl FnOnce(TaskContext) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        self.check_cancelled()?;
        let context = self.clone();
        self.children
            .spawn_blocking(move || {
                context.check_cancelled()?;
                f(context)
            })
            .await?
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}
impl Tasks {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(Mutex::new(Vec::new())),
            changes: watch::channel(TaskSnapshot::default()).0,
            closed: CancellationToken::new(),
        }
    }
    pub fn snapshot(&self) -> TaskSnapshot {
        self.changes.borrow().clone()
    }
    pub fn subscribe(&self) -> watch::Receiver<TaskSnapshot> {
        self.changes.subscribe()
    }
    pub fn shutdown(&self) -> CancellationToken {
        self.closed.clone()
    }
    fn publish(&self, entries: &mut Vec<Entry>) {
        entries.sort_by(|a, b| {
            a.summary
                .state
                .is_finished()
                .cmp(&b.summary.state.is_finished())
                .then_with(|| {
                    b.summary
                        .finished_at
                        .unwrap_or(b.summary.created_at)
                        .cmp(&a.summary.finished_at.unwrap_or(a.summary.created_at))
                })
        });
        let mut finished = 0;
        entries.retain(|e| {
            if e.summary.state.is_finished() {
                finished += 1;
            }
            finished <= 100 || !e.summary.state.is_finished()
        });
        self.changes.send_modify(|snapshot| {
            snapshot.revision += 1;
            snapshot.tasks = entries.iter().map(|e| e.summary.clone()).collect();
        });
    }
    fn update(&self, id: Uuid, update: impl FnOnce(&mut TaskSummary)) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(entry) = entries.iter_mut().find(|e| e.summary.id == id) {
            update(&mut entry.summary);
            self.publish(&mut entries);
        }
    }
    pub fn submit<T: Send + 'static, F: Future<Output = Result<T>> + Send + 'static>(
        &self,
        operation: Operation,
        label: String,

        run: impl FnOnce(TaskContext) -> F + Send + 'static,
    ) -> Result<TaskHandle<T>> {
        self.submit_owned(operation, label, None, run)
    }
    pub fn submit_owned<T: Send + 'static, F: Future<Output = Result<T>> + Send + 'static>(
        &self,
        operation: Operation,
        label: String,

        tab_id: Option<Uuid>,
        run: impl FnOnce(TaskContext) -> F + Send + 'static,
    ) -> Result<TaskHandle<T>> {
        if label.trim().is_empty() {
            return Err(Error::invalid("Task label cannot be empty"));
        }
        let id = Uuid::new_v4();
        let context = TaskContext {
            id,
            tasks: self.clone(),
            cancellation: operation.cancellation.clone(),
            children: TaskTracker::new(),
        };
        {
            let mut entries = self
                .entries
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if tab_id.is_some_and(|id| {
                entries.iter().any(|entry| {
                    entry.summary.tab_id == Some(id) && !entry.summary.state.is_finished()
                })
            }) {
                return Err(Error::new(
                    "analysis_busy",
                    "This analysis already has a running task",
                ));
            }
            entries.push(Entry {
                cancellation: context.cancellation.clone(),
                summary: TaskSummary {
                    id,
                    label,

                    tab_id,
                    state: TaskState::Queued,
                    created_at: now(),
                    started_at: None,
                    finished_at: None,
                    progress: None,
                    error: None,
                    notice: None,
                },
            });
            self.publish(&mut entries);
        }
        let tasks = self.clone();
        let (send, result) = oneshot::channel();
        tokio::spawn(async move {
            let child = context.clone();
            let outcome = tokio::spawn(CURRENT.scope(context.clone(), async move {
                child.check_cancelled()?;
                child.tasks.update(id, |task| {
                    if task.state == TaskState::Queued {
                        task.state = TaskState::Running;
                    }
                    task.started_at = Some(now());
                });
                run(child).await
            }))
            .await
            .unwrap_or_else(|e| Err(Error::from(e)));
            context.children.close();
            context.children.wait().await;
            tasks.update(id, |task| {
                task.finished_at = Some(now());
                match &outcome {
                    Ok(_) => task.state = TaskState::Succeeded,
                    Err(error) if error.code == "interrupted" => task.state = TaskState::Cancelled,
                    Err(error) => {
                        task.state = TaskState::Failed;
                        task.error = Some(error.clone());
                    }
                }
            });
            let _ = send.send(outcome);
            drop(operation);
        });
        Ok(TaskHandle { id, result })
    }
    pub fn analysis_active(&self, tab_id: Uuid) -> bool {
        self.entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .iter()
            .any(|entry| entry.summary.tab_id == Some(tab_id) && !entry.summary.state.is_finished())
    }
    pub fn cancel_analysis(&self, tab_id: Uuid) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for entry in entries.iter_mut().filter(|entry| {
            entry.summary.tab_id == Some(tab_id) && !entry.summary.state.is_finished()
        }) {
            entry.summary.state = TaskState::Cancelling;
            entry.cancellation.cancel();
        }
        self.publish(&mut entries);
    }
    pub fn cancel(&self, id: Uuid) -> Result<TaskSnapshot> {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let entry = entries
            .iter_mut()
            .find(|e| e.summary.id == id)
            .ok_or_else(|| Error::new("task_not_found", "Task is no longer available"))?;
        if !entry.summary.state.is_finished() {
            entry.summary.state = TaskState::Cancelling;
            entry.cancellation.cancel();
            self.publish(&mut entries);
        }
        Ok(self.snapshot())
    }
    pub fn dismiss(&self, id: Uuid) -> Result<TaskSnapshot> {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(entry) = entries.iter().find(|e| e.summary.id == id)
            && !entry.summary.state.is_finished()
        {
            return Err(Error::new(
                "task_active",
                "Finish or cancel the task before dismissing it",
            ));
        }
        entries.retain(|e| e.summary.id != id);
        self.publish(&mut entries);
        Ok(self.snapshot())
    }
    pub fn cancel_all(&self) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for entry in entries
            .iter_mut()
            .filter(|e| !e.summary.state.is_finished())
        {
            entry.summary.state = TaskState::Cancelling;
            entry.cancellation.cancel();
        }
        self.publish(&mut entries);
    }
    pub fn close(&self) {
        self.closed.cancel();
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        entries.clear();
        self.publish(&mut entries);
    }
}
