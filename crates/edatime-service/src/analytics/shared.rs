//! Shared helpers used across all analytics submodules.

use polars::prelude::*;
use crate::error::AppError;

/// Extract the timestamp column as epoch-millisecond f64 values.
pub fn extract_ts_epoch_ms(df: &DataFrame) -> Result<Vec<f64>, AppError> {
    let ts_col = find_ts_column(df)?;
    extract_ts_epoch_ms_with_col(df, &ts_col)
}

/// Extract the timestamp column as epoch-millisecond f64 values, using explicit column name.
pub fn extract_ts_epoch_ms_with_col(df: &DataFrame, ts_col: &str) -> Result<Vec<f64>, AppError> {
    let ts_col_series = df
        .column(ts_col)
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::internal(format!("Missing ts column '{}': {}", ts_col, e)))?;
    let ts_i64 = ts_col_series
        .cast(&DataType::Int64)
        .map_err(|e| AppError::internal(format!("ts cast: {}", e)))?;
    let ts_dtype = edatime_core::temporal::ts_dtype(df, ts_col)?;
    Ok(ts_i64
        .i64()
        .map_err(|e| AppError::internal(format!("ts i64: {}", e)))?
        .into_iter()
        .map(|v| {
            v.map(|t| edatime_core::temporal::native_to_epoch_ms(t, &ts_dtype))
                .unwrap_or(f64::NAN)
        })
        .collect())
}

/// Find the timestamp column by looking for a Datetime column.
fn find_ts_column(df: &DataFrame) -> Result<String, AppError> {
    for field in df.schema().iter_fields() {
        if matches!(field.dtype(), DataType::Datetime(_, _)) {
            return Ok(field.name().to_string());
        }
    }
    Err(AppError::internal("No timestamp column found in DataFrame"))
}

/// Extract a named column as `Vec<Option<f64>>`, filtering non-finite values to `None`.
pub fn extract_f64_column_opt(
    df: &DataFrame,
    col_name: &str,
) -> Result<Vec<Option<f64>>, AppError> {
    let series = df
        .column(col_name)
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::internal(format!("Missing column '{}': {e}", col_name)))?;
    let f64_series = series
        .cast(&DataType::Float64)
        .map_err(|e| AppError::internal(format!("Cast '{}': {e}", col_name)))?;
    Ok(f64_series
        .f64()
        .map_err(|e| AppError::internal(format!("Read '{}': {e}", col_name)))?
        .into_iter()
        .map(|v| v.filter(|f| f.is_finite()))
        .collect())
}

/// Extract a named column as `Vec<f64>`, replacing non-finite/null values with 0.0.
pub fn extract_f64_column(df: &DataFrame, col_name: &str) -> Result<Vec<f64>, AppError> {
    let series = df
        .column(col_name)
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::internal(format!("Missing '{}': {e}", col_name)))?;
    let f64_series = series
        .cast(&DataType::Float64)
        .map_err(|e| AppError::internal(format!("Cast '{}': {e}", col_name)))?;
    Ok(f64_series
        .f64()
        .map_err(|e| AppError::internal(format!("Read '{}': {e}", col_name)))?
        .into_iter()
        .map(|v| v.unwrap_or(0.0))
        .collect())
}

/// Extract multiple columns as `Vec<Vec<f64>>` with optional subsampling.
/// Non-finite values are replaced with each column's mean.
pub fn extract_columns_f64_mean(
    df: &DataFrame,
    col_names: &[String],
    max_points: usize,
) -> Result<Vec<Vec<f64>>, AppError> {
    let height = df.height().min(max_points);
    let step = if df.height() > max_points {
        df.height() / max_points
    } else {
        1
    };

    let mut result: Vec<Vec<f64>> = Vec::with_capacity(col_names.len());
    for col_name in col_names {
        let series = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::internal(format!("Missing '{}': {e}", col_name)))?;
        let f64_series = series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::internal(format!("Cast '{}': {e}", col_name)))?;
        let raw: Vec<f64> = f64_series
            .f64()
            .map_err(|e| AppError::internal(format!("Read '{}': {e}", col_name)))?
            .into_iter()
            .step_by(step)
            .take(height)
            .map(|v| v.unwrap_or(f64::NAN))
            .collect();

        let finite_sum: f64 = raw.iter().filter(|x| x.is_finite()).sum();
        let finite_count = raw.iter().filter(|x| x.is_finite()).count();
        let mean = if finite_count > 0 {
            finite_sum / finite_count as f64
        } else {
            0.0
        };
        let clean: Vec<f64> = raw
            .iter()
            .map(|&v| if v.is_finite() { v } else { mean })
            .collect();
        result.push(clean);
    }
    Ok(result)
}

/// Estimate sample rate in Hz from epoch-ms timestamps using median delta.
pub fn estimate_sample_rate_hz(ts_ms: &[f64]) -> f64 {
    if ts_ms.len() < 2 {
        return 1.0;
    }
    let mut deltas: Vec<f64> = ts_ms
        .windows(2)
        .filter_map(|pair| {
            let dt = pair[1] - pair[0];
            if dt.is_finite() && dt > 0.0 {
                Some(dt)
            } else {
                None
            }
        })
        .collect();
    if deltas.is_empty() {
        return 1.0;
    }
    deltas.sort_by(|a, b| a.total_cmp(b));
    let median_dt_ms = deltas[deltas.len() / 2];
    if median_dt_ms > 0.0 {
        1000.0 / median_dt_ms
    } else {
        1.0
    }
}