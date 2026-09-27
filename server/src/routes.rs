use crate::*;
use axum::{
    Json,
    body::Body,
    extract::{DefaultBodyLimit, Path, Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response, Sse, sse::Event},
};
use futures_util::{StreamExt, TryStreamExt};
use serde::Deserialize;
use tokio::io::AsyncWriteExt;
use tower::ServiceExt;
use utoipa_axum::{router::OpenApiRouter, routes};
use wordflow_backend::{ErrorEnvelope, InputJson, TableNames};

pub fn router() -> OpenApiRouter<Host> {
    #[derive(utoipa::OpenApi)]
    #[openapi(components(schemas(Library)))]
    struct Schemas;
    OpenApiRouter::with_openapi(<Schemas as utoipa::OpenApi>::openapi())
        .routes(routes!(status))
        .routes(routes!(events))
        .routes(routes!(switch_project))
        .routes(routes!(save))
        .routes(routes!(snapshot))
        .routes(routes!(list))
        .routes(routes!(upload))
        .layer(DefaultBodyLimit::disable())
        .routes(routes!(download, delete))
        .routes(routes!(import))
}
#[utoipa::path(get, path="/api/server", operation_id="server_status", responses((status=200, body=ServerStatus), (status=500, body=ErrorEnvelope)))]
async fn status(State(host): State<Host>) -> Result<Json<ServerStatus>> {
    Ok(Json(host.status().await?))
}
#[utoipa::path(get, path="/api/server/events", operation_id="server_events", responses((status=200, description="Active project session identifiers as SSE data", content_type="text/event-stream", body=String)))]
async fn events(State(host): State<Host>) -> impl IntoResponse {
    let receiver = host.0.changed.subscribe();
    let shutdown = host.0.shutdown.clone();
    let initial = futures_util::stream::once(async move {
        Ok::<_, std::convert::Infallible>(
            Event::default().data(host.0.changed.borrow().to_string()),
        )
    });
    let updates = futures_util::stream::unfold(
        (receiver, shutdown),
        |(mut receive, shutdown)| async move {
            tokio::select! { _ = shutdown.cancelled() => None, result = receive.changed() => {
                result.ok()?;
                let id = *receive.borrow_and_update();
                Some((Ok::<_, std::convert::Infallible>(Event::default().data(id.to_string())), (receive, shutdown)))
            }}
        },
    );
    Sse::new(initial.chain(updates)).keep_alive(axum::response::sse::KeepAlive::default())
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ServerSwitch {
    pub session_id: Uuid,
    /// Absent for a new Untitled project; otherwise an existing library project filename.
    pub name: Option<String>,
    #[serde(default)]
    pub discard_untitled: bool,
    #[serde(default)]
    pub interrupt: bool,
}
#[utoipa::path(post, path="/api/server/project", operation_id="server_switch", request_body=ServerSwitch, responses((status=200, body=ServerStatus), (status=400, body=ErrorEnvelope), (status=409, body=ErrorEnvelope)))]
async fn switch_project(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerSwitch>,
) -> Result<Json<ServerStatus>> {
    tokio::spawn(async move { switch_project_owned(host, input).await }).await?
}
async fn switch_project_owned(host: Host, input: ServerSwitch) -> Result<Json<ServerStatus>> {
    let _mutation = host.0.mutation.lock().await;
    let active = host.session(input.session_id).await?;
    let path = input
        .name
        .as_ref()
        .map(|name| host.0.files.path(Library::Projects, name))
        .transpose()?;
    let current = active.runtime.status().await?;
    if path.is_some() && current.as_ref().and_then(|p| p.path.as_ref()) == path.as_ref() {
        return Ok(Json(host.status().await?));
    }
    if active.runtime.is_editing().await {
        return Err(Error::new(
            "editing_active",
            "Save or cancel your table edits before changing projects.",
        ));
    }
    if current.as_ref().is_some_and(|p| p.path.is_none()) && !input.discard_untitled {
        return Err(Error::new(
            "save_required",
            "Save this Untitled project or choose Discard before continuing.",
        ));
    }
    let attempt = active.runtime.begin_close()?;
    if attempt.has_work() && !input.interrupt {
        return Err(Error::new(
            "task_active",
            "Work is still running. Confirm cancellation before changing projects.",
        ));
    }
    // Prepare first: a missing, incompatible or locked destination leaves the old project usable.
    let next = host.new_runtime()?;
    if let Some(path) = path {
        next.open(path).await?;
    } else {
        next.create(None).await?;
    }
    if let Err(error) = active.runtime.close().await {
        next.close().await?;
        return Err(error);
    }
    let id = Uuid::new_v4();
    *host.0.active.write().await = Active { id, runtime: next };
    host.0.changed.send_replace(id);
    drop(attempt);
    Ok(Json(host.status().await?))
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ServerSave {
    pub session_id: Uuid,
    pub name: Option<String>,
}
#[utoipa::path(post, path="/api/server/project/save", operation_id="server_save", request_body=ServerSave, responses((status=200, body=ServerStatus), (status=400, body=ErrorEnvelope), (status=409, body=ErrorEnvelope)))]
async fn save(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerSave>,
) -> Result<Json<ServerStatus>> {
    tokio::spawn(async move { save_owned(host, input).await }).await?
}
async fn save_owned(host: Host, input: ServerSave) -> Result<Json<ServerStatus>> {
    let _mutation = host.0.mutation.lock().await;
    let active = host.session(input.session_id).await?;
    let path = input
        .name
        .map(|name| host.0.files.path(Library::Projects, &name))
        .transpose()?;
    if let Some(path) = &path
        && path.exists()
    {
        return Err(Error::new(
            "file_exists",
            "Choose an unused project filename.",
        ));
    }
    active.runtime.save(path).await?;
    host.0.changed.send_replace(active.id);
    Ok(Json(host.status().await?))
}
#[utoipa::path(get, path="/api/server/project/{id}/download", operation_id="server_snapshot", params(("id"=Uuid,Path)), responses((status=200, content_type="application/octet-stream", body=wordflow_backend::openapi::Binary), (status=409,body=ErrorEnvelope)))]
async fn snapshot(State(host): State<Host>, Path(id): Path<Uuid>) -> Result<Response> {
    let active = host.session(id).await?;
    let title = active
        .runtime
        .status()
        .await?
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
    host.0.files.path(library, &name)?;
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
    let _mutation = match library {
        Library::Data => host.0.data_files.lock().await,
        Library::Projects => host.0.mutation.lock().await,
    };
    let files = host.0.files.clone();
    tokio::task::spawn_blocking(move || files.publish(library, &name, staged))
        .await?
        .map(Json)
}
#[utoipa::path(get, path="/api/server/files/{library}/{name}", operation_id="server_download", params(("library"=Library,Path),("name"=String,Path)), responses((status=200,content_type="application/octet-stream",body=wordflow_backend::openapi::Binary),(status=400,body=ErrorEnvelope)))]
async fn download(
    State(host): State<Host>,
    Path((library, name)): Path<(Library, String)>,
) -> Result<Response> {
    let _mutation = match library {
        Library::Data => host.0.data_files.lock().await,
        Library::Projects => host.0.mutation.lock().await,
    };
    let path = host.0.files.path(library, &name)?;
    if matches!(library, Library::Projects) {
        let active = host.0.active.read().await.clone();
        if active.runtime.status().await?.and_then(|p| p.path).as_ref() == Some(&path) {
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
}
#[utoipa::path(delete, path="/api/server/files/{library}/{name}", operation_id="server_delete", params(("library"=Library,Path),("name"=String,Path)), responses((status=204,description="Deleted"),(status=409,body=ErrorEnvelope)))]
async fn delete(
    State(host): State<Host>,
    Path((library, name)): Path<(Library, String)>,
) -> Result<StatusCode> {
    let _mutation = match library {
        Library::Data => host.0.data_files.lock().await,
        Library::Projects => host.0.mutation.lock().await,
    };
    let path = host.0.files.path(library, &name)?;
    if matches!(library, Library::Projects) {
        if host
            .0
            .active
            .read()
            .await
            .runtime
            .status()
            .await?
            .and_then(|p| p.path)
            .as_ref()
            == Some(&path)
        {
            return Err(Error::new(
                "project_busy",
                "Open another project before deleting this file.",
            ));
        }
        tokio::task::spawn_blocking(move || {
            let _lock = wordflow_backend::lock_destination(&path)?;
            std::fs::remove_file(path).map_err(Error::from)
        })
        .await??;
    } else {
        tokio::fs::remove_file(path).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ServerImport {
    pub session_id: Uuid,
    pub name: String,
}
#[utoipa::path(post,path="/api/server/import",operation_id="server_import",request_body=ServerImport,responses((status=200,body=TableNames),(status=400,body=ErrorEnvelope),(status=409,body=ErrorEnvelope)))]
async fn import(
    State(host): State<Host>,
    InputJson(input): InputJson<ServerImport>,
) -> Result<Response> {
    tokio::spawn(async move { import_owned(host, input).await }).await?
}
async fn import_owned(host: Host, input: ServerImport) -> Result<Response> {
    let _file = host.0.data_files.lock().await;
    let active = host.session(input.session_id).await?;
    let path = host.0.files.path(Library::Data, &input.name)?;
    let extension = std::path::Path::new(&input.name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let reader = match extension.as_str() {
        "csv" | "tsv" => "read_csv",
        "json" | "jsonl" | "ndjson" => "read_json",
        "parquet" => "read_parquet",
        _ => {
            return Err(Error::invalid(
                "Choose a CSV, TSV, Parquet, JSON, JSONL or NDJSON file.",
            ));
        }
    };
    let name = std::path::Path::new(&input.name)
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("data");
    let payload = serde_json::json!({"sources":[{"table_name":name,"sql":format!("SELECT * FROM {reader}(?)"),"parameters":[path]}]});
    let request = Request::builder()
        .method("POST")
        .uri("/api/project/import")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_vec(&payload)?))
        .map_err(|e| Error::invalid(e.to_string()))?;
    dispatch(&host, active, request).await
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
    let prefix = format!("/session/{id}");
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
