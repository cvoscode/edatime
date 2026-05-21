//! Scatter data collection — filter + project a LazyFrame for scatter rendering.
//!
//! This module contains `collect_filtered_scatter_frame`, the core function that
//! takes a dataset snapshot and returns a column-filtered, time-filtered `LazyFrame`
//! ready for execution and downstream sampling.

use polars::prelude::*;

use crate::error::AppError;

use super::{ScatterFilterSpec, ScatterLineFilterSpec, apply_scatter_filters};

// ── Value helpers ─────────────────────────────────────────────────────────────

/// Convert a DataFrame column to `Vec<Option<f64>>` for scatter rendering.
/// Numeric columns are returned as-is; temporal columns (Datetime/Date) are
/// converted to milliseconds since epoch as f64.
pub fn series_to_scatter_values(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    match series.dtype() {
        dt if dt.is_numeric() => Ok(edatime_core::stats::series_to_finite_f64(series, name)?
        .into_iter()
        .map(Some)
        .collect()),
        DataType::Datetime(_, _) | DataType::Date => {
            let casted = series.cast(&DataType::Int64).map_err(|e| {
                AppError::internal(format!(
                    "Failed to cast temporal '{}' to Int64: {}",
                    name, e
                ))
            })?;
            let vals = casted.i64().map_err(|e| {
                AppError::internal(format!("Failed to read '{}' as Int64: {}", name, e))
            })?;

            let dtype = series.dtype();
            let divisor = edatime_core::temporal::unit_multiplier(dtype);

            Ok(vals
                .into_iter()
                .map(|v| {
                    v.map(|raw| {
                        if matches!(dtype, DataType::Date) {
                            (raw * 86_400_000) as f64
                        } else {
                            (raw / divisor) as f64
                        }
                    })
                })
                .collect())
        }
        _ => Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            name
        ))),
    }
}

/// Convert a DataFrame column to `Vec<Option<String>>` for categorical scatter coloring.
pub fn series_to_label_values(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, AppError> {
    let series = df
        .column(name)
        .map_err(|e| AppError::bad_request(format!("Missing column '{}': {}", name, e)))?
        .as_materialized_series();

    let casted = series
        .cast(&DataType::String)
        .map_err(|e| AppError::internal(format!("Failed to cast '{}' to String: {}", name, e)))?;
    let values = casted
        .str()
        .map_err(|e| AppError::internal(format!("Failed to read '{}' as String: {}", name, e)))?;

    Ok(values
        .into_iter()
        .map(|value| value.map(|text| text.to_string()))
        .collect())
}

/// Collect x/y pairs from a DataFrame as `Vec<[f64; 2]>`, filtering out non-finite values.
pub fn collect_xy_pairs(df: &DataFrame, x: &str, y: &str) -> Result<Vec<[f64; 2]>, AppError> {
    let x_vals = series_to_scatter_values(df, x)?;
    let y_vals = series_to_scatter_values(df, y)?;

    let out: Vec<[f64; 2]> = x_vals
        .iter()
        .zip(y_vals.iter())
        .filter_map(|(ox, oy)| {
            if let (Some(xv), Some(yv)) = (ox, oy)
                && xv.is_finite()
                && yv.is_finite()
            {
                Some([*xv, *yv])
            } else {
                None
            }
        })
        .collect();

    Ok(out)
}

// ── Core collection ───────────────────────────────────────────────────────────

/// Filter a dataset snapshot to the requested columns and time/filters,
/// returning a `LazyFrame` that callers execute via `QueryExecutor`.
#[allow(clippy::too_many_arguments)]
pub fn collect_filtered_scatter_frame<I: Into<LazyFrame>>(
    df: I,
    x: &str,
    y: &str,
    color: Option<&str>,
    size: Option<&str>,
    start: Option<f64>,
    end: Option<f64>,
    filters: &[ScatterFilterSpec],
    line_filters: &[ScatterLineFilterSpec],
) -> Result<LazyFrame, AppError> {
    let lf: LazyFrame = df.into();
    let schema = lf
        .clone()
        .collect_schema()
        .map_err(|e| AppError::bad_request(format!("schema: {}", e)))?;

    let x_dtype = schema
        .get(x)
        .ok_or_else(|| AppError::bad_request(format!("Unknown column '{}'", x)))?;
    if !(x_dtype.is_numeric() || matches!(x_dtype, DataType::Datetime(_, _) | DataType::Date)) {
        return Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            x
        )));
    }
    let y_dtype = schema
        .get(y)
        .ok_or_else(|| AppError::bad_request(format!("Unknown column '{}'", y)))?;
    if !(y_dtype.is_numeric() || matches!(y_dtype, DataType::Datetime(_, _) | DataType::Date)) {
        return Err(AppError::bad_request(format!(
            "Column '{}' is not numeric or temporal",
            y
        )));
    }
    if let Some(c) = color
        && !schema.contains(c)
    {
        return Err(AppError::bad_request(format!("Unknown column '{}'", c)));
    }
    if let Some(s) = size
        && !schema.contains(s)
    {
        return Err(AppError::bad_request(format!("Unknown column '{}'", s)));
    }

    let lf = apply_scatter_filters(lf, start, end, filters, line_filters)?;

    let mut selected_columns = Vec::with_capacity(4);
    for name in [Some(x), Some(y), color, size].into_iter().flatten() {
        if !selected_columns.contains(&name) {
            selected_columns.push(name);
        }
    }

    let select_exprs = selected_columns.into_iter().map(col).collect::<Vec<_>>();

    Ok(lf.select(select_exprs))
}
