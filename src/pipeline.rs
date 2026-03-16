//! Composable data pipeline: filter → reduce → serialize.
//!
//! Each chart-type endpoint (line, scatter, bar…) can assemble its own pipeline
//! from these building blocks without duplicating the filter/serialize logic.

use polars::prelude::*;

use crate::arrow_export::dataframe_to_arrow_ipc;
use crate::error::AppError;
use crate::query::{AggFn, OutputFormat};

// ── Stage 1: Filter by time range ──────────────────────────────────────────

/// Filter a `DataFrame` to only rows whose `ts` column falls within
/// `[start_ts, end_ts]` (in the native time unit of the column).
pub fn filter_time_range(
    df: DataFrame,
    start_ts: i64,
    end_ts: i64,
    select_cols: &[String],
) -> Result<DataFrame, AppError> {
    let mut exprs = vec![col("ts")];
    for c in select_cols {
        exprs.push(col(c.as_str()));
    }

    tokio::task::block_in_place(|| {
        df.lazy()
            .filter(col("ts").cast(DataType::Int64).gt_eq(lit(start_ts)))
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
    /// No reduction — pass data through.
    None,
}

/// Apply the chosen reduction strategy. Returns `(reduced_df, was_reduced)`.
pub fn apply_reduction(
    df: &DataFrame,
    value_cols: &[String],
    strategy: &Reduction,
) -> Result<(DataFrame, bool), AppError> {
    match strategy {
        Reduction::None => Ok((df.clone(), false)),

        Reduction::Lttb { target_points } => {
            let target = *target_points;
            if df.height() <= target {
                return Ok((df.clone(), false));
            }
            let col_refs: Vec<&str> = value_cols.iter().map(|s| s.as_str()).collect();
            let out = crate::downsample::downsample_dataframe_multi(df, "ts", &col_refs, target)
                .map_err(|e| AppError::io(format!("Downsample error: {}", e)))?;
            Ok((out, true))
        }

        Reduction::BucketAgg { buckets, agg } => bucket_aggregate(df, value_cols, *buckets, *agg),
    }
}

/// Bucket-aggregate: split the time range into N equal-width buckets and
/// compute a summary statistic per bucket per column.
fn bucket_aggregate(
    df: &DataFrame,
    value_cols: &[String],
    n_buckets: usize,
    agg_fn: AggFn,
) -> Result<(DataFrame, bool), AppError> {
    let n_buckets = n_buckets.max(1).min(10_000);

    let ts_series = df
        .column("ts")
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::bad_request(format!("Missing ts column: {}", e)))?
        .clone();

    let ts_i64 = ts_series
        .cast(&DataType::Int64)
        .map_err(|e| AppError::io(format!("ts cast: {}", e)))?;
    let ts_ca = ts_i64
        .i64()
        .map_err(|e| AppError::io(format!("ts i64: {}", e)))?;

    let (ts_min, ts_max) = {
        let mut lo = i64::MAX;
        let mut hi = i64::MIN;
        for v in ts_ca.into_iter().flatten() {
            if v < lo {
                lo = v;
            }
            if v > hi {
                hi = v;
            }
        }
        if lo > hi {
            return Ok((DataFrame::default(), true));
        }
        (lo, hi)
    };

    let span = (ts_max - ts_min).max(1) as f64;
    let bucket_width = span / n_buckets as f64;

    // Assign bucket index to each row.
    let mut bucket_ids: Vec<u32> = Vec::with_capacity(df.height());
    for v in ts_ca.into_iter() {
        match v {
            Some(t) => {
                let idx = ((t - ts_min) as f64 / bucket_width).floor() as u32;
                bucket_ids.push(idx.min((n_buckets - 1) as u32));
            }
            None => bucket_ids.push(0),
        }
    }

    let bucket_series = Series::new("__bucket".into(), bucket_ids);
    let mut with_bucket = df.clone();
    with_bucket
        .with_column(bucket_series.into())
        .map_err(|e| AppError::io(format!("add bucket col: {}", e)))?;

    // Build aggregation expressions.
    let mut agg_exprs: Vec<Expr> = Vec::new();
    // Bucket midpoint as the "ts" value.
    agg_exprs.push(
        (lit(ts_min) + (col("__bucket").cast(DataType::Float64) + lit(0.5)) * lit(bucket_width))
            .cast(DataType::Int64)
            .alias("ts"),
    );

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
        with_bucket
            .lazy()
            .group_by([col("__bucket")])
            .agg(agg_exprs)
            .sort(["__bucket"], SortMultipleOptions::default())
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
    ts_dtype: &DataType,
) -> Result<serde_json::Value, AppError> {
    let ts_ms_divisor: i64 = match ts_dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
        DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
        DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
        DataType::Date => 1,
        _ => 1,
    };

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
                    (raw / ts_ms_divisor) as f64
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

    Ok(serde_json::json!({
        "ts": ts,
        "values": values,
    }))
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
            let json = serialize_json(&df, value_cols, ts_dtype)?;
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
