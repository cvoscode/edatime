use chrono::{DateTime, Utc};
use polars::prelude::DataFrame;

use crate::config::ValidationSettings;
use crate::error::{AppError, ErrorCode};

pub fn validate_time_window(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<(), AppError> {
    if start >= end {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidTimeRange,
            "Start time must be before end time",
        ));
    }
    Ok(())
}

pub fn validate_width(width: usize, limits: &ValidationSettings) -> Result<(), AppError> {
    if width == 0 || width > limits.max_viewport_width {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidWidth,
            format!(
                "Width must be between 1 and {} pixels",
                limits.max_viewport_width
            ),
        ));
    }
    Ok(())
}

pub fn validate_bucket_count(buckets: usize, limits: &ValidationSettings) -> Result<(), AppError> {
    if buckets == 0 || buckets > limits.max_buckets {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidBuckets,
            format!("Buckets must be between 1 and {}", limits.max_buckets),
        ));
    }
    Ok(())
}

pub fn validate_window_ms(window_ms: i64, step_ms: Option<i64>) -> Result<(), AppError> {
    if window_ms <= 0 {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidBuckets,
            "Window size must be greater than 0 ms",
        ));
    }
    if let Some(step) = step_ms
        && step <= 0 {
            return Err(AppError::bad_request_code(
                ErrorCode::InvalidBuckets,
                "Window step must be greater than 0 ms",
            ));
        }
    Ok(())
}

pub fn validate_scatter_limit(limit: usize, limits: &ValidationSettings) -> Result<(), AppError> {
    if limit == 0 || limit > limits.max_scatter_limit {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidScatterLimit,
            format!(
                "Scatter limit must be between 1 and {}",
                limits.max_scatter_limit
            ),
        ));
    }
    Ok(())
}

pub fn validate_upload_size_with_limit(
    total_bytes: usize,
    max_upload_bytes: usize,
) -> Result<(), AppError> {
    if total_bytes > max_upload_bytes {
        return Err(AppError::bad_request_code(
            ErrorCode::UploadTooLarge,
            format!(
                "Upload exceeds the {} MB limit",
                max_upload_bytes / (1024 * 1024)
            ),
        ));
    }
    Ok(())
}

pub fn validate_numeric_columns(
    df: &DataFrame,
    columns: &[String],
    limits: &ValidationSettings,
) -> Result<Vec<String>, AppError> {
    if columns.len() > limits.max_selected_columns {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidColumnSelection,
            format!(
                "At most {} columns may be requested at once",
                limits.max_selected_columns
            ),
        ));
    }

    let mut out = Vec::new();
    for column in columns {
        let name = column.trim();
        if name.is_empty() || out.iter().any(|existing: &String| existing == name) {
            continue;
        }

        let series = df.column(name).map_err(|_| {
            AppError::bad_request_code(
                ErrorCode::ColumnNotFound,
                format!("Unknown column '{}'", name),
            )
        })?;

        if !series.dtype().is_numeric() {
            return Err(AppError::bad_request_code(
                ErrorCode::InvalidColumnSelection,
                format!("Column '{}' must be numeric for this endpoint", name),
            ));
        }

        out.push(name.to_string());
    }

    if out.is_empty() {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidColumnSelection,
            "No valid numeric columns were requested",
        ));
    }

    Ok(out)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_width() {
        let limits = ValidationSettings::default();
        let err = validate_width(0, &limits).unwrap_err();
        assert!(err.to_string().contains("Width must be"));
    }

    #[test]
    fn rejects_invalid_time_window() {
        let now = Utc::now();
        let err = validate_time_window(now, now).unwrap_err();
        assert!(
            err.to_string()
                .contains("Start time must be before end time")
        );
    }
}
