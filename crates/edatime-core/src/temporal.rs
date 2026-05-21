//! Shared temporal-unit conversion utilities.
//!
//! Every place that needs to convert between epoch-ms (the query/transport
//! unit) and the native Polars timestamp representation should go through
//! these helpers so the mapping is defined exactly once.

use polars::prelude::*;

use crate::error::AppError;

/// Context for working with a timestamp column: the column name, the unit multiplier
/// to convert to/from epoch-milliseconds, and the native Polars dtype.
#[derive(Debug, Clone)]
pub struct TsContext {
    pub ts_col: String,
    pub multiplier: i64,
    pub dtype: DataType,
}

/// Look up the timestamp column's name, multiplier, and dtype from a LazyFrame.
/// The column name is taken from `ts_col` if provided, otherwise defaults to "ts".
pub fn ts_context(lf: &LazyFrame, ts_col: &str) -> Result<TsContext, AppError> {
    let multiplier = unit_multiplier_for_ts_lazy(lf, ts_col)?;
    let dtype = ts_dtype_lazy(lf, ts_col)?;
    Ok(TsContext {
        ts_col: ts_col.to_string(),
        multiplier,
        dtype,
    })
}

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

/// Detected epoch time unit from the max absolute value of a timestamp column.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DetectedTimeUnit {
    Seconds,
    Milliseconds,
    Microseconds,
    Nanoseconds,
}

/// Detects the epoch time unit from the max absolute value of a timestamp column.
/// Returns `None` if the value is zero or negative.
pub fn detect_time_unit(max_abs: i64) -> Option<DetectedTimeUnit> {
    if max_abs <= 0 {
        return None;
    }
    if max_abs < 100_000_000_000 {
        Some(DetectedTimeUnit::Seconds)
    } else if max_abs >= 100_000_000_000_000_000 {
        Some(DetectedTimeUnit::Nanoseconds)
    } else if max_abs >= 100_000_000_000_000 {
        Some(DetectedTimeUnit::Microseconds)
    } else {
        Some(DetectedTimeUnit::Milliseconds)
    }
}

/// Returns the factor to multiply the native timestamp by to convert to milliseconds.
/// E.g. Seconds → 1_000, Milliseconds → 1, Microseconds → 0 (division needed).
pub fn ts_to_ms_factor(unit: DetectedTimeUnit) -> i64 {
    match unit {
        DetectedTimeUnit::Seconds => 1_000,
        DetectedTimeUnit::Milliseconds => 1,
        DetectedTimeUnit::Microseconds => 0, // caller should divide
        DetectedTimeUnit::Nanoseconds => 0,  // caller should divide
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_seconds() {
        assert_eq!(detect_time_unit(1_700_000_000), Some(DetectedTimeUnit::Seconds));
        assert_eq!(detect_time_unit(99_999_999_999), Some(DetectedTimeUnit::Seconds));
    }

    #[test]
    fn test_detect_milliseconds() {
        assert_eq!(detect_time_unit(100_000_000_000), Some(DetectedTimeUnit::Milliseconds));
        assert_eq!(detect_time_unit(99_999_999_999_999), Some(DetectedTimeUnit::Milliseconds));
    }

    #[test]
    fn test_detect_microseconds() {
        assert_eq!(detect_time_unit(100_000_000_000_000), Some(DetectedTimeUnit::Microseconds));
        assert_eq!(detect_time_unit(99_999_999_999_999_999), Some(DetectedTimeUnit::Microseconds));
    }

    #[test]
    fn test_detect_nanoseconds() {
        assert_eq!(detect_time_unit(100_000_000_000_000_000), Some(DetectedTimeUnit::Nanoseconds));
        assert_eq!(detect_time_unit(i64::MAX), Some(DetectedTimeUnit::Nanoseconds));
    }

    #[test]
    fn test_detect_zero_and_negative() {
        assert_eq!(detect_time_unit(0), None);
        assert_eq!(detect_time_unit(-1), None);
        assert_eq!(detect_time_unit(-100_000_000_000_000_000), None);
    }
}
