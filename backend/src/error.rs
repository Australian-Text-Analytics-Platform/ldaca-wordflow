use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Error {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub statement_index: Option<usize>,
}

impl Error {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            statement_index: None,
        }
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new("invalid_request", message)
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Error {}
impl From<duckdb::Error> for Error {
    fn from(e: duckdb::Error) -> Self {
        Self::new("sql_error", e.to_string())
    }
}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::new("io_error", e.to_string())
    }
}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Self::invalid(e.to_string())
    }
}
impl From<tokio::task::JoinError> for Error {
    fn from(e: tokio::task::JoinError) -> Self {
        Self::new("worker_failed", e.to_string())
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = match self.code.as_str() {
            "project_closed" | "project_busy" | "editing_active" | "editing_closed"
            | "editing_stale" | "nothing_to_undo" | "task_active" | "analysis_busy"
            | "session_changed" | "file_exists" | "save_required" => StatusCode::CONFLICT,
            "provider_not_found"
            | "node_not_found"
            | "object_not_found"
            | "task_not_found"
            | "analysis_not_found"
            | "analysis_tab_not_found" => StatusCode::NOT_FOUND,
            "file_not_found" => StatusCode::NOT_FOUND,
            "stopping" => StatusCode::SERVICE_UNAVAILABLE,
            "worker_failed" | "io_error" | "arrow_error" => StatusCode::INTERNAL_SERVER_ERROR,
            _ => StatusCode::BAD_REQUEST,
        };
        (status, Json(ErrorEnvelope { error: self })).into_response()
    }
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ErrorEnvelope {
    pub error: Error,
}
