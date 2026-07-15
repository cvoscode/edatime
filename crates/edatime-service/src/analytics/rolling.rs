//! Rolling statistics — mean and ±1σ/±2σ bands.

use polars::prelude::*;
use serde::Serialize;

use super::shared::{extract_f64_column_opt, extract_ts_epoch_ms};
use crate::error::AppError;

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

        // Prefix sums turn every centered window into O(1) work.  The
        // previous implementation re-scanned `[start..end)` for every
        // output point, making the endpoint O(rows * window * columns).
        // Keep a separate finite-value count so null/non-finite input has
        // exactly the existing semantics: it is ignored, and a window with
        // fewer than two finite values has no bands.
        let mut sums = Vec::with_capacity(n + 1);
        let mut sum_squares = Vec::with_capacity(n + 1);
        let mut counts = Vec::with_capacity(n + 1);
        sums.push(0.0);
        sum_squares.push(0.0);
        counts.push(0usize);
        for value in values.iter().copied() {
            let (value, count) = match value {
                Some(value) => (value, 1),
                None => (0.0, 0),
            };
            sums.push(sums.last().copied().unwrap_or(0.0) + value);
            sum_squares.push(sum_squares.last().copied().unwrap_or(0.0) + value * value);
            counts.push(counts.last().copied().unwrap_or(0) + count);
        }

        let half = (window - 1) / 2;
        for i in 0..n {
            let start = i.saturating_sub(half);
            let end = (i + half + 1).min(n);
            let sum = sums[end] - sums[start];
            let sum_sq = sum_squares[end] - sum_squares[start];
            let count = counts[end] - counts[start];

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

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(actual: Option<f64>, expected: Option<f64>) {
        match (actual, expected) {
            (Some(actual), Some(expected)) => assert!(
                (actual - expected).abs() < 1e-12,
                "expected {expected}, got {actual}"
            ),
            (None, None) => {}
            (actual, expected) => panic!("expected {expected:?}, got {actual:?}"),
        }
    }

    #[test]
    fn rolling_bands_ignore_missing_values_in_centered_windows() {
        let ts = Column::new("ts".into(), vec![0i64, 1, 2, 3, 4, 5])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("timestamp cast");
        let values = Column::new(
            "value".into(),
            vec![Some(1.0), None, Some(3.0), Some(5.0), None, Some(9.0)],
        );
        let df = DataFrame::new(6, vec![ts, values]).expect("test dataframe");

        // An even window keeps the existing centered-window convention:
        // `window=4` yields a three-element span because half=(window-1)/2.
        let bands = compute_rolling_bands(&df, &["value".to_string()], 4)
            .expect("rolling bands")
            .pop()
            .expect("one result");

        let means = [None, Some(2.0), Some(4.0), Some(4.0), Some(7.0), None];
        let std_devs = [None, Some(1.0), Some(1.0), Some(1.0), Some(2.0), None];
        for index in 0..means.len() {
            assert_close(bands.mean[index], means[index]);
            assert_close(
                bands.upper1[index],
                means[index]
                    .zip(std_devs[index])
                    .map(|(mean, std)| mean + std),
            );
            assert_close(
                bands.lower2[index],
                means[index]
                    .zip(std_devs[index])
                    .map(|(mean, std)| mean - 2.0 * std),
            );
        }
    }
}
