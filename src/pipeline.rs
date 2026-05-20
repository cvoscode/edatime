//! Composable data pipeline: filter → reduce → serialize.
//!
//! Each chart-type endpoint (line, scatter, bar…) can assemble its own pipeline
//! from these building blocks without duplicating the filter/serialize logic.

use polars::prelude::*;

use crate::arrow_export::dataframe_to_arrow_ipc;
use crate::error::AppError;
use crate::query::{AggFn, OutputFormat};

// ── Stage 1: Filter by time range ──────────────────────────────────────────

/// Filter a `LazyFrame` to only rows whose timestamp column falls within
/// `[start_ts, end_ts]` (in milliseconds), selecting only the requested columns.
/// Returns a `LazyFrame` so that callers can chain additional lazy stages
/// before a single collect boundary.
pub fn filter_time_range(
    lf: LazyFrame,
    start_ts: i64,
    end_ts: i64,
    select_cols: &[String],
    ts_col: &str,
) -> Result<LazyFrame, AppError> {
    let mut exprs = vec![col(ts_col)];
    for c in select_cols {
        if c != ts_col {
            exprs.push(col(c.as_str()));
        }
    }

    Ok(lf
        .filter(col(ts_col).cast(DataType::Int64).gt_eq(lit(start_ts)))
        .filter(col(ts_col).cast(DataType::Int64).lt_eq(lit(end_ts)))
        .select(exprs))
}

// ── Stage 2: Reduction strategies ──────────────────────────────────────────

/// Reduction strategy to apply after filtering.
pub enum Reduction {
    /// LTTB downsampling for line charts. `target_points = width * 2`.
    Lttb { target_points: usize },
    /// Bucket-aggregation for bar / heatmap charts.
    BucketAgg { buckets: usize, agg: AggFn },
    /// Window aggregation for time-windowed summaries.
    WindowAgg {
        window_size_native: i64,
        step_size_native: i64,
        agg: AggFn,
    },
    /// No reduction — pass data through.
    None,
}

/// Apply the chosen reduction strategy. Returns `(reduced_df, was_reduced)`.
pub fn apply_reduction(
    df: &DataFrame,
    value_cols: &[String],
    extra_cols: &[String],
    strategy: &Reduction,
    ts_col: &str,
) -> Result<(DataFrame, bool), AppError> {
    match strategy {
        Reduction::None => {
            let mut select_cols: Vec<&str> = vec![ts_col];
            for c in value_cols {
                if c != ts_col {
                    select_cols.push(c.as_str());
                }
            }
            for c in extra_cols {
                if c != ts_col && !value_cols.contains(c) {
                    select_cols.push(c.as_str());
                }
            }
            let out = df
                .select(select_cols)
                .map_err(|e| AppError::io(format!("select error: {}", e)))?;
            Ok((out, false))
        }

        Reduction::Lttb { target_points } => {
            let target = *target_points;
            if df.height() <= target {
                let mut select_cols = vec![ts_col.to_string()];
                select_cols.extend_from_slice(value_cols);
                select_cols.extend_from_slice(extra_cols);
                let out = df
                    .select(select_cols)
                    .map_err(|e| AppError::io(format!("select error: {}", e)))?;
                return Ok((out, false));
            }
            let col_refs: Vec<&str> = value_cols.iter().map(|s| s.as_str()).collect();
            let extra_refs: Vec<&str> = extra_cols.iter().map(|s| s.as_str()).collect();
            let out = crate::downsample::downsample_dataframe_multi(
                df,
                ts_col,
                &col_refs,
                &extra_refs,
                target,
            )
            .map_err(|e| AppError::io(format!("Downsample error: {}", e)))?;
            Ok((out, true))
        }

        Reduction::BucketAgg { buckets, agg } => bucket_aggregate(df, value_cols, *buckets, *agg, ts_col),
        Reduction::WindowAgg {
            window_size_native,
            step_size_native,
            agg,
        } => window_aggregate(df, value_cols, *window_size_native, *step_size_native, *agg, ts_col),
    }
}

fn reduce_window_values(values: &[f64], agg_fn: AggFn) -> Option<f64> {
    if values.is_empty() {
        return None;
    }

    match agg_fn {
        AggFn::Mean => Some(values.iter().sum::<f64>() / values.len() as f64),
        AggFn::Sum => Some(values.iter().sum::<f64>()),
        AggFn::Min => values.iter().copied().reduce(f64::min),
        AggFn::Max => values.iter().copied().reduce(f64::max),
        AggFn::Count => Some(values.len() as f64),
    }
}

fn window_aggregate(
    df: &DataFrame,
    value_cols: &[String],
    window_size_native: i64,
    step_size_native: i64,
    agg_fn: AggFn,
    ts_col: &str,
) -> Result<(DataFrame, bool), AppError> {
    if df.height() == 0 {
        return Ok((DataFrame::default(), true));
    }
    if window_size_native <= 0 || step_size_native <= 0 {
        return Err(AppError::bad_request(
            "Window and step sizes must be positive",
        ));
    }

    let ts_i64 = df
        .column(ts_col)
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::bad_request(format!("Missing ts column '{}': {}", ts_col, e)))?
        .cast(&DataType::Int64)
        .map_err(|e| AppError::io(format!("ts cast: {}", e)))?;
    let ts_values = ts_i64
        .i64()
        .map_err(|e| AppError::io(format!("ts i64: {}", e)))?;

    let ts_vec: Vec<i64> = ts_values.into_iter().flatten().collect();
    if ts_vec.is_empty() {
        return Ok((DataFrame::default(), true));
    }

    let ts_min = ts_vec.iter().copied().min().unwrap_or(0);
    let ts_max = ts_vec.iter().copied().max().unwrap_or(0);

    let mut per_col_values: Vec<Vec<Option<f64>>> = Vec::with_capacity(value_cols.len());
    for col_name in value_cols {
        let series = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::bad_request(format!("Missing '{}': {}", col_name, e)))?;
        per_col_values.push(crate::stats::series_to_finite_f64(series, col_name)?);
    }

    let mut out_ts: Vec<i64> = Vec::new();
    let mut out_cols: Vec<Vec<Option<f64>>> = vec![Vec::new(); value_cols.len()];

    let mut window_start = ts_min;
    loop {
        if window_start > ts_max {
            break;
        }

        let window_end = window_start.saturating_add(window_size_native);
        let midpoint = window_start.saturating_add(window_size_native / 2);

        let lo = ts_vec.partition_point(|&ts| ts < window_start);
        let hi = ts_vec.partition_point(|&ts| ts < window_end);

        if lo < hi {
            out_ts.push(midpoint);
            for (col_idx, source_values) in per_col_values.iter().enumerate() {
                let window_vals: Vec<f64> = source_values[lo..hi]
                    .iter()
                    .copied()
                    .flatten()
                    .collect();
                out_cols[col_idx].push(reduce_window_values(&window_vals, agg_fn));
            }
        }

        window_start = window_start.saturating_add(step_size_native);
    }

    let mut columns: Vec<Column> = Vec::with_capacity(1 + value_cols.len());
    columns.push(Series::new(ts_col.into(), out_ts).into());
    for (idx, name) in value_cols.iter().enumerate() {
        columns.push(Series::new(name.as_str().into(), out_cols[idx].clone()).into());
    }
    let result = DataFrame::new(columns.len(), columns)
        .map_err(|e| AppError::io(format!("window aggregate frame: {}", e)))?;

    Ok((result, true))
}

/// Bucket-aggregate: split the time range into N equal-width buckets and
/// compute a summary statistic per bucket per column.
///
/// Fully lazy: ts_min/ts_max are read with a single streaming pass, and the
/// bucket assignment + group_by + aggregation are expressed as a lazy plan.
fn bucket_aggregate(
    df: &DataFrame,
    value_cols: &[String],
    n_buckets: usize,
    agg_fn: AggFn,
    ts_col: &str,
) -> Result<(DataFrame, bool), AppError> {
    let n_buckets = n_buckets.clamp(1, 10_000);

    if df.height() == 0 {
        return Ok((DataFrame::default(), true));
    }

    let ts_series = df
        .column(ts_col)
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::io(format!("Missing ts column '{}': {}", ts_col, e)))?
        .cast(&DataType::Int64)
        .map_err(|e| AppError::io(format!("ts cast failed: {}", e)))?;
    let mut iter = ts_series
        .i64()
        .map_err(|e| AppError::io(format!("ts i64 failed: {}", e)))?
        .into_iter()
        .flatten();
    let first = iter.next();
    let (ts_min, ts_max) = if let Some(first_val) = first {
        let mut min_v = first_val;
        let mut max_v = first_val;
        for v in iter {
            if v < min_v {
                min_v = v;
            }
            if v > max_v {
                max_v = v;
            }
        }
        (min_v, max_v)
    } else {
        return Ok((DataFrame::default(), true));
    };

    let span = (ts_max - ts_min).max(1) as f64;
    let bucket_width = span / n_buckets as f64;

    let n_max = (n_buckets - 1) as i64;
    let raw_bucket = ((col(ts_col).cast(DataType::Int64) - lit(ts_min)).cast(DataType::Float64)
        / lit(bucket_width))
    .cast(DataType::Int64);
    let bucket_expr = when(raw_bucket.clone().gt_eq(lit(n_buckets as i64)))
        .then(lit(n_max))
        .when(raw_bucket.clone().lt(lit(0_i64)))
        .then(lit(0_i64))
        .otherwise(raw_bucket)
        .alias("__bucket");

    let mut agg_exprs: Vec<Expr> = Vec::new();
    for c in value_cols {
        let e = match agg_fn {
            AggFn::Mean => col(c.as_str()).mean().alias(c.as_str()),
            AggFn::Sum => col(c.as_str()).sum().alias(c.as_str()),
            AggFn::Min => col(c.as_str()).min().alias(c.as_str()),
            AggFn::Max => col(c.as_str()).max().alias(c.as_str()),
            AggFn::Count => col(c.as_str())
                .count()
                .cast(DataType::Float64)
                .alias(c.as_str()),
        };
        agg_exprs.push(e);
    }

    let result = df
        .clone()
        .lazy()
        .with_column(bucket_expr)
        .group_by([col("__bucket")])
        .agg(agg_exprs)
        .sort(["__bucket"], SortMultipleOptions::default())
        .with_column(
            (lit(ts_min)
                + (col("__bucket").cast(DataType::Float64) + lit(0.5)) * lit(bucket_width))
            .cast(DataType::Int64)
            .alias(ts_col),
        )
        .select({
            let mut sel = vec![col(ts_col)];
            for c in value_cols {
                sel.push(col(c.as_str()));
            }
            sel
        })
        .with_new_streaming(true)
        .collect()
        .map_err(|e| AppError::io(e.to_string()))?;

    Ok((result, true))
}

// ── Stage 3: Serialize ─────────────────────────────────────────────────────

/// Serialize a DataFrame to Arrow IPC bytes, normalizing the timestamp column
/// to Datetime(Milliseconds) for consistent frontend parsing.
pub fn serialize_arrow(df: DataFrame, ts_col: &str) -> Result<Vec<u8>, AppError> {
    let ts_dtype = df.column(ts_col).map(|c| c.as_materialized_series().dtype().clone());
    let df = match ts_dtype {
        Ok(DataType::Datetime(TimeUnit::Milliseconds, _)) => df,
        Ok(DataType::Datetime(_, _)) => df
            .lazy()
            .with_column(col(ts_col).cast(DataType::Datetime(TimeUnit::Milliseconds, None)))
            .collect()
            .map_err(|e| AppError::io(format!("ts cast: {}", e)))?,
        _ => df,
    };
    dataframe_to_arrow_ipc(df)
        .map_err(|e| AppError::io(format!("Arrow IPC serialization: {:?}", e)))
}

/// Serialize a DataFrame to a JSON value with `ts` and `values` keys.
pub fn serialize_json(
    df: &DataFrame,
    value_cols: &[String],
    color_col: Option<&String>,
    ts_dtype: &DataType,
    ts_col: &str,
) -> Result<serde_json::Value, AppError> {
    let multiplier = crate::temporal::unit_multiplier(ts_dtype);

    let ts_series = df
        .column(ts_col)
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::io(format!("Missing ts '{}': {}", ts_col, e)))?
        .clone();

    let ts_i64 = ts_series
        .cast(&DataType::Int64)
        .map_err(|e| AppError::io(format!("ts cast: {}", e)))?;

    let ts: Vec<f64> = ts_i64
        .i64()
        .map_err(|e| AppError::io(format!("ts i64: {}", e)))?
        .into_iter()
        .map(|v| {
            v.map(|raw| {
                if matches!(ts_dtype, DataType::Date) {
                    (raw * 86_400_000) as f64
                } else {
                    (raw / multiplier) as f64
                }
            })
            .unwrap_or(f64::NAN)
        })
        .collect();

    let mut values = serde_json::Map::new();
    for col_name in value_cols {
        let col_series = df
            .column(col_name.as_str())
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::io(format!("Missing '{}': {}", col_name, e)))?
            .clone();

        let col_series = col_series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::io(format!("Cast '{}': {}", col_name, e)))?;

        let vals: Vec<f64> = col_series
            .f64()
            .map_err(|e| AppError::io(format!("Read '{}': {}", col_name, e)))?
            .into_iter()
            .map(|v| v.unwrap_or(f64::NAN))
            .collect();

        values.insert(col_name.clone(), serde_json::json!(vals));
    }

    let mut payload = serde_json::Map::new();
    payload.insert("ts".to_string(), serde_json::json!(ts));
    payload.insert("values".to_string(), serde_json::json!(values));

    if let Some(color_column) = color_col
        && let Ok(color_series) = df.column(color_column) {
            let color_vals: Vec<serde_json::Value> = (0..df.height())
                .map(|i| match color_series.get(i) {
                    Ok(AnyValue::Null) => serde_json::Value::Null,
                    Ok(AnyValue::String(s)) => serde_json::json!(s),
                    Ok(AnyValue::StringOwned(s)) => serde_json::Value::String(s.to_string()),
                    Ok(AnyValue::Boolean(v)) => serde_json::json!(v),
                    Ok(av) => {
                        // Numeric and temporal types: extract as f64 where possible.
                        let series = color_series.as_materialized_series();
                        series
                            .cast(&DataType::Float64)
                            .ok()
                            .and_then(|c| c.f64().ok().and_then(|ca| ca.get(i)))
                            .map(|v| serde_json::json!(v))
                            .unwrap_or_else(|| serde_json::Value::String(format!("{av}")))
                    }
                    Err(_) => serde_json::Value::Null,
                })
                .collect();
            payload.insert("color".to_string(), serde_json::json!(color_vals));
            payload.insert("color_column".to_string(), serde_json::json!(color_column));
        }

    Ok(serde_json::Value::Object(payload))
}

// ── Convenience: build a full response ─────────────────────────────────────

use axum::Json;
use axum::http::header;
use axum::response::{IntoResponse, Response};

pub use crate::routes::shared::ResponseMeta;
use crate::routes::shared::add_edatime_headers;

/// Build the final HTTP response from a processed DataFrame.
pub fn build_response(
    df: DataFrame,
    value_cols: &[String],
    format: OutputFormat,
    ts_dtype: &DataType,
    ts_col: &str,
    meta: ResponseMeta,
) -> Result<Response, AppError> {
    let response = match format {
        OutputFormat::Arrow => {
            let ipc_bytes = serialize_arrow(df, ts_col)?;
            (
                [(header::CONTENT_TYPE, "application/vnd.apache.arrow.stream")],
                ipc_bytes,
            )
                .into_response()
        }
        OutputFormat::Json => {
            let json = serialize_json(&df, value_cols, None, ts_dtype, ts_col)?;
            Json(json).into_response()
        }
    };

    let response_meta = ResponseMeta {
        is_downsampled: meta.is_downsampled,
        returned_rows: meta.returned_rows,
        target_points: meta.target_points,
    };
    let response = add_edatime_headers(response, &response_meta);
    Ok(response)
}
