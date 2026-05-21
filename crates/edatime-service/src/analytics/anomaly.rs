//! Anomaly detection — Z-score and IQR methods.

use polars::prelude::*;
use serde::Serialize;

use crate::error::AppError;
use super::shared::{extract_f64_column_opt, extract_ts_epoch_ms};

/// An anomaly flag for a time region.
#[derive(Debug, Serialize)]
pub struct AnomalyRegion {
    pub column: String,
    pub method: String,
    pub start_ms: f64,
    pub end_ms: f64,
    pub score: f64,
}

/// Iterates values and produces anomaly regions by calling `is_anomaly` for each point.
fn merge_anomaly_regions<F, S>(
    values: &[Option<f64>],
    ts_values: &[f64],
    method: &str,
    col_name: &str,
    mut is_anomaly: F,
    mut init_score: S,
) -> Vec<AnomalyRegion>
where
    F: FnMut(Option<f64>, usize) -> bool,
    S: FnMut(Option<f64>) -> f64,
{
    let mut regions = Vec::new();
    let mut in_anomaly = false;
    let mut region_start = 0.0f64;
    let mut max_score = 0.0f64;

    for (i, val) in values.iter().enumerate() {
        let ts_ms = ts_values.get(i).copied().unwrap_or(f64::NAN);
        if !ts_ms.is_finite() {
            continue;
        }

        let is_anomaly_flag = is_anomaly(*val, i);

        if is_anomaly_flag && !in_anomaly {
            in_anomaly = true;
            region_start = ts_ms;
            max_score = init_score(*val);
        } else if !is_anomaly_flag && in_anomaly {
            in_anomaly = false;
            let prev_ts = ts_values.get(i.wrapping_sub(1)).copied().unwrap_or(region_start);
            regions.push(AnomalyRegion {
                column: col_name.to_string(),
                method: method.to_string(),
                start_ms: region_start,
                end_ms: prev_ts,
                score: max_score,
            });
        }
    }

    if in_anomaly {
        let last_ts = ts_values.last().copied().unwrap_or(region_start);
        regions.push(AnomalyRegion {
            column: col_name.to_string(),
            method: method.to_string(),
            start_ms: region_start,
            end_ms: last_ts,
            score: max_score,
        });
    }

    regions
}

/// Detect anomalies using Z-score method.
pub fn detect_anomalies_zscore(
    df: &DataFrame,
    columns: &[String],
    threshold: f64,
) -> Result<Vec<AnomalyRegion>, AppError> {
    let ts_values = extract_ts_epoch_ms(df)?;
    let mut regions = Vec::new();

    for col_name in columns {
        let values = extract_f64_column_opt(df, col_name)?;

        let finite_vals: Vec<f64> = values.iter().copied().flatten().collect();
        if finite_vals.len() < 2 {
            continue;
        }
        let n = finite_vals.len() as f64;
        let mean = finite_vals.iter().sum::<f64>() / n;
        let variance = finite_vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
        let std = variance.sqrt();

        if std < f64::EPSILON {
            continue;
        }

        let mean_for_closure = mean;
        let std_for_closure = std;
        let threshold_for_closure = threshold;

        let col_regions = merge_anomaly_regions(
            &values,
            &ts_values,
            "zscore",
            col_name,
            move |val, _i| {
                if let Some(v) = val {
                    (v - mean_for_closure).abs() / std_for_closure > threshold_for_closure
                } else {
                    false
                }
            },
            move |val| {
                val.map(|v| ((v - mean_for_closure) / std_for_closure).abs()).unwrap_or(0.0)
            },
        );
        regions.extend(col_regions);
    }

    Ok(regions)
}

/// Detect anomalies using IQR method.
pub fn detect_anomalies_iqr(
    df: &DataFrame,
    columns: &[String],
    k: f64,
) -> Result<Vec<AnomalyRegion>, AppError> {
    let ts_values = extract_ts_epoch_ms(df)?;
    let mut regions = Vec::new();

    for col_name in columns {
        let values = extract_f64_column_opt(df, col_name)?;

        let stats = edatime_core::stats::compute_column_stats(
            &values.iter().copied().flatten().collect::<Vec<_>>(),
        );
        let (q1, q3) = match (stats.q1, stats.q3) {
            (Some(q1), Some(q3)) => (q1, q3),
            _ => continue,
        };
        let iqr = q3 - q1;
        if iqr < f64::EPSILON {
            continue;
        }
        let lower_bound = q1 - k * iqr;
        let upper_bound = q3 + k * iqr;
        let iqr_for_closure = iqr;
        let lower_for_closure = lower_bound;
        let upper_for_closure = upper_bound;

        let col_regions = merge_anomaly_regions(
            &values,
            &ts_values,
            "iqr",
            col_name,
            move |val, _i| {
                if let Some(v) = val {
                    v < lower_for_closure || v > upper_for_closure
                } else {
                    false
                }
            },
            move |val| {
                if let Some(v) = val {
                    if v < lower_for_closure {
                        (lower_for_closure - v) / iqr_for_closure
                    } else {
                        (v - upper_for_closure) / iqr_for_closure
                    }
                } else {
                    0.0
                }
            },
        );
        regions.extend(col_regions);
    }

    Ok(regions)
}
