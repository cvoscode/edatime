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
pub fn extract_f64_column_opt(df: &DataFrame, col_name: &str) -> Result<Vec<Option<f64>>, AppError> {
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
    let step = if df.height() > max_points { df.height() / max_points } else { 1 };

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
        let mean = if finite_count > 0 { finite_sum / finite_count as f64 } else { 0.0 };
        let clean: Vec<f64> = raw.iter().map(|&v| if v.is_finite() { v } else { mean }).collect();
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

            for j in start..end {
                if let Some(v) = values[j] {
                    sum += v;
                    sum_sq += v * v;
                    count += 1;
                }
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

        for i in 0..half {
            frequencies.push(i as f64 * df_freq);
            let mag = buffer[i].norm() / n as f64;
            let magnitude = if i == 0 || i == n / 2 { mag } else { 2.0 * mag };
            magnitudes.push(magnitude);
            psd.push(magnitude * magnitude);
        }

        results.push(FftResult {
            column: col_name.clone(),
            frequencies,
            magnitudes,
            psd,
        });
    }

    Ok(results)
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
    if let Some(open) = expr.find('(') {
        if expr.ends_with(')') {
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
    let window = window_size.max(4);
    let half = (window - 1) / 2;

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

        for i in 0..n {
            let start = i.saturating_sub(half);
            let end = (i + half + 1).min(n);
            let window_vals: Vec<f64> = values[start..end].iter().copied().flatten().collect();
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

// ── Distribution Over Time ─────────────────────────────────────────────────

/// A single time-window distribution bin.
#[derive(Debug, Serialize)]
pub struct TimeDistributionBin {
    pub window_start_ms: f64,
    pub window_end_ms: f64,
    pub bin_edges: Vec<f64>,
    pub counts: Vec<u64>,
}

/// Result of distribution-over-time computation for a column.
#[derive(Debug, Serialize)]
pub struct TimeDistributionResult {
    pub column: String,
    pub windows: Vec<TimeDistributionBin>,
    pub global_min: f64,
    pub global_max: f64,
}

/// Compute distribution histograms across time windows for the given columns.
pub fn compute_time_distributions(
    df: &DataFrame,
    columns: &[String],
    n_windows: usize,
    n_bins: usize,
) -> Result<Vec<TimeDistributionResult>, AppError> {
    let ts_values = extract_ts_epoch_ms(df)?;

    if ts_values.is_empty() {
        return Ok(Vec::new());
    }

    let finite_ts: Vec<f64> = ts_values
        .iter()
        .copied()
        .filter(|t| t.is_finite())
        .collect();
    if finite_ts.is_empty() {
        return Ok(Vec::new());
    }
    let ts_min = finite_ts.iter().copied().fold(f64::INFINITY, f64::min);
    let ts_max = finite_ts.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let ts_span = ts_max - ts_min;
    if ts_span <= 0.0 {
        return Ok(Vec::new());
    }

    let windows = n_windows.clamp(2, 200);
    let bins = n_bins.clamp(2, 100);
    let window_size = ts_span / windows as f64;

    let mut results = Vec::with_capacity(columns.len());

    for col_name in columns {
        let values = extract_f64_column_opt(df, col_name)?;

        // Global min/max for consistent bin edges
        let finite_vals: Vec<f64> = values.iter().copied().flatten().collect();
        if finite_vals.is_empty() {
            continue;
        }
        let global_min = finite_vals.iter().copied().fold(f64::INFINITY, f64::min);
        let global_max = finite_vals
            .iter()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max);

        let mut time_bins = Vec::with_capacity(windows);

        for w in 0..windows {
            let w_start = ts_min + w as f64 * window_size;
            let w_end = if w == windows - 1 {
                ts_max + 1.0
            } else {
                ts_min + (w + 1) as f64 * window_size
            };

            let window_vals: Vec<f64> = values
                .iter()
                .zip(ts_values.iter())
                .filter_map(|(v, &t)| {
                    if t.is_finite() && t >= w_start && t < w_end {
                        *v
                    } else {
                        None
                    }
                })
                .collect();

            if let Some(hist) =
                crate::stats::build_histogram_with_bins(&window_vals, global_min, global_max, bins)
            {
                time_bins.push(TimeDistributionBin {
                    window_start_ms: w_start,
                    window_end_ms: w_end,
                    bin_edges: hist.bin_edges,
                    counts: hist.counts,
                });
            }
        }

        results.push(TimeDistributionResult {
            column: col_name.clone(),
            windows: time_bins,
            global_min,
            global_max,
        });
    }

    Ok(results)
}
