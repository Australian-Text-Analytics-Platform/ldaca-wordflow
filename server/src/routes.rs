use crate::*;
use axum::{
    Json,
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response, Sse, sse::Event},
};
use futures_util::{StreamExt, TryStreamExt};
use serde::Deserialize;
use tokio::io::AsyncWriteExt;
use tower::ServiceExt;
use utoipa_axum::{router::OpenApiRouter, routes};
use wordflow_backend::{
    ErrorEnvelope, FileImportPlan, FileImportResult, FileImportSelection, InputJson,
};

pub fn router() -> OpenApiRouter<Host> {
    #[derive(utoipa::OpenApi)]
    #[openapi(components(schemas(Library)))]
    struct Schemas;
    OpenApiRouter::with_openapi(<Schemas as utoipa::OpenApi>::openapi())
        .routes(routes!(status))
        .routes(routes!(events))
        .routes(routes!(project_status))
        .routes(routes!(switch_project))
        .routes(routes!(close_project))
        .routes(routes!(rename_project))
        .routes(routes!(duplicate_project))
        .routes(routes!(snapshot))
        .routes(routes!(list))
        .routes(routes!(upload))
        .layer(DefaultBodyLimit::disable())
        .routes(routes!(download, delete))
        .routes(routes!(import))
        .routes(routes!(inspect_import))
        .routes(routes!(create_folder))
        .routes(routes!(move_files))
        .routes(routes!(delete_files))
        .routes(routes!(download_files))
}
#[utoipa::path(get, path="/api/server", operation_id="server_status", responses((status=200, body=ServerStatus), (status=500, body=ErrorEnvelope)))]
async fn status(State(host): State<Host>) -> Result<Json<ServerStatus>> {
    Ok(Json(host.status().await?))
}
#[derive(Deserialize)]
struct EventSelection {
    project_id: Option<Uuid>,
}
#[utoipa::path(get, path="/api/server/events", operation_id="server_events", params(("project_id"=Option<Uuid>,Query,description="Include this session's native project events on the same stream")), responses((status=200, description="User registry, preferences and optionally native project events", content_type="text/event-stream", body=String)))]
async fn events(State(host): State<Host>, Query(input): Query<EventSelection>) -> Response {
    let project = if let Some(id) = input.project_id {
        host.0.projects.read().await.get(&id).cloned()
    } else {
        None
    };
    let project_router = project.map(|active| {
        wordflow_backend::router(
            host.0.origins.clone(),
            host.0.shutdown.clone(),
            active.runtime,
        )
    });
    let receiver = host.0.changed.subscribe();
    let preferences = host.0.preferences.changes();
    let shutdown = host.0.shutdown.clone();
    let initial = futures_util::stream::once(async move {
        Ok::<_, std::convert::Infallible>(
            Event::default().data(host.0.changed.borrow().to_string()),
        )
    });
    let updates = futures_util::stream::unfold(
        (receiver, preferences, shutdown),
        |(mut receive, mut preferences, shutdown)| async move {
            tokio::select! {
                _ = shutdown.cancelled() => return None,
                result = receive.changed() => { result.ok()?; receive.borrow_and_update(); },
                result = preferences.changed() => { result.ok()?; preferences.borrow_and_update(); },
            }
            Some((
                Ok::<_, std::convert::Infallible>(Event::default().data("changed")),
                (receive, preferences, shutdown),
            ))
        },
    );
    let response = Sse::new(initial.chain(updates))
        .keep_alive(axum::response::sse::KeepAlive::default())
        .into_response();
    if let Some(router) = project_router {
        let mut request = Request::new(Body::empty());
        *request.uri_mut() = axum::http::Uri::from_static("/api/project/events");
        let project = router
            .oneshot(request)
            .await
            .unwrap_or_else(|never| match never {});
        if project.status().is_success() {
            let (parts, body) = response.into_parts();
            return Response::from_parts(
                parts,
                Body::from_stream(futures_util::stream::select(
                    body.into_data_stream(),
                    project.into_body().into_data_stream(),
                )),
            );
        }
    }
    response
}
#[utoipa::path(get,path="/api/server/project/{id}",operation_id="server_project",params(("id"=Uuid,Path)),responses((status=200,body=ServerProject),(status=409,body=ErrorEnvelope)))]
async fn project_status(
    State(host): State<Host>,
    Path(id): Path<Uuid>,
) -> Result<Json<ServerProject>> {
    Ok(Json(host.project_status(id).await?))
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ServerSwitch {
    pub name: Option<String>,
}
#[utoipa::path(post,path="/api/server/project",operation_id="server_open",request_body=ServerSwitch,responses((status=200,body=ServerProject),(status=400,body=ErrorEnvelope),(status=409,body=ErrorEnvelope)))]
async fn switch_project(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerSwitch>,
) -> Result<Json<ServerProject>> {
    tokio::spawn(async move {
        let _mutation = host.0.mutation.lock().await;
        let path = input
            .name
            .as_ref()
            .map(|name| host.0.files.path(Library::Projects, name))
            .transpose()?;
        if let Some(path) = &path
            && let Some(active) = host.open_file(path).await?
        {
            return Ok(Json(host.project_status(active.id).await?));
        }
        let runtime = host.new_runtime()?;
        match path {
            Some(path) => {
                runtime.open(path).await?;
            }
            None => {
                let names = host.0.files.list(Library::Projects)?;
                let mut number = 1_u64;
                let path = loop {
                    let name = format!("Untitled-{number}.wfpj");
                    let path = host.0.files.path(Library::Projects, &name)?;
                    if !names
                        .iter()
                        .any(|file| file.name.eq_ignore_ascii_case(&name))
                    {
                        break path;
                    }
                    number += 1;
                };
                runtime.create(Some(path)).await?;
            }
        }
        let id = Uuid::new_v4();
        host.0
            .projects
            .write()
            .await
            .insert(id, Active { id, runtime });
        host.changed();
        Ok(Json(host.project_status(id).await?))
    })
    .await?
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ServerClose {
    pub project_id: Uuid,
    #[serde(default)]
    pub interrupt: bool,
}
#[utoipa::path(post,path="/api/server/project/close",operation_id="server_close",request_body=ServerClose,responses((status=204,description="Shared project closed"),(status=409,body=ErrorEnvelope)))]
async fn close_project(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerClose>,
) -> Result<StatusCode> {
    tokio::spawn(async move {
        let _mutation = host.0.mutation.lock().await;
        let active = host.session(input.project_id).await?;
        if active.runtime.is_editing().await {
            return Err(Error::new(
                "editing_active",
                "Save or cancel table edits before closing this project.",
            ));
        }
        let attempt = active.runtime.begin_close()?;
        if attempt.has_work() && !input.interrupt {
            return Err(Error::new(
                "task_active",
                "Confirm cancellation before closing the shared project.",
            ));
        }
        active.runtime.close().await?;
        host.0.projects.write().await.remove(&active.id);
        host.changed();
        drop(attempt);
        Ok(StatusCode::NO_CONTENT)
    })
    .await?
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ServerRename {
    pub project_id: Uuid,
    pub name: String,
}
#[utoipa::path(post, path="/api/server/project/rename", operation_id="server_rename", request_body=ServerRename, responses((status=200, body=ServerProject), (status=400, body=ErrorEnvelope), (status=409, body=ErrorEnvelope)))]
async fn rename_project(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerRename>,
) -> Result<Json<ServerProject>> {
    tokio::spawn(async move {
        let _mutation = host.0.mutation.lock().await;
        let active = host.session(input.project_id).await?;
        let name = input.name.trim();
        let path = host.0.files.path(Library::Projects, name)?;
        let original = active.runtime.status().await?.and_then(|p| p.path);
        if host.0.files.list(Library::Projects)?.iter().any(|file| {
            file.name.to_lowercase() == name.to_lowercase()
                && Some(host.0.files.directory(Library::Projects).join(&file.name)) != original
        }) {
            return Err(Error::new(
                "file_exists",
                "Choose an unused project filename.",
            ));
        }
        active.runtime.rename(path).await?;
        host.changed();
        Ok(Json(host.project_status(active.id).await?))
    })
    .await?
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ServerDuplicate {
    pub project_id: Uuid,
}
#[utoipa::path(post, path="/api/server/project/duplicate", operation_id="server_duplicate", request_body=ServerDuplicate, responses((status=200, body=LibraryFile), (status=409, body=ErrorEnvelope)))]
async fn duplicate_project(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerDuplicate>,
) -> Result<Json<LibraryFile>> {
    tokio::spawn(async move {
        let _mutation = host.0.mutation.lock().await;
        let active = host.session(input.project_id).await?;
        let title = active
            .runtime
            .status()
            .await?
            .ok_or_else(|| Error::new("project_closed", "Project is closed"))?
            .title;
        let snapshot = active.runtime.snapshot().await?;
        let files = host.0.files.clone();
        let file = tokio::task::spawn_blocking(move || {
            files.publish(Library::Projects, &format!("{title}_copy.wfpj"), snapshot)
        })
        .await??;
        host.changed();
        Ok(Json(file))
    })
    .await?
}
#[utoipa::path(get, path="/api/server/project/{id}/download", operation_id="server_snapshot", params(("id"=Uuid,Path)), responses((status=200, content_type="application/octet-stream", body=wordflow_backend::openapi::Binary), (status=409,body=ErrorEnvelope)))]
async fn snapshot(State(host): State<Host>, Path(id): Path<Uuid>) -> Result<Response> {
    let active = host.session(id).await?;
    let title = active
        .status()
        .await?
        .project
        .map(|p| p.title)
        .unwrap_or_else(|| "Untitled".into());
    let file = active.runtime.snapshot().await?;
    staged_download(file, &format!("{title}.wfpj")).await
}
#[utoipa::path(get, path="/api/server/files/{library}", operation_id="server_files", params(("library"=Library,Path)), responses((status=200, body=Vec<LibraryFile>), (status=400,body=ErrorEnvelope)))]
async fn list(
    State(host): State<Host>,
    Path(library): Path<Library>,
) -> Result<Json<Vec<LibraryFile>>> {
    tokio::task::spawn_blocking(move || host.0.files.list(library))
        .await?
        .map(Json)
}
#[utoipa::path(put, path="/api/server/files/{library}/{name}", operation_id="server_upload", params(("library"=Library,Path),("name"=String,Path)), request_body(content=wordflow_backend::openapi::Binary,content_type="application/octet-stream"), responses((status=200,body=LibraryFile),(status=400,body=ErrorEnvelope)))]
async fn upload(
    State(host): State<Host>,
    Path((library, name)): Path<(Library, String)>,
    body: Body,
) -> Result<Json<LibraryFile>> {
    if name.is_empty() || host.0.files.path(library, &name)?.is_dir() {
        return Err(Error::invalid("Choose a filename"));
    }
    let protection = if matches!(library, Library::Data) {
        let mut mutations = host.0.data_files.lock().await;
        host.0.files.path(library, &name)?;
        let id = Uuid::new_v4();
        mutations.uploads.insert(
            id,
            std::fs::canonicalize(
                host.0
                    .files
                    .path(library, &name)?
                    .parent()
                    .ok_or_else(|| Error::invalid("Choose an upload folder"))?,
            )?,
        );
        Some(UploadProtection {
            host: host.clone(),
            id,
        })
    } else {
        None
    };
    let files = host.0.files.clone();
    let staged = tokio::task::spawn_blocking(move || {
        tempfile::NamedTempFile::new_in(files.directory(library))
    })
    .await??;
    let mut output = tokio::fs::OpenOptions::new()
        .write(true)
        .open(staged.path())
        .await?;
    let mut stream = body.into_data_stream();
    while let Some(chunk) = tokio::select! { _ = host.0.shutdown.cancelled() => return Err(Error::new("stopping","Server is stopping")), chunk=stream.next()=>chunk }
    {
        output
            .write_all(&chunk.map_err(|e| Error::invalid(e.to_string()))?)
            .await?;
    }
    output.flush().await?;
    output.sync_all().await?;
    drop(output);
    if matches!(library, Library::Projects) {
        ProjectRuntime::validate_file(staged.path().to_path_buf()).await?;
    }
    let _data = if matches!(library, Library::Data) {
        Some(host.0.data_files.clone().lock_owned().await)
    } else {
        None
    };
    let _projects = if matches!(library, Library::Projects) {
        Some(host.0.mutation.clone().lock_owned().await)
    } else {
        None
    };
    let files = host.0.files.clone();
    tokio::task::spawn_blocking(move || {
        // Accepted publication keeps the gate and receiving-folder protection
        // until the blocking worker finishes, even if its HTTP receiver disappears.
        let (_data, _projects, _protection) = (_data, _projects, protection);
        files.publish(library, &name, staged)
    })
    .await?
    .map(Json)
}
#[utoipa::path(get, path="/api/server/files/{library}/{name}", operation_id="server_download", params(("library"=Library,Path),("name"=String,Path)), responses((status=200,content_type="application/octet-stream",body=wordflow_backend::openapi::Binary),(status=400,body=ErrorEnvelope)))]
async fn download(
    State(host): State<Host>,
    Path((library, name)): Path<(Library, String)>,
) -> Result<Response> {
    // Snapshot work owns its file gate through completion, independently of HTTP.
    tokio::spawn(async move {
        let _data = if matches!(library, Library::Data) {
            Some(host.0.data_files.lock().await)
        } else {
            None
        };
        let _projects = if matches!(library, Library::Projects) {
            Some(host.0.mutation.lock().await)
        } else {
            None
        };
        let path = host.0.files.path(library, &name)?;
        if matches!(library, Library::Projects) {
            if let Some(active) = host.open_file(&path).await? {
                return staged_download(active.runtime.snapshot().await?, &name).await;
            }
            let runtime = host.new_runtime()?;
            runtime.open(path).await?;
            let result = runtime.snapshot().await;
            runtime.close().await?;
            return staged_download(result?, &name).await;
        }
        let file = tokio::fs::File::open(path).await?;
        Ok(download_response(
            Body::from_stream(tokio_util::io::ReaderStream::new(file)),
            &name,
        ))
    })
    .await?
}
#[utoipa::path(delete, path="/api/server/files/{library}/{name}", operation_id="server_delete", params(("library"=Library,Path),("name"=String,Path)), responses((status=204,description="Deleted"),(status=409,body=ErrorEnvelope)))]
async fn delete(
    State(host): State<Host>,
    Path((library, name)): Path<(Library, String)>,
) -> Result<StatusCode> {
    delete_batch(&host, library, vec![name]).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ServerImport {
    pub project_id: Uuid,
    pub names: Vec<String>,
    pub selected: Option<Vec<FileImportSelection>>,
}
#[utoipa::path(post,path="/api/server/import",operation_id="server_import",request_body=ServerImport,responses((status=200,body=FileImportResult),(status=400,body=ErrorEnvelope),(status=409,body=ErrorEnvelope)))]
async fn import(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerImport>,
) -> Result<Response> {
    tokio::spawn(async move { import_owned(host, input, false).await }).await?
}
#[utoipa::path(post,path="/api/server/import/inspect",operation_id="server_inspect_import",request_body=ServerImport,responses((status=200,body=FileImportPlan),(status=400,body=ErrorEnvelope)))]
async fn inspect_import(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerImport>,
) -> Result<Response> {
    import_owned(host, input, true).await
}
async fn import_owned(host: Host, input: ServerImport, inspect: bool) -> Result<Response> {
    let _file = host.0.data_files.lock().await;
    let active = host.session(input.project_id).await?;
    let selected = host.0.files.selections(Library::Data, &input.names)?;
    let payload = wordflow_backend::FileImportRequest {
        paths: selected.into_iter().map(|(_, p)| p).collect(),
        root: Some(host.0.files.directory(Library::Data)),
        selected: input.selected,
    };
    let request = Request::builder()
        .method("POST")
        .uri(if inspect {
            "/api/project/import/inspect"
        } else {
            "/api/project/import/files"
        })
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_vec(&payload)?))
        .map_err(|e| Error::invalid(e.to_string()))?;
    dispatch(&host, active, request).await
}
struct UploadProtection {
    host: Host,
    id: Uuid,
}
impl Drop for UploadProtection {
    fn drop(&mut self) {
        let host = self.host.clone();
        let id = self.id;
        tokio::spawn(async move {
            host.0.data_files.lock().await.uploads.remove(&id);
        });
    }
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct FolderRequest {
    name: String,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct FileSelection {
    library: Library,
    names: Vec<String>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct FileMove {
    names: Vec<String>,
    destination: String,
}
#[utoipa::path(post,path="/api/server/files/folder",operation_id="server_create_folder",request_body=FolderRequest,responses((status=200,body=LibraryFile),(status=400,body=ErrorEnvelope)))]
async fn create_folder(
    State(host): State<Host>,
    InputJson(input): InputJson<FolderRequest>,
) -> Result<Json<LibraryFile>> {
    let gate = host.0.data_files.clone().lock_owned().await;
    let files = host.0.files.clone();
    Ok(Json(
        tokio::task::spawn_blocking(move || {
            let _gate = gate;
            files.folder(input.name.trim())
        })
        .await??,
    ))
}
#[utoipa::path(post,path="/api/server/files/move",operation_id="server_move_files",request_body=FileMove,responses((status=204,description="Moved"),(status=400,body=ErrorEnvelope),(status=409,body=ErrorEnvelope)))]
async fn move_files(
    State(host): State<Host>,
    InputJson(input): InputJson<FileMove>,
) -> Result<StatusCode> {
    let gate = host.0.data_files.clone().lock_owned().await;
    gate.preflight(&host.0.files, &input.names)?;
    let files = host.0.files.clone();
    tokio::task::spawn_blocking(move || {
        let _gate = gate;
        files.move_files(&input.names, &input.destination)
    })
    .await??;
    Ok(StatusCode::NO_CONTENT)
}
async fn delete_batch(host: &Host, library: Library, names: Vec<String>) -> Result<()> {
    let data = if matches!(library, Library::Data) {
        Some(host.0.data_files.clone().lock_owned().await)
    } else {
        None
    };
    let _projects = if matches!(library, Library::Projects) {
        Some(host.0.mutation.clone().lock_owned().await)
    } else {
        None
    };
    if let Some(gate) = data.as_ref() {
        gate.preflight(&host.0.files, &names)?;
    }
    let selected = host.0.files.selections(library, &names)?;
    let mut locks = Vec::new();
    if matches!(library, Library::Projects) {
        for (_, path) in &selected {
            if host.open_file(path).await?.is_some() {
                return Err(Error::new(
                    "project_busy",
                    "Close the project before deleting it.",
                ));
            }
            locks.push(wordflow_backend::lock_destination(path)?);
        }
    }
    let files = host.0.files.clone();
    tokio::task::spawn_blocking(move || {
        let (_locks, _data, _projects) = (locks, data, _projects);
        files.delete_files(library, &names)
    })
    .await?
}
#[utoipa::path(post,path="/api/server/files/delete-batch",operation_id="server_delete_files",request_body=FileSelection,responses((status=204,description="Deleted"),(status=409,body=ErrorEnvelope)))]
async fn delete_files(
    State(host): State<Host>,
    InputJson(input): InputJson<FileSelection>,
) -> Result<StatusCode> {
    delete_batch(&host, input.library, input.names).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(post,path="/api/server/files/download",operation_id="server_download_files",request_body=FileSelection,responses((status=200,content_type="application/zip",body=wordflow_backend::openapi::Binary),(status=400,body=ErrorEnvelope)))]
async fn download_files(
    State(host): State<Host>,
    InputJson(input): InputJson<FileSelection>,
) -> Result<Response> {
    if !matches!(input.library, Library::Data) {
        return Err(Error::invalid(
            "Download projects individually to include their current state",
        ));
    }
    let gate = host.0.data_files.clone().lock_owned().await;
    let files = host.0.files.clone();
    let output = tokio::task::spawn_blocking(move || {
        let _gate = gate;
        files.zip(&input.names)
    })
    .await??;
    staged_download(output, "selected_files.zip").await
}
pub async fn project_request(
    State(host): State<Host>,
    Path((id, path)): Path<(Uuid, String)>,
    mut request: Request,
) -> Result<Response> {
    let active = host.session(id).await?;
    // Browser lifecycle must pass through the host; arbitrary host paths are not project choices.
    if matches!(
        path.as_str(),
        "api/project/create" | "api/project/open" | "api/project/close" | "api/project/save"
    ) {
        return Err(Error::invalid("Use the server project controls."));
    }
    let prefix = format!("/project/{id}");
    let uri = request
        .uri()
        .path_and_query()
        .map(|v| v.as_str())
        .and_then(|v| v.strip_prefix(&prefix))
        .ok_or_else(|| Error::invalid("Invalid project session URL"))?;
    *request.uri_mut() = uri
        .parse()
        .map_err(|e: axum::http::uri::InvalidUri| Error::invalid(e.to_string()))?;
    dispatch(&host, active, request).await
}
async fn dispatch(host: &Host, active: Active, mut request: Request) -> Result<Response> {
    // This is a fresh router dispatch. Outer session captures must not leak into
    // the backend's Path extractors; headers, encoded URI and body remain intact.
    request.extensions_mut().clear();
    Ok(wordflow_backend::router(
        host.0.origins.clone(),
        host.0.shutdown.clone(),
        active.runtime,
    )
    .oneshot(request)
    .await
    .unwrap_or_else(|never| match never {}))
}
async fn staged_download(file: tempfile::NamedTempFile, name: &str) -> Result<Response> {
    let reader = tokio::fs::File::open(file.path()).await?;
    let stream = tokio_util::io::ReaderStream::new(reader).map_ok(move |chunk| {
        let _keep = &file;
        chunk
    });
    Ok(download_response(Body::from_stream(stream), name))
}
fn download_response(body: Body, name: &str) -> Response {
    let encoded = name
        .as_bytes()
        .iter()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_') {
                char::from(*b).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect::<String>();
    (
        [
            (header::CONTENT_TYPE, "application/octet-stream".to_owned()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename*=UTF-8''{encoded}"),
            ),
        ],
        body,
    )
        .into_response()
}

pub async fn check_origin(
    State(host): State<Host>,
    request: Request,
    next: axum::middleware::Next,
) -> Response {
    if request
        .headers()
        .get(header::ORIGIN)
        .is_some_and(|origin| !host.0.origins.contains(origin))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorEnvelope {
                error: Error::new("origin_not_allowed", "Origin is not allowed"),
            }),
        )
            .into_response();
    }
    next.run(request).await
}
