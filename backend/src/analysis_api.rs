//! Typed analysis endpoints share runtime ownership and the ordinary response envelope.
use crate::{
    api::{InputJson, file_response, identified_task_response},
    error::Result,
    project::{
        DocumentPage, ProjectRuntime, analyses::*, annotation, concordance::*, frequency::*,
        plots::*, quotation::*, topic_modeling::*,
    },
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub(crate) fn router() -> utoipa_axum::router::OpenApiRouter<ProjectRuntime> {
    utoipa_axum::router::OpenApiRouter::new()
        .routes(utoipa_axum::routes!(query_annotation))
        .routes(utoipa_axum::routes!(run_annotation))
        .routes(utoipa_axum::routes!(preview_annotation))
        .routes(utoipa_axum::routes!(tabs, create_tab))
        .routes(utoipa_axum::routes!(annotation_edit))
        .routes(utoipa_axum::routes!(annotation_codebook))
        .routes(utoipa_axum::routes!(create_codebook))
        .routes(utoipa_axum::routes!(reorder_tabs))
        .routes(utoipa_axum::routes!(update_tab, delete_tab))
        .routes(utoipa_axum::routes!(clear_tab))
        .routes(utoipa_axum::routes!(run_frequency))
        .routes(utoipa_axum::routes!(embedding_models))
        .routes(utoipa_axum::routes!(run_topic_model))
        .routes(utoipa_axum::routes!(preview_topic_model))
        .routes(utoipa_axum::routes!(delete_topic_preview))
        .routes(utoipa_axum::routes!(query_topic_preview))
        .routes(utoipa_axum::routes!(query_topic_model))
        .routes(utoipa_axum::routes!(publish_topic_model))
        .routes(utoipa_axum::routes!(run_concordance))
        .routes(utoipa_axum::routes!(preview_concordance))
        .routes(utoipa_axum::routes!(query_concordance))
        .routes(utoipa_axum::routes!(density_concordance))
        .routes(utoipa_axum::routes!(publish_concordance))
        .routes(utoipa_axum::routes!(preview_quotation))
        .routes(utoipa_axum::routes!(run_quotation))
        .routes(utoipa_axum::routes!(query_quotation))
        .routes(utoipa_axum::routes!(publish_quotation))
        .routes(utoipa_axum::routes!(result))
        .routes(utoipa_axum::routes!(query))
        .routes(utoipa_axum::routes!(export))
        .routes(utoipa_axum::routes!(tokenizers))
        .routes(utoipa_axum::routes!(timezones))
        .routes(utoipa_axum::routes!(run_plot))
        .routes(utoipa_axum::routes!(query_plot))
        .routes(utoipa_axum::routes!(publish_plot))
}
#[derive(Deserialize, utoipa::ToSchema)]
struct TabFilter {
    kind: Option<String>,
}
#[utoipa::path(
    get, path = "/api/project/embedding-models", operation_id = "analysis_api_embedding_models",
    tag = "analysis_api",
    responses((status = 200, description = "Success", body = Vec<EmbeddingModel>), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn embedding_models() -> impl IntoResponse {
    Json(MODELS)
}
#[utoipa::path(
    post, path = "/api/project/tabs/{id}/topic-modeling", operation_id = "analysis_api_run_topic_model",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = TopicRequest,
    responses((status = 200, description = "Success", body = Analysis, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn run_topic_model(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<TopicRequest>,
) -> Result<impl IntoResponse> {
    let task = project.submit_topic_model(id, input).await?;
    identified_task_response(task.id, task.wait().await.map(Json).into_response())
}
#[utoipa::path(
    post, path = "/api/project/tabs/{id}/topic-modeling/preview", operation_id = "analysis_api_preview_topic_model",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = TopicPreviewRequest,
    responses((status = 200, description = "Success", content((String = "text/event-stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn preview_topic_model(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<TopicPreviewRequest>,
) -> Result<impl IntoResponse> {
    project.open_topic_preview(id, input).await
}
#[utoipa::path(
    delete, path = "/api/project/tabs/{tab}/topic-modeling/preview/{id}", operation_id = "analysis_api_delete_topic_preview",
    tag = "analysis_api",
    params(("tab" = String, Path), ("id" = String, Path)),
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn delete_topic_preview(
    State(project): State<ProjectRuntime>,
    Path((tab, id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse> {
    project.delete_topic_preview(tab, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/tabs/{tab}/topic-modeling/preview/{id}/query", operation_id = "analysis_api_query_topic_preview",
    tag = "analysis_api",
    params(("tab" = String, Path), ("id" = String, Path)),
    request_body = TopicQuery,
    responses((status = 200, description = "Success", content((TopicProjection = "application/json"), (crate::openapi::Binary = "application/vnd.apache.arrow.stream")), headers(("x-wordflow-total-rows" = String, description = "Total qualifying rows when supplied"), ("x-wordflow-document-count" = String, description = "Document count when supplied"), ("x-wordflow-match-count" = String, description = "Match count when supplied"), ("x-wordflow-has-next" = String, description = "Whether another document page exists when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn query_topic_preview(
    State(project): State<ProjectRuntime>,
    Path((tab, id)): Path<(Uuid, Uuid)>,
    InputJson(input): InputJson<TopicQuery>,
) -> Result<impl IntoResponse> {
    topic_response(project.query_topic_preview(tab, id, input).await?)
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/topic-modeling/query", operation_id = "analysis_api_query_topic_model",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = TopicQuery,
    responses((status = 200, description = "Success", content((TopicProjection = "application/json"), (crate::openapi::Binary = "application/vnd.apache.arrow.stream")), headers(("x-wordflow-total-rows" = String, description = "Total qualifying rows when supplied"), ("x-wordflow-document-count" = String, description = "Document count when supplied"), ("x-wordflow-match-count" = String, description = "Match count when supplied"), ("x-wordflow-has-next" = String, description = "Whether another document page exists when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn query_topic_model(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<TopicQuery>,
) -> Result<impl IntoResponse> {
    topic_response(project.query_topic_model(id, input).await?)
}
fn topic_response(output: TopicProjection) -> Result<axum::response::Response> {
    match output {
        TopicProjection::Documents(page) => document_match_response(page),
        projection => Ok(Json(projection).into_response()),
    }
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/topic-modeling/publish", operation_id = "analysis_api_publish_topic_model",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = TopicPublish,
    responses((status = 200, description = "Success", body = Vec<crate::query::Relation>, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn publish_topic_model(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<TopicPublish>,
) -> Result<impl IntoResponse> {
    let task = project.submit_topic_publish(id, input).await?;
    identified_task_response(task.id, task.wait().await.map(Json).into_response())
}
#[utoipa::path(
    get, path = "/api/project/tabs", operation_id = "analysis_api_tabs",
    tag = "analysis_api",
    params(("kind" = Option<String>, Query)),
    responses((status = 200, description = "Success", body = Vec<Tab>), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn tabs(
    State(project): State<ProjectRuntime>,
    Query(filter): Query<TabFilter>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.tabs(filter.kind).await?))
}
#[utoipa::path(
    post, path = "/api/project/tabs", operation_id = "analysis_api_create_tab",
    tag = "analysis_api",
    request_body = CreateTab,
    responses((status = 200, description = "Success", body = Tab), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn create_tab(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<CreateTab>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.create_analysis_tab(input).await?))
}
#[utoipa::path(
    post, path = "/api/project/tabs/{id}", operation_id = "analysis_api_update_tab",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = UpdateTab,
    responses((status = 200, description = "Success", body = Tab), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn update_tab(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<UpdateTab>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.update_analysis_tab(id, input).await?))
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = ReorderTabsRequest)]
#[serde(deny_unknown_fields)]
struct Reorder {
    kind: String,
    ids: Vec<Uuid>,
}
#[utoipa::path(
    post, path = "/api/project/tabs/reorder", operation_id = "analysis_api_reorder_tabs",
    tag = "analysis_api",
    request_body = Reorder,
    responses((status = 200, description = "Success", body = Vec<Tab>), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn reorder_tabs(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<Reorder>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.reorder_tabs(input.kind, input.ids).await?))
}
#[utoipa::path(
    delete, path = "/api/project/tabs/{id}", operation_id = "analysis_api_delete_tab",
    tag = "analysis_api",
    params(("id" = String, Path)),
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn delete_tab(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse> {
    project.delete_analysis_tab(id).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    delete, path = "/api/project/tabs/{id}/result", operation_id = "analysis_api_clear_tab",
    tag = "analysis_api",
    params(("id" = String, Path)),
    responses((status = 204, description = "Success"), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn clear_tab(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse> {
    project.clear_analysis_tab(id).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(
    post, path = "/api/project/tabs/{id}/frequency", operation_id = "analysis_api_run_frequency",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = FrequencyRequest,
    responses((status = 200, description = "Success", body = Analysis, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn run_frequency(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<FrequencyRequest>,
) -> Result<impl IntoResponse> {
    let task = project.submit_frequency(id, input).await?;
    let task_id = task.id;
    identified_task_response(task_id, task.wait().await.map(Json).into_response())
}
#[utoipa::path(
    get, path = "/api/project/analyses/{id}", operation_id = "analysis_api_result",
    tag = "analysis_api",
    params(("id" = String, Path)),
    responses((status = 200, description = "Success", body = Analysis), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn result(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.analysis(id).await?))
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/frequency/query", operation_id = "analysis_api_query",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = FrequencyQuery,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream")), headers(("x-wordflow-total-rows" = String, description = "Total qualifying rows when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn query(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<FrequencyQuery>,
) -> Result<impl IntoResponse> {
    let page = project.frequency_page(id, input).await?;
    let mut response = file_response(page.file, "application/vnd.apache.arrow.stream")?;
    response
        .headers_mut()
        .insert("x-wordflow-total-rows", page.total_rows.into());
    Ok(response)
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = FrequencyExportRequest)]
#[serde(deny_unknown_fields)]
struct Export {
    #[serde(default)]
    include_stopwords: bool,
    query: FrequencyQuery,
    format: FrequencyExportFormat,
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/frequency/export", operation_id = "analysis_api_export",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = Export,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "text/csv; charset=utf-8"), (crate::openapi::Binary = "text/markdown; charset=utf-8"), (crate::openapi::Binary = "multipart/form-data"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn export(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<Export>,
) -> Result<impl IntoResponse> {
    if input.include_stopwords {
        let (file, content_type) = project
            .frequency_export_parts(id, input.query, input.format)
            .await?;
        return file_response(file, &content_type);
    }
    // Like browser node exports, this prepares bytes; native installation owns its task after choosing a destination.
    let file = project
        .export_frequency_into(
            id,
            input.query,
            input.format,
            tempfile::NamedTempFile::new()?,
        )
        .await?;
    file_response(
        file,
        match input.format {
            FrequencyExportFormat::Csv => "text/csv; charset=utf-8",
            FrequencyExportFormat::Markdown => "text/markdown; charset=utf-8",
        },
    )
}
#[derive(Serialize, utoipa::ToSchema)]
struct TokenizerInfo {
    model_id: &'static str,
    label: &'static str,
    languages: &'static [&'static str],
}
#[utoipa::path(
    get, path = "/api/project/tokenizers", operation_id = "analysis_api_tokenizers",
    tag = "analysis_api",
    responses((status = 200, description = "Success", body = Vec<TokenizerInfo>), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn tokenizers() -> impl IntoResponse {
    Json(
        ldaca_rs::text::TOKENIZER_MODELS
            .iter()
            .map(|model| TokenizerInfo {
                model_id: model.model_id,
                label: model.label,
                languages: model.languages,
            })
            .collect::<Vec<_>>(),
    )
}

#[cfg(test)]
mod tests;

#[utoipa::path(
    post, path = "/api/project/tabs/{id}/concordance", operation_id = "analysis_api_run_concordance",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = ConcordanceRequest,
    responses((status = 200, description = "Success", body = Analysis, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn run_concordance(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<ConcordanceRequest>,
) -> Result<impl IntoResponse> {
    let task = project.submit_concordance(id, input).await?;
    let task_id = task.id;
    identified_task_response(task_id, task.wait().await.map(Json).into_response())
}
#[utoipa::path(
    post, path = "/api/project/tabs/{id}/concordance/preview", operation_id = "analysis_api_preview_concordance",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = ConcordancePreview,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream")), headers(("x-wordflow-total-rows" = String, description = "Total qualifying rows when supplied"), ("x-wordflow-document-count" = String, description = "Document count when supplied"), ("x-wordflow-match-count" = String, description = "Match count when supplied"), ("x-wordflow-has-next" = String, description = "Whether another document page exists when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn preview_concordance(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<ConcordancePreview>,
) -> Result<impl IntoResponse> {
    document_match_response(project.concordance_preview(id, input).await?)
}
fn document_match_response(page: DocumentPage) -> Result<axum::response::Response> {
    let mut response = file_response(page.file, "application/vnd.apache.arrow.stream")?;
    response
        .headers_mut()
        .insert("x-wordflow-total-rows", page.total_rows.into());
    response
        .headers_mut()
        .insert("x-wordflow-document-count", page.document_count.into());
    response
        .headers_mut()
        .insert("x-wordflow-match-count", page.match_count.into());
    response.headers_mut().insert(
        "x-wordflow-has-next",
        axum::http::HeaderValue::from_static(if page.has_next { "true" } else { "false" }),
    );
    Ok(response)
}

#[utoipa::path(
    post, path = "/api/project/analyses/{id}/concordance/query", operation_id = "analysis_api_query_concordance",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = ConcordanceQuery,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream")), headers(("x-wordflow-total-rows" = String, description = "Total qualifying rows when supplied"), ("x-wordflow-document-count" = String, description = "Document count when supplied"), ("x-wordflow-match-count" = String, description = "Match count when supplied"), ("x-wordflow-has-next" = String, description = "Whether another document page exists when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn query_concordance(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<ConcordanceQuery>,
) -> Result<impl IntoResponse> {
    document_match_response(project.concordance_page(id, input).await?)
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/concordance/density", operation_id = "analysis_api_density_concordance",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = ConcordanceDensity,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn density_concordance(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<ConcordanceDensity>,
) -> Result<impl IntoResponse> {
    file_response(
        project.concordance_density(id, input).await?,
        "application/vnd.apache.arrow.stream",
    )
}

#[utoipa::path(
    post, path = "/api/project/analyses/{id}/concordance/publish", operation_id = "analysis_api_publish_concordance",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = ConcordancePublish,
    responses((status = 200, description = "Success", body = Vec<crate::query::Relation>, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn publish_concordance(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<ConcordancePublish>,
) -> Result<impl IntoResponse> {
    let task = project.submit_concordance_publication(id, input).await?;
    let task_id = task.id;
    identified_task_response(task_id, task.wait().await.map(Json).into_response())
}

#[utoipa::path(
    post, path = "/api/project/tabs/{id}/quotation/preview", operation_id = "analysis_api_preview_quotation",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = QuotationPreview,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream")), headers(("x-wordflow-total-rows" = String, description = "Total qualifying rows when supplied"), ("x-wordflow-document-count" = String, description = "Document count when supplied"), ("x-wordflow-match-count" = String, description = "Match count when supplied"), ("x-wordflow-has-next" = String, description = "Whether another document page exists when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn preview_quotation(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<QuotationPreview>,
) -> Result<axum::response::Response> {
    document_match_response(project.quotation_preview(id, input).await?)
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/quotation/query", operation_id = "analysis_api_query_quotation",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = QuotationQuery,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream")), headers(("x-wordflow-total-rows" = String, description = "Total qualifying rows when supplied"), ("x-wordflow-document-count" = String, description = "Document count when supplied"), ("x-wordflow-match-count" = String, description = "Match count when supplied"), ("x-wordflow-has-next" = String, description = "Whether another document page exists when supplied"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn query_quotation(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<QuotationQuery>,
) -> Result<axum::response::Response> {
    document_match_response(project.quotation_page(id, input).await?)
}
#[utoipa::path(
    post, path = "/api/project/tabs/{id}/quotation", operation_id = "analysis_api_run_quotation",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = QuotationRequest,
    responses((status = 200, description = "Success", body = Analysis, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn run_quotation(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<QuotationRequest>,
) -> Result<axum::response::Response> {
    let task = project.submit_quotation(id, input).await?;
    identified_task_response(task.id, task.wait().await.map(Json).into_response())
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/quotation/publish", operation_id = "analysis_api_publish_quotation",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = QuotationPublish,
    responses((status = 200, description = "Success", body = crate::query::Relation, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn publish_quotation(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<QuotationPublish>,
) -> Result<axum::response::Response> {
    let task = project.submit_quotation_publication(id, input).await?;
    identified_task_response(task.id, task.wait().await.map(Json).into_response())
}

#[utoipa::path(
    post, path = "/api/project/tabs/{id}/{mode}", operation_id = "analysis_api_run_plot",
    tag = "analysis_api",
    params(("id" = String, Path), ("mode" = PlotMode, Path)),
    request_body = PlotRequest,
    responses((status = 200, description = "Success", body = Analysis, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn run_plot(
    State(project): State<ProjectRuntime>,
    Path((id, mode)): Path<(Uuid, PlotMode)>,
    InputJson(input): InputJson<serde_json::Value>,
) -> Result<impl IntoResponse> {
    let task = project
        .submit_plot(id, mode, PlotRequest::decode(mode, input)?)
        .await?;
    identified_task_response(task.id, task.wait().await.map(Json).into_response())
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/{mode}/query", operation_id = "analysis_api_query_plot",
    tag = "analysis_api",
    params(("id" = String, Path), ("mode" = PlotMode, Path)),
    request_body = PlotQuery,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn query_plot(
    State(project): State<ProjectRuntime>,
    Path((id, mode)): Path<(Uuid, PlotMode)>,
    InputJson(input): InputJson<PlotQuery>,
) -> Result<impl IntoResponse> {
    file_response(
        project.plot_page(id, mode, input).await?,
        "application/vnd.apache.arrow.stream",
    )
}
#[utoipa::path(
    post, path = "/api/project/analyses/{id}/{mode}/publish", operation_id = "analysis_api_publish_plot",
    tag = "analysis_api",
    params(("id" = String, Path), ("mode" = PlotMode, Path)),
    request_body = PlotPublish,
    responses((status = 200, description = "Success", body = crate::query::Relation, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn publish_plot(
    State(project): State<ProjectRuntime>,
    Path((id, mode)): Path<(Uuid, PlotMode)>,
    InputJson(input): InputJson<PlotPublish>,
) -> Result<impl IntoResponse> {
    let task = project.submit_plot_publication(id, mode, input).await?;
    identified_task_response(task.id, task.wait().await.map(Json).into_response())
}

#[utoipa::path(
    get, path = "/api/project/timezones", operation_id = "analysis_api_timezones",
    tag = "analysis_api",
    responses((status = 200, description = "Success", body = Vec<String>), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn timezones(State(project): State<ProjectRuntime>) -> Result<impl IntoResponse> {
    Ok(Json(project.plot_timezones().await?))
}

#[utoipa::path(
    post, path = "/api/project/tabs/{id}/annotation/edit", operation_id = "analysis_api_annotation_edit",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = annotation::EditRequest,
    responses((status = 200, description = "Success", body = crate::project::cell_edit::SessionInfo), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn annotation_edit(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<annotation::EditRequest>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.begin_annotation_edit(id, input).await?))
}
#[utoipa::path(
    post, path = "/api/project/annotation/codebook", operation_id = "analysis_api_annotation_codebook",
    tag = "analysis_api",
    request_body = annotation::Codebook,
    responses((status = 200, description = "Success", body = Vec<annotation::Code>), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn annotation_codebook(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<annotation::Codebook>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.annotation_codebook(input).await?))
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct CodebookName {
    name: String,
}
#[utoipa::path(
    post, path = "/api/project/annotation/codebooks", operation_id = "analysis_api_create_codebook",
    tag = "analysis_api",
    request_body = CodebookName,
    responses((status = 200, description = "Success", body = annotation::Codebook), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn create_codebook(
    State(project): State<ProjectRuntime>,
    InputJson(input): InputJson<CodebookName>,
) -> Result<impl IntoResponse> {
    Ok(Json(project.create_codebook(input.name).await?))
}

#[utoipa::path(
    post, path = "/api/project/tabs/{id}/annotation", operation_id = "analysis_api_run_annotation",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = annotation::execution::Request,
    responses((status = 200, description = "Success", body = Analysis, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8")), headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
async fn run_annotation(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<annotation::execution::Request>,
) -> Result<axum::response::Response> {
    let task = project.submit_annotation(id, input).await?;
    let id = task.id;
    identified_task_response(id, task.wait().await.map(Json).into_response())
}
#[utoipa::path(
    post, path = "/api/project/tabs/{id}/annotation/preview", operation_id = "analysis_api_preview_annotation",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = annotation::execution::PreviewRequest,
    responses((status = 200, description = "Success", content((crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn preview_annotation(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<annotation::execution::PreviewRequest>,
) -> Result<axum::response::Response> {
    file_response(
        project.annotation_preview(id, input).await?,
        "application/vnd.apache.arrow.stream",
    )
}

#[utoipa::path(
    post, path = "/api/project/analyses/{id}/annotation/query", operation_id = "analysis_api_query_annotation",
    tag = "analysis_api",
    params(("id" = String, Path)),
    request_body = annotation::review::Query,
    responses((status = 200, description = "Success", content((annotation::execution::Context = "application/json"), (crate::openapi::Binary = "application/vnd.apache.arrow.stream"))), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn query_annotation(
    State(project): State<ProjectRuntime>,
    Path(id): Path<Uuid>,
    InputJson(input): InputJson<annotation::review::Query>,
) -> Result<axum::response::Response> {
    match project.annotation_review(id, input).await? {
        annotation::review::Output::Page(file) => {
            file_response(file, "application/vnd.apache.arrow.stream")
        }
        annotation::review::Output::Context(value) => Ok(Json(value).into_response()),
    }
}
