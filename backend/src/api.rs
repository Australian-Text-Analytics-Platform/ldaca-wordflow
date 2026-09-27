use crate::{
    error::Result,
    project::{ObjectTarget, ProjectRuntime, SqlBatch, SqlStatement, cell_edit},
};
use axum::{
    Json,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{StatusCode, header},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = EmptyRequest)]
#[serde(deny_unknown_fields)]
struct Empty {}

#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = ProjectPathRequest)]
#[serde(deny_unknown_fields)]
struct Create {
    #[schema(value_type = Option<String>)]
    path: Option<PathBuf>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = OpenProjectRequest)]
#[serde(deny_unknown_fields)]
struct Open {
    #[schema(value_type = String)]
    path: PathBuf,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = EditViewRequest)]
#[serde(deny_unknown_fields)]
struct Edit {
    sql: String,
    #[serde(default)]
    before: Vec<SqlStatement>,
    #[serde(default)]
    after: Vec<SqlStatement>,
}
#[derive(Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct ViewDefinition {
    sql: String,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct ReplaceSource {
    old_source_name: String,
    new_source_name: String,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct ReplaceObjectSource {
    old_source: crate::query::Relation,
    new_source: crate::query::Relation,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = RenameNodeRequest)]
#[serde(deny_unknown_fields)]
struct Rename {
    name: String,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = NodeExportRequest)]
#[serde(deny_unknown_fields)]
struct Export {
    format: crate::ExportFormat,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct SqlRequest {
    task_label: Option<String>,
    #[serde(flatten)]
    #[schema(schema_with = flattened_schema)]
    batch: SqlBatch,
}

/// Keep the ordinary response while identifying failures already owned by the task observer.
pub(crate) async fn task_response<T: IntoResponse>(
    task: crate::TaskHandle<T>,
) -> Result<axum::response::Response> {
    let id = task.id;
    identified_task_response(id, task.wait().await.into_response())
}
pub(crate) fn identified_task_response(
    id: uuid::Uuid,
    mut response: axum::response::Response,
) -> Result<axum::response::Response> {
    response.headers_mut().insert(
        "x-wordflow-task-id",
        id.to_string()
            .parse()
            .map_err(|error: axum::http::header::InvalidHeaderValue| {
                crate::Error::invalid(error.to_string())
            })?,
    );
    Ok(response)
}

pub(crate) fn router() -> utoipa_axum::router::OpenApiRouter<ProjectRuntime> {
    utoipa_axum::router::OpenApiRouter::new()
        .routes(utoipa_axum::routes!(status))
        .routes(utoipa_axum::routes!(crate::language_assets::get))
        .merge(crate::analysis_api::router())
        .merge(crate::ai::http::router())
        .routes(utoipa_axum::routes!(tasks))
        .routes(utoipa_axum::routes!(task_events))
        .routes(utoipa_axum::routes!(cancel_task))
        .routes(utoipa_axum::routes!(dismiss_task))
        .routes(utoipa_axum::routes!(crate::samples::catalogue))
        .routes(utoipa_axum::routes!(crate::samples::import))
        .routes(utoipa_axum::routes!(crate::ldaca::search))
        .routes(utoipa_axum::routes!(crate::ldaca::import))
        .routes(utoipa_axum::routes!(create))
        .routes(utoipa_axum::routes!(open))
        .routes(utoipa_axum::routes!(close))
        .routes(utoipa_axum::routes!(save))
        .routes(utoipa_axum::routes!(delete_node))
        .routes(utoipa_axum::routes!(rename_node))
        .routes(utoipa_axum::routes!(clone_node))
        .routes(utoipa_axum::routes!(export_node))
        .routes(utoipa_axum::routes!(inspect_export))
        .routes(utoipa_axum::routes!(export_project))
        .routes(utoipa_axum::routes!(delete_node_object))
        .routes(utoipa_axum::routes!(rename_node_object))
        .routes(utoipa_axum::routes!(clone_node_object))
        .routes(utoipa_axum::routes!(export_node_object))
        .routes(utoipa_axum::routes!(node_page))
        .routes(utoipa_axum::routes!(edit))
        .routes(utoipa_axum::routes!(undo))
        .routes(utoipa_axum::routes!(replace_object_source))
        .routes(utoipa_axum::routes!(materialize))
        .routes(utoipa_axum::routes!(begin_cell_edit))
        .routes(utoipa_axum::routes!(node_schema))
        .routes(utoipa_axum::routes!(
            view_definition,
            replace_view_definition
        ))
        .routes(utoipa_axum::routes!(change_column))
        .routes(utoipa_axum::routes!(change_column_object))
        .routes(utoipa_axum::routes!(create_view))
        .routes(utoipa_axum::routes!(read_stopwords))
        .routes(utoipa_axum::routes!(prepare_stopwords))
        .merge(
            utoipa_axum::router::OpenApiRouter::new()
                .routes(utoipa_axum::routes!(save_stopwords))
                .layer(DefaultBodyLimit::disable()),
        )
        .routes(utoipa_axum::routes!(sql))
        .routes(utoipa_axum::routes!(parse_expression))
        .routes(utoipa_axum::routes!(import_tables))
        .routes(utoipa_axum::routes!(file_metadata))
        .routes(utoipa_axum::routes!(graph))
        .routes(utoipa_axum::routes!(node_schema_registered))
        .routes(utoipa_axum::routes!(node_page_registered))
        .routes(utoipa_axum::routes!(edit_registered))
        .routes(utoipa_axum::routes!(
            view_definition_registered,
            replace_view_definition_registered
        ))
        .routes(utoipa_axum::routes!(undo_registered))
        .routes(utoipa_axum::routes!(replace_source))
        .routes(utoipa_axum::routes!(materialize_registered))
        .routes(utoipa_axum::routes!(begin_cell_edit_registered))
        .routes(utoipa_axum::routes!(cell_edit_page))
        .routes(utoipa_axum::routes!(save_cell_edit))
        .routes(utoipa_axum::routes!(cancel_cell_edit))
}
#[utoipa::path(
    get, path = "/api/project/tasks", operation_id = "api_tasks",
    tag = "api",
    responses((status = 200, description = "Success", body = crate::TaskSnapshot), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn tasks(State(project): State<ProjectRuntime>) -> impl IntoResponse {
    Json(project.tasks())
}
#[utoipa::path(
    post, path = "/api/project/tasks/{task_id}/cancel", operation_id = "api_cancel_task",
    tag = "api",
    params(("task_id" = String, Path)),
    request_body = Empty,
    responses((status = 200, description = "Success", body = crate::TaskSnapshot), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn cancel_task(
    State(project): State<ProjectRuntime>,
    Path(id): Path<String>,
    InputJson(_input): InputJson<Empty>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.cancel_task(task_id(&id)?)?))
}
#[utoipa::path(
    delete, path = "/api/project/tasks/{task_id}", operation_id = "api_dismiss_task",
    tag = "api",
    params(("task_id" = String, Path)),
    responses((status = 200, description = "Success", body = crate::TaskSnapshot), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn dismiss_task(
    State(project): State<ProjectRuntime>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.dismiss_task(task_id(&id)?)?))
}
fn task_id(id: &str) -> Result<uuid::Uuid> {
    uuid::Uuid::parse_str(id).map_err(|_| crate::Error::invalid("Invalid task identifier"))
}
#[utoipa::path(
    get, path = "/api/project/events", operation_id = "api_task_events",
    tag = "api",
    responses((status = 200, description = "Success", content((String = "text/event-stream"))), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn task_events(State(project): State<ProjectRuntime>) -> impl IntoResponse {
    use axum::response::sse::{Event, KeepAlive, Sse};
    let changes = project.changes();
    let (tasks, shutdown) = project.task_events();
    let stream = futures_util::stream::unfold(
        (tasks, changes, shutdown, 0_u8),
        |(mut tasks, mut changes, shutdown, initial)| async move {
            if shutdown.is_cancelled() {
                return None;
            }
            let event = match initial {
                0 => Event::default()
                    .event("tasks")
                    .json_data(tasks.borrow_and_update().clone()),
                1 => Event::default().event("reset").json_data(()),
                _ => tokio::select! {
                    biased;
                    () = shutdown.cancelled() => return None,
                    change = changes.recv() => match change {
                        Ok(change) => Event::default().event("change").json_data(change),
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => Event::default().event("reset").json_data(()),
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => return None,
                    },
                    changed = tasks.changed() => {
                        if changed.is_err() { return None; }
                        // Progress can coalesce; committed changes use their own bounded channel.
                        tokio::select! { biased; () = shutdown.cancelled() => return None, () = tokio::time::sleep(std::time::Duration::from_millis(100)) => {} }
                        Event::default().event("tasks").json_data(tasks.borrow_and_update().clone())
                    }
                },
            };
            Some((event, (tasks, changes, shutdown, 2.min(initial + 1))))
        },
    );
    Sse::new(stream).keep_alive(KeepAlive::default())
}
#[utoipa::path(
    get, path = "/api/project", operation_id = "api_status",
    tag = "api",
    responses((status = 200, description = "Success", body = ProjectStatus), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn status(State(project): State<ProjectRuntime>) -> Result<impl IntoResponse> {
    Ok(Json(ProjectStatus {
        project: project.status().await?,
    }))
}
#[utoipa::path(
    post, path = "/api/project/create", operation_id = "api_create",
    tag = "api",
    request_body = Create,
    responses((status = 201, description = "Success", body = crate::ProjectInfo), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn create(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<Create>,
) -> Result<impl IntoResponse> {
    Ok((StatusCode::CREATED, Json(project.create(input.path).await?)))
}
#[utoipa::path(
    post, path = "/api/project/open", operation_id = "api_open",
    tag = "api",
    request_body = Open,
    responses((status = 200, description = "Success", body = crate::ProjectInfo), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn open(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<Open>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.open(input.path).await?))
}
#[utoipa::path(
    post, path = "/api/project/close", operation_id = "api_close",
    tag = "api",
    request_body = Empty,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn close(
    State(project): State<ProjectRuntime>,
    InputJson(_input): InputJson<Empty>,
) -> Result<impl IntoResponse> {
    project.close().await?;
    Ok(StatusCode::NO_CONTENT)
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct ParseExpression {
    expression: String,
}
#[utoipa::path(
    post, path = "/api/project/expressions/parse", operation_id = "api_parse_expression",
    tag = "api",
    request_body = ParseExpression,
    responses((status = 200, description = "Success", body = crate::expressions::Expression), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn parse_expression(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<ParseExpression>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.parse_expression(input.expression).await?))
}
#[utoipa::path(
    post, path = "/api/project/sql", operation_id = "api_sql",
    tag = "api",
    request_body = SqlRequest,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"), (SqlCommandResult = "application/json")), headers(("x-wordflow-task-id" = String, description = "Accepted task identity"), ("x-wordflow-statements-completed" = String), ("x-wordflow-result-truncated" = String))), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn sql(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<SqlRequest>,
) -> Result<impl IntoResponse> {
    if let Some(label) = input.task_label {
        let runtime = project.clone();
        let task = project.submit_task(label, move |context| async move {
            context.progress("Executing SQL", None);
            sql_response(runtime.sql(input.batch).await?)
        })?;
        task_response(task).await
    } else {
        sql_response(project.sql(input.batch).await?)
    }
}
fn sql_response(output: crate::project::SqlOutput) -> Result<axum::response::Response> {
    match output {
        crate::project::SqlOutput::Arrow {
            file,
            statements_completed,
            truncated,
        } => {
            let mut response = file_response(file, "application/vnd.apache.arrow.stream")?;
            response.headers_mut().insert(
                "x-wordflow-statements-completed",
                statements_completed.into(),
            );
            response.headers_mut().insert(
                "x-wordflow-result-truncated",
                axum::http::HeaderValue::from_static(if truncated { "true" } else { "false" }),
            );
            Ok(response)
        }
        crate::project::SqlOutput::Command(count) => Ok(Json(SqlCommandResult {
            statements_completed: count,
        })
        .into_response()),
    }
}
#[derive(Default, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GraphMode {
    #[default]
    Logical,
    Dependencies,
}
#[derive(Default, Deserialize, utoipa::ToSchema)]
struct GraphQuery {
    #[serde(default)]
    mode: GraphMode,
}
#[utoipa::path(
    get, path = "/api/project/graph", operation_id = "api_graph",
    tag = "api",
    params(("mode" = Option<GraphMode>, Query)),
    responses((status = 200, description = "Success", content((crate::openapi::GraphResponse = "application/json"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn graph(
    State(project): State<ProjectRuntime>,
    Query(query): Query<GraphQuery>,
) -> Result<axum::response::Response> {
    Ok(match query.mode {
        GraphMode::Logical => Json(crate::openapi::GraphResponse::Logical(
            project.graph().await?,
        ))
        .into_response(),
        GraphMode::Dependencies => Json(crate::openapi::GraphResponse::Dependencies(
            project.dependency_graph().await?,
        ))
        .into_response(),
    })
}
#[utoipa::path(
    get, path = "/api/project/objects/{schema}/{table_name}/schema", operation_id = "api_node_schema",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn node_schema(
    State(project): State<ProjectRuntime>,
    Path(name): Path<ObjectTarget>,
) -> Result<impl IntoResponse> {
    file_response(
        project.node_page(name, None).await?,
        "application/vnd.apache.arrow.stream",
    )
}
#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/page", operation_id = "api_node_page",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = crate::project::node_reads::Page,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn node_page(
    State(project): State<ProjectRuntime>,
    Path(name): Path<ObjectTarget>,
    InputJson(page): InputJson<crate::project::node_reads::Page>,
) -> Result<impl IntoResponse> {
    file_response(
        project.node_page(name, Some(page)).await?,
        "application/vnd.apache.arrow.stream",
    )
}
#[utoipa::path(
    get, path = "/api/project/objects/{schema}/{table_name}/definition", operation_id = "api_view_definition",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    responses((status = 200, description = "Success", body = ViewDefinition), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn view_definition(
    State(project): State<ProjectRuntime>,
    Path(name): Path<ObjectTarget>,
) -> Result<impl IntoResponse> {
    Ok(Json(ViewDefinition {
        sql: project.view_definition(name).await?,
    }))
}
#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/definition", operation_id = "api_replace_view_definition",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = ViewDefinition,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn replace_view_definition(
    State(project): State<ProjectRuntime>,
    Path(name): Path<ObjectTarget>,
    InputJson(input): InputJson<ViewDefinition>,
) -> Result<impl IntoResponse> {
    project.replace_view_definition(name, input.sql).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/edit", operation_id = "api_edit",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = Edit,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn edit(
    State(project): State<ProjectRuntime>,
    Path(id): Path<ObjectTarget>,
    InputJson(input): InputJson<Edit>,
) -> Result<impl IntoResponse> {
    if input.before.is_empty() && input.after.is_empty() {
        project.edit(id, input.sql).await?;
    } else {
        project
            .edit_with_statements(id, input.sql, input.before, input.after)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/columns", operation_id = "api_change_column",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = crate::project::mutations::ColumnChange,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn change_column(
    State(project): State<ProjectRuntime>,
    Path(target): Path<ObjectTarget>,
    InputJson(input): InputJson<crate::project::mutations::ColumnChange>,
) -> Result<impl IntoResponse> {
    project.change_column(target, input).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/views", operation_id = "api_create_view",
    tag = "api",
    request_body = crate::project::mutations::CreateView,
    responses((status = 200, description = "Success", body = TableName), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn create_view(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<crate::project::mutations::CreateView>,
) -> Result<impl IntoResponse> {
    Ok(Json(TableName {
        table_name: project.create_view(input).await?,
    }))
}
#[utoipa::path(
    post, path = "/api/project/stopwords/read", operation_id = "api_read_stopwords",
    tag = "api",
    request_body = crate::project::stopwords::StopwordSource,
    responses((status = 200, description = "Success", body = Vec<String>), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn read_stopwords(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<crate::project::stopwords::StopwordSource>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.read_stopwords(input).await?))
}
#[utoipa::path(
    post, path = "/api/project/stopwords/prepare", operation_id = "api_prepare_stopwords",
    tag = "api",
    request_body = crate::project::stopwords::PrepareStopwords,
    responses((status = 200, description = "Success", body = crate::project::stopwords::StopwordSource), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn prepare_stopwords(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<crate::project::stopwords::PrepareStopwords>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.writable_stopwords(input).await?))
}
#[utoipa::path(
    post, path = "/api/project/stopwords/save", operation_id = "api_save_stopwords",
    tag = "api",
    request_body = crate::project::stopwords::SaveStopwords,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn save_stopwords(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<crate::project::stopwords::SaveStopwords>,
) -> Result<impl IntoResponse> {
    project.save_stopwords(input).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/undo", operation_id = "api_undo",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn undo(
    State(project): State<ProjectRuntime>,
    Path(id): Path<ObjectTarget>,
    InputJson(_input): InputJson<Empty>,
) -> Result<impl IntoResponse> {
    project.undo(id).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/replace-source", operation_id = "api_replace_source",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = ReplaceSource,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn replace_source(
    State(project): State<ProjectRuntime>,
    Path(id): Path<String>,
    InputJson(input): InputJson<ReplaceSource>,
) -> Result<impl IntoResponse> {
    project
        .replace_source(
            id.into(),
            input.old_source_name.into(),
            input.new_source_name.into(),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/replace-source", operation_id = "api_replace_object_source",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = ReplaceObjectSource,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn replace_object_source(
    State(project): State<ProjectRuntime>,
    Path(id): Path<ObjectTarget>,
    InputJson(input): InputJson<ReplaceObjectSource>,
) -> Result<impl IntoResponse> {
    let target = |relation: crate::query::Relation| ObjectTarget {
        schema: Some(relation.schema),
        name: relation.name,
    };
    project
        .replace_source(id, target(input.old_source), target(input.new_source))
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/materialize", operation_id = "api_materialize",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 204, description = "Success", headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn materialize(
    State(project): State<ProjectRuntime>,
    Path(id): Path<ObjectTarget>,
    InputJson(_input): InputJson<Empty>,
) -> Result<impl IntoResponse> {
    let runtime = project.clone();
    let task = project.submit_task(format!("Materialize {id}"), move |context| async move {
        context.progress("Storing view data", None);
        runtime.materialize(id).await?;
        Ok(StatusCode::NO_CONTENT)
    })?;
    task_response(task).await
}

#[utoipa::path(
    post, path = "/api/project/save", operation_id = "api_save",
    tag = "api",
    request_body = Create,
    responses((status = 200, description = "Success", body = crate::ProjectInfo), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn save(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<Create>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.save(input.path).await?))
}
#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/delete", operation_id = "api_delete_node",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn delete_node(
    State(project): State<ProjectRuntime>,
    Path(id): Path<ObjectTarget>,
    InputJson(_input): InputJson<Empty>,
) -> Result<impl IntoResponse> {
    project.delete_node(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/rename", operation_id = "api_rename_node",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = Rename,
    responses((status = 200, description = "Success", body = TableName), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn rename_node(
    State(project): State<ProjectRuntime>,
    Path(id): Path<ObjectTarget>,
    InputJson(input): InputJson<Rename>,
) -> Result<impl IntoResponse> {
    let table_name = project.rename_node(id, input.name).await?;
    Ok(Json(TableName { table_name }))
}
#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/clone", operation_id = "api_clone_node",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 200, description = "Success", body = TableName, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn clone_node(
    State(project): State<ProjectRuntime>,
    Path(id): Path<ObjectTarget>,
    InputJson(_input): InputJson<Empty>,
) -> Result<impl IntoResponse> {
    let runtime = project.clone();
    let task = project.submit_task(format!("Clone {id}"), move |context| async move {
        context.progress("Cloning Data Block", None);
        Ok(Json(TableName {
            table_name: runtime.clone_node(id).await?,
        }))
    })?;
    task_response(task).await
}
#[utoipa::path(
    post, path = "/api/project/exports/inspect", operation_id = "api_inspect_export",
    tag = "api",
    request_body = crate::ExportRequest,
    responses((status = 200, description = "Success", body = crate::ExportInspection), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn inspect_export(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<crate::ExportRequest>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.inspect_export(input).await?))
}
#[utoipa::path(
    post, path = "/api/project/exports", operation_id = "api_export_project",
    tag = "api",
    request_body = crate::ExportRequest,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/octet-stream"), (crate::openapi::Binary = "application/zip"), (crate::openapi::Binary = "application/vnd.apache.arrow.file"), (crate::openapi::Binary = "text/csv; charset=utf-8"), (crate::openapi::Binary = "application/json"), (crate::openapi::Binary = "application/x-ndjson"), (crate::openapi::Binary = "application/vnd.apache.parquet")), headers(("x-wordflow-task-id" = String, description = "Accepted task identity"), ("Content-Disposition" = String, description = "Download filename when supplied"))), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn export_project(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<crate::ExportRequest>,
) -> Result<impl IntoResponse> {
    let title = project
        .status()
        .await?
        .ok_or_else(|| crate::Error::new("project_closed", "Open a project first"))?
        .title;
    let filename = input.filename(&title);
    let media_type = input.media_type();
    let task =
        project
            .clone()
            .submit_task(format!("Export {filename}"), move |context| async move {
                context.progress("Capturing committed data", None);
                let file = project
                    .export_into(input, tempfile::NamedTempFile::new()?)
                    .await?;
                let mut response = file_response(file, media_type)?;
                let encoded = filename
                    .bytes()
                    .map(|b| {
                        if b.is_ascii_alphanumeric() || b"-_.".contains(&b) {
                            char::from(b).to_string()
                        } else {
                            format!("%{b:02X}")
                        }
                    })
                    .collect::<String>();
                response.headers_mut().insert(
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename*=UTF-8''{encoded}")
                        .parse()
                        .map_err(|_| crate::Error::invalid("Invalid export filename"))?,
                );
                Ok(response)
            })?;
    task_response(task).await
}
#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/export", operation_id = "api_export_node",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = Export,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/octet-stream"), (crate::openapi::Binary = "application/zip"), (crate::openapi::Binary = "application/vnd.apache.arrow.file"), (crate::openapi::Binary = "text/csv; charset=utf-8"), (crate::openapi::Binary = "application/json"), (crate::openapi::Binary = "application/x-ndjson"), (crate::openapi::Binary = "application/vnd.apache.parquet")), headers(("x-wordflow-task-id" = String, description = "Accepted task identity"), ("Content-Disposition" = String, description = "Download filename when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn export_node(
    state: State<ProjectRuntime>,
    Path(id): Path<ObjectTarget>,
    InputJson(input): InputJson<Export>,
) -> Result<impl IntoResponse> {
    export_project(
        state,
        InputJson(crate::ExportRequest::Files {
            objects: vec![id],
            format: input.format,
        }),
    )
    .await
}

/// Keep extraction failures in the same error envelope as database failures.
pub struct InputJson<T>(pub T);
impl<S, T> axum::extract::FromRequest<S> for InputJson<T>
where
    S: Send + Sync,
    T: serde::de::DeserializeOwned,
{
    type Rejection = crate::error::Error;
    async fn from_request(
        request: axum::extract::Request,
        state: &S,
    ) -> std::result::Result<Self, Self::Rejection> {
        Json::<T>::from_request(request, state)
            .await
            .map(|Json(value)| Self(value))
            .map_err(|error| crate::error::Error::invalid(error.body_text()))
    }
}

struct SpoolReader {
    file: tokio::fs::File,
    _temporary: tempfile::NamedTempFile,
}
impl tokio::io::AsyncRead for SpoolReader {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buffer: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.file).poll_read(cx, buffer)
    }
}
pub(crate) fn file_response(
    file: tempfile::NamedTempFile,
    content_type: &str,
) -> Result<axum::response::Response> {
    let reader = SpoolReader {
        file: tokio::fs::File::from_std(file.reopen()?),
        _temporary: file,
    };
    let body = axum::body::Body::from_stream(tokio_util::io::ReaderStream::new(reader));
    Ok(([(header::CONTENT_TYPE, content_type)], body).into_response())
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct FilePaths {
    #[schema(value_type = Vec<String>)]
    paths: Vec<PathBuf>,
}

#[derive(Serialize, utoipa::ToSchema)]
struct FileMetadata {
    #[schema(value_type = String)]
    path: PathBuf,
    #[schema(required = true)]
    size_bytes: Option<u64>,
}

/// Read recent-file sizes without opening data or acquiring a database connection.
#[utoipa::path(
    post, path = "/api/project/files/metadata", operation_id = "api_file_metadata",
    tag = "api",
    request_body = FilePaths,
    responses((status = 200, description = "Success", body = Vec<FileMetadata>), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn file_metadata(InputJson(input): InputJson<FilePaths>) -> Json<Vec<FileMetadata>> {
    let mut files = Vec::with_capacity(input.paths.len());
    for path in input.paths {
        let size_bytes = tokio::fs::metadata(&path)
            .await
            .ok()
            .filter(std::fs::Metadata::is_file)
            .map(|metadata| metadata.len());
        files.push(FileMetadata { path, size_bytes });
    }
    Json(files)
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct TableImport {
    table_name: String,
    sql: String,
    #[serde(default)]
    parameters: Vec<serde_json::Value>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct ImportTables {
    sources: Vec<TableImport>,
}
#[utoipa::path(
    post, path = "/api/project/import", operation_id = "api_import_tables",
    tag = "api",
    request_body = ImportTables,
    responses((status = 200, description = "Success", body = TableNames, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn import_tables(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<ImportTables>,
) -> Result<impl IntoResponse> {
    let runtime = project.clone();
    let task = project.submit_task("Import local data", move |context| async move {
        context.progress("Importing data", None);
        let names = runtime
            .import_tables(
                input
                    .sources
                    .into_iter()
                    .map(|source| {
                        (
                            source.table_name,
                            SqlStatement {
                                sql: source.sql,
                                parameters: source.parameters,
                            },
                        )
                    })
                    .collect(),
            )
            .await?;
        Ok(Json(TableNames { table_names: names }))
    })?;
    task_response(task).await
}

#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/cell-edit", operation_id = "api_begin_cell_edit",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 200, description = "Success", body = cell_edit::SessionInfo), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn begin_cell_edit(
    State(project): State<ProjectRuntime>,
    Path(name): Path<ObjectTarget>,
    InputJson(_input): InputJson<Empty>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.begin_cell_edit(name).await?))
}
#[utoipa::path(
    post, path = "/api/project/cell-edits/{session_id}/page", operation_id = "api_cell_edit_page",
    tag = "api",
    params(("session_id" = String, Path)),
    request_body = cell_edit::Page,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn cell_edit_page(
    State(project): State<ProjectRuntime>,
    Path(id): Path<String>,
    InputJson(page): InputJson<cell_edit::Page>,
) -> Result<impl IntoResponse> {
    file_response(
        project.cell_edit_page(id, page).await?,
        "application/vnd.apache.arrow.stream",
    )
}
#[utoipa::path(
    post, path = "/api/project/cell-edits/{session_id}/save", operation_id = "api_save_cell_edit",
    tag = "api",
    params(("session_id" = String, Path)),
    request_body = cell_edit::Save,
    responses((status = 200, description = "Success", body = cell_edit::Completion), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn save_cell_edit(
    State(project): State<ProjectRuntime>,
    Path(id): Path<String>,
    InputJson(input): InputJson<cell_edit::Save>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.save_cell_edit(id, input).await?))
}
#[utoipa::path(
    post, path = "/api/project/cell-edits/{session_id}/cancel", operation_id = "api_cancel_cell_edit",
    tag = "api",
    params(("session_id" = String, Path)),
    request_body = Empty,
    responses((status = 200, description = "Success", body = cell_edit::Completion), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn cancel_cell_edit(
    State(project): State<ProjectRuntime>,
    Path(id): Path<String>,
    InputJson(_input): InputJson<Empty>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.cancel_cell_edit(id).await?))
}

#[derive(Serialize, utoipa::ToSchema)]
struct ProjectStatus {
    #[schema(required = true)]
    project: Option<crate::ProjectInfo>,
}
#[derive(Serialize, utoipa::ToSchema)]
struct SqlCommandResult {
    statements_completed: usize,
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct TableName {
    pub table_name: String,
}
#[derive(Serialize, utoipa::ToSchema)]
pub struct TableNames {
    pub table_names: Vec<String>,
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct EmptyResponse {}

#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/delete", operation_id = "api_delete_node_object",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn delete_node_object(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<Empty>,
) -> Result<impl IntoResponse> {
    delete_node(state, path, input).await
}

#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/rename", operation_id = "api_rename_node_object",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = Rename,
    responses((status = 200, description = "Success", body = TableName), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn rename_node_object(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<Rename>,
) -> Result<impl IntoResponse> {
    rename_node(state, path, input).await
}

#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/clone", operation_id = "api_clone_node_object",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 200, description = "Success", body = TableName, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn clone_node_object(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<Empty>,
) -> Result<impl IntoResponse> {
    clone_node(state, path, input).await
}

#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/export", operation_id = "api_export_node_object",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = Export,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/octet-stream"), (crate::openapi::Binary = "application/zip"), (crate::openapi::Binary = "application/vnd.apache.arrow.file"), (crate::openapi::Binary = "text/csv; charset=utf-8"), (crate::openapi::Binary = "application/json"), (crate::openapi::Binary = "application/x-ndjson"), (crate::openapi::Binary = "application/vnd.apache.parquet")), headers(("x-wordflow-task-id" = String, description = "Accepted task identity"), ("Content-Disposition" = String, description = "Download filename when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn export_node_object(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<Export>,
) -> Result<impl IntoResponse> {
    export_node(state, path, input).await
}

#[utoipa::path(
    post, path = "/api/project/objects/{schema}/{table_name}/columns", operation_id = "api_change_column_object",
    tag = "api",
    params(("schema" = String, Path), ("table_name" = String, Path)),
    request_body = crate::project::mutations::ColumnChange,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn change_column_object(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<crate::project::mutations::ColumnChange>,
) -> Result<impl IntoResponse> {
    change_column(state, path, input).await
}

#[utoipa::path(
    get, path = "/api/project/nodes/{table_name}/schema", operation_id = "api_node_schema_registered",
    tag = "api",
    params(("table_name" = String, Path)),
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn node_schema_registered(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
) -> Result<impl IntoResponse> {
    node_schema(state, path).await
}

#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/page", operation_id = "api_node_page_registered",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = crate::project::node_reads::Page,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn node_page_registered(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<crate::project::node_reads::Page>,
) -> Result<impl IntoResponse> {
    node_page(state, path, input).await
}

#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/edit", operation_id = "api_edit_registered",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = Edit,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn edit_registered(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<Edit>,
) -> Result<impl IntoResponse> {
    edit(state, path, input).await
}

#[utoipa::path(
    get, path = "/api/project/nodes/{table_name}/definition", operation_id = "api_view_definition_registered",
    tag = "api",
    params(("table_name" = String, Path)),
    responses((status = 200, description = "Success", body = ViewDefinition), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn view_definition_registered(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
) -> Result<impl IntoResponse> {
    view_definition(state, path).await
}

#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/definition", operation_id = "api_replace_view_definition_registered",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = ViewDefinition,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn replace_view_definition_registered(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<ViewDefinition>,
) -> Result<impl IntoResponse> {
    replace_view_definition(state, path, input).await
}

#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/undo", operation_id = "api_undo_registered",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn undo_registered(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<Empty>,
) -> Result<impl IntoResponse> {
    undo(state, path, input).await
}

#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/materialize", operation_id = "api_materialize_registered",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 204, description = "Success", headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn materialize_registered(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<Empty>,
) -> Result<impl IntoResponse> {
    materialize(state, path, input).await
}

#[utoipa::path(
    post, path = "/api/project/nodes/{table_name}/cell-edit", operation_id = "api_begin_cell_edit_registered",
    tag = "api",
    params(("table_name" = String, Path)),
    request_body = Empty,
    responses((status = 200, description = "Success", body = cell_edit::SessionInfo), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn begin_cell_edit_registered(
    state: State<ProjectRuntime>,
    path: Path<ObjectTarget>,
    input: InputJson<Empty>,
) -> Result<impl IntoResponse> {
    begin_cell_edit(state, path, input).await
}

fn flattened_schema() -> utoipa::openapi::RefOr<utoipa::openapi::Schema> {
    crate::openapi::flattened::<SqlBatch>()
}
