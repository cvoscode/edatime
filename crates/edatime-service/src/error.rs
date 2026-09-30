//! Application errors and structured HTTP responses.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

/// Client-facing text for every internal failure; the detail is only logged.
const INTERNAL_ERROR_MESSAGE: &str =
    "An internal error occurred. Quote the request id when reporting it.";

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
    RequestCancelled,
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
    DatabaseConfiguration,
    DatabaseUnavailable,
    DatabaseTimeout,
    DatabaseQuery,
    NotImplemented,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::InvalidTimeRange => "invalid_time_range",
            Self::InvalidWidth => "invalid_width",
            Self::InvalidBuckets => "invalid_buckets",
            Self::InvalidScatterLimit => "invalid_scatter_limit",
            Self::InvalidColumnSelection => "invalid_column_selection",
            Self::WorkBudgetExceeded => "work_budget_exceeded",
            Self::RequestCancelled => "request_cancelled",
            Self::ColumnNotFound => "column_not_found",
            Self::UploadTooLarge => "upload_too_large",
            Self::RateLimitExceeded => "rate_limit_exceeded",
            Self::NotFound => "not_found",
            Self::StalePlan => "stale_plan",
            Self::Internal => "internal",
            Self::MethodNotAllowed => "method_not_allowed",
            Self::UnsupportedMediaType => "unsupported_media_type",
            Self::PayloadTooLarge => "payload_too_large",
            Self::UnprocessableEntity => "unprocessable_entity",
            Self::ServiceUnavailable => "service_unavailable",
            Self::DatabaseConfiguration => "database_configuration",
            Self::DatabaseUnavailable => "database_unavailable",
            Self::DatabaseTimeout => "database_timeout",
            Self::DatabaseQuery => "database_query",
            Self::NotImplemented => "not_implemented",
        }
    }
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

        // Internal messages can carry file paths, Polars plans or SQL text.
        // They are logged above; clients get a stable message plus the id.
        let client_message = if self.kind == ErrorKind::Internal {
            INTERNAL_ERROR_MESSAGE
        } else {
            self.message.as_str()
        };
        let body = ErrorBody {
            error: self.label(),
            message: client_message,
            kind: self.kind,
            code: self.code,
            correlation_id: &self.correlation_id,
            request_id: &self.correlation_id,
        };
        let mut response = (self.status_code(), Json(body)).into_response();
        response
            .headers_mut()
            .insert("x-edatime-error", axum::http::HeaderValue::from_static("1"));
        response.headers_mut().insert(
            "x-edatime-error-code",
            axum::http::HeaderValue::from_static(self.code.as_str()),
        );
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
        use polars::prelude::PolarsError;
        match &value {
            // A name the caller chose does not exist: their input, not our bug.
            PolarsError::ColumnNotFound(_)
            | PolarsError::SchemaFieldNotFound(_)
            | PolarsError::StructFieldNotFound(_) => {
                AppError::bad_request_code(ErrorCode::ColumnNotFound, value.to_string())
            }
            PolarsError::Context { error, .. } => match error.as_ref() {
                PolarsError::ColumnNotFound(_)
                | PolarsError::SchemaFieldNotFound(_)
                | PolarsError::StructFieldNotFound(_) => {
                    AppError::bad_request_code(ErrorCode::ColumnNotFound, value.to_string())
                }
                _ => AppError::internal(value.to_string()),
            },
            _ => AppError::internal(value.to_string()),
        }
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

impl From<edatime_core::error::DomainError> for AppError {
    fn from(value: edatime_core::error::DomainError) -> Self {
        match value {
            edatime_core::error::DomainError::InvalidTimeRange(message) => {
                AppError::bad_request_code(ErrorCode::InvalidTimeRange, message)
            }
            edatime_core::error::DomainError::InvalidWidth(message) => {
                AppError::bad_request_code(ErrorCode::InvalidWidth, message)
            }
            edatime_core::error::DomainError::InvalidBuckets(message) => {
                AppError::bad_request_code(ErrorCode::InvalidBuckets, message)
            }
            edatime_core::error::DomainError::InvalidScatterLimit(message) => {
                AppError::bad_request_code(ErrorCode::InvalidScatterLimit, message)
            }
            edatime_core::error::DomainError::InvalidColumnSelection(message) => {
                AppError::bad_request_code(ErrorCode::InvalidColumnSelection, message)
            }
            edatime_core::error::DomainError::ColumnNotFound(message) => {
                AppError::bad_request_code(ErrorCode::ColumnNotFound, message)
            }
            edatime_core::error::DomainError::UploadTooLarge(message) => {
                AppError::bad_request_code(ErrorCode::UploadTooLarge, message)
            }
            edatime_core::error::DomainError::Validation(message)
            | edatime_core::error::DomainError::BadRequest(message) => {
                AppError::bad_request_code(ErrorCode::InvalidRequest, message)
            }
            edatime_core::error::DomainError::NotFound(message) => {
                AppError::new(ErrorKind::NotFound, ErrorCode::NotFound, message)
            }
            edatime_core::error::DomainError::Overloaded(message) => AppError::new(
                ErrorKind::Unavailable,
                ErrorCode::ServiceUnavailable,
                message,
            ),
            edatime_core::error::DomainError::Cancelled(message) => {
                AppError::new(ErrorKind::Unavailable, ErrorCode::RequestCancelled, message)
            }
            edatime_core::error::DomainError::DatabaseConfiguration(message) => AppError::new(
                ErrorKind::Validation,
                ErrorCode::DatabaseConfiguration,
                message,
            ),
            edatime_core::error::DomainError::DatabaseUnavailable(message) => AppError::new(
                ErrorKind::Unavailable,
                ErrorCode::DatabaseUnavailable,
                message,
            ),
            edatime_core::error::DomainError::DatabaseTimeout(message) => {
                AppError::new(ErrorKind::Unavailable, ErrorCode::DatabaseTimeout, message)
            }
            edatime_core::error::DomainError::DatabaseQuery(message) => {
                AppError::new(ErrorKind::Validation, ErrorCode::DatabaseQuery, message)
            }
            edatime_core::error::DomainError::Query(message)
            | edatime_core::error::DomainError::Io(message)
            | edatime_core::error::DomainError::Internal(message) => AppError::internal(message),
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use polars::prelude::PolarsError;

    #[test]
    fn missing_column_is_a_client_error() {
        let error = AppError::from(PolarsError::ColumnNotFound("nope".into()));
        assert_eq!(error.status_code(), StatusCode::BAD_REQUEST);
        assert_eq!(error.code, ErrorCode::ColumnNotFound);

        let wrapped =
            AppError::from(PolarsError::ColumnNotFound("nope".into()).wrap_msg(|m| m.to_string()));
        assert_eq!(wrapped.status_code(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn other_polars_failures_stay_internal() {
        let error = AppError::from(PolarsError::ComputeError("boom".into()));
        assert_eq!(error.status_code(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn internal_error_details_are_not_sent_to_clients() {
        let response = AppError::internal("open /srv/data/secret.parquet failed").into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body");
        let text = String::from_utf8_lossy(&body);
        assert!(!text.contains("secret.parquet"), "{text}");
        assert!(text.contains("request id"), "{text}");
    }
}
