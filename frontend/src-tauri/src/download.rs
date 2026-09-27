//! Export directly into a destination-adjacent staging file and install it within one task.
use std::{
    future::Future,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager, WebviewWindow};
use wordflow_backend::{Error, FrequencyExportFormat, FrequencyQuery};
type Result<T> = std::result::Result<T, Error>;
fn io(error: impl std::fmt::Display) -> Error {
    Error::new("export_error", error.to_string())
}
fn filename(name: &str, extension: &str) -> String {
    format!("{}.{}", suggested_filename(name), extension)
}
fn suggested_filename(name: &str) -> String {
    wordflow_backend::safe_filename(name)
}

pub(crate) fn install(
    target: PathBuf,
    temporary: tempfile::NamedTempFile,
    context: &wordflow_backend::TaskContext,
    replace: bool,
) -> Result<String> {
    let _destination_lock = wordflow_backend::lock_destination(&target)?;
    temporary.as_file().sync_all()?;
    context.check_cancelled()?;
    if replace {
        temporary.persist(&target).map_err(|error| error.error)?;
    } else {
        temporary
            .persist_noclobber(&target)
            .map_err(|error| error.error)?;
    }
    Ok(target.to_string_lossy().into_owned())
}
fn temporary(target: &Path) -> Result<tempfile::NamedTempFile> {
    tempfile::Builder::new()
        .prefix(".wordflow-export-")
        .tempfile_in(target.parent().unwrap_or(Path::new(".")))
        .map_err(io)
}
use wordflow_backend::ExportFormat;

#[derive(serde::Serialize)]
pub(crate) struct ExportError {
    #[serde(flatten)]
    error: Error,
    #[serde(skip_serializing_if = "Option::is_none")]
    task_id: Option<String>,
}
impl From<Error> for ExportError {
    fn from(error: Error) -> Self {
        Self {
            error,
            task_id: None,
        }
    }
}

#[tauri::command]
pub(crate) async fn save_node_export(
    window: WebviewWindow,
    table_name: String,
    schema: Option<String>,
    format: ExportFormat,
) -> std::result::Result<Option<String>, ExportError> {
    save_export(
        window,
        wordflow_backend::ExportRequest::Files {
            objects: vec![wordflow_backend::ObjectTarget {
                schema,
                name: table_name,
            }],
            format,
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn save_export(
    window: WebviewWindow,
    request: wordflow_backend::ExportRequest,
) -> std::result::Result<Option<String>, ExportError> {
    let document = crate::documents::document(&window)?;
    let project = document.backend.project.clone();
    let title = project
        .status()
        .await?
        .map(|info| info.title)
        .unwrap_or_else(|| "Untitled".into());
    let name = request.filename(&title);
    let Some(target) = crate::documents::choose_save(&window, &name).await? else {
        return Ok(None);
    };
    let app = window.app_handle().clone();
    let task =
        project
            .clone()
            .submit_task(format!("Export {name}"), move |context| async move {
                context.progress("Exporting committed data", None);
                stage_and_install(target, Some(app), context, move |file| async move {
                    project.export_into(request, file).await
                })
                .await
            })?;
    await_export(task).await
}

#[tauri::command]
pub(crate) async fn save_generated_export(
    window: WebviewWindow,
    suggested_name: String,
    bytes: Vec<u8>,
) -> std::result::Result<Option<String>, ExportError> {
    let document = crate::documents::document(&window)?;
    let name = suggested_filename(&suggested_name);
    let Some(target) = crate::documents::choose_save(&window, &name).await? else {
        return Ok(None);
    };
    let task = start_generated_export(
        document.backend.project.clone(),
        name,
        bytes,
        target,
        Some(window.app_handle().clone()),
    )?;
    await_export(task).await
}

#[tauri::command]
pub(crate) async fn save_frequency_export(
    window: WebviewWindow,
    analysis_id: String,
    query: FrequencyQuery,
    format: FrequencyExportFormat,
) -> std::result::Result<Option<String>, ExportError> {
    let document = crate::documents::document(&window)?;
    let analysis_id = analysis_id
        .parse()
        .map_err(|_| Error::new("invalid_request", "Invalid analysis result ID"))?;
    let Some(target) =
        crate::documents::choose_save(&window, &filename("frequency", format.extension())).await?
    else {
        return Ok(None);
    };
    let project = document.backend.project.clone();
    let app = window.app_handle().clone();
    let task = project
        .clone()
        .submit_task("Export Frequency", move |context| async move {
            context.progress("Exporting results", None);
            stage_and_install(target, Some(app), context, move |file| async move {
                project
                    .export_frequency_into(analysis_id, query, format, file)
                    .await
            })
            .await
        })?;
    await_export(task).await
}

async fn await_export(
    task: wordflow_backend::TaskHandle<String>,
) -> std::result::Result<Option<String>, ExportError> {
    let id = task.id.to_string();
    task.wait().await.map(Some).map_err(|error| ExportError {
        error,
        task_id: Some(id),
    })
}

#[cfg(test)]
fn start_export(
    project: wordflow_backend::ProjectRuntime,
    table_name: impl Into<wordflow_backend::ObjectTarget>,
    format: ExportFormat,
    target: PathBuf,
) -> Result<wordflow_backend::TaskHandle<String>> {
    let table_name = table_name.into();
    project
        .clone()
        .submit_task(format!("Export {table_name}"), move |context| async move {
            context.progress("Exporting data", None);
            stage_and_install(target, None, context, move |file| async move {
                project.export_node_into(table_name, format, file).await
            })
            .await
        })
}

fn start_generated_export(
    project: wordflow_backend::ProjectRuntime,
    name: String,
    bytes: Vec<u8>,
    target: PathBuf,
    app: Option<AppHandle>,
) -> Result<wordflow_backend::TaskHandle<String>> {
    project.submit_task(format!("Export {name}"), move |context| async move {
        context.progress("Saving file", None);
        let writer_context = context.clone();
        stage_and_install(target, app, context, move |mut file| async move {
            writer_context
                .run_blocking(move |context| {
                    for chunk in bytes.chunks(64 * 1024) {
                        context.check_cancelled()?;
                        file.write_all(chunk)?;
                    }
                    Ok(file)
                })
                .await
        })
        .await
    })
}

async fn stage_and_install<F>(
    target: PathBuf,
    app: Option<AppHandle>,
    context: wordflow_backend::TaskContext,
    write: impl FnOnce(tempfile::NamedTempFile) -> F,
) -> Result<String>
where
    F: Future<Output = Result<tempfile::NamedTempFile>>,
{
    let replace = target.exists();
    let staging_target = target.clone();
    let file = context
        .run_blocking(move |_| temporary(&staging_target))
        .await?;
    let file = write(file).await?;
    context.progress("Saving file", None);
    if let Some(app) = app {
        return app
            .state::<crate::documents::Documents>()
            .install_export(target, file, context, replace)
            .await;
    }
    context
        .run_blocking(move |context| install(target, file, &context, replace))
        .await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sql_names_and_export_filenames_are_separate() {
        assert_eq!(filename("a/b", "csv"), "a_b.csv");
        assert_eq!(filename("CON", "csv"), "_CON.csv");
        assert_eq!(suggested_filename("cloud.svg"), "cloud.svg");
        assert_eq!(suggested_filename("../cloud.svg"), ".._cloud.svg");
        assert_eq!(suggested_filename("NUL.png"), "_NUL.png");
    }

    #[tokio::test]
    async fn generated_bytes_replace_the_destination_after_caller_disconnect() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("cloud.svg");
        std::fs::write(&target, "old").unwrap();
        let project =
            wordflow_backend::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
        let bytes = b"<svg>captured result</svg>";
        let task = start_generated_export(
            project.clone(),
            "cloud.svg".into(),
            bytes.to_vec(),
            target.clone(),
            None,
        )
        .unwrap();
        let id = task.id;
        drop(task);
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            while !project
                .tasks()
                .tasks
                .iter()
                .find(|task| task.id == id)
                .unwrap()
                .state
                .is_finished()
            {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(std::fs::read(target).unwrap(), bytes);
        assert_eq!(
            project.tasks().tasks[0].state,
            wordflow_backend::TaskState::Succeeded
        );
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[tokio::test]
    async fn generated_export_failure_retains_task_identity_and_cleans_staging() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("occupied");
        std::fs::create_dir(&target).unwrap();
        let project =
            wordflow_backend::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
        let task = start_generated_export(
            project.clone(),
            "cloud.png".into(),
            vec![1, 2, 3],
            target.clone(),
            None,
        )
        .unwrap();
        let id = task.id.to_string();
        let error = await_export(task).await.err().unwrap();
        let error = serde_json::to_value(error).unwrap();
        assert_eq!(error["task_id"], id);
        assert!(error["code"].is_string());
        assert!(error["message"].is_string());
        assert_eq!(
            project.tasks().tasks[0].state,
            wordflow_backend::TaskState::Failed
        );
        assert!(target.is_dir());
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[tokio::test]
    async fn cancellation_during_staging_preserves_the_existing_file() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("cloud.svg");
        std::fs::write(&target, "old").unwrap();
        let destination = target.clone();
        let project =
            wordflow_backend::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
        let (started, staged) = tokio::sync::oneshot::channel();
        let (resume, resumed) = tokio::sync::oneshot::channel();
        let task = project
            .submit_task("Export cloud.svg", move |context| async move {
                stage_and_install(destination, None, context, move |mut file| async move {
                    file.write_all(b"new")?;
                    started.send(()).unwrap();
                    resumed.await.unwrap();
                    Ok(file)
                })
                .await
            })
            .unwrap();
        staged.await.unwrap();
        project.cancel_task(task.id).unwrap();
        resume.send(()).unwrap();
        assert!(task.wait().await.is_err());
        assert_eq!(
            project.tasks().tasks[0].state,
            wordflow_backend::TaskState::Cancelled
        );
        assert_eq!(std::fs::read(target).unwrap(), b"old");
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }
    #[tokio::test]
    async fn installation_honors_replace() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("data.csv");
        std::fs::write(&target, "old").unwrap();
        let mut file = temporary(&target).unwrap();
        std::io::Write::write_all(&mut file, b"new").unwrap();
        let runtime =
            wordflow_backend::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
        let destination = target.clone();
        runtime
            .submit_task("Export", move |context| async move {
                context
                    .run_blocking(move |context| install(destination, file, &context, true))
                    .await
            })
            .unwrap()
            .wait()
            .await
            .unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
    }

    #[tokio::test]
    async fn cancellation_and_install_failure_clean_staging_and_preserve_destination() {
        for cancel in [true, false] {
            let directory = tempfile::tempdir().unwrap();
            let target = directory.path().join("destination");
            if cancel {
                std::fs::write(&target, "old").unwrap();
            } else {
                std::fs::create_dir(&target).unwrap();
            }
            let file = temporary(&target).unwrap();
            let staging = file.path().to_owned();
            let destination = target.clone();
            let runtime =
                wordflow_backend::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
            let result = runtime
                .submit_task("Export", move |context| async move {
                    context
                        .run_blocking(move |context| {
                            if cancel {
                                context.cancellation().cancel();
                            }
                            install(destination, file, &context, true)
                        })
                        .await
                })
                .unwrap()
                .wait()
                .await;
            assert!(result.is_err());
            assert!(!staging.exists());
            if cancel {
                assert_eq!(std::fs::read(target).unwrap(), b"old");
            } else {
                assert!(target.is_dir());
            }
        }
    }

    #[tokio::test]
    async fn installation_wins_over_a_late_cancellation() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("result.csv");
        let file = temporary(&target).unwrap();
        let runtime =
            wordflow_backend::ProjectRuntime::new(tokio_util::sync::CancellationToken::new());
        runtime
            .submit_task("Export", move |context| async move {
                context
                    .run_blocking(move |context| {
                        let result = install(target, file, &context, false)?;
                        context.cancellation().cancel();
                        Ok(result)
                    })
                    .await
            })
            .unwrap()
            .wait()
            .await
            .unwrap();
        assert_eq!(
            runtime.tasks().tasks[0].state,
            wordflow_backend::TaskState::Succeeded
        );
    }

    #[tokio::test]
    async fn direct_exports_keep_full_output_and_own_installation_after_caller_disconnect() {
        let directory = tempfile::tempdir().unwrap();
        let shutdown = tokio_util::sync::CancellationToken::new();
        let project = wordflow_backend::ProjectRuntime::new(shutdown.clone());
        project.create(None).await.unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/api/project/sql", listener.local_addr().unwrap());
        let server = tokio::spawn(wordflow_backend::serve(
            listener,
            vec![],
            shutdown.clone(),
            project.clone(),
        ));
        let seeded = reqwest::Client::new()
            .post(url)
            .json(&serde_json::json!({"response":"command","statements":[
                {"sql":"CREATE TABLE documents AS SELECT i, 'row' AS text FROM range(1200) t(i)"},
                {"sql":"INSERT INTO wordflow.nodes(table_name) VALUES ('documents')"},
                {"sql":"CREATE SCHEMA other"},
                {"sql":"CREATE TABLE other.documents AS SELECT 7 AS n"}
            ]}))
            .send()
            .await
            .unwrap();
        assert!(seeded.status().is_success());
        for format in [
            ExportFormat::Csv,
            ExportFormat::Json,
            ExportFormat::Ndjson,
            ExportFormat::Parquet,
            ExportFormat::Ipc,
        ] {
            let target = directory
                .path()
                .join(format!("data.{}", format.extension()));
            let task = start_export(project.clone(), "documents", format, target.clone()).unwrap();
            task.wait().await.unwrap();
            assert!(std::fs::metadata(&target).unwrap().len() > 0);
            if matches!(format, ExportFormat::Csv) {
                let text = std::fs::read_to_string(target).unwrap();
                assert_eq!(text.lines().count(), 1201);
                assert!(text.contains("1199,row"));
            }
        }
        let explicit = directory.path().join("other.csv");
        start_export(
            project.clone(),
            wordflow_backend::ObjectTarget {
                schema: Some("other".into()),
                name: "documents".into(),
            },
            ExportFormat::Csv,
            explicit.clone(),
        )
        .unwrap()
        .wait()
        .await
        .unwrap();
        assert_eq!(std::fs::read_to_string(explicit).unwrap(), "n\n7\n");
        let target = directory.path().join("detached.csv");
        let task = start_export(
            project.clone(),
            "documents",
            ExportFormat::Csv,
            target.clone(),
        )
        .unwrap();
        let id = task.id;
        drop(task);
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            while project
                .tasks()
                .tasks
                .iter()
                .find(|t| t.id == id)
                .unwrap()
                .finished_at
                .is_none()
            {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(
            project
                .tasks()
                .tasks
                .iter()
                .find(|t| t.id == id)
                .unwrap()
                .state,
            wordflow_backend::TaskState::Succeeded
        );
        assert_eq!(
            std::fs::read_to_string(target).unwrap().lines().count(),
            1201
        );
        assert!(std::fs::read_dir(directory.path())
            .unwrap()
            .all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".wordflow-export-")));
        shutdown.cancel();
        server.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn frequency_exports_install_all_filtered_saved_rows_in_both_formats() {
        let directory = tempfile::tempdir().unwrap();
        let shutdown = tokio_util::sync::CancellationToken::new();
        let project = wordflow_backend::ProjectRuntime::new(shutdown.clone());
        project.create(None).await.unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}/api/project", listener.local_addr().unwrap());
        let server = tokio::spawn(wordflow_backend::serve(
            listener,
            vec![],
            shutdown.clone(),
            project.clone(),
        ));
        let client = reqwest::Client::new();
        client
            .post(format!("{base}/sql"))
            .json(&serde_json::json!({"response":"command","script":
                "CREATE TABLE documents AS SELECT 'alpha beta gamma delta' AS text"}))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap();
        let tab: serde_json::Value = client
            .post(format!("{base}/tabs"))
            .json(&serde_json::json!({"kind":"frequency"}))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap();
        let result: serde_json::Value = client
            .post(format!(
                "{base}/tabs/{}/frequency",
                tab["id"].as_str().unwrap()
            ))
            .json(&serde_json::json!({"inputs":[{
                "source":{"schema":"data","name":"documents"},
                "column":"text","tokenizer":"native:plain_words_en"
            }]}))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap();
        let analysis_id = result["id"].as_str().unwrap().parse().unwrap();
        client
            .post(format!("{base}/sql"))
            .json(&serde_json::json!({"response":"command","script":"DROP TABLE documents"}))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap();
        client.post(format!("{base}/sql")).json(&serde_json::json!({"script":"CREATE TABLE export_stopwords(word VARCHAR); INSERT INTO export_stopwords VALUES ('alpha'); INSERT INTO wordflow.nodes(table_name) VALUES ('export_stopwords')"})).send().await.unwrap().error_for_status().unwrap();
        for format in [FrequencyExportFormat::Csv, FrequencyExportFormat::Markdown] {
            let target = directory
                .path()
                .join(filename("frequency", format.extension()));
            std::fs::write(&target, "old").unwrap();
            let destination = target.clone();
            let runtime = project.clone();
            let query = FrequencyQuery {
                filter: Some("*a*".into()),
                stopword_source: Some(wordflow_backend::StopwordSource {
                    source: "export_stopwords".to_string().into(),
                    column: "word".into(),
                }),
                page_size: Some(1),
                limit: Some(1),
                ..Default::default()
            };
            project
                .submit_task("Export Frequency", move |context| async move {
                    stage_and_install(destination, None, context, move |file| async move {
                        runtime
                            .export_frequency_into(analysis_id, query, format, file)
                            .await
                    })
                    .await
                })
                .unwrap()
                .wait()
                .await
                .unwrap();
            let saved = std::fs::read_to_string(target).unwrap();
            for token in ["beta", "gamma", "delta"] {
                assert!(saved.contains(token), "missing {token}: {saved}");
            }
            assert!(!saved.contains("alpha"));
            let expected_lines = match format {
                FrequencyExportFormat::Csv => 4,
                FrequencyExportFormat::Markdown => 5,
            };
            assert_eq!(saved.lines().count(), expected_lines);
        }
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 2);
        shutdown.cancel();
        server.await.unwrap().unwrap();
    }
}
