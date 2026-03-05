use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug)]
pub enum AppError {
    PolarsError(String),
    ParseError(String),
    IoError(String),
    BadRequest(String),
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            AppError::PolarsError(e) => {
                tracing::error!("Polars error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database query error".to_string())
            }
            AppError::ParseError(e) => {
                tracing::error!("Parse error: {}", e);
                (StatusCode::BAD_REQUEST, e.clone())
            }
            AppError::IoError(e) => {
                tracing::error!("IO error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            AppError::BadRequest(e) => {
                tracing::error!("Bad request: {}", e);
                (StatusCode::BAD_REQUEST, e.clone())
            }
            AppError::Internal(e) => {
                tracing::error!("Internal error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(json!({
            "error": error_message,
        }));

        (status, body).into_response()
    }
}

impl From<polars::prelude::PolarsError> for AppError {
    fn from(err: polars::prelude::PolarsError) -> Self {
        AppError::PolarsError(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::IoError(err.to_string())
    }
}

impl From<chrono::ParseError> for AppError {
    fn from(err: chrono::ParseError) -> Self {
        AppError::ParseError(err.to_string())
    }
}
