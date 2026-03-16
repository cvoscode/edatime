use chrono::{DateTime, Utc};
use polars::prelude::DataFrame;

use crate::error::{AppError, ErrorCode};

pub const MAX_SELECTED_COLUMNS: usize = 100;
pub const MAX_VIEWPORT_WIDTH: usize = 20_000;
pub const MAX_BUCKETS: usize = 10_000;
pub const MAX_SCATTER_LIMIT: usize = 5_000_000;

pub fn validate_time_window(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<(), AppError> {
    if start >= end {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidTimeRange,
            "Start time must be before end time",
        ));
    }
    Ok(())
}

pub fn validate_width(width: usize) -> Result<(), AppError> {
    if width == 0 || width > MAX_VIEWPORT_WIDTH {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidWidth,
            format!("Width must be between 1 and {} pixels", MAX_VIEWPORT_WIDTH),
        ));
    }
    Ok(())
}

pub fn validate_bucket_count(buckets: usize) -> Result<(), AppError> {
    if buckets == 0 || buckets > MAX_BUCKETS {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidBuckets,
            format!("Buckets must be between 1 and {}", MAX_BUCKETS),
        ));
    }
    Ok(())
}

pub fn validate_scatter_limit(limit: usize) -> Result<(), AppError> {
    if limit == 0 || limit > MAX_SCATTER_LIMIT {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidScatterLimit,
            format!("Scatter limit must be between 1 and {}", MAX_SCATTER_LIMIT),
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
) -> Result<Vec<String>, AppError> {
    if columns.len() > MAX_SELECTED_COLUMNS {
        return Err(AppError::bad_request_code(
            ErrorCode::InvalidColumnSelection,
            format!(
                "At most {} columns may be requested at once",
                MAX_SELECTED_COLUMNS
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
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_width() {
        let err = validate_width(0).unwrap_err();
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
