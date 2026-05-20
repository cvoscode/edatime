//! Application errors and structured HTTP responses.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

static ERROR_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    Validation,
    Internal,
    RateLimit,
    NotFound,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidRequest,
    InvalidTimeRange,
    InvalidWidth,
    InvalidBuckets,
    InvalidScatterLimit,
    InvalidColumnSelection,
    ColumnNotFound,
    UploadTooLarge,
    RateLimitExceeded,
    NotFound,
    Internal,
}

#[derive(Debug, Serialize)]
struct ErrorBody<'a> {
    error: &'a str,
    message: &'a str,
    kind: ErrorKind,
    code: ErrorCode,
    correlation_id: &'a str,
}

#[derive(Debug)]
pub struct AppError {
    pub kind: ErrorKind,
    pub code: ErrorCode,
    pub message: String,
    pub correlation_id: String,
}

impl AppError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::bad_request_code(ErrorCode::InvalidRequest, msg)
    }

    pub fn bad_request_code(code: ErrorCode, msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Validation, code, msg)
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, ErrorCode::Internal, msg)
    }

    pub fn io(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, ErrorCode::Internal, msg)
    }

    pub fn rate_limit(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::RateLimit, ErrorCode::RateLimitExceeded, msg)
    }

    fn new(kind: ErrorKind, code: ErrorCode, msg: impl Into<String>) -> Self {
        Self {
            kind,
            code,
            message: msg.into(),
            correlation_id: next_correlation_id(),
        }
    }

    fn status_code(&self) -> StatusCode {
        match self.kind {
            ErrorKind::Validation => StatusCode::BAD_REQUEST,
            ErrorKind::RateLimit => StatusCode::TOO_MANY_REQUESTS,
            ErrorKind::NotFound => StatusCode::NOT_FOUND,
            ErrorKind::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn label(&self) -> &'static str {
        match self.kind {
            ErrorKind::Validation => "Bad request",
            ErrorKind::RateLimit => "Rate limit exceeded",
            ErrorKind::NotFound => "Not found",
            ErrorKind::Internal => "Internal error",
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        tracing::error!(
            correlation_id = %self.correlation_id,
            kind = ?self.kind,
            code = ?self.code,
            message = %self.message,
            "request failed"
        );

        let body = ErrorBody {
            error: self.label(),
            message: &self.message,
            kind: self.kind,
            code: self.code,
            correlation_id: &self.correlation_id,
        };

        (self.status_code(), Json(body)).into_response()
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<polars::prelude::PolarsError> for AppError {
    fn from(value: polars::prelude::PolarsError) -> Self {
        AppError::internal(value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::io(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        AppError::internal(format!("JSON serialization error: {value}"))
    }
}

impl From<edatime_core::error::AppError> for AppError {
    fn from(value: edatime_core::error::AppError) -> Self {
        AppError::internal(format!("core error: {value}"))
    }
}

fn next_correlation_id() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    let seq = ERROR_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("err-{:x}-{:x}", ms, seq)
}
