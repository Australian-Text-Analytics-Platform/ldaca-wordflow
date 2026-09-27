use super::cell_edit::Editor;
use super::*;
use futures_util::FutureExt;
use std::{collections::HashMap, future::Future, sync::Mutex};
use tokio::sync::{Mutex as AsyncMutex, RwLock, watch};
use tokio_util::task::{TaskTracker, task_tracker::TaskTrackerToken};
mod annotation_execution;
pub(super) mod topic_preview;

#[derive(Clone)]
pub struct ProjectRuntime {
    shared: Arc<Shared>,
}
struct Shared {
    project: Mutex<Option<Project>>,
    lifecycle: Arc<RwLock<()>>,
    protection: Arc<protection::Protection>,
    editor: Arc<AsyncMutex<Editor>>,
    active: Mutex<HashMap<Uuid, Arc<Work>>>,
    tracker: TaskTracker,
    operations: Mutex<Admission>,
    shutdown: CancellationToken,
    client: reqwest::Client,
    ai: crate::AiConfiguration,
    portal: Mutex<Option<ldaca_rs::data::Client>>,
    icu_path: Mutex<Option<PathBuf>>,
    icu_cache: Mutex<Option<Arc<crate::icu::Cache>>>,
    language_cache: Mutex<Option<Arc<crate::language_assets::Cache>>>,
    embedding_cache: Mutex<Option<PathBuf>>,
    topic_previews: Mutex<HashMap<Uuid, std::sync::Weak<topic_preview::Preview>>>,
    topic_preview_admission: AsyncMutex<()>,
    tasks: crate::tasks::Tasks,
    changes: changes::Notifications,
}
struct Admission {
    available: Option<CancellationToken>,
    close: Option<watch::Receiver<Option<Result<()>>>>,
}

/// Owns the pause while the host asks whether to close. Dropping a provisional
/// attempt restores admission; a retained final close can never be reopened.
pub struct CloseAttempt {
    runtime: ProjectRuntime,
    admission: CancellationToken,
}
impl CloseAttempt {
    pub fn has_work(&self) -> bool {
        !self.runtime.shared.tracker.is_empty()
    }
    pub async fn interrupt_and_wait(&self) -> Result<()> {
        self.admission.cancel();
        self.runtime.interrupt_and_wait().await
    }
}
impl Drop for CloseAttempt {
    fn drop(&mut self) {
        let mut admission = self
            .runtime
            .shared
            .operations
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if admission.close.is_none() {
            admission.available = Some(if self.admission.is_cancelled() {
                CancellationToken::new()
            } else {
                self.admission.clone()
            });
            self.runtime.shared.tracker.reopen();
        }
    }
}
enum Access {
    Read,
    Write,
    Targets(Vec<ObjectTarget>),
    ExclusiveSql,
    Execute,
}

struct Work {
    cancellation: CancellationToken,
    interrupt: Mutex<Option<Arc<duckdb::InterruptHandle>>>,
}

/// Owns accepted work until all its database and blocking resources are released.
pub struct Operation {
    shared: Arc<Shared>,
    id: Uuid,
    work: Arc<Work>,
    pub cancellation: CancellationToken,
    _tracked: TaskTrackerToken,
    _task: Option<TaskTrackerToken>,
}
impl Drop for Operation {
    fn drop(&mut self) {
        self.shared
            .active
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(&self.id);
    }
}
fn locked<T>(mutex: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    mutex
        .lock()
        .map_err(|_| Error::new("worker_failed", "Project control lock poisoned"))
}
fn interrupted() -> Error {
    Error::new("interrupted", "Operation interrupted")
}
impl ProjectRuntime {
    pub fn new(shutdown: CancellationToken) -> Self {
        Self::with_ai(shutdown, crate::AiConfiguration::session_only())
    }
    pub fn with_ai(shutdown: CancellationToken, ai: crate::AiConfiguration) -> Self {
        Self {
            shared: Arc::new(Shared {
                project: Mutex::new(None),
                lifecycle: Arc::new(RwLock::new(())),
                protection: Arc::new(protection::Protection::default()),
                editor: Arc::new(AsyncMutex::new(Editor::default())),
                active: Mutex::new(HashMap::new()),
                tracker: TaskTracker::new(),
                operations: Mutex::new(Admission {
                    available: Some(CancellationToken::new()),
                    close: None,
                }),
                shutdown,
                client: reqwest::Client::new(),
                ai,
                portal: Mutex::new(None),
                icu_path: Mutex::new(None),
                icu_cache: Mutex::new(None),
                language_cache: Mutex::new(None),
                embedding_cache: Mutex::new(None),
                topic_previews: Mutex::new(HashMap::new()),
                topic_preview_admission: AsyncMutex::new(()),
                tasks: crate::tasks::Tasks::new(),
                changes: changes::Notifications::default(),
            }),
        }
    }
    /// Explicit host override, primarily for offline deployments and tests.
    pub fn set_icu_path(&self, path: PathBuf) -> Result<()> {
        *locked(&self.shared.icu_path)? = Some(path);
        Ok(())
    }
    /// Configures optional resource storage without creating files or downloading assets.
    pub fn set_icu_cache_directory(&self, directory: PathBuf) -> Result<()> {
        *locked(&self.shared.icu_cache)? = Some(Arc::new(crate::icu::Cache::new(directory)));
        Ok(())
    }
    pub fn set_language_cache_directory(&self, directory: PathBuf) -> Result<()> {
        *locked(&self.shared.language_cache)? =
            Some(Arc::new(crate::language_assets::Cache::new(directory)));
        Ok(())
    }
    pub(crate) async fn language_asset(&self, name: &str) -> Result<Vec<u8>> {
        let cache = locked(&self.shared.language_cache)?
            .clone()
            .ok_or_else(|| {
                Error::new(
                    "asset_unavailable",
                    "The host has not configured language support storage",
                )
            })?;
        cache.read(&self.shared.client, name).await
    }
    async fn load_icu(&self) -> Result<()> {
        let operation = self.operation()?;
        let fixed = locked(&self.shared.icu_path)?.clone();
        let path = if let Some(path) = fixed {
            path
        } else {
            let cache = locked(&self.shared.icu_cache)?.clone().ok_or_else(|| {
                Error::new(
                    "icu_unavailable",
                    "The host has not configured a timezone extension cache",
                )
            })?;
            let (version, platform) = self
                .with_project(|p| {
                    let version: String = p.conn.query_row("SELECT version()", [], |r| r.get(0))?;
                    let platform: String = p.conn.query_row("PRAGMA platform", [], |r| r.get(0))?;
                    Ok((version, platform))
                })
                .await?;
            tokio::select! {
                result = cache.resolve(&self.shared.client, version, platform) => result?,
                () = operation.cancellation.cancelled() => return Err(interrupted()),
            }
        };
        self.with_project(move |p| {
            let path = path
                .to_str()
                .ok_or_else(|| Error::invalid("Invalid ICU asset path"))?;
            p.conn
                .execute_batch(&format!("LOAD '{}'", path.replace('\'', "''")))?;
            Ok(())
        })
        .await
    }
    pub(crate) async fn plot_timezones(&self) -> Result<Vec<String>> {
        self.load_icu().await?;
        self.with_project(|p| {
            Ok(p.conn
                .prepare("SELECT name FROM pg_timezone_names() ORDER BY name")?
                .query_map([], |r| r.get(0))?
                .collect::<duckdb::Result<Vec<_>>>()?)
        })
        .await
    }
    pub(crate) fn ai(&self) -> &crate::AiConfiguration {
        &self.shared.ai
    }
    pub fn client(&self) -> &reqwest::Client {
        &self.shared.client
    }
    pub(crate) fn portal_client(&self, token: Option<&str>) -> Result<ldaca_rs::data::Client> {
        let mut portal = self
            .shared
            .portal
            .lock()
            .map_err(|_| Error::new("worker_failed", "Portal client lock poisoned"))?;
        if portal.is_none() {
            *portal = Some(
                ldaca_rs::data::Client::new(None, ldaca_rs::data::ClientOptions::default())
                    .map_err(|e| Error::new("portal_error", e.to_string()))?,
            );
        }
        portal
            .as_ref()
            .ok_or_else(|| Error::new("worker_failed", "Portal client unavailable"))?
            .with_api_key(token)
            .map_err(|e| Error::new("portal_error", e.to_string()))
    }
    pub fn submit_task<T: Send + 'static, F: Future<Output = Result<T>> + Send + 'static>(
        &self,
        label: impl Into<String>,

        run: impl FnOnce(crate::TaskContext) -> F + Send + 'static,
    ) -> Result<crate::TaskHandle<T>> {
        self.shared
            .tasks
            .submit(self.operation()?, label.into(), run)
    }
    pub fn tasks(&self) -> crate::TaskSnapshot {
        self.shared.tasks.snapshot()
    }
    pub fn cancel_task(&self, id: Uuid) -> Result<crate::TaskSnapshot> {
        self.shared.tasks.cancel(id)
    }
    pub fn dismiss_task(&self, id: Uuid) -> Result<crate::TaskSnapshot> {
        self.shared.tasks.dismiss(id)
    }
    pub(crate) fn task_events(&self) -> (watch::Receiver<crate::TaskSnapshot>, CancellationToken) {
        (self.shared.tasks.subscribe(), self.shared.tasks.shutdown())
    }
    pub(crate) fn changes(&self) -> tokio::sync::broadcast::Receiver<ChangeScope> {
        self.shared.changes.subscribe()
    }
    pub fn operation(&self) -> Result<Operation> {
        let token = locked(&self.shared.operations)?;
        let scope = crate::tasks::current();
        if let Some(task) = &scope {
            task.check_cancelled()?;
        }
        self.shared.check(&token, scope.is_some())?;
        let cancellation = if let Some(task) = &scope {
            task.cancellation().child_token()
        } else {
            token
                .available
                .as_ref()
                .ok_or_else(|| Error::new("project_busy", "Project is closing"))?
                .child_token()
        };
        if cancellation.is_cancelled() {
            return Err(interrupted());
        }
        let id = Uuid::new_v4();
        let work = Arc::new(Work {
            cancellation: cancellation.clone(),
            interrupt: Mutex::new(None),
        });
        locked(&self.shared.active)?.insert(id, work.clone());
        Ok(Operation {
            shared: self.shared.clone(),
            id,
            work,
            cancellation,
            _tracked: self.shared.tracker.token(),
            _task: scope.map(|s| s.track()),
        })
    }
    pub fn begin_close(&self) -> Result<CloseAttempt> {
        let mut control = locked(&self.shared.operations)?;
        self.shared.check(&control, false)?;
        let admission = control
            .available
            .take()
            .ok_or_else(|| Error::new("project_busy", "Project is closing"))?;
        Ok(CloseAttempt {
            runtime: self.clone(),
            admission,
        })
    }
    async fn interrupt_and_wait(&self) -> Result<()> {
        for preview in locked(&self.shared.topic_previews)?
            .values()
            .filter_map(std::sync::Weak::upgrade)
        {
            preview.cancellation.cancel();
        }
        self.shared.tasks.cancel_all();
        for work in locked(&self.shared.active)?.values() {
            work.cancellation.cancel();
        }
        self.shared.tracker.close();
        self.shared.tracker.wait().await;
        Ok(())
    }
    /// Detach accepted execution from its HTTP receiver, including waiting for lifecycle leases.
    async fn own<T: Send + 'static>(
        operation: Operation,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T> {
        tokio::spawn(async move {
            let work = operation.work.clone();
            let done = CancellationToken::new();
            let finished = done.clone();
            let monitor = tokio::spawn(async move {
                tokio::select! {
                    () = work.cancellation.cancelled() => {},
                    () = finished.cancelled() => return,
                }
                loop {
                    if let Some(handle) = work
                        .interrupt
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner)
                        .as_ref()
                    {
                        handle.interrupt();
                    }
                    tokio::select! {
                        () = finished.cancelled() => return,
                        () = tokio::time::sleep(std::time::Duration::from_millis(25)) => {},
                    }
                }
            });
            let result = tokio::spawn(future)
                .await
                .unwrap_or_else(|error| Err(Error::from(error)));
            done.cancel();
            let _ = monitor.await;
            drop(operation);
            result
        })
        .await?
    }
    async fn run<T: Send + 'static>(
        &self,
        access: Access,
        f: impl FnOnce(&mut Database, bool) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        self.run_operation(self.operation()?, access, f).await
    }
    async fn run_operation<T: Send + 'static>(
        &self,
        operation: Operation,
        access: Access,
        f: impl FnOnce(&mut Database, bool) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let work = operation.work.clone();
        let shared = self.shared.clone();
        Self::own(operation, async move {
            let lifecycle = tokio::select! {
                guard = shared.lifecycle.clone().read_owned() => guard,
                () = work.cancellation.cancelled() => return Err(interrupted()),
            };
            let writer = match access {
                Access::Read => None,
                Access::Write => Some(shared.protection.mutation(Some(vec![]))?),
                Access::Targets(targets) => Some(shared.protection.mutation(Some(targets))?),
                Access::ExclusiveSql => Some(shared.protection.mutation(None)?),
                Access::Execute => shared.protection.mutation(None).ok(),
            };
            let read_only = writer.is_none();
            tokio::task::spawn_blocking(move || {
                let _lifecycle = lifecycle;
                let _writer = writer;
                if work.cancellation.is_cancelled() {
                    return Err(interrupted());
                }
                let mut database = locked(&shared.project)?
                    .as_ref()
                    .ok_or_else(|| Error::new("project_closed", "Open a project first"))?
                    .database
                    .connection(work.cancellation.clone())?;
                *locked(&work.interrupt)? = Some(database.conn.interrupt_handle());
                f(&mut database, read_only).map_err(|error| {
                    if work.cancellation.is_cancelled()
                        && error.code == "sql_error"
                        && error.message.to_ascii_lowercase().contains("interrupt")
                    {
                        Error {
                            statement_index: error.statement_index,
                            ..interrupted()
                        }
                    } else {
                        error
                    }
                })
            })
            .await?
        })
        .await
    }
    async fn with_project<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Database) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        self.run(Access::Read, move |p, _| f(p)).await
    }
    async fn with_writable_project<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Database) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        self.run(Access::Write, move |p, _| f(p)).await
    }
    async fn with_mutation<T: Send + 'static>(
        &self,
        target: ObjectTarget,
        f: impl FnOnce(&mut Database) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        self.run(Access::Targets(vec![target]), move |p, _| f(p))
            .await
    }
    pub(crate) async fn ensure_writable(&self) -> Result<()> {
        self.shared.check(
            &*locked(&self.shared.operations)?,
            crate::tasks::current().is_some(),
        )?;
        if locked(&self.shared.project)?.is_none() {
            return Err(Error::new("project_closed", "Open a project first"));
        }
        Ok(())
    }
    pub async fn is_editing(&self) -> bool {
        // Startup and accepted editor work retain this lock. Inspect ownership without
        // waiting for a query or Save to finish.
        self.shared
            .editor
            .try_lock()
            .map_or(true, |editor| !editor.sessions.is_empty())
            || self.shared.protection.is_editing()
    }
    pub async fn discard_cell_edit(&self) -> Result<()> {
        let shared = self.shared.clone();
        // Begin owns this lock before waiting for admitted writes; cleanup cannot overtake it.
        let mut editor = shared.editor.clone().lock_owned().await;
        let lease = shared.lifecycle.clone().read_owned().await;
        tokio::task::spawn_blocking(move || {
            let _lease = lease;
            editor.sessions.clear();
        })
        .await?;
        Ok(())
    }
    pub(crate) async fn begin_cell_edit(
        &self,
        name: impl Into<ObjectTarget> + Send,
    ) -> Result<cell_edit::SessionInfo> {
        self.begin_editor(name.into(), None).await
    }
    pub(crate) async fn begin_annotation_edit(
        &self,
        tab: Uuid,
        request: annotation::EditRequest,
    ) -> Result<cell_edit::SessionInfo> {
        self.begin_editor(request.target().clone(), Some((tab, request)))
            .await
    }
    pub(crate) async fn create_codebook(&self, name: String) -> Result<annotation::Codebook> {
        self.with_writable_project(move |p| p.create_codebook(name))
            .await
    }
    pub(crate) async fn annotation_codebook(
        &self,
        request: annotation::Codebook,
    ) -> Result<Vec<annotation::Code>> {
        self.with_project(move |p| annotation::read_codebook(&p.conn, &request))
            .await
    }
    async fn begin_editor(
        &self,
        name: ObjectTarget,
        annotation: Option<(Uuid, annotation::EditRequest)>,
    ) -> Result<cell_edit::SessionInfo> {
        let operation = self.operation()?;
        let shared = self.shared.clone();
        let work = operation.work.clone();
        let protection = shared.protection.editing(name.clone())?;
        let mut pending = Box::pin(shared.editor.clone().lock_owned());
        let ready = pending.as_mut().now_or_never();
        Self::own(operation, async move {
            let mut editor = if let Some(guard) = ready {
                guard
            } else {
                pending.await
            };
            let lease = shared.lifecycle.clone().read_owned().await;
            protection.ready(&work.cancellation).await?;
            tokio::task::spawn_blocking(move || {
                let _lease = lease;
                check_cancellation(&work.cancellation)?;
                let mut database = locked(&shared.project)?
                    .as_ref()
                    .ok_or_else(|| Error::new("project_closed", "Open a project first"))?
                    .database
                    .connection(work.cancellation.clone())?;
                if let Some((tab, _)) = &annotation
                    && database.analysis_tab(*tab)?.kind != "annotation"
                {
                    return Err(Error::invalid("This is not an Annotation tab"));
                }
                let info = editor.begin_cell_edit(
                    &database.conn,
                    &name,
                    protection,
                    |reader| {
                        *work
                            .interrupt
                            .lock()
                            .unwrap_or_else(std::sync::PoisonError::into_inner) =
                            Some(reader.interrupt_handle());
                    },
                    &shared.changes,
                    annotation
                        .as_ref()
                        .and_then(|(_, request)| request.expected()),
                )?;
                if let Some((tab, request)) = annotation {
                    let configured = editor
                        .restrict_annotation(&info.session_id, request.clone())
                        .and_then(|info| {
                            if let annotation::EditRequest::Manual { setup } = request {
                                database.save_manual_setup(tab, &setup)?;
                            }
                            Ok(info)
                        });
                    if configured.is_err() {
                        editor.sessions.remove(&info.session_id);
                    }
                    configured
                } else {
                    Ok(info)
                }
            })
            .await?
        })
        .await
    }
    async fn with_editor<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Editor, &Work) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let operation = self.operation()?;
        let shared = self.shared.clone();
        let work = operation.work.clone();
        // Reserve our place before detaching, so teardown awaits already accepted Saves.
        let mut pending = Box::pin(shared.editor.clone().lock_owned());
        let ready = pending.as_mut().now_or_never();
        Self::own(operation, async move {
            let mut editor = if let Some(guard) = ready {
                guard
            } else {
                pending.await
            };
            let lease = shared.lifecycle.clone().read_owned().await;
            tokio::task::spawn_blocking(move || {
                let _lease = lease;
                f(&mut editor, &work)
            })
            .await?
        })
        .await
    }
    pub(crate) async fn cell_edit_page(
        &self,
        id: String,
        page: cell_edit::Page,
    ) -> Result<tempfile::NamedTempFile> {
        let shared = self.shared.clone();
        self.with_editor(move |p, work| {
            if let Ok(session) = p.editing(&id) {
                *locked(&work.interrupt)? = Some(session.conn.interrupt_handle());
            }
            let live = locked(&shared.project)?
                .as_ref()
                .ok_or_else(|| Error::new("project_closed", "Open a project first"))?
                .database
                .conn
                .try_clone()?;
            p.cell_edit_page(&id, page, Some(&live))
        })
        .await
    }
    pub(crate) async fn save_cell_edit(
        &self,
        id: String,
        input: cell_edit::Save,
    ) -> Result<cell_edit::Completion> {
        let shared = self.shared.clone();
        self.with_editor(move |editor, _| {
            editor.save_cell_edit(
                || {
                    Ok(locked(&shared.project)?
                        .as_ref()
                        .ok_or_else(|| Error::new("project_closed", "Open a project first"))?
                        .database
                        .conn
                        .try_clone()?)
                },
                &id,
                input,
                &shared.changes,
            )
        })
        .await
    }
    pub(crate) async fn cancel_cell_edit(&self, id: String) -> Result<cell_edit::Completion> {
        self.with_editor(move |p, _| p.cancel_cell_edit(&id)).await
    }
    pub async fn create(&self, path: Option<PathBuf>) -> Result<ProjectInfo> {
        self.initialize(path, true).await
    }
    /// Inspect an uploaded project without opening it for writes or evaluating Views.
    pub async fn validate_file(path: PathBuf) -> Result<()> {
        tokio::task::spawn_blocking(move || {
            let config = duckdb::Config::default().access_mode(duckdb::AccessMode::ReadOnly)?;
            let reader = duckdb::Connection::open_with_flags(path, config)?;
            super::validate_project(&reader)?;
            reader.close().map_err(|(_, error)| Error::from(error))
        })
        .await?
    }
    /// Download a checkpointed copy without changing this runtime's project identity.
    pub async fn snapshot(&self) -> Result<tempfile::NamedTempFile> {
        let operation = self.operation()?;
        let shared = self.shared.clone();
        Self::own(operation, async move {
            let editor = shared
                .editor
                .clone()
                .try_lock_owned()
                .map_err(|_| cell_edit::editing_active())?;
            if !editor.sessions.is_empty() || shared.protection.is_editing() {
                return Err(cell_edit::editing_active());
            }
            let lease = shared.lifecycle.clone().write_owned().await;
            tokio::task::spawn_blocking(move || {
                let (_lease, _editor) = (lease, editor);
                let state = locked(&shared.project)?;
                let project = state
                    .as_ref()
                    .ok_or_else(|| Error::new("project_closed", "Open a project first"))?;
                project.database.conn.execute_batch("CHECKPOINT")?;
                let file = tempfile::NamedTempFile::new()?;
                std::fs::copy(&project.path, file.path())?;
                Ok(file)
            })
            .await?
        })
        .await
    }
    pub async fn open(&self, path: PathBuf) -> Result<ProjectInfo> {
        self.initialize(Some(path), false).await
    }
    async fn initialize(&self, path: Option<PathBuf>, create: bool) -> Result<ProjectInfo> {
        let operation = self.operation()?;
        let shared = self.shared.clone();
        let cancellation = operation.cancellation.clone();
        Self::own(operation, async move {
            let lease = shared.lifecycle.clone().write_owned().await;
            tokio::task::spawn_blocking(move || {
                let _lease = lease;
                let mut state = locked(&shared.project)?;
                if state.is_some() {
                    return Err(Error::new(
                        "project_busy",
                        "This backend already owns a project",
                    ));
                }
                let mut project = match (path, create) {
                    (Some(p), true) => Project::create(&p)?,
                    (Some(p), false) => Project::open(&p)?,
                    (None, _) => Project::untitled()?,
                };
                if cancellation.is_cancelled() {
                    return Err(interrupted());
                }
                project.database.changes = shared.changes.clone();
                let info = project.info();
                *state = Some(project);
                Ok(info)
            })
            .await?
        })
        .await
    }
    pub async fn save(&self, path: Option<PathBuf>) -> Result<ProjectInfo> {
        let shared = self.shared.clone();
        // Host saving is allowed while Close has paused ordinary admission.
        tokio::spawn(async move {
            let editor = shared
                .editor
                .clone()
                .try_lock_owned()
                .map_err(|_| cell_edit::editing_active())?;
            if !editor.sessions.is_empty() || shared.protection.is_editing() {
                return Err(cell_edit::editing_active());
            }
            let lease = shared.lifecycle.clone().write_owned().await;
            tokio::task::spawn_blocking(move || {
                let _lease = lease;
                let _editor = editor;
                if locked(&shared.operations)?.close.is_some() {
                    return Err(Error::new("project_closed", "Project is closed"));
                }
                let mut state = locked(&shared.project)?;
                let project = state
                    .as_mut()
                    .ok_or_else(|| Error::new("project_closed", "Open a project first"))?;
                if let Some(path) = path {
                    project.save_as(&path)
                } else {
                    if project.temporary.is_some() {
                        return Err(Error::invalid(
                            "Choose a destination for this Untitled project",
                        ));
                    }
                    project.database.conn.execute_batch("CHECKPOINT")?;
                    Ok(project.info())
                }
            })
            .await?
        })
        .await?
    }
    pub async fn status(&self) -> Result<Option<ProjectInfo>> {
        let shared = self.shared.clone();
        tokio::task::spawn_blocking(move || {
            Ok(locked(&shared.project)?.as_ref().map(Project::info))
        })
        .await?
    }
    pub(crate) async fn change_column(
        &self,
        target: ObjectTarget,
        change: mutations::ColumnChange,
    ) -> Result<()> {
        self.with_mutation(target.clone(), move |p| p.change_column(target, change))
            .await
    }
    pub(crate) async fn create_view(&self, request: mutations::CreateView) -> Result<String> {
        self.with_writable_project(move |p| p.create_view(request))
            .await
    }
    pub(crate) async fn read_stopwords(
        &self,
        selected: stopwords::StopwordSource,
    ) -> Result<Vec<String>> {
        self.with_project(move |p| p.read_stopwords(selected)).await
    }
    pub(crate) async fn writable_stopwords(
        &self,
        request: stopwords::PrepareStopwords,
    ) -> Result<stopwords::StopwordSource> {
        self.with_writable_project(move |p| p.writable_stopwords(request))
            .await
    }
    pub(crate) async fn save_stopwords(&self, request: stopwords::SaveStopwords) -> Result<()> {
        self.with_mutation(request.selected.source.clone(), move |p| {
            p.save_stopwords(request)
        })
        .await
    }
    pub(crate) async fn rename_node(
        &self,
        id: impl Into<ObjectTarget> + Send,
        name: String,
    ) -> Result<String> {
        let id = id.into();
        self.with_mutation(id.clone(), move |p| p.rename_node(&id, &name))
            .await
    }
    pub(crate) async fn clone_node(&self, id: impl Into<ObjectTarget> + Send) -> Result<String> {
        let id = id.into();
        self.with_writable_project(move |p| p.clone_node(&id)).await
    }
    pub(crate) async fn node_page(
        &self,
        name: impl Into<ObjectTarget> + Send,
        page: Option<node_reads::Page>,
    ) -> Result<tempfile::NamedTempFile> {
        let name = name.into();
        self.with_project(move |p| p.node_page(&name, page)).await
    }
    /// Export the full node directly into caller-owned staging; the host owns final installation.
    pub async fn export_node_into(
        &self,
        name: impl Into<ObjectTarget> + Send,
        format: ExportFormat,
        file: tempfile::NamedTempFile,
    ) -> Result<tempfile::NamedTempFile> {
        self.export_into(
            exports::ExportRequest::Files {
                objects: vec![name.into()],
                format,
            },
            file,
        )
        .await
    }
    pub async fn inspect_export(
        &self,
        request: exports::ExportRequest,
    ) -> Result<exports::ExportInspection> {
        self.with_project(move |p| p.inspect_export(&request)).await
    }
    /// Generate captured output directly into host-owned staging. The host owns installation.
    pub async fn export_into(
        &self,
        request: exports::ExportRequest,
        file: tempfile::NamedTempFile,
    ) -> Result<tempfile::NamedTempFile> {
        let progress = crate::tasks::current();
        self.with_project(move |p| p.write_export(&request, file, progress.as_ref()))
            .await
    }
    pub(crate) async fn edit_with_statements(
        &self,
        id: impl Into<ObjectTarget> + Send,
        sql: String,
        before: Vec<SqlStatement>,
        after: Vec<SqlStatement>,
    ) -> Result<()> {
        let id = id.into();
        self.run(Access::ExclusiveSql, move |p, _| {
            p.edit_batch(&id, &sql, &before, &after)
        })
        .await
    }
    pub(crate) async fn delete_node(&self, id: impl Into<ObjectTarget> + Send) -> Result<()> {
        let id = id.into();
        self.with_mutation(id.clone(), move |project| project.delete_node(&id))
            .await
    }
    pub(crate) async fn parse_expression(
        &self,
        expression: String,
    ) -> Result<crate::expressions::Expression> {
        self.with_project(move |p| {
            p.conn.execute_batch("BEGIN TRANSACTION READ ONLY")?;
            let result = crate::expressions::parse(&p.conn, &expression)?;
            p.conn.execute_batch("COMMIT")?;
            Ok(result)
        })
        .await
    }
    pub(crate) async fn sql(&self, batch: SqlBatch) -> Result<SqlOutput> {
        let access = match batch.mode {
            SqlMode::Execute => Access::Execute,
            SqlMode::Read | SqlMode::Preview => Access::Read,
        };
        self.run(access, move |p, read_only| {
            p.sql_with_permission(batch, read_only)
        })
        .await
    }

    pub(crate) async fn tabs(&self, kind: Option<String>) -> Result<Vec<Tab>> {
        self.with_project(move |p| p.tabs(kind.as_deref())).await
    }
    pub(crate) async fn create_analysis_tab(&self, input: CreateTab) -> Result<Tab> {
        self.with_writable_project(move |p| p.create_analysis_tab(input))
            .await
    }
    pub(crate) async fn update_analysis_tab(&self, id: Uuid, input: UpdateTab) -> Result<Tab> {
        self.with_writable_project(move |p| p.update_analysis_tab(id, input))
            .await
    }
    pub(crate) async fn reorder_tabs(&self, kind: String, ids: Vec<Uuid>) -> Result<Vec<Tab>> {
        self.with_writable_project(move |p| p.reorder_tabs(&kind, ids))
            .await
    }
    pub(crate) async fn delete_analysis_tab(&self, id: Uuid) -> Result<()> {
        let tasks = self.shared.tasks.clone();
        self.with_writable_project(move |p| {
            p.delete_analysis_tab(id)?;
            tasks.cancel_analysis(id);
            Ok(())
        })
        .await?;
        self.cancel_topic_preview(id)?;
        Ok(())
    }
    pub(crate) async fn clear_analysis_tab(&self, id: Uuid) -> Result<()> {
        if self.shared.tasks.analysis_active(id) {
            return Err(Error::new(
                "analysis_busy",
                "Cancel the running analysis before clearing its result",
            ));
        }
        self.with_writable_project(move |p| p.clear_analysis_tab(id))
            .await?;
        self.cancel_topic_preview(id)?;
        Ok(())
    }
    pub(crate) async fn analysis(&self, id: Uuid) -> Result<Analysis> {
        self.with_project(move |p| p.analysis(id)).await
    }
    pub(crate) async fn quotation_preview(
        &self,
        tab: Uuid,
        input: QuotationPreview,
    ) -> Result<DocumentPage> {
        self.ensure_writable().await?;
        document_matches::page_offset(input.page, input.page_size)?;
        let selected = input.input.clone();
        self.with_project(move |p| p.validate_quotation_input(tab, &selected))
            .await?;
        let operation = self.operation()?;
        let cancellation = operation.cancellation.clone();
        let _cancel_on_drop = cancellation.clone().drop_guard();
        let runtime = self.clone();
        tokio::spawn(async move {
            let extractor =
                quotation::prepare_extractor(runtime.shared.client.clone(), cancellation.clone())
                    .await?;
            check_cancellation(&cancellation)?;
            runtime
                .run_operation(operation, Access::Write, move |database, _| {
                    database.quotation_preview(tab, input, extractor)
                })
                .await
        })
        .await?
    }
    pub(crate) async fn submit_plot(
        &self,
        tab_id: Uuid,
        mode: PlotMode,
        input: PlotRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        let tab = self.with_project(move |p| p.analysis_tab(tab_id)).await?;
        if tab.kind != mode.kind() {
            return Err(Error::invalid("Select the matching plot tab"));
        }
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Plot: {}", tab.name),
            Some(tab_id),
            move |context| async move {
                let submitted = serde_json::to_value(&input)?;
                let id = runtime
                    .with_writable_project(move |p| {
                        p.begin_analysis_run(tab_id, mode.kind(), submitted)
                    })
                    .await?;
                context.check_cancelled()?;
                if matches!(&input, PlotRequest::Trends(r) if matches!(r.interval,Interval::Time{..})) {
                    context.progress("Preparing timezone support", None);
                    tokio::select! {
                        result = runtime.load_icu() => result?,
                        () = context.cancellation().cancelled() => return Err(interrupted()),
                    }
                }
                runtime
                    .with_writable_project(move |p| {
                        p.run_plot(tab_id, id, mode, input, |message| {
                            context.progress(message, None)
                        })
                    })
                    .await
            },
        )
    }
    async fn load_plot_icu(&self, id: Uuid, mode: PlotMode) -> Result<()> {
        if mode == PlotMode::Trends {
            let time=self.with_project(move |p| Ok(matches!(PlotRequest::decode(mode,p.analysis(id)?.request)?,PlotRequest::Trends(r) if matches!(r.interval,Interval::Time{..})))).await?;
            if time {
                self.load_icu().await?;
            }
        }
        Ok(())
    }
    pub(crate) async fn plot_page(
        &self,
        id: Uuid,
        mode: PlotMode,
        input: PlotQuery,
    ) -> Result<tempfile::NamedTempFile> {
        self.load_plot_icu(id, mode).await?;
        self.with_project(move |p| p.plot_page(id, mode, input))
            .await
    }
    pub(crate) async fn submit_plot_publication(
        &self,
        id: Uuid,
        mode: PlotMode,
        input: PlotPublish,
    ) -> Result<crate::TaskHandle<ObjectTarget>> {
        self.ensure_writable().await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            "Add plot rows to project".into(),
            None,
            move |context| async move {
                context.progress("Creating Data Block", None);
                runtime.load_plot_icu(id, mode).await?;
                runtime
                    .with_writable_project(move |p| p.publish_plot(id, mode, input))
                    .await
            },
        )
    }
    pub(crate) async fn quotation_page(
        &self,
        id: Uuid,
        input: QuotationQuery,
    ) -> Result<DocumentPage> {
        self.with_project(move |p| p.quotation_page(id, input))
            .await
    }
    pub(crate) async fn submit_quotation(
        &self,
        tab_id: Uuid,
        input: QuotationRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        let tab = self.with_project(move |p| p.analysis_tab(tab_id)).await?;
        if tab.kind != "quotation" {
            return Err(Error::invalid("Select a Quotation tab"));
        }
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Quotation: {}", tab.name),
            Some(tab_id),
            move |context| async move {
                let submitted = serde_json::to_value(&input)?;
                let analysis_id = runtime
                    .with_writable_project(move |p| {
                        p.begin_analysis_run(tab_id, "quotation", submitted)
                    })
                    .await?;
                let selected = input.input.clone();
                runtime
                    .with_project(move |p| p.validate_quotation_input(tab_id, &selected))
                    .await?;
                context.progress("Loading quotation model", None);
                let extractor = quotation::prepare_extractor(
                    runtime.shared.client.clone(),
                    context.cancellation().clone(),
                )
                .await?;
                context.check_cancelled()?;
                runtime
                    .with_writable_project(move |p| {
                        p.run_quotation(tab_id, analysis_id, input, extractor, |message| {
                            context.progress(message, None)
                        })
                    })
                    .await
            },
        )
    }
    pub(crate) async fn submit_quotation_publication(
        &self,
        id: Uuid,
        input: QuotationPublish,
    ) -> Result<crate::TaskHandle<ObjectTarget>> {
        self.ensure_writable().await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            "Add Quotation results to project".into(),
            None,
            move |context| async move {
                context.progress("Creating Data Block", None);
                runtime
                    .with_writable_project(move |p| p.publish_quotation(id, input))
                    .await
            },
        )
    }
    pub(crate) async fn concordance_preview(
        &self,
        tab: Uuid,
        input: ConcordancePreview,
    ) -> Result<DocumentPage> {
        self.ensure_writable().await?;
        let operation = self.operation()?;
        // Unlike accepted tasks, a Preview belongs to its request. Cleanup stays runtime-owned.
        let cancellation = operation.cancellation.clone();
        let _cancel_on_drop = cancellation.clone().drop_guard();
        let runtime = self.clone();
        tokio::spawn(async move {
            let search = input.search.clone();
            let source = input.input.clone();
            let matcher =
                tokio::task::spawn_blocking(move || DocumentMatcher::prepare(&search, &source))
                    .await??;
            check_cancellation(&cancellation)?;
            runtime
                .run_operation(operation, Access::Write, move |database, _| {
                    database.concordance_preview(tab, input, matcher)
                })
                .await
        })
        .await?
    }
    pub(crate) async fn concordance_page(
        &self,
        id: Uuid,
        input: ConcordanceQuery,
    ) -> Result<DocumentPage> {
        self.with_project(move |p| p.concordance_page(id, input))
            .await
    }
    pub(crate) async fn concordance_density(
        &self,
        id: Uuid,
        input: ConcordanceDensity,
    ) -> Result<tempfile::NamedTempFile> {
        self.with_project(move |p| p.concordance_density(id, input))
            .await
    }
    pub(crate) async fn submit_concordance_publication(
        &self,
        id: Uuid,
        input: ConcordancePublish,
    ) -> Result<crate::TaskHandle<Vec<ObjectTarget>>> {
        self.ensure_writable().await?;
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            "Add Concordance results to project".into(),
            None,
            move |context| async move {
                context.progress("Creating Data Blocks", None);
                runtime
                    .with_writable_project(move |p| p.publish_concordance(id, input))
                    .await
            },
        )
    }
    pub(crate) async fn submit_concordance(
        &self,
        tab_id: Uuid,
        input: ConcordanceRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        let tab = self.with_project(move |p| p.analysis_tab(tab_id)).await?;
        if tab.kind != "concordance" || !(1..=2).contains(&input.inputs.len()) {
            return Err(Error::invalid(
                "Select a Concordance tab and one or two inputs",
            ));
        }
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Concordance: {}", tab.name),
            Some(tab_id),
            move |context| async move {
                let submitted = serde_json::to_value(&input)?;
                let analysis_id = runtime
                    .with_writable_project(move |p| {
                        p.begin_analysis_run(tab_id, "concordance", submitted)
                    })
                    .await?;
                context.progress("Preparing search", None);
                let request = input.clone();
                let matchers = context
                    .run_blocking(move |context| {
                        request
                            .inputs
                            .iter()
                            .map(|input| {
                                context.check_cancelled()?;
                                DocumentMatcher::prepare(&request.search, input)
                            })
                            .collect::<Result<Vec<_>>>()
                    })
                    .await?;
                context.check_cancelled()?;
                runtime
                    .with_writable_project(move |p| {
                        p.run_concordance(tab_id, analysis_id, input, matchers, |message| {
                            context.progress(message, None)
                        })
                    })
                    .await
            },
        )
    }
    pub(crate) async fn submit_frequency(
        &self,
        tab_id: Uuid,
        input: FrequencyRequest,
    ) -> Result<crate::TaskHandle<Analysis>> {
        self.ensure_writable().await?;
        let tab = self.with_project(move |p| p.analysis_tab(tab_id)).await?;
        if tab.kind != "frequency" {
            return Err(Error::invalid("Analysis tab is not a Frequency tab"));
        }
        if !(1..=2).contains(&input.inputs.len()) {
            return Err(Error::invalid("Select one or two corpora"));
        }
        let runtime = self.clone();
        self.shared.tasks.submit_owned(
            self.operation()?,
            format!("Frequency: {}", tab.name),
            Some(tab_id),
            move |context| async move {
                let submitted = serde_json::to_value(&input)?;
                let analysis_id = runtime
                    .with_writable_project(move |p| {
                        p.begin_analysis_run(tab_id, "frequency", submitted)
                    })
                    .await?;
                context.progress("Loading tokenizer", None);
                let models: Vec<_> = input
                    .inputs
                    .iter()
                    .map(|input| input.tokenizer.clone())
                    .collect();
                let tokenizers = context
                    .run_blocking(move |context| {
                        models
                            .iter()
                            .map(|model| {
                                context.check_cancelled()?;
                                ldaca_rs::text::Tokenizer::load(model).map_err(|error| {
                                    Error::new("tokenizer_error", error.to_string())
                                })
                            })
                            .collect::<Result<Vec<_>>>()
                    })
                    .await?;
                context.check_cancelled()?;
                runtime
                    .with_writable_project(move |p| {
                        p.run_frequency(tab_id, analysis_id, input, tokenizers, |message| {
                            context.progress(message, None)
                        })
                    })
                    .await
            },
        )
    }
    pub(crate) async fn frequency_page(
        &self,
        id: Uuid,
        query: FrequencyQuery,
    ) -> Result<FrequencyPage> {
        self.with_project(move |p| p.frequency_page(id, query))
            .await
    }
    /// Write a saved result directly into host-owned staging, retaining it through database cleanup.
    pub async fn export_frequency_into(
        &self,
        id: Uuid,
        query: FrequencyQuery,
        format: FrequencyExportFormat,
        file: tempfile::NamedTempFile,
    ) -> Result<tempfile::NamedTempFile> {
        self.with_project(move |p| {
            p.export_frequency_into(id, query, format, file.path())?;
            Ok(file)
        })
        .await
    }
    pub(crate) async fn frequency_export_parts(
        &self,
        id: Uuid,
        query: FrequencyQuery,
        format: FrequencyExportFormat,
    ) -> Result<(tempfile::NamedTempFile, String)> {
        self.with_project(move |p| {
            use std::io::Write;
            let table = tempfile::NamedTempFile::new()?;
            let words = tempfile::NamedTempFile::new()?;
            p.export_frequency_parts(id, query, format, table.path(), Some(words.path()))?;
            let boundary = format!("wordflow-{}", Uuid::new_v4().simple());
            let mut output = tempfile::NamedTempFile::new()?;
            for (name, extension, file) in [("table", format.extension(), table), ("stopwords", "txt", words)] {
                write!(output, "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{name}.{extension}\"\r\nContent-Type: application/octet-stream\r\n\r\n")?;
                std::io::copy(&mut std::fs::File::open(file.path())?, &mut output)?;
                write!(output, "\r\n")?;
            }
            write!(output, "--{boundary}--\r\n")?;
            Ok((output, format!("multipart/form-data; boundary={boundary}")))
        }).await
    }
    pub(crate) async fn import_tables(
        &self,
        sources: Vec<(String, SqlStatement)>,
    ) -> Result<Vec<String>> {
        self.with_writable_project(move |project| project.import_tables(sources))
            .await
    }
    pub(crate) async fn import_samples(
        &self,
        files: Vec<(String, String)>,
        as_views: bool,
    ) -> Result<Vec<String>> {
        self.with_writable_project(move |project| {
            // DuckDB autoloads its signed httpfs extension on the first remote scan.
            // Every selected object and its registration commit together.
            let kind = if as_views { "VIEW" } else { "TABLE" };
            let tx = project.conn.transaction()?;
            let mut statements = Vec::new();
            let mut reserved = Vec::new();
            for (name, url) in files {
                let object = unique_object_name(&tx, "data", &name, true, &reserved)?;
                reserved.push(object.clone());
                statements.push(SqlStatement {
                    sql: format!(
                        "CREATE {kind} data.{} AS SELECT * FROM read_parquet('{}')",
                        query::quote(&object),
                        url.replace('\'', "''")
                    ),
                    parameters: vec![],
                });
                statements.push(SqlStatement {
                    sql: "INSERT INTO wordflow.nodes(table_name) VALUES (?)".into(),
                    parameters: vec![serde_json::json!(object)],
                });
            }
            for entry in &statements {
                query::validate_statement(&entry.sql)?;
            }
            execute_statements(&tx, &statements, None, &project.cancellation)?;
            check_cancellation(&project.cancellation)?;
            let scope = ChangeScope {
                objects: reserved
                    .iter()
                    .map(|name| Relation {
                        schema: "data".into(),
                        name: name.clone(),
                    })
                    .collect(),
                ..ChangeScope::resource(Resource::Graph)
            };
            PendingChange::new(&tx, scope, &project.cancellation).commit(
                tx,
                &project.changes,
                &project.cancellation,
            )?;
            Ok(reserved)
        })
        .await
    }
    pub(crate) async fn import_ldaca(
        &self,
        staged: tempfile::TempDir,
        name: String,
    ) -> Result<Vec<String>> {
        self.with_writable_project(move |project| {
            project.import_tables(vec![(
                name,
                SqlStatement {
                    sql: "SELECT * FROM read_parquet(?)".into(),
                    parameters: vec![serde_json::json!(staged.path().join("import.parquet"))],
                },
            )])
        })
        .await
    }
    pub fn shutdown_signal(&self) -> CancellationToken {
        self.shared.shutdown.clone()
    }
    pub(crate) async fn dependency_graph(&self) -> Result<objects::DependencyGraph> {
        self.with_project(|p| p.dependency_graph()).await
    }
    pub(crate) async fn graph(&self) -> Result<Graph> {
        self.with_project(|p| p.graph()).await
    }
    pub(crate) async fn view_definition(
        &self,
        name: impl Into<ObjectTarget> + Send,
    ) -> Result<String> {
        let name = name.into();
        self.with_project(move |p| p.view_definition(&name)).await
    }
    pub(crate) async fn replace_view_definition(
        &self,
        name: impl Into<ObjectTarget> + Send,
        sql: String,
    ) -> Result<()> {
        let name = name.into();
        self.with_mutation(name.clone(), move |p| {
            p.replace_view_definition(&name, &sql)
        })
        .await
    }
    pub(crate) async fn edit(&self, id: impl Into<ObjectTarget> + Send, sql: String) -> Result<()> {
        let id = id.into();
        self.with_mutation(id.clone(), move |p| p.edit(&id, &sql))
            .await
    }
    pub(crate) async fn undo(&self, id: impl Into<ObjectTarget> + Send) -> Result<()> {
        let id = id.into();
        self.with_mutation(id.clone(), move |p| p.undo(&id)).await
    }
    pub(crate) async fn replace_source(
        &self,
        id: ObjectTarget,
        old: ObjectTarget,
        new: ObjectTarget,
    ) -> Result<()> {
        self.with_mutation(id.clone(), move |p| p.replace_source(&id, &old, &new))
            .await
    }
    pub(crate) async fn materialize(&self, id: impl Into<ObjectTarget> + Send) -> Result<()> {
        let id = id.into();
        self.with_mutation(id.clone(), move |p| p.materialize(&id))
            .await
    }
    pub async fn close(&self) -> Result<()> {
        let mut result = {
            let mut admission = locked(&self.shared.operations)?;
            if let Some(result) = &admission.close {
                result.clone()
            } else {
                let (send, receive) = watch::channel(None);
                admission.close = Some(receive.clone());
                if let Some(token) = admission.available.take() {
                    token.cancel();
                }
                let runtime = self.clone();
                tokio::spawn(async move {
                    let worker = runtime.clone();
                    let outcome = tokio::spawn(async move {
                        worker.interrupt_and_wait().await?;
                        worker.discard_cell_edit().await?;
                        let lease = worker.shared.lifecycle.clone().write_owned().await;
                        tokio::task::spawn_blocking(move || {
                            let _lease = lease;
                            if let Some(project) = locked(&worker.shared.project)?.take() {
                                project
                                    .database
                                    .conn
                                    .close()
                                    .map_err(|(_, e)| Error::from(e))?;
                            }
                            worker.shared.tasks.close();
                            Ok(())
                        })
                        .await?
                    })
                    .await
                    .unwrap_or_else(|e| Err(Error::from(e)));
                    send.send_replace(Some(outcome));
                });
                receive
            }
        };
        loop {
            if let Some(outcome) = result.borrow_and_update().clone() {
                return outcome;
            }
            result
                .changed()
                .await
                .map_err(|_| Error::new("worker_failed", "Close result unavailable"))?;
        }
    }
}
impl Shared {
    fn check(&self, admission: &Admission, accepted_task: bool) -> Result<()> {
        if self.shutdown.is_cancelled() {
            return Err(Error::new("stopping", "Backend is stopping"));
        }
        if admission.close.is_some() {
            return Err(Error::new("project_closed", "Project is closed"));
        }
        // A close prompt stops new work, not later stages of an already accepted task.
        if !accepted_task && admission.available.is_none() {
            return Err(Error::new("project_busy", "Project is closing"));
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::time::timeout;
    fn runtime() -> ProjectRuntime {
        ProjectRuntime::new(CancellationToken::new())
    }
    fn batch(sql: &str) -> SqlBatch {
        SqlBatch {
            statements: Some(vec![SqlStatement {
                sql: sql.into(),
                parameters: vec![],
            }]),
            response: SqlResponse::Command,
            ..Default::default()
        }
    }

    fn staged(table: &ldaca_rs::data::Table) -> tempfile::TempDir {
        let directory = tempfile::tempdir().unwrap();
        table
            .write(
                &directory.path().join("import.parquet"),
                ldaca_rs::data::table::ExportFormat::Parquet,
            )
            .unwrap();
        directory
    }
    #[tokio::test]
    async fn sample_imports_create_views_or_offline_tables_atomically() {
        for as_views in [true, false] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("samples.wfpj");
            let input = directory.path().join("sample.parquet");
            let input_url = input.to_string_lossy().into_owned();
            let project = runtime();
            project.create(Some(path.clone())).await.unwrap();
            project
                .sql(batch(&format!(
                    "COPY (SELECT 12 AS value) TO '{}' (FORMAT PARQUET)",
                    input_url.replace('\'', "''")
                )))
                .await
                .unwrap();
            let names = project
                .import_samples(vec![("sample".into(), input_url.clone())], as_views)
                .await
                .unwrap();
            let copies = project
                .import_samples(vec![("sample".into(), input_url.clone())], as_views)
                .await
                .unwrap();
            assert_eq!(names, ["sample"]);
            assert_ne!(names, copies);
            assert!(
                project
                    .import_samples(
                        vec![
                            ("should_rollback".into(), input_url),
                            (
                                "missing".into(),
                                directory
                                    .path()
                                    .join("missing.parquet")
                                    .to_string_lossy()
                                    .into_owned()
                            ),
                        ],
                        as_views
                    )
                    .await
                    .is_err()
            );
            assert_eq!(project.graph().await.unwrap().nodes.len(), 2);
            project.close().await.unwrap();
            if !as_views {
                std::fs::remove_file(input).unwrap();
            }
            let reopened = runtime();
            reopened.open(path).await.unwrap();
            reopened
                .with_project(move |project| {
                    let catalogue = if as_views {
                        "duckdb_views()"
                    } else {
                        "duckdb_tables()"
                    };
                    let objects: i64 = project.conn.query_row(
                        &format!("SELECT count(*) FROM {catalogue} WHERE schema_name='data'"),
                        [],
                        |row| row.get(0),
                    )?;
                    assert_eq!(objects, 2);
                    let value: i64 =
                        project
                            .conn
                            .query_row("SELECT value FROM data.sample", [], |row| row.get(0))?;
                    assert_eq!(value, 12);
                    Ok(())
                })
                .await
                .unwrap();
            reopened.close().await.unwrap();
        }
    }

    #[tokio::test]
    async fn imports_remain_available_while_an_unrelated_table_is_edited() {
        let project = runtime();
        project.create(None).await.unwrap();
        for sql in [
            "CREATE TABLE data.docs AS SELECT 'original' AS text",
            "INSERT INTO wordflow.nodes(table_name) VALUES ('docs')",
        ] {
            project.sql(batch(sql)).await.unwrap();
        }
        let session = project.begin_cell_edit("docs").await.unwrap();
        let names = project
            .import_tables(vec![(
                "late".into(),
                batch("SELECT 1 AS n").statements.unwrap().remove(0),
            )])
            .await
            .unwrap();
        assert_eq!(names.len(), 1);
        let second = project.begin_cell_edit(names[0].clone()).await;
        // Imports are Views over independently owned Tables; materialize explicitly first.
        assert!(second.is_err());
        project.materialize(names[0].clone()).await.unwrap();
        let second = project.begin_cell_edit(names[0].clone()).await.unwrap();
        assert!(project.begin_cell_edit("docs").await.is_err());
        assert_eq!(
            project
                .rename_node("docs", "renamed".into())
                .await
                .unwrap_err()
                .code,
            "editing_active"
        );
        assert_eq!(
            project.delete_node("docs").await.unwrap_err().code,
            "editing_active"
        );
        assert!(
            project
                .sql(batch("CREATE TABLE forbidden(v INT)"))
                .await
                .is_err()
        );
        project.cancel_cell_edit(session.session_id).await.unwrap();
        assert!(project.is_editing().await);
        project.cancel_cell_edit(second.session_id).await.unwrap();
        assert!(!project.is_editing().await);
        project.rename_node("docs", "renamed".into()).await.unwrap();
        project.close().await.unwrap();
    }

    #[tokio::test]
    async fn merged_data_sdk_import_embeds_values_and_allocates_node_names() {
        let project = runtime();
        project.create(None).await.unwrap();
        let krate = ldaca_rs::data::RoCrate::from_value(serde_json::json!({"@graph": [
            {"@id": "source", "@type": "Document", "text": "Café 猫"}
        ]}))
        .unwrap();
        let mut tables = krate.select_tables(&["Document".into()]).unwrap();
        let table = tables.tables.shift_remove("Document").unwrap();
        let first = project
            .import_ldaca(staged(&table), "Imported docs".into())
            .await
            .unwrap();
        let second = project
            .import_ldaca(staged(&table), "Imported docs".into())
            .await
            .unwrap();
        assert_ne!(first, second);
        let text: String = project
            .with_project(move |project| {
                project
                    .conn
                    .query_row(
                        &format!("SELECT text FROM data.{}", query::quote(&first[0])),
                        [],
                        |row| row.get(0),
                    )
                    .map_err(Error::from)
            })
            .await
            .unwrap();
        assert_eq!(text, "Café 猫");
        assert!(project.status().await.unwrap().unwrap().path.is_none());
        project.close().await.unwrap();
    }

    #[tokio::test]
    async fn accepted_console_script_survives_a_disconnected_caller() {
        let project = runtime();
        project.create(None).await.unwrap();
        let (started, ready) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let worker = project.clone();
        let request = tokio::spawn(async move {
            worker.with_writable_project(move |database| {
                started.send(()).unwrap();
                wait.recv_timeout(Duration::from_secs(5)).unwrap();
                database.sql(SqlBatch {
                    script: Some("CREATE TABLE committed(v INT); INSERT INTO committed VALUES (42); SELECT * FROM committed".into()),
                    max_rows: Some(1),
                    ..Default::default()
                })
            }).await
        });
        timeout(Duration::from_secs(5), ready)
            .await
            .unwrap()
            .unwrap();
        request.abort();
        release.send(()).unwrap();
        let close = project.begin_close().unwrap();
        project.shared.tracker.close();
        timeout(Duration::from_secs(5), project.shared.tracker.wait())
            .await
            .unwrap();
        drop(close);
        let value = timeout(
            Duration::from_secs(5),
            project.with_project(|database| {
                Ok(database
                    .conn
                    .query_row("SELECT v FROM committed", [], |row| row.get::<_, i32>(0))?)
            }),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(value, 42);
        project.close().await.unwrap();
    }

    #[tokio::test]
    async fn accepted_cell_save_survives_disconnect_and_finishes_before_close() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("editing.wfpj");
        let project = runtime();
        project.create(Some(path.clone())).await.unwrap();
        for sql in [
            "CREATE TABLE data.docs AS SELECT i AS n FROM range(1000) t(i)",
            "INSERT INTO wordflow.nodes(table_name) VALUES ('docs')",
        ] {
            project.sql(batch(sql)).await.unwrap();
        }
        let session = project.begin_cell_edit("docs").await.unwrap();
        let saving = {
            let project = project.clone();
            tokio::spawn(async move {
                project
                    .save_cell_edit(
                        session.session_id,
                        cell_edit::Save {
                            changes: (0..1000)
                                .map(|row| cell_edit::Patch {
                                    row_ref: row.to_string(),
                                    column: "n".into(),
                                    value: Some("42".into()),
                                })
                                .collect(),
                            ..cell_edit::Save::default()
                        },
                    )
                    .await
            })
        };
        timeout(Duration::from_secs(5), async {
            while project.shared.editor.try_lock().is_ok() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        saving.abort(); // The HTTP receiver goes away; the accepted blocking worker still owns Save.
        timeout(Duration::from_secs(10), project.close())
            .await
            .unwrap()
            .unwrap();
        let conn = Connection::open(path).unwrap();
        assert_eq!(
            conn.query_row("SELECT count(*) FROM data.docs WHERE n=42", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            1000
        );
    }

    #[tokio::test]
    async fn cancelling_a_close_resumes_the_same_project() {
        let project = runtime();
        project.create(None).await.unwrap();
        let work = project.operation().unwrap();
        let close = project.begin_close().unwrap();
        assert!(close.has_work());
        assert!(project.operation().is_err());
        drop(close); // User declined interruption.
        assert!(!work.cancellation.is_cancelled());
        drop(work);
        project
            .sql(batch("CREATE TABLE data.a AS SELECT 1 n"))
            .await
            .unwrap();
        let close = project.begin_close().unwrap();
        close.interrupt_and_wait().await.unwrap();
        assert!(project.status().await.unwrap().unwrap().path.is_none());
        drop(close); // User cancelled Save.
        project.sql(batch("SELECT * FROM data.a")).await.unwrap();
        project.close().await.unwrap();
    }

    #[tokio::test]
    async fn disconnected_close_keeps_ownership_until_cleanup_and_other_callers_await_it() {
        let project = runtime();
        project.create(None).await.unwrap();
        let operation = project.operation().unwrap();
        let closing = {
            let project = project.clone();
            tokio::spawn(async move { project.close().await })
        };
        timeout(Duration::from_secs(2), operation.cancellation.cancelled())
            .await
            .unwrap();
        closing.abort(); // Simulates a disconnected HTTP caller, not host shutdown.
        let second = {
            let project = project.clone();
            tokio::spawn(async move { project.close().await })
        };
        assert!(!second.is_finished());
        drop(operation);
        timeout(Duration::from_secs(2), second)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(project.status().await.unwrap().is_none());
        assert!(project.create(None).await.is_err());
        project.close().await.unwrap();
    }

    #[tokio::test]
    async fn interrupt_is_isolated_and_waits_for_detached_database_worker() {
        let first = runtime();
        let second = runtime();
        first.create(None).await.unwrap();
        second.create(None).await.unwrap();
        for project in [&first, &second] {
            project
                .sql(batch("CREATE TABLE data.same AS SELECT 1 n"))
                .await
                .unwrap();
        }
        let query = {
            let first = first.clone();
            tokio::spawn(async move {
                first
                    .sql(batch(
                        "SELECT sum(i*j) FROM range(10000000) a(i), range(10000000) b(j)",
                    ))
                    .await
            })
        };
        timeout(Duration::from_secs(2), async {
            while first.shared.tracker.is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        query.abort();
        timeout(
            Duration::from_secs(5),
            first.begin_close().unwrap().interrupt_and_wait(),
        )
        .await
        .unwrap()
        .unwrap();
        second.sql(batch("SELECT * FROM data.same")).await.unwrap();

        first.sql(batch("SELECT * FROM data.same")).await.unwrap();
        first.close().await.unwrap();
        second.close().await.unwrap();
    }

    #[tokio::test]
    async fn pause_before_initialization_prevents_late_publication() {
        let project = runtime();
        let close = project.begin_close().unwrap();
        assert!(!close.has_work());
        assert!(project.create(None).await.is_err());
        assert!(project.status().await.unwrap().is_none());
        project.close().await.unwrap();
    }
}

#[cfg(test)]
#[path = "concurrency_tests.rs"]
mod concurrency_tests;

#[cfg(test)]
#[path = "workload_tests.rs"]
mod workload_tests;

#[cfg(test)]
#[path = "analysis_runtime_tests.rs"]
mod analysis_tests;

#[cfg(test)]
mod plots_icu_tests {
    use super::*;
    use serde_json::json;
    #[tokio::test]
    #[ignore = "requires the platform-matched ICU asset from prepare-icu.mjs"]
    async fn offline_timezone_asset_supports_daily_dst_bins() {
        let asset = std::env::var_os("WORDFLOW_TEST_ICU_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../frontend/src-tauri/resources/icu/icu.duckdb_extension")
            });
        let isolated = tempfile::tempdir().unwrap();
        let config = duckdb::Config::default()
            .enable_autoload_extension(false)
            .unwrap()
            .with("autoinstall_known_extensions", "false")
            .unwrap()
            .with("extension_directory", isolated.path().to_str().unwrap())
            .unwrap();
        let conn = Connection::open_in_memory_with_flags(config).unwrap();
        assert!(conn.prepare("SELECT * FROM pg_timezone_names()").is_err());
        let mut invalid = std::fs::read(&asset).unwrap();
        *invalid.last_mut().unwrap() ^= 1;
        let invalid_path = isolated.path().join("invalid.duckdb_extension");
        std::fs::write(&invalid_path, invalid).unwrap();
        let error = conn
            .execute_batch(&format!("LOAD '{}'", invalid_path.display()))
            .unwrap_err();
        assert!(
            error.to_string().to_lowercase().contains("signature"),
            "{error}"
        );
        conn.execute_batch(&format!("LOAD '{}'", asset.display()))
            .unwrap();
        assert!(
            conn.query_row("SELECT count(*) FROM pg_timezone_names()", [], |r| r
                .get::<_, u64>(0))
                .unwrap()
                > 100
        );
        let runtime = ProjectRuntime::new(CancellationToken::new());
        runtime.set_icu_path(asset).unwrap();
        runtime.create(None).await.unwrap();
        runtime.with_writable_project(|p|{p.conn.execute_batch("SET autoinstall_known_extensions=false; SET autoload_known_extensions=false; CREATE TABLE data.corpus(t TIMESTAMPTZ); INSERT INTO data.corpus VALUES ('2026-03-07 12:00:00+00'),('2026-03-09 12:00:00+00'); INSERT INTO wordflow.nodes(table_name) VALUES ('corpus')")?; Ok(())}).await.unwrap();
        assert!(
            runtime
                .plot_timezones()
                .await
                .unwrap()
                .contains(&"America/New_York".into())
        );
        let tab = runtime
            .create_analysis_tab(CreateTab {
                kind: "trends".into(),
                name: None,
            })
            .await
            .unwrap();
        let input=PlotRequest::decode(PlotMode::Trends,json!({"source":{"name":"corpus"},"axis":"t","groups":[],"measure":"count","value":null,"interval":{"type":"time","unit":"day","step":1},"timezone":"America/New_York"})).unwrap();
        let result = runtime
            .submit_plot(tab.id, PlotMode::Trends, input)
            .await
            .unwrap()
            .wait()
            .await
            .unwrap();
        let id = result.id;
        let file = runtime
            .plot_page(id, PlotMode::Trends, PlotQuery::default())
            .await
            .unwrap();
        let mut reader =
            arrow_ipc::reader::StreamReader::try_new(file.reopen().unwrap(), None).unwrap();
        let batch = reader.next().unwrap().unwrap();
        assert_eq!(batch.num_rows(), 3);
        let intervals = batch
            .column(0)
            .as_any()
            .downcast_ref::<duckdb::arrow::array::StringArray>()
            .unwrap();
        assert!(intervals.value(0).ends_with("-05"));
        assert!(intervals.value(2).ends_with("-04"));
        runtime.close().await.unwrap();
    }
}
