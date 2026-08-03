//! Composable data pipeline: filter → reduce → serialize.
//!
//! Each chart-type endpoint (line, scatter, bar…) can assemble its own pipeline
//! from these building blocks without duplicating the filter/serialize logic.

use polars::prelude::*;

use crate::arrow_export::dataframe_to_arrow_ipc;
use crate::query::AggFn;
use edatime_core::error::AppError;

/// Window aggregation materializes one output row per step. Keep that result
/// bounded so a millisecond step across a multi-year sparse series cannot
/// spend unbounded CPU looping over empty windows.
const MAX_WINDOW_AGGREGATE_WINDOWS: u64 = 10_000;

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
#[derive(Clone, Copy)]
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

/// Build a bounded, lazy time-series envelope. Each dynamic time bucket emits
/// the first, finite minimum, finite maximum, and last value for one numeric
/// series. Callers expand this small result back into ordinary time/value rows
/// and may then run LTTB; no full filtered frame is collected first.
pub fn lazy_time_envelope(
    lf: LazyFrame,
    ts_col: &str,
    value_col: &str,
    bucket_width_ms: i64,
) -> Result<LazyFrame, AppError> {
    let every = Duration::try_parse(&format!("{}ms", bucket_width_ms.max(1)))
        .map_err(|error| AppError::BadRequest(format!("Invalid overview bucket width: {error}")))?;
    Ok(lf
        .group_by_dynamic(
            col(ts_col),
            [],
            DynamicGroupOptions {
                every,
                period: every,
                offset: Duration::try_parse("0ns").expect("zero duration is valid"),
                label: Label::Left,
                include_boundaries: false,
                closed_window: ClosedWindow::Left,
                start_by: StartBy::WindowBound,
                ..Default::default()
            },
        )
        .agg([
            col(value_col).first().alias("__edatime_first"),
            col(value_col)
                .filter(col(value_col).is_finite())
                .min()
                .alias("__edatime_min"),
            col(value_col)
                .filter(col(value_col).is_finite())
                .max()
                .alias("__edatime_max"),
            col(value_col).last().alias("__edatime_last"),
        ]))
}

/// Build one shared time-bucket scan for every requested series and extra
/// column. Each bucket carries first/min/max/last numeric values, first/last
/// extras, and an exact row count. The bounded result is expanded in memory.
pub fn lazy_multi_time_envelope(
    lf: LazyFrame,
    ts_col: &str,
    value_cols: &[String],
    extra_cols: &[String],
    bucket_width_ms: i64,
) -> Result<LazyFrame, AppError> {
    let every = Duration::try_parse(&format!("{}ms", bucket_width_ms.max(1)))
        .map_err(|error| AppError::BadRequest(format!("Invalid overview bucket width: {error}")))?;
    let mut aggregates = Vec::with_capacity(value_cols.len() * 4 + extra_cols.len() * 2 + 1);
    for (index, name) in value_cols.iter().enumerate() {
        aggregates.extend([
            col(name).first().alias(format!("__value_{index}_first")),
            col(name)
                .filter(col(name).is_finite())
                .min()
                .alias(format!("__value_{index}_min")),
            col(name)
                .filter(col(name).is_finite())
                .max()
                .alias(format!("__value_{index}_max")),
            col(name).last().alias(format!("__value_{index}_last")),
        ]);
    }
    for (index, name) in extra_cols.iter().enumerate() {
        aggregates.extend([
            col(name).first().alias(format!("__extra_{index}_first")),
            col(name).last().alias(format!("__extra_{index}_last")),
        ]);
    }
    aggregates.push(len().cast(DataType::UInt64).alias("__rows"));
    Ok(lf
        .group_by_dynamic(
            col(ts_col),
            [],
            DynamicGroupOptions {
                every,
                period: every,
                offset: Duration::try_parse("0ns").expect("zero duration is valid"),
                label: Label::Left,
                include_boundaries: false,
                closed_window: ClosedWindow::Left,
                start_by: StartBy::WindowBound,
                ..Default::default()
            },
        )
        .agg(aggregates))
}

pub fn expand_multi_time_envelope(
    envelope: &DataFrame,
    ts_col: &str,
    value_cols: &[String],
    extra_cols: &[String],
) -> Result<(DataFrame, usize), AppError> {
    let filtered_rows = envelope
        .column("__rows")
        .map_err(|error| AppError::BadRequest(format!("Envelope count missing: {error}")))?
        .u64()
        .map_err(|error| AppError::Io(format!("Envelope count read: {error}")))?
        .into_iter()
        .flatten()
        .fold(0_u64, u64::saturating_add) as usize;
    let stats = ["first", "min", "max", "last"];
    let mut expanded: Option<DataFrame> = None;
    for (stat_index, stat) in stats.iter().enumerate() {
        let mut columns = Vec::with_capacity(1 + value_cols.len() + extra_cols.len());
        columns.push(
            envelope
                .column(ts_col)
                .map_err(|error| AppError::BadRequest(format!("Envelope time missing: {error}")))?
                .clone(),
        );
        for (index, name) in value_cols.iter().enumerate() {
            let mut column = envelope
                .column(&format!("__value_{index}_{stat}"))
                .map_err(|error| AppError::BadRequest(format!("Envelope value missing: {error}")))?
                .clone();
            column.rename(name.into());
            columns.push(column);
        }
        let extra_stat = if stat_index < 2 { "first" } else { "last" };
        for (index, name) in extra_cols.iter().enumerate() {
            let mut column = envelope
                .column(&format!("__extra_{index}_{extra_stat}"))
                .map_err(|error| AppError::BadRequest(format!("Envelope extra missing: {error}")))?
                .clone();
            column.rename(name.into());
            columns.push(column);
        }
        let frame = DataFrame::new(envelope.height(), columns)
            .map_err(|error| AppError::Io(format!("Build multi-series envelope: {error}")))?;
        if let Some(output) = expanded.as_mut() {
            output
                .vstack_mut(&frame)
                .map_err(|error| AppError::Io(format!("Stack multi-series envelope: {error}")))?;
        } else {
            expanded = Some(frame);
        }
    }
    let mut output = expanded.unwrap_or_default();
    output = output
        .sort(
            [ts_col],
            SortMultipleOptions::default().with_maintain_order(true),
        )
        .map_err(|error| AppError::Io(format!("Sort multi-series envelope: {error}")))?;
    Ok((output, filtered_rows))
}

/// Convert a bounded bucket envelope into the ordinary two-column frame used
/// by the existing deterministic LTTB/serializer path. Bucket labels preserve
/// chronological ordering while first/min/max/last preserve visible extrema.
pub fn expand_time_envelope(
    envelope: &DataFrame,
    ts_col: &str,
    value_col: &str,
) -> Result<DataFrame, AppError> {
    let ts = envelope
        .column(ts_col)
        .map_err(|error| AppError::BadRequest(format!("Envelope timestamp missing: {error}")))?
        .as_materialized_series()
        .cast(&DataType::Int64)
        .map_err(|error| AppError::Io(format!("Envelope timestamp cast: {error}")))?;
    let values = [
        "__edatime_first",
        "__edatime_min",
        "__edatime_max",
        "__edatime_last",
    ]
    .iter()
    .map(|name| {
        envelope
            .column(name)
            .map_err(|error| AppError::BadRequest(format!("Envelope value missing: {error}")))?
            .as_materialized_series()
            .cast(&DataType::Float64)
            .map_err(|error| AppError::Io(format!("Envelope value cast: {error}")))
    })
    .collect::<Result<Vec<_>, _>>()?;
    let ts_values = ts
        .i64()
        .map_err(|error| AppError::Io(format!("Envelope timestamp read: {error}")))?;
    let value_columns = values
        .iter()
        .map(|series| {
            series
                .f64()
                .map_err(|error| AppError::Io(format!("Envelope value read: {error}")))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut out_ts = Vec::with_capacity(envelope.height() * 4);
    let mut out_values = Vec::with_capacity(envelope.height() * 4);
    for row in 0..envelope.height() {
        let Some(timestamp) = ts_values.get(row) else {
            continue;
        };
        for column in &value_columns {
            if let Some(value) = column.get(row).filter(|value| value.is_finite()) {
                out_ts.push(timestamp);
                out_values.push(value);
            }
        }
    }
    let output_len = out_ts.len();
    let timestamp = Series::new(ts_col.into(), out_ts)
        .cast(
            envelope
                .column(ts_col)
                .map_err(|error| AppError::BadRequest(error.to_string()))?
                .dtype(),
        )
        .map_err(|error| AppError::Io(format!("Restore envelope timestamp dtype: {error}")))?;
    DataFrame::new(
        output_len,
        vec![
            timestamp.into(),
            Series::new(value_col.into(), out_values).into(),
        ],
    )
    .map_err(|error| AppError::Io(format!("Build envelope frame: {error}")))
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
                .map_err(|e| AppError::Io(format!("select error: {}", e)))?;
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
                    .map_err(|e| AppError::Io(format!("select error: {}", e)))?;
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
            .map_err(|e| AppError::Io(format!("Downsample error: {}", e)))?;
            Ok((out, true))
        }

        Reduction::BucketAgg { buckets, agg } => {
            bucket_aggregate(df, value_cols, *buckets, *agg, ts_col)
        }
        Reduction::WindowAgg {
            window_size_native,
            step_size_native,
            agg,
        } => window_aggregate(
            df,
            value_cols,
            *window_size_native,
            *step_size_native,
            *agg,
            ts_col,
        ),
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
        return Err(AppError::BadRequest(
            "Window and step sizes must be positive".to_string(),
        ));
    }

    let ts_i64 = df
        .column(ts_col)
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::BadRequest(format!("Missing ts column '{}': {}", ts_col, e)))?
        .cast(&DataType::Int64)
        .map_err(|e| AppError::Io(format!("ts cast: {}", e)))?;
    let ts_values = ts_i64
        .i64()
        .map_err(|e| AppError::Io(format!("ts i64: {}", e)))?;

    // Keep timestamp positions alongside their original DataFrame rows.
    // Value vectors below deliberately preserve null/NaN slots, so using a
    // compacted timestamp or value vector here would make window boundaries
    // address the wrong samples after malformed input.
    let mut ts_vec = Vec::with_capacity(df.height());
    let mut ts_rows = Vec::with_capacity(df.height());
    for (row, timestamp) in ts_values.into_iter().enumerate() {
        if let Some(timestamp) = timestamp {
            ts_vec.push(timestamp);
            ts_rows.push(row);
        }
    }
    if ts_vec.is_empty() {
        return Ok((DataFrame::default(), true));
    }

    let ts_min = ts_vec.iter().copied().min().unwrap_or(0);
    let ts_max = ts_vec.iter().copied().max().unwrap_or(0);
    // Positivity was checked above, so this cast is lossless.
    let step_size = step_size_native as u64;
    let window_count = (ts_max.saturating_sub(ts_min) as u64 / step_size).saturating_add(1);
    if window_count > MAX_WINDOW_AGGREGATE_WINDOWS {
        return Err(AppError::BadRequest(format!(
            "Window aggregation would produce {window_count} windows; reduce the time range or increase the step"
        )));
    }

    let mut per_col_values: Vec<Vec<Option<f64>>> = Vec::with_capacity(value_cols.len());
    for col_name in value_cols {
        let series = df
            .column(col_name)
            .map(|c| c.as_materialized_series())
            .map_err(|e| AppError::BadRequest(format!("Missing '{}': {}", col_name, e)))?;
        let values = series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::Io(format!("Cast '{}': {}", col_name, e)))?
            .f64()
            .map_err(|e| AppError::Io(format!("Read '{}': {}", col_name, e)))?
            .into_iter()
            .map(|value| value.filter(|value| value.is_finite()))
            .collect();
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

        let lo = ts_vec.partition_point(|&ts| ts < window_start);
        let hi = ts_vec.partition_point(|&ts| ts < window_end);

        if lo < hi {
            out_ts.push(midpoint);
            for (col_idx, source_values) in per_col_values.iter().enumerate() {
                let window_vals: Vec<f64> = ts_rows[lo..hi]
                    .iter()
                    .filter_map(|&row| source_values[row])
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
        .map_err(|e| AppError::Io(format!("window aggregate frame: {}", e)))?;

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
        .map_err(|e| AppError::Io(format!("Missing ts column '{}': {}", ts_col, e)))?
        .cast(&DataType::Int64)
        .map_err(|e| AppError::Io(format!("ts cast failed: {}", e)))?;
    let mut iter = ts_series
        .i64()
        .map_err(|e| AppError::Io(format!("ts i64 failed: {}", e)))?
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
        .map_err(|e| AppError::Io(e.to_string()))?;

    Ok((result, true))
}

// ── Stage 3: Serialize ─────────────────────────────────────────────────────

/// Serialize a DataFrame to Arrow IPC bytes, normalizing the timestamp column
/// to Datetime(Milliseconds) for consistent frontend parsing while preserving
/// the source timestamp column name.
pub fn serialize_arrow(df: DataFrame, ts_col: &str) -> Result<Vec<u8>, AppError> {
    let ts_dtype = df
        .column(ts_col)
        .map(|c| c.as_materialized_series().dtype().clone());
    let df = match ts_dtype {
        Ok(DataType::Datetime(TimeUnit::Milliseconds, _)) => df,
        Ok(DataType::Datetime(_, _)) => df
            .lazy()
            .with_column(col(ts_col).cast(DataType::Datetime(TimeUnit::Milliseconds, None)))
            .collect()
            .map_err(|e| AppError::Io(format!("ts cast: {}", e)))?,
        _ => df,
    };
    dataframe_to_arrow_ipc(df)
        .map_err(|e| AppError::Io(format!("Arrow IPC serialization: {:?}", e)))
}

/// Serialize a DataFrame to a JSON value with the original timestamp column
/// name and a `values` object.
pub fn serialize_json(
    df: &DataFrame,
    value_cols: &[String],
    color_col: Option<&String>,
    ts_dtype: &DataType,
    ts_col: &str,
) -> Result<serde_json::Value, AppError> {
    let multiplier = edatime_core::temporal::unit_multiplier(ts_dtype);

    let ts_series = df
        .column(ts_col)
        .map(|c| c.as_materialized_series())
        .map_err(|e| AppError::Io(format!("Missing ts '{}': {}", ts_col, e)))?
        .clone();

    let ts_i64 = ts_series
        .cast(&DataType::Int64)
        .map_err(|e| AppError::Io(format!("ts cast: {}", e)))?;

    let ts: Vec<f64> = ts_i64
        .i64()
        .map_err(|e| AppError::Io(format!("ts i64: {}", e)))?
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
            .map_err(|e| AppError::Io(format!("Missing '{}': {}", col_name, e)))?
            .clone();

        let col_series = col_series
            .cast(&DataType::Float64)
            .map_err(|e| AppError::Io(format!("Cast '{}': {}", col_name, e)))?;

        let vals: Vec<f64> = col_series
            .f64()
            .map_err(|e| AppError::Io(format!("Read '{}': {}", col_name, e)))?
            .into_iter()
            .map(|v| v.unwrap_or(f64::NAN))
            .collect();

        values.insert(col_name.clone(), serde_json::json!(vals));
    }

    let mut payload = serde_json::Map::new();
    payload.insert(ts_col.to_string(), serde_json::json!(ts));
    payload.insert("values".to_string(), serde_json::json!(values));

    if let Some(color_column) = color_col
        && let Ok(color_series) = df.column(color_column)
    {
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

#[cfg(test)]
mod tests {
    use super::{
        Reduction, apply_reduction, expand_multi_time_envelope, lazy_multi_time_envelope,
        serialize_json,
    };
    use crate::query::AggFn;
    use polars::prelude::*;

    #[test]
    fn serialize_json_preserves_original_timestamp_key() {
        let df = DataFrame::new(
            2,
            vec![
                Series::new(
                    "event_time".into(),
                    &[1_704_067_200_000_i64, 1_704_153_600_000_i64],
                )
                .into(),
                Series::new("value".into(), &[1.0_f64, 2.0_f64]).into(),
            ],
        )
        .expect("dataframe");

        let payload = serialize_json(
            &df,
            &[String::from("value")],
            None,
            &DataType::Datetime(TimeUnit::Milliseconds, None),
            "event_time",
        )
        .expect("serialize json");

        let object = payload.as_object().expect("object payload");
        assert!(object.contains_key("event_time"));
        assert!(!object.contains_key("ts"));
    }

    #[test]
    fn window_aggregate_keeps_nan_and_null_values_row_aligned() {
        let df = DataFrame::new(
            5,
            vec![
                Series::new("ts".into(), vec![0_i64, 1, 2, 3, 4]).into(),
                Series::new(
                    "value".into(),
                    vec![Some(1.0), Some(f64::NAN), Some(3.0), None, Some(5.0)],
                )
                .into(),
            ],
        )
        .expect("dataframe");
        let (aggregated, was_reduced) = apply_reduction(
            &df,
            &["value".to_string()],
            &[],
            &Reduction::WindowAgg {
                window_size_native: 3,
                step_size_native: 3,
                agg: AggFn::Mean,
            },
            "ts",
        )
        .expect("window aggregation");

        assert!(was_reduced);
        let values = aggregated
            .column("value")
            .expect("value column")
            .f64()
            .expect("f64 values")
            .into_iter()
            .collect::<Vec<_>>();
        assert_eq!(values, vec![Some(2.0), Some(5.0)]);
    }

    #[test]
    fn window_aggregate_rejects_an_unbounded_sparse_window_grid() {
        let df = DataFrame::new(
            2,
            vec![
                Series::new("ts".into(), vec![0_i64, 1_000_000]).into(),
                Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
            ],
        )
        .expect("dataframe");
        let result = apply_reduction(
            &df,
            &["value".to_string()],
            &[],
            &Reduction::WindowAgg {
                window_size_native: 1,
                step_size_native: 1,
                agg: AggFn::Mean,
            },
            "ts",
        );

        assert!(
            result.is_err(),
            "oversized sparse window grid must fail fast"
        );
    }

    #[test]
    fn multi_time_envelope_is_bounded_aligned_and_counts_source_rows() {
        let rows = 8;
        let ts = Series::new(
            "ts".into(),
            (0..rows)
                .map(|index| index as i64 * 1_000)
                .collect::<Vec<_>>(),
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("datetime");
        let frame = DataFrame::new(
            rows,
            vec![
                ts.into(),
                Series::new("a".into(), (0..rows).map(|v| v as f64).collect::<Vec<_>>()).into(),
                Series::new(
                    "b".into(),
                    (0..rows).map(|v| (rows - v) as f64).collect::<Vec<_>>(),
                )
                .into(),
                Series::new("color".into(), ["x", "x", "y", "y", "z", "z", "q", "q"]).into(),
            ],
        )
        .expect("frame");
        let envelope = lazy_multi_time_envelope(
            frame.lazy(),
            "ts",
            &["a".to_string(), "b".to_string()],
            &["color".to_string()],
            4_000,
        )
        .expect("plan")
        .collect()
        .expect("envelope");
        let (expanded, filtered_rows) = expand_multi_time_envelope(
            &envelope,
            "ts",
            &["a".to_string(), "b".to_string()],
            &["color".to_string()],
        )
        .expect("expand");

        assert_eq!(filtered_rows, rows);
        assert_eq!(expanded.height(), envelope.height() * 4);
        assert_eq!(expanded.width(), 4);
        assert!(expanded.column("color").is_ok());
    }
}
