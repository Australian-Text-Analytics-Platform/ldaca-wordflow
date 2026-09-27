//! Sample imports resolve main once and create pinned Parquet views or embedded tables.
use crate::{
    error::{Error, Result},
    project::ProjectRuntime,
};
use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, time::Duration};

const REPOSITORY: &str = "Australian-Text-Analytics-Platform/ldaca-analytics-sample-data";
#[derive(Deserialize, Serialize, utoipa::ToSchema)]
#[schema(as = SampleCollection)]
pub(crate) struct Collection {
    id: String,
    name: String,
    description: String,
    total_size_bytes: u64,
    files: Vec<File>,
}
#[derive(Deserialize, Serialize, utoipa::ToSchema)]
#[schema(as = SampleFile)]
struct File {
    path: String,
}
#[derive(Deserialize, Serialize, utoipa::ToSchema)]
#[schema(as = SampleCatalogue)]
pub(crate) struct Catalogue {
    schema_version: u32,
    collections: Vec<Collection>,
}
#[derive(Serialize, utoipa::ToSchema)]
#[schema(as = SampleSnapshot)]
pub(crate) struct Snapshot {
    commit: String,
    #[serde(flatten)]
    catalogue: Catalogue,
}
#[derive(Deserialize, utoipa::ToSchema)]
#[schema(as = SampleImport)]
#[serde(deny_unknown_fields)]
pub(crate) struct Import {
    file_paths: Vec<String>,
    as_views: bool,
}

fn remote_error(error: reqwest::Error) -> Error {
    Error::new(
        "sample_data_error",
        format!("Could not read the sample repository. Check your connection and retry: {error}"),
    )
}
async fn latest(client: &reqwest::Client) -> Result<Snapshot> {
    #[derive(Deserialize)]
    struct Commit {
        sha: String,
    }
    let commit = client
        .get(format!(
            "https://api.github.com/repos/{REPOSITORY}/commits/main"
        ))
        .timeout(Duration::from_secs(30))
        .header(reqwest::header::USER_AGENT, "Wordflow")
        .send()
        .await
        .map_err(remote_error)?
        .error_for_status()
        .map_err(remote_error)?
        .json::<Commit>()
        .await
        .map_err(remote_error)?
        .sha;
    validate_commit(&commit)?;
    let catalogue = client
        .get(format!(
            "https://raw.githubusercontent.com/{REPOSITORY}/{commit}/catalogue.json"
        ))
        .timeout(Duration::from_secs(30))
        .header(reqwest::header::USER_AGENT, "Wordflow")
        .send()
        .await
        .map_err(remote_error)?
        .error_for_status()
        .map_err(remote_error)?
        .json::<Catalogue>()
        .await
        .map_err(remote_error)?;
    if catalogue.schema_version != 1 {
        return Err(Error::invalid("Unsupported sample catalogue version"));
    }
    Ok(Snapshot { commit, catalogue })
}
fn validate_commit(commit: &str) -> Result<()> {
    if commit.len() != 40 || !commit.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(Error::invalid("Sample revision must be a full commit SHA"));
    }
    Ok(())
}
fn selected_files(snapshot: &Snapshot, paths: &[String]) -> Result<Vec<(String, String)>> {
    validate_commit(&snapshot.commit)?;
    if paths.is_empty() {
        return Err(Error::invalid("Select at least one sample file"));
    }
    let mut selected = HashSet::new();
    let mut files = Vec::new();
    for path in paths {
        if !selected.insert(path) {
            continue;
        }
        let file = snapshot
            .catalogue
            .collections
            .iter()
            .flat_map(|collection| &collection.files)
            .find(|file| &file.path == path && file.path.ends_with(".parquet"))
            .ok_or_else(|| Error::invalid(format!("Sample file is no longer available: {path}")))?;
        if file
            .path
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
            || !file
                .path
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"/_-.".contains(&b))
        {
            return Err(Error::invalid("Invalid sample data path"));
        }
        let name = file
            .path
            .rsplit('/')
            .next()
            .unwrap_or(&file.path)
            .trim_end_matches(".parquet")
            .to_owned();
        files.push((
            name,
            format!(
                "https://raw.githubusercontent.com/{REPOSITORY}/{}/{}",
                snapshot.commit, file.path
            ),
        ));
    }
    Ok(files)
}
async fn cancellable_latest(
    project: &ProjectRuntime,
    operation: &crate::project::Operation,
) -> Result<Snapshot> {
    tokio::select! {
        result = latest(project.client()) => result,
        () = operation.cancellation.cancelled() => Err(Error::new("interrupted", "Operation interrupted")),
    }
}
#[utoipa::path(
    get, path = "/api/project/samples", operation_id = "samples_catalogue",
    tag = "samples",
    responses((status = 200, description = "Success", body = Snapshot), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
pub(crate) async fn catalogue(State(project): State<ProjectRuntime>) -> Result<Json<Snapshot>> {
    let operation = project.operation()?;
    Ok(Json(cancellable_latest(&project, &operation).await?))
}
#[utoipa::path(
    post, path = "/api/project/samples/import", operation_id = "samples_import",
    tag = "samples",
    request_body = Import,
    responses((status = 200, description = "Success", body = SampleImportResponse, headers(("x-wordflow-task-id" = String, description = "Accepted task identity"))), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope, headers(("x-wordflow-task-id" = Option<String>, description = "Accepted task identity, including task failures"))))
)]
pub(crate) async fn import(
    State(project): State<ProjectRuntime>,
    crate::api::InputJson(input): crate::api::InputJson<Import>,
) -> Result<axum::response::Response> {
    let runtime = project.clone();
    let task = project.submit_task("Import sample data", move |context| async move {
        let project = runtime;
        context.progress("Loading sample catalogue", None);
        project.ensure_writable().await?;
        let operation = project.operation()?;
        let snapshot = cancellable_latest(&project, &operation).await?;
        let files = selected_files(&snapshot, &input.file_paths)?;
        context.progress(
            if input.as_views {
                "Creating sample views"
            } else {
                "Importing sample tables"
            },
            None,
        );
        let names = project.import_samples(files, input.as_views).await?;
        Ok(Json(SampleImportResponse {
            commit: snapshot.commit,
            table_names: names,
        }))
    })?;
    crate::api::task_response(task).await
}

#[derive(Serialize, utoipa::ToSchema)]
struct SampleImportResponse {
    commit: String,
    table_names: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selection_pins_only_selected_data_files_and_rejects_documentation() {
        let snapshot = Snapshot { commit: "a".repeat(40), catalogue: serde_json::from_value(serde_json::json!({
            "schema_version":1, "collections":[{"id":"test", "name":"Test", "description":"Corpus", "total_size_bytes":10,
            "files":[{"path":"test/data.parquet"},{"path":"test/other.parquet"},{"path":"test/README.md"}]}]
        })).unwrap() };
        let files = selected_files(
            &snapshot,
            &["test/data.parquet".into(), "test/data.parquet".into()],
        )
        .unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].0, "data");
        assert!(
            files[0]
                .1
                .contains(&format!("/{}/test/data.parquet", "a".repeat(40)))
        );
        assert!(!files[0].1.contains("/main/"));
        assert!(selected_files(&snapshot, &["missing".into()]).is_err());
        assert!(selected_files(&snapshot, &["test/README.md".into()]).is_err());
        assert!(selected_files(&snapshot, &[]).is_err());
        assert!(
            selected_files(
                &snapshot,
                &["test/data.parquet".into(), "missing.parquet".into()]
            )
            .is_err()
        );
        assert!(validate_commit("main").is_err());
    }
}
