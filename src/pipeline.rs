//! Composable data pipeline: filter → reduce → serialize.
//!
//! Each chart-type endpoint (line, scatter, bar…) can assemble its own pipeline
//! from these building blocks without duplicating the filter/serialize logic.

use polars::prelude::*;

use crate::arrow_export::dataframe_to_arrow_ipc;
use crate::error::AppError;
use crate::query::{AggFn, OutputFormat};

// ── Stage 1: Filter by time range ──────────────────────────────────────────

/// Filter a `LazyFrame` to only rows whose `ts` column falls within
/// `[start_ts, end_ts]` (in the native time unit of the column), selecting
/// only the requested columns. Streaming execution is used to minimise peak
/// memory when the filtered result is large.
pub fn filter_time_range(
    lf: LazyFrame,
    start_ts: i64,
    end_ts: i64,
    select_cols: &[String],
) -> Result<DataFrame, AppError> {
    let mut exprs = vec![col("ts")];
    for c in select_cols {
        if c != "ts" {
            exprs.push(col(c.as_str()));
        }
    }

    tokio::task::block_in_place(|| {
        lf.filter(col("ts").cast(DataType::Int64).gt_eq(lit(start_ts)))
            .filter(col("ts").cast(DataType::Int64).lt_eq(lit(end_ts)))
            .select(exprs)
            .collect()
    })
    .map_err(|e| AppError::io(e.to_string()))
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
) -> Result<(DataFrame, bool), AppError> {
    match strategy {
        Reduction::None => {
            let mut exprs = vec![col("ts")];
            for c in value_cols {
                if c != "ts" {
                    exprs.push(col(c.as_str()));
                }
            }
            for c in extra_cols {
                if c != "ts" && !value_cols.contains(c) {
                    exprs.push(col(c.as_str()));
                }
            }
            let out = tokio::task::block_in_place(|| df.clone().lazy().select(exprs).collect())
                .map_err(|e| AppError::io(format!("select error: {}", e)))?;
            Ok((out, false))
        }

        Reduction::Lttb { target_points } => {
            let target = *target_points;
            if df.height() <= target {
                let mut select_cols = vec!["ts".to_string()];
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
                "ts",
                &col_refs,
                &extra_refs,
                target,
            )
            .map_err(|e| AppError::io(format!("Downsample error: {}", e)))?;
            Ok((out, true))
        }

        Reduction::BucketAgg { buckets, agg } => bucket_aggregate(df, value_cols, *buckets, *agg),
        Reduction::WindowAgg {
            window_size_native,
            step_size_native,
            agg,
        } => window_aggregate(df, value_cols, *window_size_native, *step_size_native, *agg),
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
        .column("ts")
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::bad_request(format!("Missing ts column: {}", e)))?
        .cast(&DataType::Int64)
        .map_err(|e| AppError::io(format!("ts cast: {}", e)))?;
    let ts_values = ts_i64
        .i64()
        .map_err(|e| AppError::io(format!("ts i64: {}", e)))?;

    let mut ts_vec = Vec::with_capacity(df.height());
    for value in ts_values.into_iter().flatten() {
        ts_vec.push(value);
    }
    if ts_vec.is_empty() {
        return Ok((DataFrame::default(), true));
    }

    let ts_min = ts_vec.iter().copied().min().unwrap_or(0);
    let ts_max = ts_vec.iter().copied().max().unwrap_or(0);

    let mut per_col_values: Vec<Vec<Option<f64>>> = Vec::with_capacity(value_cols.len());
    for col_name in value_cols {
        let casted = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::bad_request(format!("Missing '{}': {}", col_name, e)))?
            .cast(&DataType::Float64)
            .map_err(|e| AppError::io(format!("Cast '{}': {}", col_name, e)))?;
        let values = casted
            .f64()
            .map_err(|e| AppError::io(format!("Read '{}': {}", col_name, e)))?
            .into_iter()
            .map(|v| v.filter(|f| f.is_finite()))
            .collect::<Vec<_>>();
        per_col_values.push(values);
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

        let mut window_indices = Vec::new();
        for (idx, ts) in ts_vec.iter().enumerate() {
            if *ts >= window_start && *ts < window_end {
                window_indices.push(idx);
            }
        }

        if !window_indices.is_empty() {
            out_ts.push(midpoint);
            for (col_idx, source_values) in per_col_values.iter().enumerate() {
                let mut window_vals = Vec::new();
                for idx in &window_indices {
                    if let Some(value) = source_values.get(*idx).copied().flatten() {
                        window_vals.push(value);
                    }
                }
                out_cols[col_idx].push(reduce_window_values(&window_vals, agg_fn));
            }
        }

        window_start = window_start.saturating_add(step_size_native);
    }

    let mut columns: Vec<Column> = Vec::with_capacity(1 + value_cols.len());
    columns.push(Series::new("ts".into(), out_ts).into());
    for (idx, name) in value_cols.iter().enumerate() {
        columns.push(Series::new(name.as_str().into(), out_cols[idx].clone()).into());
    }
    let mut result = DataFrame::new(columns.len(), columns)
        .map_err(|e| AppError::io(format!("window aggregate frame: {}", e)))?;

    let ts_dtype = df
        .column("ts")
        .map(|c| c.as_materialized_series().dtype().clone())
        .unwrap_or(DataType::Int64);
    if matches!(ts_dtype, DataType::Datetime(_, _)) {
        result = result
            .lazy()
            .with_column(col("ts").cast(ts_dtype).alias("ts"))
            .collect()
            .map_err(|e| AppError::io(format!("ts recast: {}", e)))?;
    }

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
) -> Result<(DataFrame, bool), AppError> {
    let n_buckets = n_buckets.max(1).min(10_000);

    if df.height() == 0 {
        return Ok((DataFrame::default(), true));
    }

    // Compute ts bounds with a single pass over the ts column only.
    let bounds = tokio::task::block_in_place(|| {
        df.clone()
            .lazy()
            .select([
                col("ts").cast(DataType::Int64).min().alias("ts_min"),
                col("ts").cast(DataType::Int64).max().alias("ts_max"),
            ])
            .collect()
    })
    .map_err(|e| AppError::io(format!("ts bounds: {}", e)))?;

    let get_i64 = |col_name: &str| -> Option<i64> {
        bounds
            .column(col_name)
            .ok()
            .and_then(|s| s.get(0).ok())
            .and_then(|v| match v {
                AnyValue::Int64(n) => Some(n),
                _ => None,
            })
    };
    let (ts_min, ts_max) = match (get_i64("ts_min"), get_i64("ts_max")) {
        (Some(lo), Some(hi)) if lo <= hi => (lo, hi),
        _ => return Ok((DataFrame::default(), true)),
    };

    let span = (ts_max - ts_min).max(1) as f64;
    let bucket_width = span / n_buckets as f64;

    // Bucket assignment as a lazy expression — no manual iteration, no clone.
    // Cast to Int64 truncates toward zero which equals floor for non-negative
    // values (ts >= ts_min always after filtering). Use when/then to clamp the
    // upper edge (ts_max yields exactly n_buckets, not n_buckets-1).
    let n_max = (n_buckets - 1) as i64;
    let raw_bucket = ((col("ts").cast(DataType::Int64) - lit(ts_min)).cast(DataType::Float64)
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

    let result = tokio::task::block_in_place(|| {
        df.clone()
            .lazy()
            .with_column(bucket_expr)
            .group_by([col("__bucket")])
            .agg(agg_exprs)
            .sort(["__bucket"], SortMultipleOptions::default())
            // Compute bucket midpoint ts via with_column (not inside .agg) to
            // avoid Polars wrapping lit() results as List types.
            .with_column(
                (lit(ts_min)
                    + (col("__bucket").cast(DataType::Float64) + lit(0.5)) * lit(bucket_width))
                .cast(DataType::Int64)
                .alias("ts"),
            )
            .select({
                let mut sel = vec![col("ts")];
                for c in value_cols {
                    sel.push(col(c.as_str()));
                }
                sel
            })
            .collect()
    })
    .map_err(|e| AppError::io(e.to_string()))?;

    // Cast ts back to datetime for consistent Arrow IPC serialization.
    let ts_dtype = df
        .column("ts")
        .map(|c| c.as_materialized_series().dtype().clone())
        .unwrap_or(DataType::Int64);

    let result = if matches!(ts_dtype, DataType::Datetime(_, _)) {
        result
            .lazy()
            .with_column(col("ts").cast(ts_dtype).alias("ts"))
            .collect()
            .map_err(|e| AppError::io(format!("ts recast: {}", e)))?
    } else {
        result
    };

    Ok((result, true))
}

// ── Stage 3: Serialize ─────────────────────────────────────────────────────

/// Serialize a DataFrame to Arrow IPC bytes.
pub fn serialize_arrow(df: DataFrame) -> Result<Vec<u8>, AppError> {
    dataframe_to_arrow_ipc(df)
        .map_err(|e| AppError::io(format!("Arrow IPC serialization: {:?}", e)))
}

/// Serialize a DataFrame to a JSON value with `ts` and `values` keys.
pub fn serialize_json(
    df: &DataFrame,
    value_cols: &[String],
    color_col: Option<&String>,
    ts_dtype: &DataType,
) -> Result<serde_json::Value, AppError> {
    let multiplier = crate::temporal::unit_multiplier(ts_dtype);

    let ts_series = df
        .column("ts")
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::io(format!("Missing ts: {}", e)))?
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

    if let Some(color_column) = color_col {
        if let Ok(color_series) = df.column(color_column) {
            let mut color_vals = Vec::with_capacity(df.height());
            for i in 0..df.height() {
                let json_val = match color_series.get(i) {
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
                };
                color_vals.push(json_val);
            }
            payload.insert("color".to_string(), serde_json::json!(color_vals));
            payload.insert("color_column".to_string(), serde_json::json!(color_column));
        }
    }

    Ok(serde_json::Value::Object(payload))
}

// ── Convenience: build a full response ─────────────────────────────────────

use axum::Json;
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};

/// Metadata attached to every data response via custom headers.
pub struct ResponseMeta {
    pub is_downsampled: bool,
    pub returned_rows: usize,
    pub target_points: usize,
}

/// Build the final HTTP response from a processed DataFrame.
pub fn build_response(
    df: DataFrame,
    value_cols: &[String],
    format: OutputFormat,
    ts_dtype: &DataType,
    meta: ResponseMeta,
) -> Result<Response, AppError> {
    let mut response = match format {
        OutputFormat::Arrow => {
            let ipc_bytes = serialize_arrow(df)?;
            (
                [(header::CONTENT_TYPE, "application/vnd.apache.arrow.stream")],
                ipc_bytes,
            )
                .into_response()
        }
        OutputFormat::Json => {
            let json = serialize_json(&df, value_cols, None, ts_dtype)?;
            Json(json).into_response()
        }
    };

    response.headers_mut().insert(
        "x-edatime-downsampled",
        if meta.is_downsampled {
            HeaderValue::from_static("1")
        } else {
            HeaderValue::from_static("0")
        },
    );
    response.headers_mut().insert(
        "x-edatime-returned-rows",
        HeaderValue::from_str(&meta.returned_rows.to_string())
            .unwrap_or(HeaderValue::from_static("0")),
    );
    response.headers_mut().insert(
        "x-edatime-target-points",
        HeaderValue::from_str(&meta.target_points.to_string())
            .unwrap_or(HeaderValue::from_static("0")),
    );

    Ok(response)
}
