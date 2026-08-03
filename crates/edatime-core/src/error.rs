//! Pure domain error types — no HTTP/Axum dependencies.

use thiserror::Error;

#[derive(Debug, Clone, Error)]
pub enum AppError {
    #[error("invalid time range: {0}")]
    InvalidTimeRange(String),
    #[error("invalid viewport width: {0}")]
    InvalidWidth(String),
    #[error("invalid bucket count: {0}")]
    InvalidBuckets(String),
    #[error("invalid scatter limit: {0}")]
    InvalidScatterLimit(String),
    #[error("invalid column selection: {0}")]
    InvalidColumnSelection(String),
    #[error("column not found: {0}")]
    ColumnNotFound(String),
    #[error("upload too large: {0}")]
    UploadTooLarge(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("service overloaded: {0}")]
    Overloaded(String),
    #[error("database configuration error: {0}")]
    DatabaseConfiguration(String),
    #[error("database unavailable: {0}")]
    DatabaseUnavailable(String),
    #[error("database timeout: {0}")]
    DatabaseTimeout(String),
    #[error("database query error: {0}")]
    DatabaseQuery(String),
    #[error("query error: {0}")]
    Query(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl AppError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::BadRequest(msg.into())
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }

    pub fn overloaded(msg: impl Into<String>) -> Self {
        Self::Overloaded(msg.into())
    }

    pub fn database_configuration(msg: impl Into<String>) -> Self {
        Self::DatabaseConfiguration(msg.into())
    }

    pub fn database_unavailable(msg: impl Into<String>) -> Self {
        Self::DatabaseUnavailable(msg.into())
    }

    pub fn database_timeout(msg: impl Into<String>) -> Self {
        Self::DatabaseTimeout(msg.into())
    }

    pub fn database_query(msg: impl Into<String>) -> Self {
        Self::DatabaseQuery(msg.into())
    }
}

impl From<polars::prelude::PolarsError> for AppError {
    fn from(value: polars::prelude::PolarsError) -> Self {
        AppError::Internal(value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Io(value.to_string())
    }
}
