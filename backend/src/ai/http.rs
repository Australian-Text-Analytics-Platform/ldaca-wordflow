use super::*;
use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
};
use std::collections::BTreeSet;
use std::time::Duration;

pub(crate) fn router<S>() -> utoipa_axum::router::OpenApiRouter<S>
where
    S: Clone + Send + Sync + 'static,
    super::AiConfiguration: axum::extract::FromRef<S>,
{
    utoipa_axum::router::OpenApiRouter::new()
        .routes(utoipa_axum::routes!(list, create))
        .routes(utoipa_axum::routes!(update, remove))
        .routes(utoipa_axum::routes!(models))
        .routes(utoipa_axum::routes!(model_capabilities))
        .routes(utoipa_axum::routes!(annotation_concurrency))
}
#[utoipa::path(
    get, path = "/api/ai/providers", operation_id = "ai_http_list",
    tag = "ai_http",
    responses((status = 200, description = "Success", body = Vec<ConnectionInfo>), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn list(State(config): State<super::AiConfiguration>) -> Result<Json<Vec<ConnectionInfo>>> {
    Ok(Json(config.list().await?))
}
#[utoipa::path(
    post, path = "/api/ai/providers", operation_id = "ai_http_create",
    tag = "ai_http",
    request_body = CreateConnection,
    responses((status = 200, description = "Success", body = ConnectionInfo), (status = 400, description = "Invalid request or operation failed", body = crate::error::ErrorEnvelope), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn create(
    State(config): State<super::AiConfiguration>,
    request: std::result::Result<Json<CreateConnection>, JsonRejection>,
) -> Result<Json<ConnectionInfo>> {
    Ok(Json(
        config
            .create(
                request
                    .map_err(|_| Error::invalid("Invalid provider configuration"))?
                    .0,
            )
            .await?,
    ))
}
#[utoipa::path(
    post, path = "/api/ai/providers/{id}", operation_id = "ai_http_update",
    tag = "ai_http",
    params(("id" = String, Path)),
    request_body = UpdateConnection,
    responses((status = 200, description = "Success", body = ConnectionInfo), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn update(
    State(config): State<super::AiConfiguration>,
    Path(id): Path<Uuid>,
    request: std::result::Result<Json<UpdateConnection>, JsonRejection>,
) -> Result<Json<ConnectionInfo>> {
    Ok(Json(
        config
            .update(
                id,
                request
                    .map_err(|_| Error::invalid("Invalid provider configuration"))?
                    .0,
            )
            .await?,
    ))
}
#[utoipa::path(
    delete, path = "/api/ai/providers/{id}", operation_id = "ai_http_remove",
    tag = "ai_http",
    params(("id" = String, Path)),
    responses((status = 200, description = "Success", body = crate::api::EmptyResponse), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn remove(
    State(config): State<super::AiConfiguration>,
    Path(id): Path<Uuid>,
) -> Result<Json<crate::api::EmptyResponse>> {
    config.remove(id).await?;
    Ok(Json(crate::api::EmptyResponse {}))
}
#[utoipa::path(
    get, path = "/api/ai/providers/{id}/models", operation_id = "ai_http_models",
    tag = "ai_http",
    params(("id" = String, Path)),
    responses((status = 200, description = "Success", body = Vec<String>), (status = 400, description = "Invalid request, extractor rejection or operation failure", content((crate::error::ErrorEnvelope = "application/json"), (String = "text/plain; charset=utf-8"))), (status = 403, description = "Origin not allowed", body = crate::error::ErrorEnvelope), (status = 404, description = "Resource unavailable", body = crate::error::ErrorEnvelope), (status = 409, description = "Operation conflict", body = crate::error::ErrorEnvelope), (status = 500, description = "Internal operation error", body = crate::error::ErrorEnvelope), (status = 503, description = "Backend stopping", body = crate::error::ErrorEnvelope))
)]
async fn models(
    State(config): State<super::AiConfiguration>,
    Path(id): Path<Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<String>>> {
    let config = config.for_request(&headers)?;
    let (connection, key) = config.resolve(id).await?;
    if connection.provider == Provider::Apple {
        return Ok(Json(vec!["system".into()]));
    }
    if let Some((revision, models)) = config.0.models.lock().await.get(&id)
        && !config.0.browser_owned
        && *revision == connection.revision
    {
        return Ok(Json(models.clone()));
    }
    let values = discover(&config.0.client, &connection, key.as_deref()).await?;
    if !config.0.browser_owned {
        config
            .0
            .models
            .lock()
            .await
            .insert(id, (connection.revision, values.clone()));
    }
    Ok(Json(values))
}
pub(super) fn endpoint(connection: &Connection) -> Result<&str> {
    Ok(match connection.provider {
        Provider::Apple => {
            return Err(Error::invalid(
                "Apple Foundation Models has no HTTP endpoint",
            ));
        }
        Provider::Openai => "https://api.openai.com/v1",
        Provider::Openrouter => "https://openrouter.ai/api/v1",
        Provider::Anthropic => "https://api.anthropic.com/v1",
        Provider::Google => "https://generativelanguage.googleapis.com/v1beta",
        Provider::Custom => connection
            .endpoint
            .as_deref()
            .ok_or_else(|| Error::invalid("Custom endpoint is missing"))?,
    })
}
pub(super) fn authorize(
    request: reqwest::RequestBuilder,
    provider: Provider,
    key: Option<&str>,
) -> reqwest::RequestBuilder {
    let request = if provider == Provider::Anthropic {
        request.header("anthropic-version", "2023-06-01")
    } else {
        request
    };
    match (provider, key) {
        (Provider::Anthropic, Some(key)) => request.header("x-api-key", key),
        (Provider::Google, Some(key)) => request.header("x-goog-api-key", key),
        (_, Some(key)) => request.bearer_auth(key),
        (_, None) => request,
    }
}
async fn discover(
    client: &reqwest::Client,
    connection: &Connection,
    key: Option<&str>,
) -> Result<Vec<String>> {
    let mut result = BTreeSet::new();
    let mut cursor: Option<String> = None;
    let mut seen = BTreeSet::new();
    loop {
        let url = format!("{}/models", endpoint(connection)?);
        let mut request =
            authorize(client.get(url), connection.provider, key).timeout(Duration::from_secs(90));
        if let Some(cursor) = &cursor {
            request = request.query(&[(
                if connection.provider == Provider::Google {
                    "pageToken"
                } else {
                    "after_id"
                },
                cursor,
            )]);
        }
        let response = request.send().await.map_err(|_| {
            Error::new(
                "provider_unavailable",
                "Model discovery could not reach the provider. Check the connection and retry.",
            )
        })?;
        if !response.status().is_success() {
            return Err(Error::new(
                "provider_discovery_failed",
                format!(
                    "Model discovery returned HTTP {}. Check the connection credentials and endpoint.",
                    response.status()
                ),
            ));
        }
        let page: serde_json::Value = response.json().await.map_err(|_| {
            Error::new(
                "provider_invalid_response",
                "The model catalogue was not valid JSON",
            )
        })?;
        let field = if connection.provider == Provider::Google {
            "models"
        } else {
            "data"
        };
        let rows = page
            .get(field)
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| {
                Error::new(
                    "provider_invalid_response",
                    "The model catalogue did not contain a model list",
                )
            })?;
        for row in rows {
            let id = row
                .get(if connection.provider == Provider::Google {
                    "name"
                } else {
                    "id"
                })
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    Error::new("provider_invalid_response", "A model has no identifier")
                })?;
            result.insert(id.strip_prefix("models/").unwrap_or(id).to_owned());
        }
        cursor = match connection.provider {
            Provider::Google => page
                .get("nextPageToken")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned),
            Provider::Anthropic
                if page.get("has_more").and_then(serde_json::Value::as_bool) == Some(true) =>
            {
                Some(
                    page.get("last_id")
                        .and_then(serde_json::Value::as_str)
                        .ok_or_else(|| {
                            Error::new(
                                "provider_invalid_response",
                                "The model catalogue has no next cursor",
                            )
                        })?
                        .to_owned(),
                )
            }
            _ => None,
        };
        let Some(next) = &cursor else { break };
        if !seen.insert(next.clone()) {
            return Err(Error::new(
                "provider_invalid_response",
                "The model catalogue repeated a page cursor",
            ));
        }
    }
    let mut values: Vec<_> = result.into_iter().collect();
    values.sort_by_cached_key(|s| (s.to_lowercase(), s.clone()));
    Ok(values)
}

#[derive(Deserialize)]
struct ModelSelection {
    model: String,
}
#[utoipa::path(
    get, path = "/api/ai/providers/{id}/capabilities", operation_id = "ai_http_capabilities",
    tag = "ai_http",
    params(("id" = String, Path), ("model" = String, Query)),
    responses((status = 200, body = inference::InferenceCapabilities), (status = 400, body = crate::error::ErrorEnvelope))
)]
async fn model_capabilities(
    State(config): State<super::AiConfiguration>,
    Path(id): Path<Uuid>,
    Query(selection): Query<ModelSelection>,
) -> Result<Json<inference::InferenceCapabilities>> {
    let provider = config.provider(id).await?;
    Ok(Json(inference::capabilities(provider, &selection.model)))
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
struct AnnotationConcurrency {
    concurrency: usize,
}
#[utoipa::path(
    patch, path = "/api/ai/providers/{id}/annotation", operation_id = "ai_http_annotation_concurrency",
    tag = "ai_http", params(("id" = String, Path)), request_body = AnnotationConcurrency,
    responses((status = 200, body = ConnectionInfo), (status = 400, body = crate::error::ErrorEnvelope))
)]
async fn annotation_concurrency(
    State(config): State<super::AiConfiguration>,
    Path(id): Path<Uuid>,
    Json(input): Json<AnnotationConcurrency>,
) -> Result<Json<ConnectionInfo>> {
    Ok(Json(
        config.annotation_concurrency(id, input.concurrency).await?,
    ))
}
