//! Native document ownership. React observes documents; it does not approve their lifecycle.
use crate::{events::emit_to_window, supervisor::BackendSupervisor};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use wordflow_backend::{CloseAttempt, Error};
type Result<T> = std::result::Result<T, Error>;
fn native(error: impl std::fmt::Display) -> Error {
    Error::new("desktop_error", error.to_string())
}

pub(crate) struct Document {
    pub(crate) backend: Arc<BackendSupervisor>,
    path: Mutex<Option<PathBuf>>,
    actions: AsyncMutex<()>,
    close: AsyncMutex<Option<Result<bool>>>,
}
#[derive(Default)]
pub(crate) struct Documents {
    windows: Mutex<BTreeMap<String, Arc<Document>>>,
    sequence: AtomicU64,
    opening: AtomicUsize,
    opening_gate: AsyncMutex<()>,
    quit: Arc<AsyncMutex<Option<Result<bool>>>>,
}
impl Documents {
    /// Serialize installation with Open/Save As, but never hold the registry during generation.
    pub(crate) async fn install_export(
        &self,
        target: PathBuf,
        file: tempfile::NamedTempFile,
        context: wordflow_backend::TaskContext,
        replace: bool,
    ) -> Result<String> {
        let _ownership = self.opening_gate.lock().await;
        if target.exists() {
            let canonical = tokio::fs::canonicalize(&target).await.map_err(native)?;
            let windows = self.windows.lock().map_err(native)?;
            for document in windows.values() {
                if document.path.lock().map_err(native)?.as_ref() == Some(&canonical) {
                    return Err(Error::new("project_busy", "The export destination is an open project. Choose a different file or close that project first."));
                }
            }
        }
        context
            .run_blocking(move |context| crate::download::install(target, file, &context, replace))
            .await
    }

    async fn save_project(
        &self,
        label: &str,
        document: &Document,
        destination: Option<PathBuf>,
    ) -> Result<wordflow_backend::ProjectInfo> {
        // Open and Save As reserve canonical destinations under the same registry gate.
        let _ownership = self.opening_gate.lock().await;
        if let Some(path) = &destination {
            let path = if path.exists() {
                tokio::fs::canonicalize(path).await.map_err(native)?
            } else {
                path.clone()
            };
            let windows = self.windows.lock().map_err(native)?;
            for (other_label, other) in windows.iter() {
                if other_label != label
                    && other.path.lock().map_err(native)?.as_ref() == Some(&path)
                {
                    return Err(Error::new("project_busy", "This destination is open in another Wordflow window. Close it before replacing the file."));
                }
            }
        }
        let info = document.backend.project.save(destination).await?;
        *document.path.lock().map_err(native)? = info.path.clone();
        Ok(info)
    }
}
pub(crate) fn document(window: &WebviewWindow) -> Result<Arc<Document>> {
    window
        .state::<Documents>()
        .windows
        .lock()
        .map_err(native)?
        .get(window.label())
        .cloned()
        .ok_or_else(|| Error::new("project_closed", "This window has no project"))
}
pub(crate) fn focused(app: &AppHandle) -> Option<WebviewWindow> {
    app.webview_windows().into_values().find(|window| {
        window.label().starts_with("project-") && window.is_focused().unwrap_or(false)
    })
}
pub(crate) fn report(window: &WebviewWindow, error: &Error) {
    tracing::error!(%error, window = window.label(), "Document operation failed");
    let _ = emit_to_window(window, "project-error", error);
}
async fn open_window(app: &AppHandle, path: Option<PathBuf>) -> Result<()> {
    tracing::info!(?path, "Opening project window");
    let registry = app.state::<Documents>();
    let _opening = registry.opening_gate.lock().await;
    let path = match path {
        Some(path) => Some(tokio::fs::canonicalize(path).await.map_err(native)?),
        None => None,
    };
    let state = app.state::<Documents>();
    let mut windows = state.windows.lock().map_err(native)?;
    if state
        .quit
        .try_lock()
        .map_or(true, |outcome| matches!(*outcome, Some(Ok(true))))
    {
        return Err(native("The application is quitting"));
    }
    if let Some(path) = &path {
        for (label, document) in windows.iter() {
            if document.path.lock().map_err(native)?.as_ref() == Some(path) {
                let label = label.clone();
                let ready = matches!(
                    document.backend.snapshot(),
                    crate::supervisor::BackendStatus::Ready { .. }
                );
                drop(windows);
                if let Some(window) = app.get_webview_window(&label) {
                    window.unminimize().map_err(native)?;
                    window.set_focus().map_err(native)?;
                    if ready {
                        crate::recent_projects::record(app, Some(path));
                    }
                    return Ok(());
                }
                return Err(native("Project window is closing"));
            }
        }
    }
    let label = format!("project-{}", state.sequence.fetch_add(1, Ordering::Relaxed));
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or_else(|| native("Missing document window configuration"))?;
    config.label = label.clone();
    config.visible = true;
    #[cfg(feature = "e2e")]
    app.state::<crate::e2e_profile::Profile>()
        .configure(&mut config);
    let backend = Arc::new(BackendSupervisor::with_ai(
        app.state::<wordflow_backend::AiConfiguration>()
            .inner()
            .clone(),
    ));
    let document = Arc::new(Document {
        backend: backend.clone(),
        path: Mutex::new(path.clone()),
        actions: AsyncMutex::new(()),
        close: AsyncMutex::new(None),
    });
    windows.insert(label.clone(), document);
    drop(windows);
    match WebviewWindowBuilder::from_config(app, &config).and_then(|builder| {
        // Tauri 2.11's from_config does not forward the macOS store identifier.
        #[cfg(target_os = "macos")]
        let builder = match config.data_store_identifier {
            Some(identifier) => builder.data_store_identifier(identifier),
            None => builder,
        };
        builder.build()
    }) {
        Ok(window) => {
            tracing::info!(window = window.label(), "Project window created");
            backend.start(window, path);
            Ok(())
        }
        Err(error) => {
            state.windows.lock().map_err(native)?.remove(&label);
            Err(native(error))
        }
    }
}
/// Pending window creation is accounted for even when its future unwinds.
struct PendingOpen(AppHandle);
impl Drop for PendingOpen {
    fn drop(&mut self) {
        self.0
            .state::<Documents>()
            .opening
            .fetch_sub(1, Ordering::SeqCst);
    }
}
fn enqueue_open(app: &AppHandle, path: Option<PathBuf>) {
    app.state::<Documents>()
        .opening
        .fetch_add(1, Ordering::SeqCst);
    let pending = PendingOpen(app.clone());
    tauri::async_runtime::spawn(async move {
        let app = &pending.0;
        if let Err(error) = open_window(app, path).await {
            if let Some(window) = focused(app) {
                report(&window, &error);
            } else {
                app.dialog()
                    .message(error.to_string())
                    .title("Cannot open project")
                    .show(|_| {});
            }
        }
    });
}
pub(crate) fn ensure_window(app: &AppHandle) {
    let state = app.state::<Documents>();
    if state.opening.load(Ordering::SeqCst) == 0
        && state.windows.lock().is_ok_and(|windows| windows.is_empty())
    {
        enqueue_open(app, None);
    }
}
pub(crate) fn open_paths(app: &AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    for path in paths {
        if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("wfpj"))
        {
            enqueue_open(app, Some(path));
        }
    }
}
pub(crate) fn argument_paths(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .map(PathBuf::from)
        .filter(|p| {
            p.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("wfpj"))
        })
        .map(|p| if p.is_absolute() { p } else { cwd.join(p) })
        .collect()
}
pub(crate) async fn choose_save(window: &WebviewWindow, filename: &str) -> Result<Option<PathBuf>> {
    let (send, receive) = oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(window)
        .set_file_name(filename)
        .save_file(move |path| {
            let _ = send.send(path);
        });
    receive
        .await
        .map_err(native)?
        .map(|path| path.into_path().map_err(native))
        .transpose()
}
async fn choose_open(app: &AppHandle, parent: Option<&WebviewWindow>) -> Result<Option<PathBuf>> {
    let (send, receive) = oneshot::channel();
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Wordflow project", &["wfpj"]);
    if let Some(parent) = parent {
        dialog = dialog.set_parent(parent);
    }
    dialog.pick_file(move |path| {
        let _ = send.send(path);
    });
    receive
        .await
        .map_err(native)?
        .map(|path| path.into_path().map_err(native))
        .transpose()
}
/// Document actions never save or discard drafts owned by the table editor.
pub(crate) async fn return_to_table_editor(window: &WebviewWindow) -> Result<bool> {
    let document = document(window)?;
    if !document.backend.project.is_editing().await {
        return Ok(false);
    }
    window.set_focus().map_err(native)?;
    emit_to_window(window, "focus-table-editor", ()).map_err(native)?;
    Ok(true)
}
pub(crate) fn reload(window: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        let result = async {
            if !return_to_table_editor(&window).await? {
                window.reload().map_err(native)?;
            }
            Ok(())
        }
        .await;
        if let Err(error) = result {
            report(&window, &error);
        }
    });
}
/// Reload/destruction can occur outside the File menu (e.g. development HMR).
pub(crate) fn webview_unloaded(app: &AppHandle, label: &str) {
    let project = app
        .state::<Documents>()
        .windows
        .lock()
        .ok()
        .and_then(|windows| {
            windows
                .get(label)
                .map(|document| document.backend.project.clone())
        });
    if let Some(project) = project {
        tauri::async_runtime::spawn(async move {
            if let Err(error) = project.discard_cell_edit().await {
                tracing::warn!(%error, "Could not release table editor on webview teardown");
            }
        });
    }
}
async fn save_document(window: &WebviewWindow, document: &Document, save_as: bool) -> Result<bool> {
    if return_to_table_editor(window).await? {
        return Ok(false);
    }
    let Some(info) = document.backend.project.status().await? else {
        return Err(Error::new("project_closed", "Project is closed"));
    };
    let destination = if save_as || info.path.is_none() {
        let Some(path) = choose_save(window, &format!("{}.wfpj", info.title)).await? else {
            return Ok(false);
        };
        Some(path)
    } else {
        None
    };
    let info = window
        .state::<Documents>()
        .save_project(window.label(), document, destination)
        .await?;
    crate::recent_projects::record(window.app_handle(), info.path.as_deref());
    window.set_title(&info.title).map_err(native)?;
    let _ = emit_to_window(window, "project-changed", &info);
    Ok(true)
}
async fn confirm(
    window: &WebviewWindow,
    message: &str,
    buttons: MessageDialogButtons,
) -> Result<MessageDialogResult> {
    let (send, receive) = oneshot::channel();
    window
        .dialog()
        .message(message)
        .title("Wordflow")
        .parent(window)
        .buttons(buttons)
        .show_with_result(move |result| {
            let _ = send.send(result);
        });
    receive.await.map_err(native)
}
async fn close_one(window: &WebviewWindow) -> Result<bool> {
    let document = document(window)?;
    let Ok(mut completion) = document.close.try_lock() else {
        return document.close.lock().await.clone().unwrap_or(Ok(false));
    };
    if matches!(*completion, Some(Ok(true))) {
        return Ok(true);
    }
    let outcome = close_document(window, &document).await;
    *completion = Some(outcome.clone());
    outcome
}
async fn close_document(window: &WebviewWindow, document: &Document) -> Result<bool> {
    let _action = document.actions.lock().await;
    // A backend may already have stopped after a failed window destruction or startup.
    if matches!(
        document.backend.snapshot(),
        crate::supervisor::BackendStatus::Failed { .. } | crate::supervisor::BackendStatus::Stopped
    ) {
        document.backend.stop(window).await;
        window.destroy().map_err(native)?;
        window
            .app_handle()
            .state::<Documents>()
            .windows
            .lock()
            .map_err(native)?
            .remove(window.label());
        return Ok(true);
    }
    let project = &document.backend.project;
    let approved = settle_for_close(
        project,
        || async {
            let answer = confirm(
                window,
                "Work is running in this project. Interrupt it and close?",
                MessageDialogButtons::OkCancelCustom("Interrupt and Close".into(), "Cancel".into()),
            )
            .await?;
            Ok(answer == MessageDialogResult::Custom("Interrupt and Close".into()))
        },
        || async {
            let answer = confirm(
                window,
                "Save this Untitled project before closing?",
                MessageDialogButtons::YesNoCancelCustom(
                    "Save".into(),
                    "Don't Save".into(),
                    "Cancel".into(),
                ),
            )
            .await?;
            match answer {
                MessageDialogResult::Custom(label) if label == "Save" => {
                    save_document(window, document, false).await
                }
                MessageDialogResult::Custom(label) if label == "Don't Save" => Ok(true),
                _ => Ok(false),
            }
        },
    )
    .await?;
    let Some(_close) = approved else {
        return_to_table_editor(window).await?;
        return Ok(false);
    };
    document.backend.stop(window).await;
    window.destroy().map_err(native)?;
    window
        .app_handle()
        .state::<Documents>()
        .windows
        .lock()
        .map_err(native)?
        .remove(window.label());
    Ok(true)
}

/// Native dialogs are callbacks so close decisions can be verified against a real runtime.
async fn settle_for_close<I, S>(
    project: &wordflow_backend::ProjectRuntime,
    interrupt: impl FnOnce() -> I,
    save: impl FnOnce() -> S,
) -> Result<Option<CloseAttempt>>
where
    I: std::future::Future<Output = Result<bool>>,
    S: std::future::Future<Output = Result<bool>>,
{
    let close = project.begin_close()?;
    if project.is_editing().await {
        return Ok(None);
    }
    if close.has_work() && !interrupt().await? {
        return Ok(None);
    }
    close.interrupt_and_wait().await?;
    if project
        .status()
        .await?
        .is_some_and(|info| info.path.is_none())
        && !save().await?
    {
        return Ok(None);
    }
    Ok(Some(close))
}
pub(crate) fn request_close(window: &WebviewWindow) -> bool {
    if document(window).is_err() {
        return false;
    }
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = close_one(&window).await {
            report(&window, &error);
        }
    });
    true
}
/// Holds Quit admission across prompts and updater installation. Abandoning it
/// releases the gate; only consuming it publishes permission for native exit.
pub(crate) struct QuitApproval(tokio::sync::OwnedMutexGuard<Option<Result<bool>>>);
impl QuitApproval {
    pub(crate) fn allow_exit(mut self) {
        *self.0 = Some(Ok(true));
    }
}
pub(crate) async fn close_all(app: &AppHandle) -> Result<Option<QuitApproval>> {
    let state = app.state::<Documents>();
    let gate = state.quit.clone();
    let mut quit = match gate.clone().try_lock_owned() {
        Ok(guard) => guard,
        Err(_) => {
            let completed = gate.lock_owned().await;
            return match completed.clone().unwrap_or(Ok(false))? {
                true => Ok(Some(QuitApproval(completed))),
                false => Ok(None),
            };
        }
    };
    *quit = None;
    // Settle already-started opens before taking the snapshot. Save As can use
    // the path-ownership gate while native prompts retain the separate Quit lease.
    let opening = state.opening_gate.lock().await;
    let labels: Vec<_> = state
        .windows
        .lock()
        .map_err(native)?
        .keys()
        .cloned()
        .collect();
    drop(opening);
    let outcome = async {
        for label in labels {
            if let Some(window) = app.get_webview_window(&label) {
                if !close_one(&window).await? {
                    return Ok(false);
                }
            }
        }
        Ok(true)
    }
    .await;
    match outcome {
        Ok(true) => Ok(Some(QuitApproval(quit))),
        other => {
            *quit = Some(other.clone());
            other.map(|_| None)
        }
    }
}
pub(crate) fn intercept_exit(app: &AppHandle, code: i32) -> bool {
    let state = app.state::<Documents>();
    let Ok(quit) = state.quit.try_lock() else {
        return true;
    };
    if matches!(*quit, Some(Ok(true))) {
        return false;
    }
    drop(quit);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match close_all(&app).await {
            Ok(Some(approval)) => {
                approval.allow_exit();
                app.exit(code);
            }
            Ok(None) => {}
            Err(error) => {
                if let Some(window) = focused(&app) {
                    report(&window, &error);
                }
            }
        }
    });
    true
}

pub(crate) enum ProjectCommand {
    New,
    Open,
    Save,
    SaveAs,
    Close,
}
async fn perform(
    app: &AppHandle,
    window: Option<&WebviewWindow>,
    command: ProjectCommand,
) -> Result<()> {
    match command {
        ProjectCommand::New => enqueue_open(app, None),
        ProjectCommand::Open => {
            if let Some(path) = choose_open(app, window).await? {
                enqueue_open(app, Some(path));
            }
        }
        ProjectCommand::Save | ProjectCommand::SaveAs => {
            if let Some(window) = window {
                let document = document(window)?;
                let _action = document.actions.lock().await;
                save_document(window, &document, matches!(command, ProjectCommand::SaveAs)).await?;
            }
        }
        ProjectCommand::Close => {
            if let Some(window) = window {
                request_close(window);
            }
        }
    }
    Ok(())
}
pub(crate) fn menu_action(app: &AppHandle, command: &str) {
    let action = match command {
        "project-new" => ProjectCommand::New,
        "project-open" => ProjectCommand::Open,
        "project-save" => ProjectCommand::Save,
        "project-save-as" => ProjectCommand::SaveAs,
        "project-close" => ProjectCommand::Close,
        _ => return,
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let window = focused(&app);
        if let Err(error) = perform(&app, window.as_ref(), action).await {
            if let Some(window) = window {
                report(&window, &error);
            }
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn file_arguments_preserve_spaces_and_resolve_relative_paths() {
        assert_eq!(
            argument_paths(
                ["wordflow", "a b.wfpj", "skip.txt"].map(str::to_owned),
                Path::new("/tmp")
            ),
            vec![PathBuf::from("/tmp/a b.wfpj")]
        );
    }
}

#[cfg(test)]
mod close_tests {
    use super::*;
    use tokio_util::sync::CancellationToken;
    use wordflow_backend::ProjectRuntime;

    #[tokio::test]
    async fn named_project_closes_without_an_unsaved_content_prompt() {
        let directory = tempfile::tempdir().unwrap();
        let project = ProjectRuntime::new(CancellationToken::new());
        project
            .create(Some(directory.path().join("named.wfpj")))
            .await
            .unwrap();
        assert!(settle_for_close(
            &project,
            || async { panic!("No running work") },
            || async { panic!("Named projects commit immediately") }
        )
        .await
        .unwrap()
        .is_some());
        project.close().await.unwrap();
    }

    #[tokio::test]
    async fn table_editor_prevents_close_before_interrupt_or_save_and_teardown_releases_it() {
        let shutdown = CancellationToken::new();
        let project = ProjectRuntime::new(shutdown.clone());
        project.create(None).await.unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/api/project", listener.local_addr().unwrap());
        let server = tokio::spawn(wordflow_backend::serve(
            listener,
            vec![],
            shutdown.clone(),
            project.clone(),
        ));
        let client = reqwest::Client::new();
        assert!(client.post(format!("{url}/sql")).json(&serde_json::json!({"response":"command","statements":[{"sql":"CREATE TABLE t AS SELECT 1 AS x"},{"sql":"INSERT INTO wordflow.nodes(table_name) VALUES ('t')"}]})).send().await.unwrap().status().is_success());
        assert!(client
            .post(format!("{url}/nodes/t/cell-edit"))
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap()
            .status()
            .is_success());
        for _ in 0..2 {
            assert!(!settle_for_close(
                &project,
                || async { panic!("Do not interrupt an editor") },
                || async { panic!("Return to the editor before document Save") }
            )
            .await
            .unwrap()
            .is_some());
            assert!(project.is_editing().await);
            assert_eq!(project.save(None).await.unwrap_err().code, "editing_active");
            drop(project.operation().unwrap());
        }
        project.discard_cell_edit().await.unwrap();
        assert!(!project.is_editing().await);
        assert!(settle_for_close(
            &project,
            || async { panic!("Idle reader is not running work") },
            || async { Ok(true) }
        )
        .await
        .unwrap()
        .is_some());
        shutdown.cancel();
        server.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn untouched_untitled_prompts_and_declining_interruption_resumes() {
        let project = ProjectRuntime::new(CancellationToken::new());
        project.create(None).await.unwrap();
        let work = project.operation().unwrap();
        assert!(!settle_for_close(
            &project,
            || async { Ok(false) },
            || async { panic!("No Save expected") }
        )
        .await
        .unwrap()
        .is_some());
        assert!(!work.cancellation.is_cancelled());
        drop(project.operation().unwrap());
        drop(work);
        assert!(settle_for_close(
            &project,
            || async { panic!("No running work") },
            || async { Ok(true) }
        )
        .await
        .unwrap()
        .is_some());
        project.close().await.unwrap();
    }

    #[tokio::test]
    async fn cancelled_or_failed_save_leaves_untitled_usable() {
        let shutdown = CancellationToken::new();
        let project = ProjectRuntime::new(shutdown.clone());
        project.create(None).await.unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/api/project/sql", listener.local_addr().unwrap());
        let server = tokio::spawn(wordflow_backend::serve(
            listener,
            vec![],
            shutdown.clone(),
            project.clone(),
        ));
        let client = reqwest::Client::new();
        let response = client.post(&url).json(&serde_json::json!({"response":"command","statements":[{"sql":"CREATE TABLE saved_before_interrupt AS SELECT 1"}]})).send().await.unwrap();
        assert!(response.status().is_success());
        let work = project.operation().unwrap();
        let finish = tokio::spawn(async move {
            work.cancellation.cancelled().await;
            drop(work);
        });
        assert!(
            !settle_for_close(&project, || async { Ok(true) }, || async { Ok(false) })
                .await
                .unwrap()
                .is_some()
        );
        finish.await.unwrap();
        assert!(project.status().await.unwrap().unwrap().path.is_none());
        drop(project.operation().unwrap());
        let error = settle_for_close(
            &project,
            || async { Ok(true) },
            || async { Err(Error::new("io_error", "Cannot save")) },
        )
        .await
        .err()
        .unwrap();
        assert_eq!(error.code, "io_error");
        assert!(client.post(&url).json(&serde_json::json!({"response":"command","statements":[{"sql":"SELECT * FROM saved_before_interrupt"}]})).send().await.unwrap().status().is_success());
        assert!(
            settle_for_close(&project, || async { Ok(true) }, || async { Ok(true) })
                .await
                .unwrap()
                .is_some()
        );
        shutdown.cancel();
        server.await.unwrap().unwrap();
    }
}

#[cfg(test)]
mod destination_tests {
    use super::*;
    async fn owned(path: PathBuf) -> Arc<Document> {
        let backend = Arc::new(BackendSupervisor::new());
        let info = backend.project.create(Some(path)).await.unwrap();
        Arc::new(Document {
            backend,
            path: Mutex::new(info.path),
            actions: AsyncMutex::new(()),
            close: AsyncMutex::new(None),
        })
    }
    #[tokio::test]
    async fn export_rejects_every_open_project_destination_without_modifying_it() {
        let dir = tempfile::tempdir().unwrap();
        let document = owned(dir.path().join("open.wfpj")).await;
        let registry = Arc::new(Documents::default());
        registry
            .windows
            .lock()
            .unwrap()
            .insert("open".into(), document.clone());
        let target = document.path.lock().unwrap().clone().unwrap();
        let before = std::fs::read(&target).unwrap();
        let project = document.backend.project.clone();
        let error = project
            .submit_task("Export", move |context| async move {
                registry
                    .install_export(target, tempfile::NamedTempFile::new()?, context, true)
                    .await
            })
            .unwrap()
            .wait()
            .await
            .unwrap_err();
        assert_eq!(error.code, "project_busy");
        assert_eq!(
            std::fs::read(document.path.lock().unwrap().as_ref().unwrap()).unwrap(),
            before
        );
        document.backend.project.close().await.unwrap();
    }
    #[tokio::test]
    async fn save_as_rejects_another_window_and_releases_the_reservation_after_failure() {
        let dir = tempfile::tempdir().unwrap();
        let a = owned(dir.path().join("a.wfpj")).await;
        let b = owned(dir.path().join("b.wfpj")).await;
        let registry = Arc::new(Documents::default());
        registry
            .windows
            .lock()
            .unwrap()
            .extend([("a".into(), a.clone()), ("b".into(), b.clone())]);
        let source = a.path.lock().unwrap().clone();
        let destination = b.path.lock().unwrap().clone();
        let error = registry
            .save_project("a", &a, destination.clone())
            .await
            .unwrap_err();
        assert_eq!(error.code, "project_busy");
        assert_eq!(*a.path.lock().unwrap(), source);
        assert_eq!(*b.path.lock().unwrap(), destination);
        b.backend.project.close().await.unwrap();
        registry.windows.lock().unwrap().remove("b");
        let info = registry
            .save_project("a", &a, destination.clone())
            .await
            .unwrap();
        assert_eq!(info.path, destination);
        assert_eq!(*a.path.lock().unwrap(), destination);
        a.backend.project.close().await.unwrap();
    }
    #[tokio::test]
    async fn open_reservation_prevents_a_concurrent_save_as_from_replacing_its_destination() {
        let dir = tempfile::tempdir().unwrap();
        let a = owned(dir.path().join("a.wfpj")).await;
        let b = owned(dir.path().join("b.wfpj")).await;
        let registry = Arc::new(Documents::default());
        let opening = registry.opening_gate.lock().await;
        let destination = b.path.lock().unwrap().clone();
        let saving = {
            let registry = registry.clone();
            let a = a.clone();
            tokio::spawn(async move { registry.save_project("a", &a, destination).await })
        };
        registry
            .windows
            .lock()
            .unwrap()
            .insert("opening".into(), b.clone());
        drop(opening);
        assert_eq!(saving.await.unwrap().unwrap_err().code, "project_busy");
        a.backend.project.close().await.unwrap();
        b.backend.project.close().await.unwrap();
    }
}
