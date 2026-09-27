//! ONI access uses the existing Arrow adapter; imports commit stored project tables.
use crate::{
    error::{Error, Result},
    project::ProjectRuntime,
};
use axum::{Json, extract::State};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = LdacaSearchMethod)]
#[serde(rename_all = "snake_case")]
enum SearchMethod {
    Keyword,
    Identifier,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = LdacaSearch)]
#[serde(deny_unknown_fields)]
pub(crate) struct Search {
    token: Option<String>,
    method: SearchMethod,
    query: String,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = LdacaImport)]
#[serde(deny_unknown_fields)]
pub(crate) struct Import {
    token: Option<String>,
    identifier: String,
}
fn portal_error(error: ldaca_rs::data::Error) -> Error {
    Error::new("portal_error", error.to_string())
}
#[utoipa::path(
    post, path = "/api/project/ldaca/search", operation_id = "ldaca_search",
    tag = "ldaca",
    request_body = Search,
    responses((status = 200, description = "Success", body = SearchResponse), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
pub(crate) async fn search(
    State(project): State<ProjectRuntime>,
    crate::api::InputJson(input): crate::api::InputJson<Search>,
) -> Result<Json<SearchResponse>> {
    let client = project.portal_client(input.token.as_deref())?;
    let operation = project.operation()?;
    let shutdown = operation.cancellation.clone();
    let result = tokio::select! {
        result = client.search(match input.method { SearchMethod::Keyword => "keyword", SearchMethod::Identifier => "identifier" }, &input.query, 25, 0) => result.map_err(portal_error)?,
        () = shutdown.cancelled() => return Err(Error::new("stopping", "Backend is stopping")),
    };
    Ok(Json(SearchResponse {
        items: result.items,
    }))
}
#[utoipa::path(
    post, path = "/api/project/ldaca/import", operation_id = "ldaca_import",
    tag = "ldaca",
    request_body = Import,
    responses((status = 200, description = "Success", body = crate::api::TableNames, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
pub(crate) async fn import(
    State(project): State<ProjectRuntime>,
    crate::api::InputJson(input): crate::api::InputJson<Import>,
) -> Result<axum::response::Response> {
    let runtime = project.clone();
    let task = project.submit_task("Import from LDaCA", move |context| async move {
        let project = runtime;
        context.progress("Loading collection metadata", None);
        project.ensure_writable().await?;
        let client = project.portal_client(input.token.as_deref())?;
        let operation = project.operation()?;
        let shutdown = operation.cancellation.clone();
        let krate = tokio::select! {
            result = client.get_crate(&input.identifier, true, true) => result.map_err(portal_error)?,
            () = shutdown.cancelled() => return Err(Error::new("interrupted", "Import interrupted")),
        };
        let documents = ldaca_rs::data::profiles::select_documents(&krate);
        let paths = documents
            .iter()
            .map(|document| document.path.clone())
            .collect::<Vec<_>>();
        context.progress("Downloading documents", None);
        let texts = tokio::select! {
            result = client.download_texts(&input.identifier, &paths, 256 * 1024 * 1024) => result.map_err(portal_error)?,
            () = shutdown.cancelled() => return Err(Error::new("interrupted", "Import interrupted")),
        };
        let id = input.identifier.clone();
        context.progress("Converting documents", None);
        let staged = context.run_blocking(move |context| {
            let result = if documents.is_empty() {
                ldaca_rs::data::profiles::wordflow_metadata(&krate, &id, None)
            } else {
                ldaca_rs::data::profiles::document_table(&documents, &texts)
            }.map_err(portal_error)?;
            context.check_cancelled()?;
            let file = tempfile::tempdir()?;
            result.write(&file.path().join("import.parquet"), ldaca_rs::data::table::ExportFormat::Parquet)
                .map_err(portal_error)?;
            context.check_cancelled()?;
            Ok(file)
        })
        .await?;
        context.progress("Importing data", None);
        let names = project.import_ldaca(staged, input.identifier).await?;
        Ok(Json(crate::api::TableNames { table_names: names }))
    })?;
    crate::api::task_response(task).await
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub(crate) struct SearchResponse {
    items: Vec<Value>,
}
