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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    Validation,
    Conflict,
    Internal,
    RateLimit,
    NotFound,
    Unsupported,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidRequest,
    InvalidTimeRange,
    InvalidWidth,
    InvalidBuckets,
    InvalidScatterLimit,
    InvalidColumnSelection,
    WorkBudgetExceeded,
    ColumnNotFound,
    UploadTooLarge,
    RateLimitExceeded,
    NotFound,
    StalePlan,
    Internal,
    MethodNotAllowed,
    UnsupportedMediaType,
    PayloadTooLarge,
    UnprocessableEntity,
    ServiceUnavailable,
    NotImplemented,
}

#[derive(Debug, Serialize)]
struct ErrorBody<'a> {
    error: &'a str,
    message: &'a str,
    kind: ErrorKind,
    code: ErrorCode,
    correlation_id: &'a str,
    request_id: &'a str,
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

    pub fn stale_plan(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Conflict, ErrorCode::StalePlan, msg)
    }

    pub fn framework(status: StatusCode, msg: impl Into<String>) -> Self {
        match status {
            StatusCode::NOT_FOUND => Self::new(ErrorKind::NotFound, ErrorCode::NotFound, msg),
            StatusCode::METHOD_NOT_ALLOWED => {
                Self::new(ErrorKind::Unsupported, ErrorCode::MethodNotAllowed, msg)
            }
            StatusCode::UNSUPPORTED_MEDIA_TYPE => {
                Self::new(ErrorKind::Unsupported, ErrorCode::UnsupportedMediaType, msg)
            }
            StatusCode::PAYLOAD_TOO_LARGE => {
                Self::new(ErrorKind::Validation, ErrorCode::PayloadTooLarge, msg)
            }
            StatusCode::UNPROCESSABLE_ENTITY => {
                Self::new(ErrorKind::Validation, ErrorCode::UnprocessableEntity, msg)
            }
            StatusCode::SERVICE_UNAVAILABLE => {
                Self::new(ErrorKind::Unavailable, ErrorCode::ServiceUnavailable, msg)
            }
            StatusCode::NOT_IMPLEMENTED => {
                Self::new(ErrorKind::Unsupported, ErrorCode::NotImplemented, msg)
            }
            _ => Self::bad_request(msg),
        }
    }

    fn new(kind: ErrorKind, code: ErrorCode, msg: impl Into<String>) -> Self {
        Self {
            kind,
            code,
            message: msg.into(),
            correlation_id: crate::middleware::current_request_id()
                .unwrap_or_else(next_correlation_id),
        }
    }

    fn status_code(&self) -> StatusCode {
        match self.kind {
            ErrorKind::Validation => match self.code {
                ErrorCode::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
                ErrorCode::UnprocessableEntity => StatusCode::UNPROCESSABLE_ENTITY,
                _ => StatusCode::BAD_REQUEST,
            },
            ErrorKind::Conflict => StatusCode::CONFLICT,
            ErrorKind::RateLimit => StatusCode::TOO_MANY_REQUESTS,
            ErrorKind::NotFound => StatusCode::NOT_FOUND,
            ErrorKind::Unsupported => match self.code {
                ErrorCode::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED,
                ErrorCode::UnsupportedMediaType => StatusCode::UNSUPPORTED_MEDIA_TYPE,
                ErrorCode::NotImplemented => StatusCode::NOT_IMPLEMENTED,
                _ => StatusCode::BAD_REQUEST,
            },
            ErrorKind::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            ErrorKind::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn label(&self) -> &'static str {
        match self.kind {
            ErrorKind::Validation => "Bad request",
            ErrorKind::Conflict => "Conflict",
            ErrorKind::RateLimit => "Rate limit exceeded",
            ErrorKind::NotFound => "Not found",
            ErrorKind::Unsupported => "Unsupported request",
            ErrorKind::Unavailable => "Service unavailable",
            ErrorKind::Internal => "Internal error",
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self.kind {
            ErrorKind::Validation | ErrorKind::NotFound => tracing::info!(
                request_id = %self.correlation_id,
                kind = ?self.kind,
                code = ?self.code,
                message = %self.message,
                "request rejected"
            ),
            ErrorKind::Conflict
            | ErrorKind::RateLimit
            | ErrorKind::Unsupported
            | ErrorKind::Unavailable => tracing::warn!(
                request_id = %self.correlation_id,
                kind = ?self.kind,
                code = ?self.code,
                message = %self.message,
                "request rejected"
            ),
            ErrorKind::Internal => tracing::error!(
                request_id = %self.correlation_id,
                kind = ?self.kind,
                code = ?self.code,
                message = %self.message,
                "request failed"
            ),
        }

        let body = ErrorBody {
            error: self.label(),
            message: &self.message,
            kind: self.kind,
            code: self.code,
            correlation_id: &self.correlation_id,
            request_id: &self.correlation_id,
        };
        let mut response = (self.status_code(), Json(body)).into_response();
        response
            .headers_mut()
            .insert("x-edatime-error", axum::http::HeaderValue::from_static("1"));
        if let Ok(value) = axum::http::HeaderValue::from_str(&self.correlation_id) {
            response.headers_mut().insert("x-request-id", value);
        }
        if self.kind == ErrorKind::Unavailable {
            response.headers_mut().insert(
                axum::http::header::RETRY_AFTER,
                axum::http::HeaderValue::from_static("1"),
            );
        }
        response
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
        match value {
            edatime_core::error::AppError::InvalidTimeRange(message) => {
                AppError::bad_request_code(ErrorCode::InvalidTimeRange, message)
            }
            edatime_core::error::AppError::InvalidWidth(message) => {
                AppError::bad_request_code(ErrorCode::InvalidWidth, message)
            }
            edatime_core::error::AppError::InvalidBuckets(message) => {
                AppError::bad_request_code(ErrorCode::InvalidBuckets, message)
            }
            edatime_core::error::AppError::InvalidScatterLimit(message) => {
                AppError::bad_request_code(ErrorCode::InvalidScatterLimit, message)
            }
            edatime_core::error::AppError::InvalidColumnSelection(message) => {
                AppError::bad_request_code(ErrorCode::InvalidColumnSelection, message)
            }
            edatime_core::error::AppError::ColumnNotFound(message) => {
                AppError::bad_request_code(ErrorCode::ColumnNotFound, message)
            }
            edatime_core::error::AppError::UploadTooLarge(message) => {
                AppError::bad_request_code(ErrorCode::UploadTooLarge, message)
            }
            edatime_core::error::AppError::Validation(message)
            | edatime_core::error::AppError::BadRequest(message) => {
                AppError::bad_request_code(ErrorCode::InvalidRequest, message)
            }
            edatime_core::error::AppError::NotFound(message) => {
                AppError::new(ErrorKind::NotFound, ErrorCode::NotFound, message)
            }
            edatime_core::error::AppError::Overloaded(message) => AppError::new(
                ErrorKind::Unavailable,
                ErrorCode::ServiceUnavailable,
                message,
            ),
            edatime_core::error::AppError::Query(message)
            | edatime_core::error::AppError::Io(message)
            | edatime_core::error::AppError::Internal(message) => AppError::internal(message),
        }
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
