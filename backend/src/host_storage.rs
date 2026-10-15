//! Resolved host locations and maintenance of explicitly owned reusable caches.
//! Renderers cannot choose native folder paths.
use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use std::path::Path;
use wordflow_storage::AppDirectories;
#[derive(Clone, Copy, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum DirectoryCategory {
    Config,
    Data,
    LocalData,
    Cache,
    Logs,
    Temporary,
}
impl DirectoryCategory {
    pub fn path(self, dirs: &AppDirectories) -> &Path {
        match self {
            Self::Config => &dirs.config,
            Self::Data => &dirs.data,
            Self::LocalData => &dirs.local_data,
            Self::Cache => &dirs.cache,
            Self::Logs => &dirs.logs,
            Self::Temporary => &dirs.temporary,
        }
    }
}
#[derive(Clone, Serialize, utoipa::ToSchema)]
pub struct StorageLocation {
    pub category: DirectoryCategory,
    pub path: String,
    pub exists: bool,
}
#[derive(Clone, Serialize, utoipa::ToSchema)]
pub struct StorageLocations {
    pub location_scope: String,
    pub directories: Vec<StorageLocation>,
    pub project_library: Option<String>,
    pub data_library: Option<String>,
}
impl StorageLocations {
    pub fn new(dirs: Option<&AppDirectories>, scope: &str, libraries: Option<&Path>) -> Self {
        Self {
            location_scope: scope.into(),
            directories: dirs
                .map(|dirs| {
                    [
                        DirectoryCategory::Config,
                        DirectoryCategory::Data,
                        DirectoryCategory::LocalData,
                        DirectoryCategory::Cache,
                        DirectoryCategory::Logs,
                        DirectoryCategory::Temporary,
                    ]
                    .into_iter()
                    .map(|category| {
                        let path = category.path(dirs);
                        StorageLocation {
                            category,
                            path: path.to_string_lossy().into_owned(),
                            exists: path.is_dir(),
                        }
                    })
                    .collect()
                })
                .unwrap_or_default(),
            project_library: libraries
                .map(|root| root.join("projects").to_string_lossy().into_owned()),
            data_library: libraries.map(|root| root.join("data").to_string_lossy().into_owned()),
        }
    }
    pub fn router(self) -> axum::Router {
        contract().split_for_parts().0.with_state(self)
    }
}
pub(crate) fn contract() -> utoipa_axum::router::OpenApiRouter<StorageLocations> {
    utoipa_axum::router::OpenApiRouter::new()
        .routes(utoipa_axum::routes!(get))
        .routes(utoipa_axum::routes!(inspect_caches))
        .routes(utoipa_axum::routes!(clear_cache))
}
#[utoipa::path(get, path = "/api/storage/locations", operation_id = "storage_locations", tag = "settings", responses((status = 200, body = StorageLocations)))]
async fn get(State(locations): State<StorageLocations>) -> Json<StorageLocations> {
    Json(locations)
}

#[derive(Clone, Copy, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReusableCache {
    Tokens,
    Embeddings,
}
impl ReusableCache {
    fn path(self, locations: &StorageLocations) -> crate::error::Result<std::path::PathBuf> {
        let root = locations
            .directories
            .iter()
            .find(|item| matches!(item.category, DirectoryCategory::Cache))
            .ok_or_else(|| crate::Error::invalid("The host has not configured cache storage"))?;
        Ok(Path::new(&root.path).join(match self {
            Self::Tokens => "tokens.duckdb",
            Self::Embeddings => "embeddings.duckdb",
        }))
    }
}
#[derive(Serialize, utoipa::ToSchema)]
pub struct ReusableCacheSize {
    pub cache: ReusableCache,
    pub bytes: u64,
}

#[utoipa::path(get, path = "/api/storage/caches", operation_id = "storage_caches", tag = "settings",
    responses((status = 200, body = Vec<ReusableCacheSize>), (status = 400, body = crate::ErrorEnvelope)))]
async fn inspect_caches(
    State(locations): State<StorageLocations>,
) -> crate::error::Result<Json<Vec<ReusableCacheSize>>> {
    let paths = [ReusableCache::Tokens, ReusableCache::Embeddings]
        .into_iter()
        .map(|cache| Ok((cache, cache.path(&locations)?)))
        .collect::<crate::error::Result<Vec<_>>>()?;
    Ok(Json(
        tokio::task::spawn_blocking(move || {
            paths
                .into_iter()
                .map(|(cache, path)| {
                    ldaca_rs::text_cache_size(&path)
                        .map(|bytes| ReusableCacheSize { cache, bytes })
                        .map_err(cache_error)
                })
                .collect::<crate::error::Result<Vec<_>>>()
        })
        .await??,
    ))
}
fn cache_error(error: impl std::fmt::Display) -> crate::Error {
    crate::Error::new("cache_maintenance_failed", format!("{error:#}"))
}

#[utoipa::path(delete, path = "/api/storage/caches/{cache}", operation_id = "storage_clear_cache", tag = "settings",
    params(("cache" = ReusableCache, Path)), responses((status = 200, body = ReusableCacheSize), (status = 400, body = crate::ErrorEnvelope), (status = 409, body = crate::ErrorEnvelope)))]
async fn clear_cache(
    State(locations): State<StorageLocations>,
    axum::extract::Path(cache): axum::extract::Path<ReusableCache>,
) -> crate::error::Result<Json<ReusableCacheSize>> {
    let path = cache.path(&locations)?;
    let bytes =
        tokio::task::spawn_blocking(move || ldaca_rs::clear_text_cache(&path).map_err(cache_error))
            .await??
            .ok_or_else(|| {
                crate::Error::new(
                    "cache_busy",
                    "This cache is in use. Wait for active analyses to finish, then retry.",
                )
            })?;
    Ok(Json(ReusableCacheSize { cache, bytes }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower::ServiceExt;
    #[tokio::test]
    async fn cache_routes_are_scoped_and_conflict_with_cross_process_leases() {
        let directory = tempfile::tempdir().unwrap();
        let dirs = AppDirectories::browser(directory.path()).unwrap();
        dirs.create().unwrap();
        for (file, bytes) in [
            ("tokens.duckdb", b"tokens".as_slice()),
            ("embeddings.duckdb", b"embeddings".as_slice()),
            ("model.onnx", b"model".as_slice()),
        ] {
            std::fs::write(dirs.cache.join(file), bytes).unwrap();
        }
        let locations = StorageLocations::new(Some(&dirs), "server", None);
        let request = |method: &str, path: &str| {
            axum::http::Request::builder()
                .method(method)
                .uri(path)
                .body(axum::body::Body::empty())
                .unwrap()
        };
        let response = locations
            .clone()
            .router()
            .oneshot(request("GET", "/api/storage/caches"))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let body: serde_json::Value = serde_json::from_slice(
            &axum::body::to_bytes(response.into_body(), 4096)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            body,
            serde_json::json!([{"cache":"tokens","bytes":6},{"cache":"embeddings","bytes":10}])
        );
        let lease = std::fs::File::create(dirs.cache.join("tokens.duckdb.lease.lock")).unwrap();
        lease.lock_shared().unwrap();
        let response = locations
            .clone()
            .router()
            .oneshot(request("DELETE", "/api/storage/caches/tokens"))
            .await
            .unwrap();
        assert_eq!(response.status(), 409);
        drop(lease);
        let response = locations
            .clone()
            .router()
            .oneshot(request("DELETE", "/api/storage/caches/tokens"))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert!(!dirs.cache.join("tokens.duckdb").exists());
        assert_eq!(
            std::fs::read(dirs.cache.join("embeddings.duckdb")).unwrap(),
            b"embeddings"
        );
        assert_eq!(
            std::fs::read(dirs.cache.join("model.onnx")).unwrap(),
            b"model"
        );
        let response = locations
            .router()
            .oneshot(request("DELETE", "/api/storage/caches/models"))
            .await
            .unwrap();
        assert_eq!(response.status(), 400);
    }
}
