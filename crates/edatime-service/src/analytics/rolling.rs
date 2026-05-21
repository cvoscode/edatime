//! Rolling statistics — mean and ±1σ/±2σ bands.

use polars::prelude::*;
use serde::Serialize;

use crate::error::AppError;
use super::shared::{extract_f64_column_opt, extract_ts_epoch_ms};

/// Result of rolling statistics computation for a single column.
#[derive(Debug, Serialize)]
pub struct RollingBands {
    pub column: String,
    /// Timestamps in epoch-ms
    pub ts: Vec<f64>,
    pub mean: Vec<Option<f64>>,
    pub upper1: Vec<Option<f64>>,
    pub lower1: Vec<Option<f64>>,
    pub upper2: Vec<Option<f64>>,
    pub lower2: Vec<Option<f64>>,
}

/// Compute rolling mean and ±1σ/±2σ bands for the given columns.
/// `window_size` is the number of samples in the rolling window.
pub fn compute_rolling_bands(
    df: &DataFrame,
    columns: &[String],
    window_size: usize,
) -> Result<Vec<RollingBands>, AppError> {
    let ts_values = extract_ts_epoch_ms(df)?;

    let window = window_size.max(2);
    let mut results = Vec::with_capacity(columns.len());

    for col_name in columns {
        let values = extract_f64_column_opt(df, col_name)?;

        let n = values.len();
        let mut mean_out = vec![None; n];
        let mut upper1_out = vec![None; n];
        let mut lower1_out = vec![None; n];
        let mut upper2_out = vec![None; n];
        let mut lower2_out = vec![None; n];

        for i in 0..n {
            let half = (window - 1) / 2;
            let start = i.saturating_sub(half);
            let end = (i + half + 1).min(n);
            let mut sum = 0.0;
            let mut sum_sq = 0.0;
            let mut count = 0usize;

            for v in values[start..end].iter().flatten() {
                sum += v;
                sum_sq += v * v;
                count += 1;
            }

            if count >= 2 {
                let mean = sum / count as f64;
                let variance = (sum_sq / count as f64) - mean * mean;
                let std = variance.max(0.0).sqrt();

                mean_out[i] = Some(mean);
                upper1_out[i] = Some(mean + std);
                lower1_out[i] = Some(mean - std);
                upper2_out[i] = Some(mean + 2.0 * std);
                lower2_out[i] = Some(mean - 2.0 * std);
            }
        }

        results.push(RollingBands {
            column: col_name.clone(),
            ts: ts_values.clone(),
            mean: mean_out,
            upper1: upper1_out,
            lower1: lower1_out,
            upper2: upper2_out,
            lower2: lower2_out,
        });
    }

    Ok(results)
}
