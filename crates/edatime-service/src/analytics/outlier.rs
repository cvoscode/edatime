//! Outlier removal — global and windowed IQR/Z-score methods.

use polars::prelude::*;
use serde::Serialize;

use crate::error::AppError;

/// Result of outlier removal.
#[derive(Debug, Serialize)]
pub struct OutlierRemovalResult {
    pub method: String,
    pub columns: Vec<String>,
    pub rows_before: usize,
    pub rows_after: usize,
    pub rows_removed: usize,
}

/// Remove outliers from the dataset using the specified method applied globally.
pub fn remove_outliers_global(
    df: &DataFrame,
    columns: &[String],
    method: &str,
    threshold: f64,
) -> Result<(DataFrame, OutlierRemovalResult), AppError> {
    let rows_before = df.height();
    let mut mask = polars::prelude::BooleanChunked::from_iter_values(
        "mask".into(),
        std::iter::repeat_n(true, rows_before),
    );

    for col_name in columns {
        let series = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::internal(format!("Missing column '{}': {e}", col_name)))?;
        let f64_series = series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::internal(format!("Cast '{}': {e}", col_name)))?;
        let values = f64_series
            .f64()
            .map_err(|e| AppError::internal(format!("Read '{}': {e}", col_name)))?;

        let col_mask = match method {
            "iqr" => {
                let finite: Vec<f64> = values
                    .into_iter()
                    .flatten()
                    .filter(|v| v.is_finite())
                    .collect();
                let stats = crate::stats::compute_column_stats(&finite);
                match (stats.q1, stats.q3) {
                    (Some(q1), Some(q3)) => {
                        let iqr = q3 - q1;
                        let lower = q1 - threshold * iqr;
                        let upper = q3 + threshold * iqr;
                        BooleanChunked::from_iter_values(
                            "m".into(),
                            values.into_iter().map(|v| match v {
                                Some(val) if val.is_finite() => val >= lower && val <= upper,
                                None => true,
                                _ => false,
                            }),
                        )
                    }
                    _ => continue,
                }
            }
            _ => {
                let finite: Vec<f64> = values
                    .into_iter()
                    .flatten()
                    .filter(|v| v.is_finite())
                    .collect();
                if finite.len() < 2 {
                    continue;
                }
                let n = finite.len() as f64;
                let mean = finite.iter().sum::<f64>() / n;
                let variance = finite.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
                let std = variance.sqrt();
                if std < f64::EPSILON {
                    continue;
                }

                BooleanChunked::from_iter_values(
                    "m".into(),
                    values.into_iter().map(|v| match v {
                        Some(val) if val.is_finite() => ((val - mean) / std).abs() <= threshold,
                        None => true,
                        _ => false,
                    }),
                )
            }
        };

        mask = mask & col_mask;
    }

    let filtered = df
        .filter(&mask)
        .map_err(|e| AppError::internal(format!("Filter: {e}")))?;
    let rows_after = filtered.height();

    Ok((
        filtered,
        OutlierRemovalResult {
            method: method.to_string(),
            columns: columns.to_vec(),
            rows_before,
            rows_after,
            rows_removed: rows_before - rows_after,
        },
    ))
}

/// Remove outliers using a rolling window approach.
pub fn remove_outliers_windowed(
    df: &DataFrame,
    columns: &[String],
    method: &str,
    threshold: f64,
    window_size: usize,
) -> Result<(DataFrame, OutlierRemovalResult), AppError> {
    let rows_before = df.height();
    let n = rows_before;
    let k = (window_size.max(4) - 1) / 2;

    let mut keep = vec![true; n];

    for col_name in columns {
        let series = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::internal(format!("Missing column '{}': {e}", col_name)))?;
        let f64_series = series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::internal(format!("Cast '{}': {e}", col_name)))?;
        let values: Vec<Option<f64>> = f64_series
            .f64()
            .map_err(|e| AppError::internal(format!("Read '{}': {e}", col_name)))?
            .into_iter()
            .map(|v| v.filter(|f| f.is_finite()))
            .collect();

        let mut window_vals = Vec::with_capacity(window_size);

        for i in 0..n {
            let start = i.saturating_sub(k);
            let end = (i + k + 1).min(n);

            window_vals.clear();
            window_vals.extend(values[start..end].iter().flatten().copied());

            if window_vals.len() < 4 {
                continue;
            }

            let val = match values[i] {
                Some(v) => v,
                None => continue,
            };

            let is_outlier = match method {
                "iqr" => {
                    let stats = crate::stats::compute_column_stats(&window_vals);
                    match (stats.q1, stats.q3) {
                        (Some(q1), Some(q3)) => {
                            let iqr = q3 - q1;
                            val < q1 - threshold * iqr || val > q3 + threshold * iqr
                        }
                        _ => false,
                    }
                }
                _ => {
                    let wn = window_vals.len() as f64;
                    let mean = window_vals.iter().sum::<f64>() / wn;
                    let variance = window_vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / wn;
                    let std = variance.sqrt();
                    std > f64::EPSILON && ((val - mean) / std).abs() > threshold
                }
            };

            if is_outlier {
                keep[i] = false;
            }
        }
    }

    let mask = BooleanChunked::from_iter_values("keep".into(), keep.into_iter());
    let filtered = df
        .filter(&mask)
        .map_err(|e| AppError::internal(format!("Filter: {e}")))?;
    let rows_after = filtered.height();

    Ok((
        filtered,
        OutlierRemovalResult {
            method: format!("{}_windowed", method),
            columns: columns.to_vec(),
            rows_before,
            rows_after,
            rows_removed: rows_before - rows_after,
        },
    ))
}
