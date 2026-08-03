use chrono::{DateTime, Utc};
use polars::prelude::{DataFrame, LazyFrame};

use edatime_core::config::ValidationSettings;
use edatime_core::error::AppError;

pub fn validate_time_window(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<(), AppError> {
    if start >= end {
        return Err(AppError::InvalidTimeRange(
            "Start time must be before end time".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_width(width: usize, limits: &ValidationSettings) -> Result<(), AppError> {
    // Enforce BOTH the lower and upper bounds so the `width=1` raw-data
    // escape hatch (audit issue 1.2) cannot resurface via direct API
    // calls. The frontend already clamps to 50 in
    // `services/api/timeseries.ts`; this makes the backend authoritative.
    if width < limits.min_viewport_width || width > limits.max_viewport_width {
        return Err(AppError::InvalidWidth(format!(
            "Width must be between {} and {} pixels",
            limits.min_viewport_width, limits.max_viewport_width
        )));
    }
    Ok(())
}

pub fn validate_bucket_count(buckets: usize, limits: &ValidationSettings) -> Result<(), AppError> {
    if buckets == 0 || buckets > limits.max_buckets {
        return Err(AppError::InvalidBuckets(format!(
            "Buckets must be between 1 and {}",
            limits.max_buckets
        )));
    }
    Ok(())
}

pub fn validate_window_ms(window_ms: i64, step_ms: Option<i64>) -> Result<(), AppError> {
    if window_ms <= 0 {
        return Err(AppError::BadRequest(
            "Window size must be greater than 0 ms".to_string(),
        ));
    }
    if let Some(step) = step_ms
        && step <= 0
    {
        return Err(AppError::BadRequest(
            "Window step must be greater than 0 ms".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_scatter_limit(limit: usize, limits: &ValidationSettings) -> Result<(), AppError> {
    if limit == 0 || limit > limits.max_scatter_limit {
        return Err(AppError::InvalidScatterLimit(format!(
            "Scatter limit must be between 1 and {}",
            limits.max_scatter_limit
        )));
    }
    Ok(())
}

pub fn validate_upload_size_with_limit(
    total_bytes: usize,
    max_upload_bytes: usize,
) -> Result<(), AppError> {
    if total_bytes > max_upload_bytes {
        return Err(AppError::UploadTooLarge(format!(
            "Upload exceeds the {} MB limit",
            max_upload_bytes / (1024 * 1024)
        )));
    }
    Ok(())
}

pub fn validate_numeric_columns(
    df: &DataFrame,
    columns: &[String],
    limits: &ValidationSettings,
) -> Result<Vec<String>, AppError> {
    if columns.len() > limits.max_selected_columns {
        return Err(AppError::InvalidColumnSelection(format!(
            "At most {} columns may be requested at once",
            limits.max_selected_columns
        )));
    }

    let mut out = Vec::new();
    for column in columns {
        let name = column.trim();
        if name.is_empty() || out.iter().any(|existing: &String| existing == name) {
            continue;
        }

        let series = df
            .column(name)
            .map_err(|_| AppError::ColumnNotFound(format!("Unknown column '{}'", name)))?;

        if !series.dtype().is_numeric() {
            return Err(AppError::InvalidColumnSelection(format!(
                "Column '{}' must be numeric for this endpoint",
                name
            )));
        }

        out.push(name.to_string());
    }

    if out.is_empty() {
        return Err(AppError::InvalidColumnSelection(
            "No valid numeric columns were requested".to_string(),
        ));
    }

    Ok(out)
}

pub fn validate_numeric_columns_lazy(
    lf: &LazyFrame,
    columns: &[String],
    limits: &ValidationSettings,
) -> Result<Vec<String>, AppError> {
    if columns.len() > limits.max_selected_columns {
        return Err(AppError::InvalidColumnSelection(format!(
            "At most {} columns may be requested at once",
            limits.max_selected_columns
        )));
    }

    let schema = lf
        .clone()
        .collect_schema()
        .map_err(|e| AppError::BadRequest(format!("Failed to get schema: {}", e)))?;

    let mut out = Vec::new();
    for column in columns {
        let name = column.trim();
        if name.is_empty() || out.iter().any(|existing: &String| existing == name) {
            continue;
        }

        let dtype = schema
            .get(name)
            .ok_or_else(|| AppError::ColumnNotFound(format!("Unknown column '{}'", name)))?;

        if !dtype.is_numeric() {
            return Err(AppError::InvalidColumnSelection(format!(
                "Column '{}' must be numeric for this endpoint",
                name
            )));
        }

        out.push(name.to_string());
    }

    if out.is_empty() {
        return Err(AppError::InvalidColumnSelection(
            "No valid numeric columns were requested".to_string(),
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
        // Audit issue 1.2: the `width=1` raw-data escape hatch is
        // closed by the new min bound. The error message must
        // mention the actual configured min so the caller can
        // recover without guessing.
        let err_min = validate_width(1, &limits).unwrap_err();
        assert!(err_min.to_string().contains("Width must be"));
    }

    /// Audit issue 1.2: `width=1` must be rejected (escape hatch
    /// closed); `width = min_viewport_width` (default 50) must be
    /// accepted; `width = max_viewport_width + 1` must be rejected.
    #[test]
    fn width_enforces_min_and_max_floor() {
        let limits = ValidationSettings::default();
        assert!(validate_width(1, &limits).is_err(), "width=1 is below min");
        assert!(
            validate_width(limits.min_viewport_width, &limits).is_ok(),
            "width at the min must be accepted"
        );
        assert!(
            validate_width(limits.min_viewport_width - 1, &limits).is_err(),
            "width one below the min must be rejected"
        );
        assert!(
            validate_width(limits.max_viewport_width, &limits).is_ok(),
            "width at the max must be accepted"
        );
        assert!(
            validate_width(limits.max_viewport_width + 1, &limits).is_err(),
            "width above the max must be rejected"
        );
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
