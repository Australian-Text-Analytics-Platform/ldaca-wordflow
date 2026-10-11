//! Read-only resolved host locations. Renderers cannot choose native folder paths.
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
    utoipa_axum::router::OpenApiRouter::new().routes(utoipa_axum::routes!(get))
}
#[utoipa::path(get, path = "/api/storage/locations", operation_id = "storage_locations", tag = "settings", responses((status = 200, body = StorageLocations)))]
async fn get(State(locations): State<StorageLocations>) -> Json<StorageLocations> {
    Json(locations)
}
