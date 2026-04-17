//! Analytics computations: rolling statistics, anomaly detection, FFT/PSD, column transforms.

use polars::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use serde::Serialize;

use crate::error::AppError;

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
    let ts_col = df
        .column("ts")
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::internal(format!("Missing ts column: {e}")))?;
    let ts_i64 = ts_col
        .cast(&DataType::Int64)
        .map_err(|e| AppError::internal(format!("ts cast: {e}")))?;

    let ts_dtype = crate::temporal::ts_dtype(df)?;
    let ts_values: Vec<f64> = ts_i64
        .i64()
        .map_err(|e| AppError::internal(format!("ts i64: {e}")))?
        .into_iter()
        .map(|v| {
            v.map(|t| crate::temporal::native_to_epoch_ms(t, &ts_dtype))
                .unwrap_or(f64::NAN)
        })
        .collect();

    let window = window_size.max(2);
    let mut results = Vec::with_capacity(columns.len());

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
    let ts_col = df
        .column("ts")
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::internal(format!("Missing ts: {e}")))?;
    let ts_i64 = ts_col
        .cast(&DataType::Int64)
        .map_err(|e| AppError::internal(format!("ts cast: {e}")))?;
    let ts_dtype = crate::temporal::ts_dtype(df)?;
    let ts_values: Vec<f64> = ts_i64
        .i64()
        .map_err(|e| AppError::internal(format!("ts i64: {e}")))?
        .into_iter()
        .map(|v| {
            v.map(|t| crate::temporal::native_to_epoch_ms(t, &ts_dtype))
                .unwrap_or(f64::NAN)
        })
        .collect();

    let mut regions = Vec::new();

    for col_name in columns {
        let series = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::internal(format!("Missing '{}': {e}", col_name)))?;
        let f64_series = series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::internal(format!("Cast '{}': {e}", col_name)))?;
        let values: Vec<Option<f64>> = f64_series
            .f64()
            .map_err(|e| AppError::internal(format!("Read '{}': {e}", col_name)))?
            .into_iter()
            .map(|v| v.filter(|f| f.is_finite()))
            .collect();

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
    let ts_col = df
        .column("ts")
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::internal(format!("Missing ts: {e}")))?;
    let ts_i64 = ts_col
        .cast(&DataType::Int64)
        .map_err(|e| AppError::internal(format!("ts cast: {e}")))?;
    let ts_dtype = crate::temporal::ts_dtype(df)?;
    let ts_values: Vec<f64> = ts_i64
        .i64()
        .map_err(|e| AppError::internal(format!("ts i64: {e}")))?
        .into_iter()
        .map(|v| {
            v.map(|t| crate::temporal::native_to_epoch_ms(t, &ts_dtype))
                .unwrap_or(f64::NAN)
        })
        .collect();

    let mut regions = Vec::new();

    for col_name in columns {
        let series = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::internal(format!("Missing '{}': {e}", col_name)))?;
        let f64_series = series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::internal(format!("Cast '{}': {e}", col_name)))?;
        let values: Vec<Option<f64>> = f64_series
            .f64()
            .map_err(|e| AppError::internal(format!("Read '{}': {e}", col_name)))?
            .into_iter()
            .map(|v| v.filter(|f| f.is_finite()))
            .collect();

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
    let ts_col = df
        .column("ts")
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::internal(format!("Missing ts: {e}")))?;
    let ts_i64 = ts_col
        .cast(&DataType::Int64)
        .map_err(|e| AppError::internal(format!("ts cast: {e}")))?;
    let ts_dtype = crate::temporal::ts_dtype(df)?;
    let ts_ms: Vec<f64> = ts_i64
        .i64()
        .map_err(|e| AppError::internal(format!("ts i64: {e}")))?
        .into_iter()
        .map(|v| {
            v.map(|t| crate::temporal::native_to_epoch_ms(t, &ts_dtype))
                .unwrap_or(f64::NAN)
        })
        .collect();

    // Estimate sample rate from median time delta
    let fs = sample_rate_hz.unwrap_or_else(|| {
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
    });

    let mut results = Vec::with_capacity(columns.len());
    let mut planner = FftPlanner::<f64>::new();

    for col_name in columns {
        let series = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::internal(format!("Missing '{}': {e}", col_name)))?;
        let f64_series = series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::internal(format!("Cast '{}': {e}", col_name)))?;
        let values: Vec<f64> = f64_series
            .f64()
            .map_err(|e| AppError::internal(format!("Read '{}': {e}", col_name)))?
            .into_iter()
            .map(|v| v.unwrap_or(0.0))
            .collect();

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
