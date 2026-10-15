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
    #[serde(default)]
    metadata_only: bool,
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
#[derive(serde::Serialize, utoipa::ToSchema)]
#[schema(as = LdacaImportResponse)]
pub(crate) struct ImportResponse {
    table_names: Vec<String>,
    replaced_paths: Vec<String>,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = LdacaBrowse)]
#[serde(deny_unknown_fields)]
pub(crate) struct Browse {
    token: Option<String>,
}
#[utoipa::path(
    post, path = "/api/project/ldaca/browse", operation_id = "ldaca_browse",
    tag = "ldaca", request_body = Browse,
    responses((status = 200, description = "Collections", body = SearchResponse), (status = 400, description = "Portal error", body = crate::error::ErrorEnvelope))
)]
pub(crate) async fn browse(
    State(project): State<ProjectRuntime>,
    crate::api::InputJson(input): crate::api::InputJson<Browse>,
) -> Result<Json<SearchResponse>> {
    let operation = project.operation()?;
    let client = project.portal_client(input.token.as_deref())?;
    tokio::select! {
        result = client.collections() => Ok(Json(SearchResponse { items: result.map_err(portal_error)? })),
        () = operation.cancellation.cancelled() => Err(Error::new("stopping", "Backend is stopping")),
    }
}
#[utoipa::path(
    post, path = "/api/project/ldaca/import", operation_id = "ldaca_import",
    tag = "ldaca",
    request_body = Import,
    responses((status = 200, description = "Success", body = ImportResponse, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
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
            result = client.get_crate(&input.identifier, false, true) => result.map_err(portal_error)?,
            () = shutdown.cancelled() => return Err(Error::new("interrupted", "Import interrupted")),
        };
        let name = krate.name(&input.identifier);
        let is_collection = krate.entities().values().any(|entity| {
            ldaca_rs::data::metadata::entity_types(entity).iter().any(|kind| kind == "RepositoryCollection")
                || ldaca_rs::data::metadata::strings(entity.get("conformsTo")).iter().any(|profile| profile.ends_with("#Collection"))
        });
        let mut ids = if is_collection {
            tokio::select! {
                result = client.member_object_ids(&input.identifier) => result.map_err(portal_error)?,
                () = shutdown.cancelled() => return Err(Error::new("interrupted", "Import interrupted")),
            }
        } else { Vec::new() };
        if ids.is_empty() { ids.push(input.identifier.clone()); }
        let total = ids.len();
        let mut original = Some(krate);
        let mut replaced_paths = Vec::new();
        let mut remaining_bytes = 256 * 1024 * 1024;
        let mut staged = tempfile::tempdir_in(project.temporary_directory()?)?;
        for (index, id) in ids.into_iter().enumerate() {
            context.check_cancelled()?;
            context.progress(format!("Loading member metadata ({}/{total})", index + 1), Some(index as f64 / total as f64));
            let krate = if id == input.identifier {
                original.take().ok_or_else(|| Error::invalid("Duplicate collection identifier"))?
            } else {
                tokio::select! {
                    result = client.get_crate(&id, false, true) => result.map_err(portal_error)?,
                    () = shutdown.cancelled() => return Err(Error::new("interrupted", "Import interrupted")),
                }
            };
            if !input.metadata_only && krate.root(&id).is_some_and(|root| !ldaca_rs::data::profiles::has_access(root)) {
                return Err(Error::new("portal_access_denied", "This item does not allow text access. Import metadata only or enter a token with access."));
            }
            let documents = if input.metadata_only { Vec::new() } else { ldaca_rs::data::profiles::select_documents(&krate) };
            let paths = documents.iter().map(|document| document.path.clone()).collect::<Vec<_>>();
            context.progress("Downloading documents", None);
            let downloaded = tokio::select! {
                result = client.download_texts_with_report(&id, &paths, remaining_bytes) => result.map_err(portal_error)?,
                () = shutdown.cancelled() => return Err(Error::new("interrupted", "Import interrupted")),
            };
            remaining_bytes -= downloaded.bytes;
            replaced_paths.extend(downloaded.replaced_paths.into_iter().map(|path| format!("{id}: {path}")));
            context.progress("Converting documents", None);
            staged = context.run_blocking(move |context| {
                let result = if documents.is_empty() {
                    ldaca_rs::data::profiles::wordflow_metadata(&krate, &id, None)
                } else {
                    ldaca_rs::data::profiles::document_table_for_item(&documents, &downloaded.texts, &id)
                }.map_err(portal_error)?;
                context.check_cancelled()?;
                result.write(&staged.path().join(format!("{index:05}.parquet")), ldaca_rs::data::table::ExportFormat::Parquet)
                    .map_err(portal_error)?;
                context.check_cancelled()?;
                Ok(staged)
            }).await?;
        }
        context.progress("Importing data", None);
        let name = if input.metadata_only { format!("{name} (metadata)") } else { name };
        let names = project.import_ldaca(staged, name).await?;
        if !replaced_paths.is_empty() {
            context.notice(format!("Invalid text encoding replaced in {} files: {}", replaced_paths.len(), replaced_paths.iter().take(10).cloned().collect::<Vec<_>>().join(", ")));
        }
        Ok(Json(ImportResponse { table_names: names, replaced_paths }))
    })?;
    crate::api::task_response(task).await
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub(crate) struct SearchResponse {
    items: Vec<Value>,
}
