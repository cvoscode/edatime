//! Shared temporal-unit conversion utilities.
//!
//! Every place that needs to convert between epoch-ms (the query/transport
//! unit) and the native Polars timestamp representation should go through
//! these helpers so the mapping is defined exactly once.

use polars::prelude::*;

use crate::error::AppError;

/// How many native timestamp ticks fit in one millisecond for a given dtype.
/// E.g. `DateTime(Nanoseconds, _)` → 1 000 000.
pub fn unit_multiplier(dtype: &DataType) -> i64 {
    match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
        DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
        DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
        DataType::Date => 1,
        _ => 1,
    }
}

/// Convenience: look up the timestamp column dtype and return its multiplier.
pub fn unit_multiplier_for_ts(df: &DataFrame, ts_col: &str) -> Result<i64, AppError> {
    let dtype = ts_dtype(df, ts_col)?;
    Ok(unit_multiplier(&dtype))
}

/// Return the `DataType` of the timestamp column.
pub fn ts_dtype(df: &DataFrame, ts_col: &str) -> Result<DataType, AppError> {
    Ok(df
        .column(ts_col)
        .map_err(|e| AppError::bad_request(format!("Missing ts column '{}': {}", ts_col, e)))?
        .as_materialized_series()
        .dtype()
        .clone())
}

/// LazyFrame variant: collect ts dtype cheaply.
pub fn ts_dtype_lazy(lf: &LazyFrame, ts_col: &str) -> Result<DataType, AppError> {
    let schema = lf.clone().collect_schema().map_err(|e| {
        AppError::bad_request(format!("Failed to get schema: {}", e))
    })?;
    schema
        .get(ts_col)
        .cloned()
        .ok_or_else(|| AppError::bad_request(format!("Missing ts column '{}'", ts_col)))
}

/// LazyFrame variant: unit multiplier.
pub fn unit_multiplier_for_ts_lazy(lf: &LazyFrame, ts_col: &str) -> Result<i64, AppError> {
    let dtype = ts_dtype_lazy(lf, ts_col)?;
    Ok(unit_multiplier(&dtype))
}

/// Convert a native Polars timestamp value to epoch-milliseconds (f64).
///
/// Handles `Datetime(ns|us|ms)`, `Date` (days since epoch), and integer
/// columns where the unit is ambiguous (heuristic: >10 billion ⇒ ms).
pub fn native_to_epoch_ms(value: i64, dtype: &DataType) -> f64 {
    if matches!(dtype, DataType::Int64 | DataType::Int32) {
        // Heuristic: treat large integers as milliseconds, small ones as seconds.
        if value.abs() > 10_000_000_000 {
            return value as f64;
        }
        return (value * 1000) as f64;
    }

    match dtype {
        DataType::Date => (value * 86_400_000) as f64,
        _ => (value / unit_multiplier(dtype)) as f64,
    }
}

/// Convert an epoch-millisecond value (f64) to the native Polars
/// representation for the given dtype. `round_up` controls ceiling vs floor.
pub fn epoch_ms_to_native(value_ms: f64, dtype: &DataType, round_up: bool) -> Result<i64, AppError> {
    if !value_ms.is_finite() {
        return Err(AppError::bad_request("Temporal range value must be finite"));
    }

    let scaled = match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => value_ms * 1_000_000.0,
        DataType::Datetime(TimeUnit::Microseconds, _) => value_ms * 1_000.0,
        DataType::Datetime(TimeUnit::Milliseconds, _) => value_ms,
        DataType::Date => value_ms / 86_400_000.0,
        _ => value_ms,
    };

    let rounded = if round_up {
        scaled.ceil()
    } else {
        scaled.floor()
    };
    if rounded < i64::MIN as f64 || rounded > i64::MAX as f64 {
        return Err(AppError::bad_request(
            "Temporal range is outside supported bounds",
        ));
    }

    Ok(rounded as i64)
}
