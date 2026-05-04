//! Analytics computations: rolling statistics, anomaly detection, FFT/PSD, column transforms.

use polars::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use serde::Serialize;

use crate::error::AppError;

// ── Shared helpers ─────────────────────────────────────────────────────────

/// Extract the "ts" column as epoch-millisecond f64 values.
pub fn extract_ts_epoch_ms(df: &DataFrame) -> Result<Vec<f64>, AppError> {
    let ts_col = df
        .column("ts")
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::internal(format!("Missing ts column: {e}")))?;
    let ts_i64 = ts_col
        .cast(&DataType::Int64)
        .map_err(|e| AppError::internal(format!("ts cast: {e}")))?;
    let ts_dtype = crate::temporal::ts_dtype(df)?;
    Ok(ts_i64
        .i64()
        .map_err(|e| AppError::internal(format!("ts i64: {e}")))?
        .into_iter()
        .map(|v| {
            v.map(|t| crate::temporal::native_to_epoch_ms(t, &ts_dtype))
                .unwrap_or(f64::NAN)
        })
        .collect())
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

        // Replace NaN with column mean
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
fn estimate_sample_rate_hz(ts_ms: &[f64]) -> f64 {
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

// ── Rolling Statistics ─────────────────────────────────────────────────────

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

        // Simple rolling computation
        for i in 0..n {
            // Centered symmetric window: [max(0, i-half) .. min(n, i+half+1)]
            // so output at ts[i] truly represents the data around that timestamp.
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
            ts: ts_values.clone(), // centered window: output at ts[i] with no offset needed
            mean: mean_out,
            upper1: upper1_out,
            lower1: lower1_out,
            upper2: upper2_out,
            lower2: lower2_out,
        });
    }

    Ok(results)
}

// ── Anomaly Detection ──────────────────────────────────────────────────────

/// An anomaly flag for a time region.
#[derive(Debug, Serialize)]
pub struct AnomalyRegion {
    pub column: String,
    pub method: String,
    pub start_ms: f64,
    pub end_ms: f64,
    pub score: f64,
}

/// Detect anomalies using Z-score method.
/// Points with |z-score| > threshold are flagged.
pub fn detect_anomalies_zscore(
    df: &DataFrame,
    columns: &[String],
    threshold: f64,
) -> Result<Vec<AnomalyRegion>, AppError> {
    let ts_values = extract_ts_epoch_ms(df)?;

    let mut regions = Vec::new();

    for col_name in columns {
        let values = extract_f64_column_opt(df, col_name)?;

        // Compute mean and std
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

        // Find anomalous regions (merge consecutive anomalous points)
        let mut in_anomaly = false;
        let mut region_start = 0.0f64;
        let mut max_score = 0.0f64;

        for (i, val) in values.iter().enumerate() {
            let ts_ms = ts_values.get(i).copied().unwrap_or(f64::NAN);
            if !ts_ms.is_finite() {
                continue;
            }

            let is_anomaly = if let Some(v) = val {
                let z = (v - mean).abs() / std;
                if z > threshold {
                    if z > max_score {
                        max_score = z;
                    }
                    true
                } else {
                    false
                }
            } else {
                false
            };

            if is_anomaly && !in_anomaly {
                in_anomaly = true;
                region_start = ts_ms;
                max_score = val.map(|v| ((v - mean) / std).abs()).unwrap_or(0.0);
            } else if !is_anomaly && in_anomaly {
                in_anomaly = false;
                let prev_ts = if i > 0 {
                    ts_values.get(i - 1).copied().unwrap_or(region_start)
                } else {
                    region_start
                };
                regions.push(AnomalyRegion {
                    column: col_name.clone(),
                    method: "zscore".to_string(),
                    start_ms: region_start,
                    end_ms: prev_ts,
                    score: max_score,
                });
            }
        }

        // Close any open region
        if in_anomaly {
            let last_ts = ts_values.last().copied().unwrap_or(region_start);
            regions.push(AnomalyRegion {
                column: col_name.clone(),
                method: "zscore".to_string(),
                start_ms: region_start,
                end_ms: last_ts,
                score: max_score,
            });
        }
    }

    Ok(regions)
}

/// Detect anomalies using IQR method.
/// Points outside [Q1 - k*IQR, Q3 + k*IQR] are flagged.
pub fn detect_anomalies_iqr(
    df: &DataFrame,
    columns: &[String],
    k: f64,
) -> Result<Vec<AnomalyRegion>, AppError> {
    let ts_values = extract_ts_epoch_ms(df)?;

    let mut regions = Vec::new();

    for col_name in columns {
        let values = extract_f64_column_opt(df, col_name)?;

        let stats = crate::stats::compute_column_stats(
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

        let mut in_anomaly = false;
        let mut region_start = 0.0f64;
        let mut max_score = 0.0f64;

        for (i, val) in values.iter().enumerate() {
            let ts_ms = ts_values.get(i).copied().unwrap_or(f64::NAN);
            if !ts_ms.is_finite() {
                continue;
            }

            let is_anomaly = if let Some(v) = val {
                if *v < lower_bound || *v > upper_bound {
                    let score = if *v < lower_bound {
                        (lower_bound - v) / iqr
                    } else {
                        (v - upper_bound) / iqr
                    };
                    if score > max_score {
                        max_score = score;
                    }
                    true
                } else {
                    false
                }
            } else {
                false
            };

            if is_anomaly && !in_anomaly {
                in_anomaly = true;
                region_start = ts_ms;
                max_score = if let Some(v) = val {
                    if *v < lower_bound {
                        (lower_bound - v) / iqr
                    } else {
                        (v - upper_bound) / iqr
                    }
                } else {
                    0.0
                };
            } else if !is_anomaly && in_anomaly {
                in_anomaly = false;
                let prev_ts = if i > 0 {
                    ts_values.get(i - 1).copied().unwrap_or(region_start)
                } else {
                    region_start
                };
                regions.push(AnomalyRegion {
                    column: col_name.clone(),
                    method: "iqr".to_string(),
                    start_ms: region_start,
                    end_ms: prev_ts,
                    score: max_score,
                });
            }
        }

        if in_anomaly {
            let last_ts = ts_values.last().copied().unwrap_or(region_start);
            regions.push(AnomalyRegion {
                column: col_name.clone(),
                method: "iqr".to_string(),
                start_ms: region_start,
                end_ms: last_ts,
                score: max_score,
            });
        }
    }

    Ok(regions)
}

// ── FFT / PSD ──────────────────────────────────────────────────────────────

/// A detected dominant frequency peak.
#[derive(Debug, Serialize, Clone)]
pub struct FrequencyPeak {
    /// Frequency in Hz
    pub frequency_hz: f64,
    /// Magnitude at this frequency
    pub magnitude: f64,
    /// Power at this frequency
    pub power: f64,
    /// Rank (1 = highest magnitude)
    pub rank: usize,
}

/// FFT result for a single column.
#[derive(Debug, Serialize)]
pub struct FftResult {
    pub column: String,
    /// Frequency values in Hz (if sample_rate provided) or cycles/sample
    pub frequencies: Vec<f64>,
    /// Magnitude spectrum
    pub magnitudes: Vec<f64>,
    /// Power spectral density (magnitude^2 / N)
    pub psd: Vec<f64>,
    /// Estimated sample rate in Hz
    pub sample_rate_hz: f64,
    /// Nyquist frequency (max detectable frequency)
    pub nyquist_hz: f64,
    /// Dominant frequency peaks (top N by magnitude)
    pub dominant_peaks: Vec<FrequencyPeak>,
}

/// Compute FFT for the given columns.
/// `sample_rate_hz` is computed from the timestamp spacing if not provided.
pub fn compute_fft(
    df: &DataFrame,
    columns: &[String],
    sample_rate_hz: Option<f64>,
) -> Result<Vec<FftResult>, AppError> {
    let ts_ms = extract_ts_epoch_ms(df)?;
    let fs = sample_rate_hz.unwrap_or_else(|| estimate_sample_rate_hz(&ts_ms));
    let nyquist = fs / 2.0;

    let mut results = Vec::with_capacity(columns.len());
    let mut planner = FftPlanner::<f64>::new();

    for col_name in columns {
        let values = extract_f64_column(df, col_name)?;

        let n = values.len();
        if n < 4 {
            continue;
        }

        // Remove mean (DC offset)
        let mean = values.iter().sum::<f64>() / n as f64;
        let mut buffer: Vec<Complex<f64>> = values
            .iter()
            .map(|&v| Complex::new(v - mean, 0.0))
            .collect();

        // Apply Hann window
        for (i, sample) in buffer.iter_mut().enumerate() {
            let w = 0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / (n as f64 - 1.0)).cos());
            sample.re *= w;
        }

        let fft = planner.plan_fft_forward(n);
        fft.process(&mut buffer);

        let half = n / 2 + 1;
        let df_freq = fs / n as f64;

        let mut frequencies = Vec::with_capacity(half);
        let mut magnitudes = Vec::with_capacity(half);
        let mut psd = Vec::with_capacity(half);

        for (i, val) in buffer.iter().enumerate().take(half) {
            frequencies.push(i as f64 * df_freq);
            let mag = val.norm() / n as f64;
            let magnitude = if i == 0 || i == n / 2 { mag } else { 2.0 * mag };
            magnitudes.push(magnitude);
            psd.push(magnitude * magnitude);
        }

        // Find dominant peaks (skip DC at index 0)
        let dominant_peaks = find_dominant_peaks(&frequencies, &magnitudes, &psd, 5);

        results.push(FftResult {
            column: col_name.clone(),
            frequencies,
            magnitudes,
            psd,
            sample_rate_hz: fs,
            nyquist_hz: nyquist,
            dominant_peaks,
        });
    }

    Ok(results)
}

/// Find top N frequency peaks by magnitude, excluding DC.
fn find_dominant_peaks(
    frequencies: &[f64],
    magnitudes: &[f64],
    psd: &[f64],
    top_n: usize,
) -> Vec<FrequencyPeak> {
    // Collect (idx, magnitude) pairs, skip DC (idx 0)
    let mut indexed: Vec<(usize, f64)> = magnitudes
        .iter()
        .enumerate()
        .skip(1) // skip DC
        .filter(|&(_, m)| m.is_finite() && *m > 0.0)
        .map(|(i, m)| (i, *m))
        .collect();

    // Sort by magnitude descending
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Take top N and convert to peaks
    indexed
        .into_iter()
        .take(top_n)
        .enumerate()
        .map(|(rank, (idx, mag))| FrequencyPeak {
            frequency_hz: frequencies.get(idx).copied().unwrap_or(0.0),
            magnitude: mag,
            power: psd.get(idx).copied().unwrap_or(0.0),
            rank: rank + 1,
        })
        .collect()
}

// ── Spectrogram (STFT) ────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SpectrogramResult {
    pub column: String,
    /// Centre-time of each window in epoch-ms
    pub times_ms: Vec<f64>,
    /// Frequency bins in Hz
    pub frequencies: Vec<f64>,
    /// 2-D magnitude grid: magnitudes[time_idx][freq_idx]
    pub magnitudes: Vec<Vec<f64>>,
}

/// Compute an STFT spectrogram for one column.
///
/// `window_size` – number of samples per FFT window (default 256).
/// `hop_size`    – step between successive windows (default window_size / 2).
pub fn compute_spectrogram(
    df: &DataFrame,
    column: &str,
    window_size: usize,
    hop_size: usize,
) -> Result<SpectrogramResult, AppError> {
    let ts_ms = extract_ts_epoch_ms(df)?;
    let fs = estimate_sample_rate_hz(&ts_ms);
    let values = extract_f64_column(df, column)?;

    let n = values.len();
    if n < window_size {
        return Err(AppError::bad_request(format!(
            "Not enough data ({n} samples) for window size {window_size}"
        )));
    }

    let half = window_size / 2 + 1;
    let df_freq = fs / window_size as f64;
    let frequencies: Vec<f64> = (0..half).map(|i| i as f64 * df_freq).collect();

    // Pre-compute Hann window
    let hann: Vec<f64> = (0..window_size)
        .map(|i| {
            0.5 * (1.0 - (2.0 * std::f64::consts::PI * i as f64 / (window_size as f64 - 1.0)).cos())
        })
        .collect();

    let mut planner = FftPlanner::<f64>::new();
    let fft = planner.plan_fft_forward(window_size);

    let mut times_ms = Vec::new();
    let mut magnitudes = Vec::new();

    let mut pos = 0usize;
    while pos + window_size <= n {
        // Centre time of window
        let centre_idx = pos + window_size / 2;
        let t = if centre_idx < ts_ms.len() {
            ts_ms[centre_idx]
        } else {
            f64::NAN
        };
        times_ms.push(t);

        let mean: f64 = values[pos..pos + window_size].iter().sum::<f64>() / window_size as f64;
        let mut buffer: Vec<Complex<f64>> = values[pos..pos + window_size]
            .iter()
            .enumerate()
            .map(|(i, &v)| Complex::new((v - mean) * hann[i], 0.0))
            .collect();

        fft.process(&mut buffer);

        let row: Vec<f64> = (0..half)
            .map(|i| {
                let mag = buffer[i].norm() / window_size as f64;
                if i == 0 || i == window_size / 2 {
                    mag
                } else {
                    2.0 * mag
                }
            })
            .collect();
        magnitudes.push(row);

        pos += hop_size;
    }

    Ok(SpectrogramResult {
        column: column.to_string(),
        times_ms,
        frequencies,
        magnitudes,
    })
}

/// Filter type for spectral filtering.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FilterType {
    Lowpass,
    Highpass,
    Bandpass,
    Bandstop,
}

/// Apply a frequency-domain filter to a time-series column.
///
/// Returns the filtered signal as a `Vec<f64>` with the same length as the input,
/// suitable for rendering as a preview series on the frontend.
pub fn apply_spectral_filter(
    df: &DataFrame,
    column: &str,
    filter_type: FilterType,
    low_hz: Option<f64>,
    high_hz: Option<f64>,
    sample_rate_hz: Option<f64>,
) -> Result<(Vec<f64>, Vec<f64>), AppError> {
    let ts_ms = extract_ts_epoch_ms(df)?;
    let values = extract_f64_column(df, column)?;
    let n = values.len();
    if n < 4 {
        return Err(AppError::bad_request(
            "Not enough data for filtering".to_string(),
        ));
    }

    let fs = sample_rate_hz.unwrap_or_else(|| estimate_sample_rate_hz(&ts_ms));
    let nyquist = fs / 2.0;

    // Mean (DC offset)
    let mean = values.iter().sum::<f64>() / n as f64;

    let mut buffer: Vec<Complex<f64>> = values
        .iter()
        .map(|&v| Complex::new(v - mean, 0.0))
        .collect();

    // Forward FFT
    let mut planner = FftPlanner::<f64>::new();
    let fft_forward = planner.plan_fft_forward(n);
    fft_forward.process(&mut buffer);

    // Build frequency array and apply filter mask
    let df_freq = fs / n as f64;
    for (i, c) in buffer.iter_mut().enumerate() {
        // Compute frequency for this bin (handle negative frequencies via symmetry)
        let freq = if i <= n / 2 {
            i as f64 * df_freq
        } else {
            (n - i) as f64 * df_freq
        };

        let pass = match filter_type {
            FilterType::Lowpass => {
                let cutoff = high_hz.unwrap_or(nyquist);
                freq <= cutoff
            }
            FilterType::Highpass => {
                let cutoff = low_hz.unwrap_or(0.0);
                freq >= cutoff
            }
            FilterType::Bandpass => {
                let lo = low_hz.unwrap_or(0.0);
                let hi = high_hz.unwrap_or(nyquist);
                freq >= lo && freq <= hi
            }
            FilterType::Bandstop => {
                let lo = low_hz.unwrap_or(0.0);
                let hi = high_hz.unwrap_or(nyquist);
                freq < lo || freq > hi
            }
        };

        if !pass {
            c.re = 0.0;
            c.im = 0.0;
        }
    }

    // Inverse FFT
    let fft_inverse = planner.plan_fft_inverse(n);
    fft_inverse.process(&mut buffer);

    // Normalise and re-add DC offset
    let scale = 1.0 / n as f64;
    let filtered: Vec<f64> = buffer.iter().map(|c| c.re * scale + mean).collect();

    Ok((ts_ms, filtered))
}

// ── Column Transformations ─────────────────────────────────────────────────

/// Allowed binary operators for column transformations.
const ALLOWED_OPS: &[&str] = &["+", "-", "*", "/", "%"];

/// Allowed unary functions for column transformations.
const ALLOWED_FUNCTIONS: &[&str] = &[
    "abs", "log", "log2", "log10", "sqrt", "exp", "sin", "cos", "tan", "ceil", "floor", "round",
];

/// Validate and parse a transformation expression.
/// Supports: col_a + col_b, col_a / col_b, log(col_a), abs(col_a - col_b), etc.
pub fn apply_column_transform(
    df: &DataFrame,
    expression: &str,
    output_name: &str,
) -> Result<DataFrame, AppError> {
    let expr = expression.trim();
    if expr.is_empty() {
        return Err(AppError::bad_request("Expression is empty"));
    }

    // Validate output name
    if output_name.trim().is_empty() || output_name == "ts" {
        return Err(AppError::bad_request("Invalid output column name"));
    }

    let polars_expr = parse_expression(expr, df)?;
    let result = tokio::task::block_in_place(|| {
        df.clone()
            .lazy()
            .with_column(polars_expr.alias(output_name))
            .collect()
    })
    .map_err(|e| AppError::internal(format!("Transform execution failed: {e}")))?;

    Ok(result)
}

/// Parse a simple expression string into a Polars Expr.
/// Supports:
///   - `col_a + col_b` (binary ops: +, -, *, /, %)
///   - `func(col_a)` where func ∈ ALLOWED_FUNCTIONS
///   - `func(col_a op col_b)`
///   - Numeric literals
fn parse_expression(expr: &str, df: &DataFrame) -> Result<Expr, AppError> {
    let expr = expr.trim();

    // Check for function call: func(...)
    if let Some(open) = expr.find('(')
        && expr.ends_with(')') {
            let func_name = expr[..open].trim().to_lowercase();
            let inner = expr[open + 1..expr.len() - 1].trim();

            if !ALLOWED_FUNCTIONS.contains(&func_name.as_str()) {
                return Err(AppError::bad_request(format!(
                    "Unknown function '{}'. Allowed: {}",
                    func_name,
                    ALLOWED_FUNCTIONS.join(", ")
                )));
            }

            let inner_expr = parse_expression(inner, df)?;
            return apply_function(&func_name, inner_expr);
        }

    // Check for binary operation
    for op in ALLOWED_OPS {
        // Find the operator, skipping those inside parentheses
        let mut depth = 0i32;
        let chars: Vec<char> = expr.chars().collect();
        let op_chars: Vec<char> = op.chars().collect();

        // Search from right to left for + and - (lower precedence)
        // and from left to right for *, /, %
        if *op == "+" || *op == "-" {
            for i in (0..chars.len()).rev() {
                if chars[i] == ')' {
                    depth += 1;
                } else if chars[i] == '(' {
                    depth -= 1;
                }
                if depth == 0 && i > 0 && chars[i] == op_chars[0] {
                    // Make sure it's not a negative sign at the start or after an operator
                    if *op == "-" && (i == 0 || "+-*/%(".contains(chars[i - 1])) {
                        continue;
                    }
                    let left = expr[..i].trim();
                    let right = expr[i + 1..].trim();
                    if !left.is_empty() && !right.is_empty() {
                        let left_expr = parse_expression(left, df)?;
                        let right_expr = parse_expression(right, df)?;
                        return apply_binary_op(left_expr, right_expr, op);
                    }
                }
            }
        } else {
            for i in (0..chars.len()).rev() {
                if chars[i] == ')' {
                    depth += 1;
                } else if chars[i] == '(' {
                    depth -= 1;
                }
                if depth == 0 && chars[i] == op_chars[0] {
                    let left = expr[..i].trim();
                    let right = expr[i + 1..].trim();
                    if !left.is_empty() && !right.is_empty() {
                        let left_expr = parse_expression(left, df)?;
                        let right_expr = parse_expression(right, df)?;
                        return apply_binary_op(left_expr, right_expr, op);
                    }
                }
            }
        }
    }

    // Try as numeric literal
    if let Ok(number) = expr.parse::<f64>() {
        return Ok(lit(number));
    }

    // Try as column reference
    let col_names: Vec<String> = df
        .get_column_names()
        .iter()
        .map(|c| c.to_string())
        .collect();

    if col_names.contains(&expr.to_string()) {
        return Ok(col(expr));
    }

    Err(AppError::bad_request(format!(
        "Unknown token '{}'. Expected column name, number, or expression. Available columns: {}",
        expr,
        col_names.join(", ")
    )))
}

fn apply_binary_op(left: Expr, right: Expr, op: &str) -> Result<Expr, AppError> {
    match op {
        "+" => Ok(left + right),
        "-" => Ok(left - right),
        "*" => Ok(left * right),
        "/" => Ok(left / right),
        "%" => Ok(left % right),
        _ => Err(AppError::bad_request(format!("Unknown operator '{}'", op))),
    }
}

fn apply_function(name: &str, inner: Expr) -> Result<Expr, AppError> {
    match name {
        "abs" => Ok(float_map(inner, |x| x.abs())),
        "log" => Ok(float_map(inner, |x| x.ln())),
        "log2" => Ok(float_map(inner, |x| x.log2())),
        "log10" => Ok(float_map(inner, |x| x.log10())),
        "sqrt" => Ok(float_map(inner, |x| x.sqrt())),
        "exp" => Ok(float_map(inner, |x| x.exp())),
        "sin" => Ok(float_map(inner, |x| x.sin())),
        "cos" => Ok(float_map(inner, |x| x.cos())),
        "tan" => Ok(float_map(inner, |x| x.tan())),
        "ceil" => Ok(float_map(inner, |x| x.ceil())),
        "floor" => Ok(float_map(inner, |x| x.floor())),
        "round" => Ok(float_map(inner, |x| x.round())),
        _ => Err(AppError::bad_request(format!(
            "Unknown function '{}'",
            name
        ))),
    }
}

/// Helper to apply an f64->f64 function via Polars map expression.
fn float_map(expr: Expr, f: fn(f64) -> f64) -> Expr {
    expr.cast(DataType::Float64).map(
        move |s| {
            let ca = s.f64()?;
            let out: Float64Chunked = ca.into_iter().map(|v| v.map(f)).collect();
            Ok(out.into_column())
        },
        |_schema: &Schema, _field: &Field| Ok(Field::new("".into(), DataType::Float64)),
    )
}

// ── Outlier Removal ────────────────────────────────────────────────────────

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
/// Returns a new DataFrame with outlier rows removed.
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
                                None => true, // keep nulls
                                _ => false,
                            }),
                        )
                    }
                    _ => continue,
                }
            }
            _ => {
                // zscore
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
/// Within each window, outliers are identified and flagged.
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

        // Reuse a buffer for window values to reduce allocations
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

// ── Temporal Drift Analysis ────────────────────────────────────────────────

/// Two-sample Kolmogorov-Smirnov test.
/// Returns (statistic, p_value). Both slices must be pre-sorted.
pub fn ks_test_2sample(a: &[f64], b: &[f64]) -> (f64, f64) {
    if a.is_empty() || b.is_empty() {
        return (0.0, 1.0);
    }
    let n1 = a.len() as f64;
    let n2 = b.len() as f64;

    let mut i = 0usize;
    let mut j = 0usize;
    let mut max_diff = 0.0_f64;

    while i < a.len() || j < b.len() {
        let next_a = a.get(i).copied().unwrap_or(f64::INFINITY);
        let next_b = b.get(j).copied().unwrap_or(f64::INFINITY);
        let x = next_a.min(next_b);

        while i < a.len() && a[i] <= x {
            i += 1;
        }
        while j < b.len() && b[j] <= x {
            j += 1;
        }

        let f1 = i as f64 / n1;
        let f2 = j as f64 / n2;
        let diff = (f1 - f2).abs();
        if diff > max_diff {
            max_diff = diff;
        }
    }

    // Asymptotic p-value approximation (Hodges 1958)
    let n_eff = (n1 * n2 / (n1 + n2)).sqrt();
    let z = (max_diff + 1.0 / (6.0 * n_eff)) * (n_eff + 0.12 + 0.11 / n_eff);
    let p_value = ks_pvalue_asymptotic(z);

    (max_diff, p_value)
}

fn ks_pvalue_asymptotic(z: f64) -> f64 {
    if z < 0.2 {
        return 1.0;
    }
    let mut sum = 0.0_f64;
    for k in 1_i64..=100 {
        let term = (-2.0 * (k as f64).powi(2) * z * z).exp();
        if k % 2 == 1 {
            sum += term;
        } else {
            sum -= term;
        }
        if term.abs() < 1e-12 {
            break;
        }
    }
    (2.0 * sum).clamp(0.0, 1.0)
}

/// 1D Wasserstein-1 distance (Earth Mover's Distance) between two empirical distributions.
/// Both slices must be pre-sorted.
pub fn wasserstein_distance_1d(a: &[f64], b: &[f64]) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let n1 = a.len() as f64;
    let n2 = b.len() as f64;

    let mut i = 0usize;
    let mut j = 0usize;
    let mut dist = 0.0_f64;
    let mut cdf1 = 0.0_f64;
    let mut cdf2 = 0.0_f64;
    let mut prev_x = f64::NEG_INFINITY;

    while i < a.len() || j < b.len() {
        let next_a = a.get(i).copied().unwrap_or(f64::INFINITY);
        let next_b = b.get(j).copied().unwrap_or(f64::INFINITY);
        let x = next_a.min(next_b);

        if prev_x.is_finite() {
            dist += (cdf1 - cdf2).abs() * (x - prev_x);
        }
        prev_x = x;

        while i < a.len() && a[i] <= x {
            i += 1;
            cdf1 += 1.0 / n1;
        }
        while j < b.len() && b[j] <= x {
            j += 1;
            cdf2 += 1.0 / n2;
        }
    }
    dist
}

/// Population Stability Index (PSI) between a reference and current distribution.
/// Uses reference-quantile-based binning so buckets have approximately equal expected counts.
/// Standard thresholds: < 0.1 stable, 0.1–0.2 slight shift, ≥ 0.2 significant shift.
pub fn compute_psi(reference: &[f64], current: &[f64], n_bins: usize) -> f64 {
    if reference.is_empty() || current.is_empty() || n_bins < 2 {
        return 0.0;
    }

    let mut ref_sorted = reference.to_vec();
    ref_sorted.sort_by(|a, b| a.total_cmp(b));

    // Build bin edges from reference quantiles
    let edges: Vec<f64> = (0..=n_bins)
        .map(|i| {
            let frac = i as f64 / n_bins as f64;
            let idx = ((ref_sorted.len() - 1) as f64 * frac) as usize;
            ref_sorted[idx.min(ref_sorted.len() - 1)]
        })
        .collect();

    let ref_props = psi_ref_props_from_sorted(&ref_sorted, &edges);
    compute_psi_with_ref_props(&ref_props, current, &edges)
}

/// Pre-compute reference bin proportions (one-time cost) for use in repeated PSI calls.
/// `ref_sorted` must be sorted. Returns one proportion per bin in `edges`.
pub fn psi_ref_props_from_sorted(ref_sorted: &[f64], edges: &[f64]) -> Vec<f64> {
    let n_bins = edges.len().saturating_sub(1);
    if n_bins == 0 || ref_sorted.is_empty() {
        return vec![];
    }
    let hist = histogram_from_edges(ref_sorted, edges);
    let ref_n = ref_sorted.len() as f64;
    let eps = 1e-10_f64;
    hist.iter().map(|&c| (c as f64 / ref_n).max(eps)).collect()
}

/// PSI using pre-computed reference proportions — O(M × n_bins) only (M = current size).
/// Call `psi_ref_props_from_sorted` once per reference, then reuse for every window.
pub fn compute_psi_with_ref_props(ref_props: &[f64], current: &[f64], edges: &[f64]) -> f64 {
    let n_bins = ref_props.len();
    if n_bins == 0 || current.is_empty() || edges.len() < 2 {
        return 0.0;
    }
    let curr_n = current.len() as f64;
    let eps = 1e-10_f64;
    let hist = histogram_from_edges(current, edges);
    let mut psi = 0.0_f64;
    for b in 0..n_bins {
        let ref_prop = ref_props[b];
        let curr_prop = (hist[b] as f64 / curr_n).max(eps);
        psi += (curr_prop - ref_prop) * (curr_prop / ref_prop).ln();
    }
    psi.max(0.0)
}

/// Compute quantiles from a sorted slice at the given fractions (0.0–1.0).
fn compute_quantiles_sorted(sorted: &[f64], qs: &[f64]) -> Vec<f64> {
    if sorted.is_empty() {
        return vec![f64::NAN; qs.len()];
    }
    let n = sorted.len() - 1;
    qs.iter()
        .map(|&q| {
            let idx = (q.clamp(0.0, 1.0) * n as f64).round() as usize;
            sorted[idx.min(n)]
        })
        .collect()
}

/// Build histogram counts using the given bin edges.
fn histogram_from_edges(data: &[f64], edges: &[f64]) -> Vec<u64> {
    if edges.len() < 2 {
        return vec![];
    }
    let n_bins = edges.len() - 1;
    let mut counts = vec![0u64; n_bins];
    for &v in data {
        if !v.is_finite() {
            continue;
        }
        // Binary search for the bin
        match edges.binary_search_by(|e| e.total_cmp(&v)) {
            Ok(idx) => {
                // Value exactly on an edge → put in current or last bin
                let b = idx.min(n_bins - 1);
                counts[b] += 1;
            }
            Err(idx) => {
                if idx > 0 && idx <= n_bins {
                    counts[idx - 1] += 1;
                }
            }
        }
    }
    counts
}

/// Build a downsampled ECDF (x, y) from sorted data with at most `max_pts` points.
fn ecdf_downsampled(sorted: &[f64], max_pts: usize) -> (Vec<f64>, Vec<f64>) {
    let n = sorted.len();
    if n == 0 {
        return (vec![], vec![]);
    }
    let step = (n / max_pts.max(1)).max(1);
    let xs: Vec<f64> = sorted.iter().copied().step_by(step).collect();
    let ys: Vec<f64> = xs
        .iter()
        .enumerate()
        .map(|(i, _)| {
            let raw_idx = i * step;
            (raw_idx + 1) as f64 / n as f64
        })
        .collect();
    (xs, ys)
}

/// Distribution statistics for a single window (reference or current).
#[derive(Debug, Serialize)]
pub struct WindowDistributionStats {
    pub start_ms: f64,
    pub end_ms: f64,
    pub label: String,
    pub count: usize,
    pub null_count: usize,
    pub completeness: f64,
    pub mean: f64,
    pub std: f64,
    pub min: f64,
    pub max: f64,
    /// Quantiles at [5, 25, 50, 75, 95] percentiles
    pub quantiles: Vec<f64>,
    pub hist_bins: Vec<f64>,
    pub hist_counts: Vec<u64>,
    pub ecdf_x: Vec<f64>,
    pub ecdf_y: Vec<f64>,
}

/// Drift statistics for a single current window compared to the reference.
#[derive(Debug, Serialize)]
pub struct DriftWindowStats {
    #[serde(flatten)]
    pub distribution: WindowDistributionStats,
    pub ks_stat: f64,
    pub ks_pvalue: f64,
    pub es_stat: f64,
    pub es_pvalue: f64,
    pub wasserstein: f64,
    pub psi: f64,
    /// "green" | "yellow" | "red"
    pub drift_level: String,
    pub low_sample_warning: bool,
}

/// Thresholds used for drift alerting.
#[derive(Debug, Serialize)]
pub struct DriftThresholds {
    pub ks_threshold: f64,
    pub wasserstein_threshold: f64,
    pub psi_minor_threshold: f64,
    pub psi_major_threshold: f64,
}

/// Metadata about the drift computation.
#[derive(Debug, Serialize)]
pub struct DriftMetadata {
    /// Computation time in milliseconds.
    pub computation_time_ms: u64,
    /// Number of windows analyzed.
    pub num_windows: usize,
    /// Number of samples in reference window.
    pub reference_samples: usize,
    /// True when quantile-based histogram edges collapsed; equal-width fallback was used.
    pub bin_count_warning: bool,
    /// Effective histogram bins used (may be less than requested when data has many duplicates).
    pub effective_bins: usize,
    /// True when reference_samples / avg monitoring window samples > 10×.
    /// PSI values may be inflated due to sample-size mismatch.
    pub psi_sample_ratio_warning: bool,
    /// Average sample count across monitoring windows (used with psi_sample_ratio_warning).
    pub avg_window_samples: f64,
}

/// Full response for a temporal drift analysis request.
#[derive(Debug, Serialize)]
pub struct DriftResponse {
    pub column: String,
    pub reference: WindowDistributionStats,
    pub windows: Vec<DriftWindowStats>,
    pub thresholds: DriftThresholds,
    pub metadata: DriftMetadata,
}

/// Build `WindowDistributionStats` from a raw value array and its time bounds.
fn build_distribution_stats(
    values: &[f64],
    all_values_including_nulls: usize,
    start_ms: f64,
    end_ms: f64,
    label: String,
    hist_edges: &[f64],
) -> WindowDistributionStats {
    let null_count = all_values_including_nulls.saturating_sub(values.len());
    let completeness = if all_values_including_nulls > 0 {
        values.len() as f64 / all_values_including_nulls as f64
    } else {
        1.0
    };

    if values.is_empty() {
        return WindowDistributionStats {
            start_ms,
            end_ms,
            label,
            count: 0,
            null_count,
            completeness,
            mean: f64::NAN,
            std: f64::NAN,
            min: f64::NAN,
            max: f64::NAN,
            quantiles: vec![f64::NAN; 5],
            hist_bins: hist_edges.to_vec(),
            hist_counts: vec![0; hist_edges.len().saturating_sub(1)],
            ecdf_x: vec![],
            ecdf_y: vec![],
        };
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));

    let n = sorted.len() as f64;
    let mean = sorted.iter().sum::<f64>() / n;
    let variance = sorted.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
    let std = variance.sqrt();
    let min = sorted[0];
    let max = sorted[sorted.len() - 1];

    let quantiles = compute_quantiles_sorted(&sorted, &[0.05, 0.25, 0.50, 0.75, 0.95]);
    let hist_counts = histogram_from_edges(&sorted, hist_edges);
    let (ecdf_x, ecdf_y) = ecdf_downsampled(&sorted, 200);

    WindowDistributionStats {
        start_ms,
        end_ms,
        label,
        count: sorted.len(),
        null_count,
        completeness,
        mean,
        std,
        min,
        max,
        quantiles,
        hist_bins: hist_edges.to_vec(),
        hist_counts,
        ecdf_x,
        ecdf_y,
    }
}

/// Compute temporal drift analysis for a given column.
///
/// The dataset timestamp column is used to bucket rows into windows.
/// `ref_start_ms` / `ref_end_ms` define the reference window.
/// `curr_start_ms` / `curr_end_ms` define the range for current windows.
/// `window_ms` is the bucket size in milliseconds.
#[allow(clippy::too_many_arguments)]
pub fn compute_temporal_drift(
    df: &DataFrame,
    column: &str,
    window_ms: i64,
    ref_start_ms: f64,
    ref_end_ms: f64,
    curr_start_ms: f64,
    curr_end_ms: f64,
    n_bins: usize,
    ks_threshold: f64,
    wasserstein_threshold: f64,
    psi_minor: f64,
    psi_major: f64,
) -> Result<DriftResponse, AppError> {
    let start_time = std::time::Instant::now();
    let ts_ms = extract_ts_epoch_ms(df)?;
    let raw_values = extract_f64_column_opt(df, column)?;

    let n = ts_ms.len().min(raw_values.len());

    // ── Build reference values ──
    let (mut ref_vals, ref_total) = ts_ms
        .iter()
        .zip(raw_values.iter())
        .filter(|&(t, _)| *t >= ref_start_ms && *t <= ref_end_ms)
        .fold((Vec::new(), 0), |(mut vals, mut total), (_, &v)| {
            total += 1;
            if let Some(val) = v {
                vals.push(val);
            }
            (vals, total)
        });
    if ref_vals.len() < 5 {
        return Err(AppError::bad_request(
            "Reference window contains fewer than 5 valid samples. Widen the reference range or select a different column.",
        ));
    }

    // Sort in-place — avoids cloning the reference array into a separate sorted copy (issue #7).
    ref_vals.sort_by(|a, b| a.total_cmp(b));
    let ref_sorted = ref_vals; // alias; already sorted

    // Build histogram bin edges from reference distribution (decile quantiles)
    let effective_bins = n_bins.clamp(4, 50);
    let raw_edges: Vec<f64> = (0..=effective_bins)
        .map(|i| {
            let frac = i as f64 / effective_bins as f64;
            let idx = ((ref_sorted.len() - 1) as f64 * frac).round() as usize;
            ref_sorted[idx.min(ref_sorted.len() - 1)]
        })
        .collect();

    // Deduplicate edges while preserving order; ensure first < last
    let mut hist_edges: Vec<f64> = vec![raw_edges[0]];
    for &e in &raw_edges[1..] {
        if e > hist_edges[hist_edges.len() - 1] {
            hist_edges.push(e);
        }
    }
    // When quantile-based edges collapse (many duplicate values), fall back to equal-width
    // binning to avoid degenerate 1-bin histograms that make PSI meaningless (issue #5).
    let bin_count_warning: bool;
    if hist_edges.len() < 2 {
        // Constant / near-constant column — spread bins evenly over [min, max].
        let lo = ref_sorted[0];
        let hi = ref_sorted[ref_sorted.len() - 1];
        let range = (hi - lo).max(f64::EPSILON);
        let width = range / effective_bins as f64;
        hist_edges = (0..=effective_bins)
            .map(|i| lo + width * i as f64)
            .collect();
        bin_count_warning = true;
    } else if hist_edges.len() < effective_bins / 2 + 2 {
        // Fewer than half the requested bins survived deduplication — equal-width fallback.
        let lo = hist_edges[0];
        let hi = hist_edges[hist_edges.len() - 1];
        let width = (hi - lo).max(f64::EPSILON) / effective_bins as f64;
        hist_edges = (0..=effective_bins)
            .map(|i| lo + width * i as f64)
            .collect();
        bin_count_warning = true;
    } else {
        bin_count_warning = false;
    }
    let effective_bin_count = hist_edges.len().saturating_sub(1);

    let ref_label = format!(
        "Ref ({} – {})",
        ms_to_date_label(ref_start_ms),
        ms_to_date_label(ref_end_ms)
    );
    let reference = build_distribution_stats(
        &ref_sorted,
        ref_total,
        ref_start_ms,
        ref_end_ms,
        ref_label,
        &hist_edges,
    );

    // If the caller passes <= 0.0, derive a practical default based on
    // the reference spread to avoid classifying any non-zero Wasserstein
    // distance as critical drift.
    let effective_wasserstein_threshold = if wasserstein_threshold > 0.0 {
        wasserstein_threshold
    } else {
        let candidate = reference.std * 0.1;
        if candidate.is_finite() && candidate > 0.0 {
            candidate
        } else {
            1e-9
        }
    };

    // ── Build current windows ──
    let first_curr_bucket = ((curr_start_ms / window_ms as f64).floor() as i64) * window_ms;
    let last_curr_ms = curr_end_ms;

    // ── Single-pass bucketing: O(n) instead of O(n × windows) ──
    let n_buckets = ((last_curr_ms - first_curr_bucket as f64) / window_ms as f64).ceil() as usize;
    let n_buckets = n_buckets.max(1);
    let mut bucket_vals: Vec<Vec<f64>> = vec![Vec::new(); n_buckets];
    let mut bucket_totals: Vec<usize> = vec![0; n_buckets];
    for i in 0..n {
        let t = ts_ms[i];
        if t >= curr_start_ms && t < last_curr_ms {
            let idx = ((t - first_curr_bucket as f64) / window_ms as f64) as usize;
            if idx < n_buckets {
                bucket_totals[idx] += 1;
                if let Some(v) = raw_values[i] {
                    bucket_vals[idx].push(v);
                }
            }
        }
    }

    // Subsample the reference once (outside the window loop) for use in the
    // Epps-Singleton permutation test.  The ES test only needs an order-of-
    // magnitude sense of the reference distribution; subsampling to ~400
    // points keeps the permutation loop fast while preserving distributional
    // shape.  KS and Wasserstein continue to use the full reference.
    const ES_REF_CAP: usize = 400;
    let es_ref_sample: std::borrow::Cow<[f64]> = if ref_sorted.len() > ES_REF_CAP {
        let step = ref_sorted.len().div_ceil(ES_REF_CAP);
        std::borrow::Cow::Owned(ref_sorted.iter().step_by(step).copied().collect())
    } else {
        std::borrow::Cow::Borrowed(&ref_sorted)
    };

    // Pre-compute PSI reference bin proportions once — avoids O(N log N) sort
    // and O(N × n_bins) scan being repeated for every window.
    let psi_ref_props = psi_ref_props_from_sorted(&ref_sorted, &hist_edges);

    // Pre-sort each bucket in-place once so the window loop skips the per-window
    // clone + sort that previously cost O(m log m) per bucket (issue #1).
    for bv in &mut bucket_vals {
        bv.sort_by(|a, b| a.total_cmp(b));
    }

    let mut windows: Vec<DriftWindowStats> = Vec::with_capacity(n_buckets);
    for bi in 0..n_buckets {
        let bucket_start_ms = first_curr_bucket as f64 + bi as f64 * window_ms as f64;
        let bucket_end_ms = bucket_start_ms + window_ms as f64;
        if bucket_start_ms >= last_curr_ms {
            break;
        }
        let vals = &bucket_vals[bi];
        let low_sample_warning = vals.len() < 5;

        // vals is already sorted (pre-sorted before the window loop)
        let (ks_stat, ks_pvalue, es_stat, es_pvalue, wasserstein, psi) = if vals.len() >= 5 {
            let (ks_s, ks_p) = ks_test_2sample(&ref_sorted, vals);
            let (es_s, es_p) = crate::stats::epps_singleton_test(&es_ref_sample, vals);
            let w = wasserstein_distance_1d(&ref_sorted, vals);
            let p = compute_psi_with_ref_props(&psi_ref_props, vals, &hist_edges);
            (ks_s, ks_p, es_s, es_p, w, p)
        } else {
            (0.0, 1.0, 0.0, 1.0, 0.0, 0.0)
        };

        let drift_level = if wasserstein > effective_wasserstein_threshold || psi >= psi_major {
            "red".to_string()
        } else if psi >= psi_minor {
            "yellow".to_string()
        } else {
            "green".to_string()
        };

        let label = ms_to_date_label(bucket_start_ms);
        let dist = build_distribution_stats(
            vals,
            bucket_totals[bi],
            bucket_start_ms,
            bucket_end_ms,
            label,
            &hist_edges,
        );

        windows.push(DriftWindowStats {
            distribution: dist,
            ks_stat,
            ks_pvalue,
            es_stat,
            es_pvalue,
            wasserstein,
            psi,
            drift_level,
            low_sample_warning,
        });
    }

    let num_windows = windows.len();
    let reference_samples = ref_sorted.len();

    // PSI sample-ratio warning: if the reference window has more than 10× the
    // average monitoring window size, PSI values are likely inflated (issue #15).
    let nonempty_windows: Vec<usize> = windows
        .iter()
        .filter(|w| w.distribution.count >= 5)
        .map(|w| w.distribution.count)
        .collect();
    let avg_window_samples = if nonempty_windows.is_empty() {
        0.0
    } else {
        nonempty_windows.iter().sum::<usize>() as f64 / nonempty_windows.len() as f64
    };
    let psi_sample_ratio_warning =
        avg_window_samples > 0.0 && reference_samples as f64 / avg_window_samples > 10.0;

    Ok(DriftResponse {
        column: column.to_string(),
        reference,
        windows,
        thresholds: DriftThresholds {
            ks_threshold,
            wasserstein_threshold: effective_wasserstein_threshold,
            psi_minor_threshold: psi_minor,
            psi_major_threshold: psi_major,
        },
        metadata: DriftMetadata {
            computation_time_ms: start_time.elapsed().as_millis() as u64,
            num_windows,
            reference_samples,
            bin_count_warning,
            effective_bins: effective_bin_count,
            psi_sample_ratio_warning,
            avg_window_samples,
        },
    })
}

/// Format epoch-ms as a short date label (YYYY-MM-DD).
fn ms_to_date_label(ms: f64) -> String {
    if !ms.is_finite() {
        return "—".to_string();
    }
    let secs = (ms / 1000.0) as i64;
    // Simple date computation without external crates
    // Days since Unix epoch (1970-01-01)
    let days = secs / 86400;
    let (y, m, d) = days_to_ymd(days);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Convert days since Unix epoch (1970-01-01) to (year, month, day).
fn days_to_ymd(mut days: i64) -> (i64, i64, i64) {
    // Algorithm from https://howardhinnant.github.io/date_algorithms.html
    days += 719468;
    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
