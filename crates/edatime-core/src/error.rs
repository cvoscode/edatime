//! Pure domain error types — no HTTP/Axum dependencies.

use thiserror::Error;

#[derive(Debug, Clone, Error)]
pub enum AppError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("query error: {0}")]
    Query(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("internal error: {0}")]
    Internal(String),
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
