//! Typed library failures. Error messages deliberately exclude credentials and URLs.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
    #[error("ONI returned HTTP {0}")]
    Http(u16),
    #[error("ONI request timed out")]
    Timeout,
    #[error("ONI transport failed")]
    Transport,
    #[error("Size limit exceeded: {0}")]
    Limit(String),
    #[error("Operation cancelled")]
    Cancelled,
    #[error("Conversion failed: {0}")]
    Conversion(String),
    #[error("I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Arrow error: {0}")]
    Arrow(#[from] arrow_schema::ArrowError),
    #[error("Parquet error: {0}")]
    Parquet(#[from] parquet::errors::ParquetError),
}
pub type Result<T> = std::result::Result<T, Error>;
impl From<reqwest::Error> for Error {
    fn from(error: reqwest::Error) -> Self {
        if error.is_timeout() {
            Self::Timeout
        } else {
            Self::Transport
        }
    }
}
impl From<serde_json::Error> for Error {
    fn from(error: serde_json::Error) -> Self {
        Self::InvalidInput(format!(
            "invalid JSON at line {}, column {}",
            error.line(),
            error.column()
        ))
    }
}
