use std::{collections::HashSet, fmt::Display, hash::Hash, path::Path};

use axum::{Json, extract::State};
use polars::prelude::{
    DataFrame, DataType, LazyCsvReader, LazyFileListReader, LazyFrame, ScanArgsParquet, SchemaExt,
    col, len, lit, NamedFrom, Series,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use edatime_core::stats;
use edatime_core::temporal;
use edatime_store::{
    jobs::{JobKind, JobRecord, JobStatus},
    state::{AppState, ProfileCacheEntry},
    versions::DatasetVersionRecord,
};

const PROFILE_ALGORITHM_VERSION: &str = "exact-v1";
const SAMPLED_PROFILE_ALGORITHM_VERSION: &str = "sample-v2";
const SAMPLED_PROFILE_ROW_CAP: usize = 10_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResponse {
    pub algorithm_version: String,
    pub source_version: DatasetVersionRecord,
    pub status: String,
    pub job: Option<JobRecord>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetMetadata {
    pub revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_version_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root_source_version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_source_version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dataset_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub profile_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_sample_rows: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_sampling: Option<ProfileSampling>,
    pub total_rows: usize,
    pub columns: Vec<ColumnMetadata>,
    pub numeric_columns: Vec<String>,
    pub time_column: Option<String>,
    pub time_range: Option<TimeRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_quality: Option<TimeQuality>,
    pub column_profiles: Vec<ColumnProfile>,
}

/// Sampling applies to distribution estimates only, not adjacency/run statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSampling {
    pub method: String,
    pub source_rows: usize,
    pub sampled_rows: usize,
    pub seed: u64,
}

fn profile_sample_indices(rows: usize, cap: usize) -> Vec<u32> {
    let target = rows.min(cap);
    let mut random = 0xeda71_u64;
    (0..target).map(|bucket| {
        let start = bucket * rows / target;
        let end = (bucket + 1) * rows / target;
        random ^= random << 13;
        random ^= random >> 7;
        random ^= random << 17;
        let index = if bucket == 0 { 0 } else if bucket + 1 == target { rows - 1 }
            else { start + random as usize % (end - start) };
        index as u32
    }).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMetadata {
    pub name: String,
    pub dtype: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TimeRange {
    pub min: i64,
    pub max: i64,
}

/// Ordered-source quality facts for the detected time column.
///
/// These facts are deliberately only produced by a completed sampled or exact
/// profile. Immediate metadata reports the time range without pretending it
/// has inspected source ordering or duplicate timestamps.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TimeQuality {
    pub non_null_count: usize,
    pub null_count: usize,
    pub unique_timestamp_count: usize,
    /// Rows beyond the first occurrence for each duplicate timestamp.
    pub duplicate_timestamp_count: usize,
    pub is_monotonic_non_decreasing: bool,
    /// Adjacent source-order timestamp pairs where the latter is earlier.
    pub out_of_order_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_gap_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub median_gap_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_gap_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnProfile {
    pub name: String,
    pub dtype: String,
    pub non_null_count: usize,
    pub null_count: usize,
    pub non_finite_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finite_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zero_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longest_zero_run: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longest_zero_run_start_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longest_zero_run_end_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distinct_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_constant: Option<bool>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Native integer minimum as a decimal string; `min` can round beyond f64 precision.
    pub min_exact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// Native integer maximum as a decimal string; `max` can round beyond f64 precision.
    pub max_exact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q25: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub median: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q75: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interquartile_range: Option<f64>,
    pub histogram: Option<stats::Histogram>,
}

fn detect_time_column(schema: &polars::prelude::Schema) -> Option<(String, DataType)> {
    if let Some(dtype) = schema.get("ts")
        && matches!(
            dtype,
            DataType::Datetime(_, _) | DataType::Date | DataType::Int64 | DataType::Int32
        )
    {
        return Some(("ts".to_string(), dtype.clone()));
    }

    // Prefer explicit temporal columns first.
    if let Some(field) = schema
        .iter_fields()
        .find(|field| matches!(field.dtype(), DataType::Datetime(_, _) | DataType::Date))
    {
        return Some((field.name().to_string(), field.dtype().clone()));
    }

    // Fallback to integer-based timestamp heuristic in name.
    schema.iter_fields().find_map(|field| {
        let name_lower = field.name().to_lowercase();
        let dtype = field.dtype();
        if matches!(dtype, DataType::Int64 | DataType::Int32)
            && (name_lower.contains("ts")
                || name_lower.contains("time")
                || name_lower.contains("timestamp"))
        {
            Some((field.name().to_string(), dtype.clone()))
        } else {
            None
        }
    })
}

fn resolve_time_column(
    schema: &polars::prelude::Schema,
    override_column: Option<&str>,
) -> Result<Option<(String, DataType)>, AppError> {
    let Some(name) = override_column else {
        return Ok(detect_time_column(schema));
    };
    let dtype = schema.get(name).ok_or_else(|| {
        AppError::bad_request(format!("Time column '{name}' was not found in the file"))
    })?;
    if !matches!(
        dtype,
        DataType::Datetime(_, _) | DataType::Date | DataType::Int64 | DataType::Int32
    ) {
        return Err(AppError::bad_request(format!(
            "Time column '{name}' must be a date, datetime, or integer timestamp"
        )));
    }
    Ok(Some((name.to_string(), dtype.clone())))
}

fn cast_u64_to_usize(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

/// Extract a u64 aggregate column, cast to usize.
fn read_u64_agg(agg: &DataFrame, col_name: &str) -> usize {
    agg.column(col_name)
        .ok()
        .and_then(|s| s.u64().ok())
        .and_then(|v| v.get(0))
        .map(cast_u64_to_usize)
        .unwrap_or(0)
}

/// Extract an f64 aggregate column.
fn read_f64_agg(agg: &DataFrame, col_name: &str) -> Option<f64> {
    agg.column(col_name)
        .ok()
        .and_then(|s| s.f64().ok())
        .and_then(|v| v.get(0))
}

/// Extract an i64 aggregate column.
fn read_i64_agg(agg: &DataFrame, col_name: &str) -> Option<i64> {
    agg.column(col_name)
        .ok()
        .and_then(|s| s.i64().ok())
        .and_then(|v| v.get(0))
}

fn percentile(sorted: &[f64], quantile: f64) -> Option<f64> {
    let last_index = sorted.len().checked_sub(1)?;
    let position = quantile.clamp(0.0, 1.0) * last_index as f64;
    let lower = position.floor() as usize;
    let upper = position.ceil() as usize;
    let fraction = position - lower as f64;
    Some(sorted[lower] + (sorted[upper] - sorted[lower]) * fraction)
}

#[derive(Debug)]
struct ExactIntegerSummary {
    distinct_count: usize,
    min_exact: Option<String>,
    max_exact: Option<String>,
}

fn summarize_integer_values<T>(
    values: impl Iterator<Item = Option<T>>,
    capacity: usize,
) -> ExactIntegerSummary
where
    T: Copy + Display + Eq + Hash + Ord,
{
    let mut distinct = HashSet::with_capacity(capacity);
    let mut minimum: Option<T> = None;
    let mut maximum: Option<T> = None;
    for value in values.flatten() {
        distinct.insert(value);
        minimum = Some(minimum.map_or(value, |current| current.min(value)));
        maximum = Some(maximum.map_or(value, |current| current.max(value)));
    }
    ExactIntegerSummary {
        distinct_count: distinct.len(),
        min_exact: minimum.map(|value| value.to_string()),
        max_exact: maximum.map(|value| value.to_string()),
    }
}

fn exact_integer_summary(
    series: &polars::prelude::Series,
    dtype: &DataType,
    capacity: usize,
) -> Result<Option<ExactIntegerSummary>, AppError> {
    macro_rules! summarize {
        ($accessor:ident, $type:ty) => {{
            let values = series.$accessor()?;
            Ok(Some(summarize_integer_values::<$type>(
                values.into_iter(),
                capacity,
            )))
        }};
    }

    match dtype {
        DataType::Int8 => summarize!(i8, i8),
        DataType::Int16 => summarize!(i16, i16),
        DataType::Int32 => summarize!(i32, i32),
        DataType::Int64 => summarize!(i64, i64),
        DataType::UInt8 => summarize!(u8, u8),
        DataType::UInt16 => summarize!(u16, u16),
        DataType::UInt32 => summarize!(u32, u32),
        DataType::UInt64 => summarize!(u64, u64),
        _ => Ok(None),
    }
}

fn time_quality_from_frame(
    df: &DataFrame,
    time_column_override: Option<&str>,
) -> Option<TimeQuality> {
    let schema = df.schema();
    let (name, dtype) = resolve_time_column(schema.as_ref(), time_column_override).ok()??;
    let series = df.column(&name).ok()?.as_materialized_series().clone();
    let mut timestamps = Vec::with_capacity(series.len());
    let null_count = series.null_count();

    if dtype.is_numeric() {
        for value in series
            .cast(&DataType::Float64)
            .ok()?
            .f64()
            .ok()?
            .into_iter()
            .flatten()
        {
            if value.is_finite() {
                timestamps.push(
                    temporal::native_to_epoch_ms(value.round() as i64, &DataType::Int64).round()
                        as i64,
                );
            }
        }
    } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
        for value in series
            .cast(&DataType::Int64)
            .ok()?
            .i64()
            .ok()?
            .into_iter()
            .flatten()
        {
            timestamps.push(temporal::native_to_epoch_ms(value, &dtype).round() as i64);
        }
    } else {
        return None;
    }

    let out_of_order_count = timestamps
        .windows(2)
        .filter(|pair| pair[1] < pair[0])
        .count();
    let mut ordered = timestamps.clone();
    ordered.sort_unstable();
    let duplicate_timestamp_count = ordered.windows(2).filter(|pair| pair[0] == pair[1]).count();
    let mut positive_gaps = ordered
        .windows(2)
        .filter_map(|pair| (pair[1] > pair[0]).then_some(pair[1].saturating_sub(pair[0])))
        .collect::<Vec<_>>();
    positive_gaps.sort_unstable();
    let median_gap_ms = positive_gaps
        .get(positive_gaps.len().saturating_sub(1) / 2)
        .copied();

    Some(TimeQuality {
        non_null_count: timestamps.len(),
        null_count,
        unique_timestamp_count: ordered.len().saturating_sub(duplicate_timestamp_count),
        duplicate_timestamp_count,
        is_monotonic_non_decreasing: out_of_order_count == 0,
        out_of_order_count,
        min_gap_ms: positive_gaps.first().copied(),
        median_gap_ms,
        max_gap_ms: positive_gaps.last().copied(),
    })
}

fn build_dataset_metadata_from_lazyframe(
    lf: LazyFrame,
    time_column_override: Option<&str>,
) -> Result<DatasetMetadata, AppError> {
    // File previews are exact profiling surfaces. Resolve the selected
    // time column, collect once, then share the same profiler and statistics
    // regardless of whether that selection was explicit or automatic.
    let frame = lf.collect().map_err(|error| {
        AppError::bad_request(format!("Failed to profile uploaded file: {error}"))
    })?;
    let metadata = build_dataset_metadata(&frame, true, time_column_override)?;
    if metadata.numeric_columns.is_empty() {
        return Err(AppError::bad_request(
            "File must contain at least one numeric column",
        ));
    }
    Ok(metadata)
}

/// Produce the metadata required to start exploring a source without building
/// wide per-column aggregates or histograms. The one-row lazy aggregate keeps
/// the row count and time range truthful while the exact profile job owns all
/// quality statistics.
fn build_immediate_dataset_metadata_from_lazyframe(
    lf: LazyFrame,
    time_column_override: Option<&str>,
) -> Result<DatasetMetadata, AppError> {
    let schema_ref = lf
        .clone()
        .collect_schema()
        .map_err(|e| AppError::bad_request(format!("Failed to infer schema: {e}")))?;
    let schema = schema_ref.as_ref();
    let time_col = resolve_time_column(schema, time_column_override)?;
    let time_col_name = time_col.as_ref().map(|(name, _)| name.clone());

    if time_col.is_none() && time_column_override.is_some() {
        return Err(AppError::bad_request(
            "Specified time column not found in the file",
        ));
    }

    let mut columns = Vec::with_capacity(schema.len());
    let mut numeric_columns = Vec::new();
    for field in schema.iter_fields() {
        let name = field.name().to_string();
        let dtype = field.dtype().clone();
        columns.push(ColumnMetadata {
            name: name.clone(),
            dtype: dtype.to_string(),
        });
        if dtype.is_numeric() && Some(name.as_str()) != time_col_name.as_deref() {
            numeric_columns.push(name);
        }
    }
    let mut expressions = vec![len().cast(DataType::UInt64).alias("__total_rows")];
    if let Some((name, dtype)) = time_col.as_ref() {
        if dtype.is_numeric() {
            expressions.push(col(name).cast(DataType::Float64).min().alias("__time_min"));
            expressions.push(col(name).cast(DataType::Float64).max().alias("__time_max"));
        } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            expressions.push(col(name).cast(DataType::Int64).min().alias("__time_min"));
            expressions.push(col(name).cast(DataType::Int64).max().alias("__time_max"));
        }
    }
    let aggregate = lf
        .select(expressions)
        .collect()
        .map_err(|e| AppError::bad_request(format!("Failed to inspect source: {e}")))?;
    let total_rows = read_u64_agg(&aggregate, "__total_rows");
    let time_range = time_col.as_ref().and_then(|(_, dtype)| {
        if dtype.is_numeric() {
            Some(TimeRange {
                min: temporal::native_to_epoch_ms(
                    read_f64_agg(&aggregate, "__time_min")?.round() as i64,
                    &DataType::Int64,
                )
                .round() as i64,
                max: temporal::native_to_epoch_ms(
                    read_f64_agg(&aggregate, "__time_max")?.round() as i64,
                    &DataType::Int64,
                )
                .round() as i64,
            })
        } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            Some(TimeRange {
                min: temporal::native_to_epoch_ms(read_i64_agg(&aggregate, "__time_min")?, dtype)
                    .round() as i64,
                max: temporal::native_to_epoch_ms(read_i64_agg(&aggregate, "__time_max")?, dtype)
                    .round() as i64,
            })
        } else {
            None
        }
    });

    Ok(DatasetMetadata {
        revision: 0,
        source_version_id: None,
        source_version_revision: None,
        root_source_version_id: None,
        parent_source_version_id: None,
        dataset_fingerprint: None,
        schema_fingerprint: None,
        source_name: None,
        display_name: None,
        profile_status: "immediate".to_string(),
        profile_sample_rows: None,
        profile_sampling: None,
        total_rows,
        columns,
        numeric_columns,
        time_column: time_col_name,
        time_range,
        time_quality: None,
        column_profiles: Vec::new(),
    })
}

pub fn build_dataset_metadata(
    df: &DataFrame,
    include_histograms: bool,
    time_column_override: Option<&str>,
) -> Result<DatasetMetadata, AppError> {
    let total_rows = df.height();
    let schema = df.schema();
    let time_col = resolve_time_column(schema.as_ref(), time_column_override)?;
    let time_col_name = time_col
        .as_ref()
        .map(|(name, _)| name.as_str())
        .unwrap_or("ts");

    let mut columns = Vec::with_capacity(df.width());
    let mut numeric_columns = Vec::new();
    let zero_run_times = df.column(time_col_name).ok().and_then(|series| {
        let dtype = series.dtype().clone();
        let casted = series.cast(&DataType::Int64).ok()?;
        let values = casted.i64().ok()?;
        Some(
            values
                .into_iter()
                .map(|value| value.map(|v| temporal::native_to_epoch_ms(v, &dtype).round() as i64))
                .collect::<Vec<_>>(),
        )
    });
    let mut column_profiles = Vec::with_capacity(df.width());

    for series in df.materialized_column_iter() {
        let name = series.name().as_str().to_string();
        let dtype = series.dtype().clone();

        columns.push(ColumnMetadata {
            name: name.clone(),
            dtype: dtype.to_string(),
        });

        if dtype.is_numeric() && name != time_col_name {
            numeric_columns.push(name.clone());
        }

        let null_count = series.null_count();
        let non_null_count = series.len().saturating_sub(null_count);
        let mut profile = ColumnProfile {
            name: name.clone(),
            dtype: dtype.to_string(),
            non_null_count,
            null_count,
            non_finite_count: 0,
            finite_count: None,
            zero_count: None,
            longest_zero_run: None,
            longest_zero_run_start_ms: None,
            longest_zero_run_end_ms: None,
            distinct_count: None,
            is_constant: None,
            min: None,
            max: None,
            min_exact: None,
            max_exact: None,
            q25: None,
            median: None,
            q75: None,
            interquartile_range: None,
            histogram: None,
        };

        if dtype.is_numeric() {
            let casted = series.cast(&DataType::Float64)?;
            let values = casted.f64()?;
            let mut min = f64::INFINITY;
            let mut max = f64::NEG_INFINITY;
            let integer_summary = exact_integer_summary(series, &dtype, non_null_count)?;
            let mut finite_values = Vec::with_capacity(non_null_count);
            let mut zero_count = 0usize;
            let mut current_zero_run = 0usize;
            let mut longest_zero_run = 0usize;
            let mut current_zero_run_start = 0usize;
            let mut longest_zero_run_start = None;
            let mut longest_zero_run_end = None;
            let mut non_finite_count = 0usize;

            for (index, value) in values.into_iter().enumerate() {
                let Some(value) = value else {
                    current_zero_run = 0;
                    continue;
                };
                if !value.is_finite() {
                    non_finite_count += 1;
                    current_zero_run = 0;
                    continue;
                }
                min = min.min(value);
                max = max.max(value);
                finite_values.push(value);
                zero_count += usize::from(value == 0.0);
                if value == 0.0 {
                    if current_zero_run == 0 {
                        current_zero_run_start = index;
                    }
                    current_zero_run += 1;
                    if current_zero_run > longest_zero_run {
                        longest_zero_run = current_zero_run;
                        longest_zero_run_start = Some(current_zero_run_start);
                        longest_zero_run_end = Some(index);
                    }
                } else {
                    current_zero_run = 0;
                }
            }

            finite_values.sort_by(f64::total_cmp);
            let float_distinct_count = if integer_summary.is_none() {
                finite_values
                    .windows(2)
                    .filter(|pair| pair[0] != pair[1])
                    .count()
                    .saturating_add(usize::from(!finite_values.is_empty()))
            } else {
                0
            };
            if min.is_finite() && max.is_finite() {
                profile.min = Some(min);
                profile.max = Some(max);
                profile.q25 = percentile(&finite_values, 0.25);
                profile.median = percentile(&finite_values, 0.5);
                profile.q75 = percentile(&finite_values, 0.75);
                profile.interquartile_range = profile
                    .q75
                    .zip(profile.q25)
                    .map(|(upper, lower)| upper - lower);
                if include_histograms {
                    profile.histogram = stats::build_histogram_from_finite_iter(
                        finite_values.iter().copied(),
                        min,
                        max,
                        finite_values.len(),
                    );
                }
            }
            profile.non_finite_count = non_finite_count;
            profile.finite_count = Some(finite_values.len());
            profile.zero_count = Some(zero_count);
            profile.longest_zero_run = Some(longest_zero_run);
            if let (Some(start), Some(end), Some(times)) = (
                longest_zero_run_start,
                longest_zero_run_end,
                zero_run_times.as_ref(),
            ) {
                profile.longest_zero_run_start_ms = times.get(start).copied().flatten();
                profile.longest_zero_run_end_ms = times.get(end).copied().flatten();
            }
            if let Some(summary) = integer_summary {
                profile.distinct_count = Some(summary.distinct_count);
                profile.is_constant = Some(summary.distinct_count == 1);
                profile.min_exact = summary.min_exact;
                profile.max_exact = summary.max_exact;
            } else {
                profile.distinct_count = Some(float_distinct_count);
                profile.is_constant = Some(float_distinct_count == 1);
            }
        } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            let casted = series.cast(&DataType::Int64)?;
            let ints = casted.i64()?;
            let mut min_raw: Option<i64> = None;
            let mut max_raw: Option<i64> = None;
            let mut temporal_count = 0usize;
            for value in ints.into_iter().flatten() {
                min_raw = Some(min_raw.map_or(value, |current| current.min(value)));
                max_raw = Some(max_raw.map_or(value, |current| current.max(value)));
                temporal_count += 1;
            }
            if let Some(value) = min_raw {
                profile.min = Some(temporal::native_to_epoch_ms(value, &dtype));
            }
            if let Some(value) = max_raw {
                profile.max = Some(temporal::native_to_epoch_ms(value, &dtype));
            }
            if include_histograms && let (Some(min), Some(max)) = (profile.min, profile.max) {
                profile.histogram = stats::build_histogram_from_finite_iter(
                    ints.into_iter()
                        .flatten()
                        .map(|value| temporal::native_to_epoch_ms(value, &dtype)),
                    min,
                    max,
                    temporal_count,
                );
            }
        }

        column_profiles.push(profile);
    }

    let time_col_for_range = time_col.clone();
    let time_range = time_col_for_range.and_then(|(name, dtype)| {
        let series = df.column(&name).ok()?.as_materialized_series().clone();
        let casted = series.cast(&DataType::Int64).ok()?;
        let ints = casted.i64().ok()?;
        let mut min_raw: Option<i64> = None;
        let mut max_raw: Option<i64> = None;
        for value in ints.into_iter().flatten() {
            min_raw = Some(min_raw.map_or(value, |current| current.min(value)));
            max_raw = Some(max_raw.map_or(value, |current| current.max(value)));
        }
        let min_raw = min_raw?;
        let max_raw = max_raw?;
        Some(TimeRange {
            min: temporal::native_to_epoch_ms(min_raw, &dtype).round() as i64,
            max: temporal::native_to_epoch_ms(max_raw, &dtype).round() as i64,
        })
    });

    let time_column_for_response = time_col.as_ref().map(|(name, _)| name.clone());
    let time_quality = time_quality_from_frame(df, time_column_override);

    Ok(DatasetMetadata {
        revision: 0,
        source_version_id: None,
        source_version_revision: None,
        root_source_version_id: None,
        parent_source_version_id: None,
        dataset_fingerprint: None,
        schema_fingerprint: None,
        source_name: None,
        display_name: None,
        profile_status: "exact".to_string(),
        profile_sample_rows: None,
        profile_sampling: None,
        total_rows,
        columns,
        numeric_columns,
        time_column: time_column_for_response,
        time_range,
        time_quality,
        column_profiles,
    })
}

pub fn build_dataset_metadata_from_path_with_time_column(
    path: &Path,
    time_column_override: Option<&str>,
) -> Result<DatasetMetadata, AppError> {
    let path_str = path
        .to_str()
        .ok_or_else(|| AppError::bad_request("Invalid upload path"))?;
    let is_parquet = path.extension().is_some_and(|ext| ext == "parquet");

    let lf = if is_parquet {
        LazyFrame::scan_parquet(path_str.into(), ScanArgsParquet::default())
            .map_err(|e| AppError::bad_request(format!("Failed to scan parquet: {e}")))?
    } else {
        // First pass: normal parse.
        let base = LazyCsvReader::new(path_str.into()).with_try_parse_dates(true);
        match base.clone().finish() {
            Ok(f) => f,
            Err(_) => {
                // Retry with relaxed parser behavior for malformed values.
                base.with_ignore_errors(true)
                    .with_infer_schema_length(Some(10000))
                    .finish()
                    .map_err(|e| AppError::bad_request(format!("Failed to scan csv: {e}")))?
            }
        }
    };

    build_dataset_metadata_from_lazyframe(lf, time_column_override)
}

pub fn build_immediate_dataset_metadata_from_path_with_time_column(
    path: &Path,
    time_column_override: Option<&str>,
) -> Result<DatasetMetadata, AppError> {
    let path_str = path
        .to_str()
        .ok_or_else(|| AppError::bad_request("Invalid upload path"))?;
    let is_parquet = path.extension().is_some_and(|ext| ext == "parquet");
    let lf = if is_parquet {
        LazyFrame::scan_parquet(path_str.into(), ScanArgsParquet::default())
            .map_err(|e| AppError::bad_request(format!("Failed to scan parquet: {e}")))?
    } else {
        let base = LazyCsvReader::new(path_str.into()).with_try_parse_dates(true);
        match base.clone().finish() {
            Ok(frame) => frame,
            Err(_) => base
                .with_ignore_errors(true)
                .with_infer_schema_length(Some(10000))
                .finish()
                .map_err(|e| AppError::bad_request(format!("Failed to scan csv: {e}")))?,
        }
    };
    let metadata = build_immediate_dataset_metadata_from_lazyframe(lf, time_column_override)?;
    if metadata.numeric_columns.is_empty() {
        return Err(AppError::bad_request(
            "File must contain at least one numeric column",
        ));
    }
    Ok(metadata)
}

#[tracing::instrument(skip(state))]
pub async fn get_metadata(
    State(state): State<AppState>,
) -> Result<Json<DatasetMetadata>, AppError> {
    let version = state.current_dataset_version()?;
    let metadata_key = immediate_metadata_cache_key(&version);
    if let Some(cached) = state.cached_immediate_metadata(&metadata_key) {
        let mut metadata: DatasetMetadata = serde_json::from_value(cached)
            .map_err(|error| AppError::internal(format!("Decode cached metadata: {error}")))?;
        metadata.display_name = version.display_name;
        return Ok(Json(metadata));
    }
    // Resolve the immutable source before yielding to the admitted worker.
    // The active repository may be replaced by another upload while metadata
    // is being computed, but this response must remain internally consistent.
    let source = state.dataset_snapshot_for_version(&version.id)?;
    let worker_time_column = version.time_column.clone();

    let metadata = state
        .query_executor
        .run_interactive(edatime_core::metrics::CpuStage::Query, move || {
            build_immediate_dataset_metadata_from_lazyframe(source, worker_time_column.as_deref())
        })
        .await
        .map_err(AppError::from)??;

    let mut metadata = metadata;
    metadata.revision = version.revision;
    metadata.source_version_id = Some(version.id);
    metadata.source_version_revision = Some(version.revision);
    metadata.root_source_version_id = Some(version.root_id);
    metadata.parent_source_version_id = version.parent_id;
    metadata.dataset_fingerprint = Some(version.dataset_fingerprint);
    metadata.schema_fingerprint = Some(version.schema_fingerprint);
    metadata.source_name = version.source_name;
    metadata.display_name = version.display_name;
    state.store_immediate_metadata(metadata_key, serde_json::to_value(&metadata)?);
    Ok(Json(metadata))
}

fn immediate_metadata_cache_key(version: &DatasetVersionRecord) -> String {
    format!(
        "{}:{}:{}",
        version.id,
        version.revision,
        version.time_column.as_deref().unwrap_or("")
    )
}

fn profile_cache_key(version: &DatasetVersionRecord, algorithm_version: &str) -> String {
    format!(
        "{algorithm_version}:{}:{}:{}",
        version.id, version.revision, version.dataset_fingerprint
    )
}

fn profile_response(
    state: &AppState,
    algorithm_version: &'static str,
) -> Result<ProfileResponse, AppError> {
    let version = state.current_dataset_version()?;
    let key = profile_cache_key(&version, algorithm_version);
    let mut entry = state.cached_profile(&key);
    let job = entry
        .as_ref()
        .and_then(|entry| state.jobs.record(&entry.job_id));
    // Publication stores the result before completing the job. The worker can
    // finish between these two reads; refresh the earlier cache snapshot so a
    // completed profile is never incorrectly reported as not_started.
    if job
        .as_ref()
        .is_some_and(|job| job.status == JobStatus::Completed)
    {
        entry = state.cached_profile(&key);
    }
    let status = match (
        entry.as_ref().and_then(|entry| entry.result.as_ref()),
        job.as_ref(),
    ) {
        (Some(_), _) => "ready",
        (None, Some(job)) if job.status == JobStatus::Queued => "queued",
        (None, Some(job)) if job.status == JobStatus::Running => "running",
        (None, Some(job)) if job.status == JobStatus::Cancelling => "cancelling",
        (None, Some(job)) if job.status == JobStatus::Cancelled => "cancelled",
        (None, Some(job)) if job.status == JobStatus::Failed => "failed",
        _ => "not_started",
    };
    Ok(ProfileResponse {
        algorithm_version: algorithm_version.to_string(),
        source_version: version,
        status: status.to_string(),
        job,
        metadata: entry.and_then(|entry| entry.result),
    })
}

/// Report the exact profile cache state for the selected immutable source.
/// Metadata remains available to existing consumers while this dedicated
/// endpoint distinguishes a complete exact report from an in-flight job.
pub async fn get_profile(State(state): State<AppState>) -> Result<Json<ProfileResponse>, AppError> {
    Ok(Json(profile_response(&state, PROFILE_ALGORITHM_VERSION)?))
}

/// Report the bounded sampled profile cache independently from the exact
/// profile. Its metadata always declares `profile_status: sampled` and a
/// sample-row count so callers cannot treat it as an exact report.
pub async fn get_sample_profile(
    State(state): State<AppState>,
) -> Result<Json<ProfileResponse>, AppError> {
    Ok(Json(profile_response(
        &state,
        SAMPLED_PROFILE_ALGORITHM_VERSION,
    )?))
}

/// Start (or reuse) an admitted exact profile job for the active source. The
/// job publishes only a fully computed result, so callers never confuse a
/// partial aggregate with an exact quality finding.
pub async fn start_profile(
    State(state): State<AppState>,
) -> Result<Json<ProfileResponse>, AppError> {
    start_profile_mode(state, PROFILE_ALGORITHM_VERSION, None).await
}

/// Deterministic stratified sample spanning the source order, with endpoint
/// coverage. Gathering retains at most the cap; the source count scan is admitted.
pub async fn start_sample_profile(
    State(state): State<AppState>,
) -> Result<Json<ProfileResponse>, AppError> {
    start_profile_mode(
        state,
        SAMPLED_PROFILE_ALGORITHM_VERSION,
        Some(SAMPLED_PROFILE_ROW_CAP),
    )
    .await
}

async fn start_profile_mode(
    state: AppState,
    algorithm_version: &'static str,
    sample_row_cap: Option<usize>,
) -> Result<Json<ProfileResponse>, AppError> {
    let version = state.current_dataset_version()?;
    let key = profile_cache_key(&version, algorithm_version);
    if let Some(entry) = state.cached_profile(&key) {
        let active = state.jobs.record(&entry.job_id).is_some_and(|job| {
            matches!(
                job.status,
                JobStatus::Queued | JobStatus::Running | JobStatus::Cancelling
            )
        });
        if entry.result.is_some() || active {
            return Ok(Json(profile_response(&state, algorithm_version)?));
        }
    }
    // Capture the immutable source before publishing a job. A failed lookup is
    // a request error, never a reason to profile whichever source is current
    // by the time a background task begins.
    let mut snapshot = state.dataset_snapshot_for_version(&version.id)?;

    let job = state
        .jobs
        .create_with_request_id(JobKind::Profile, crate::middleware::current_request_id());
    state.store_profile(
        key.clone(),
        ProfileCacheEntry {
            job_id: job.id().to_string(),
            result: None,
        },
    );

    let worker_state = state.clone();
    let worker_version = version.clone();
    tokio::spawn(async move {
        if !worker_state.jobs.start(&job) {
            return;
        }
        worker_state.jobs.update_progress(
            &job,
            5,
            Some(if sample_row_cap.is_some() {
                format!("collecting bounded {algorithm_version} source profile")
            } else {
                "collecting exact source profile".to_string()
            }),
        );
        if job.is_cancelled() {
            worker_state.jobs.complete(&job);
            return;
        }

        let source_rows = if let Some(cap) = sample_row_cap {
            let count = match worker_state.query_executor
                .execute_queued_background_async(snapshot.clone().select([len().alias("rows")])).await {
                Ok(frame) => frame.column("rows").ok().and_then(|c| c.u32().ok()).and_then(|c| c.get(0)).map(|n| n as usize),
                Err(error) => { worker_state.jobs.fail(&job, error.to_string()); return; }
            };
            let Some(rows) = count else { worker_state.jobs.fail(&job, "Could not count the sampled source".to_string()); return; };
            snapshot = match worker_state.query_executor.run_queued_background(
                edatime_core::metrics::CpuStage::Analytics,
                move || -> Result<LazyFrame, AppError> {
                    let schema = snapshot.collect_schema()?;
                    let indices = lit(Series::new("profile_indices".into(), profile_sample_indices(rows, cap)));
                    Ok(snapshot.select(schema.iter_names().map(|name| col(name.as_str()).gather(indices.clone())).collect::<Vec<_>>()))
                }).await {
                Ok(Ok(selected)) => selected,
                Ok(Err(error)) => { worker_state.jobs.fail(&job, error.to_string()); return; }
                Err(error) => { worker_state.jobs.fail(&job, error.to_string()); return; }
            };
            Some(rows)
        } else { None };

        let frame = match worker_state
            .query_executor
            .execute_queued_background_async(snapshot)
            .await
        {
            Ok(frame) => frame,
            Err(error) => {
                worker_state.jobs.fail(&job, error.to_string());
                return;
            }
        };
        if job.is_cancelled() {
            worker_state.jobs.complete(&job);
            return;
        }
        worker_state.jobs.update_progress(
            &job,
            70,
            Some(if sample_row_cap.is_some() {
                "building sampled quality report".to_string()
            } else {
                "building exact quality report".to_string()
            }),
        );
        let time_column = worker_version.time_column.clone();
        let report = match worker_state
            .query_executor
            .run_queued_background(edatime_core::metrics::CpuStage::Analytics, move || {
                build_dataset_metadata(&frame, true, time_column.as_deref())
            })
            .await
        {
            Ok(Ok(report)) => report,
            Ok(Err(error)) => {
                worker_state.jobs.fail(&job, error.to_string());
                return;
            }
            Err(error) => {
                worker_state.jobs.fail(&job, error.to_string());
                return;
            }
        };
        if job.is_cancelled() {
            worker_state.jobs.complete(&job);
            return;
        }

        let mut report = report;
        if sample_row_cap.is_some() {
            report.profile_status = "sampled".to_string();
            report.profile_sample_rows = Some(report.total_rows);
            report.profile_sampling = Some(ProfileSampling {
                method: "stratified_source_rows_with_endpoints".into(),
                source_rows: source_rows.unwrap_or(report.total_rows), sampled_rows: report.total_rows,
                seed: 0xeda71,
            });
            // Sampled rows are not adjacent observations. Run lengths and cadence
            // computed on them would be false source-quality claims.
            report.time_quality = None;
            for column in &mut report.column_profiles {
                column.longest_zero_run = None;
                column.longest_zero_run_start_ms = None;
                column.longest_zero_run_end_ms = None;
            }
        }
        report.revision = worker_version.revision;
        report.source_version_id = Some(worker_version.id.clone());
        report.source_version_revision = Some(worker_version.revision);
        report.root_source_version_id = Some(worker_version.root_id.clone());
        report.parent_source_version_id = worker_version.parent_id.clone();
        report.dataset_fingerprint = Some(worker_version.dataset_fingerprint.clone());
        report.schema_fingerprint = Some(worker_version.schema_fingerprint.clone());
        report.source_name = worker_version.source_name.clone();
        report.display_name = worker_version.display_name.clone();
        match serde_json::to_value(report) {
            Ok(result) => {
                worker_state.store_profile(
                    key,
                    ProfileCacheEntry {
                        job_id: job.id().to_string(),
                        result: Some(result),
                    },
                );
                worker_state.jobs.complete(&job);
            }
            Err(error) => {
                worker_state
                    .jobs
                    .fail(&job, format!("Could not serialize profile: {error}"));
            }
        }
    });

    Ok(Json(profile_response(&state, algorithm_version)?))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use edatime_core::config::AppConfig;
    use polars::prelude::{IntoLazy, NamedFrom, TimeUnit};
    use std::fs;

    fn frame_with_two_time_columns(ts_values: [i64; 3], event_values: [i64; 3]) -> DataFrame {
        let ts = polars::prelude::Series::new("ts".into(), ts_values.to_vec())
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("ts datetime");
        let event_time = polars::prelude::Series::new("event_time".into(), event_values.to_vec())
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("event time datetime");
        DataFrame::new(
            3,
            vec![
                ts.into(),
                event_time.into(),
                polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("two-time-column dataframe")
    }

    #[test]
    fn stratified_profile_covers_endpoints_without_periodic_stride() {
        let indices = profile_sample_indices(69_680, 10_000);
        assert_eq!(indices.len(), 10_000);
        assert_eq!(indices[0], 0);
        assert_eq!(indices[9_999], 69_679);
        assert!(indices.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(indices.windows(2).any(|pair| pair[1] - pair[0] != 7));
        assert_eq!(indices, profile_sample_indices(69_680, 10_000));
    }

    #[test]
    fn builds_metadata_for_in_memory_frame() {
        let ts = polars::prelude::Series::new(
            "ts".into(),
            vec![1_700_000_000_000i64, 1_700_000_100_000i64],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("cast ts to datetime");
        let df = DataFrame::new(
            2,
            vec![
                ts.into(),
                polars::prelude::Series::new("value".into(), vec![1.0f64, 2.0]).into(),
            ],
        )
        .expect("dataframe");

        let metadata = build_dataset_metadata(&df, true, None).expect("metadata");
        assert_eq!(metadata.numeric_columns, vec!["value".to_string()]);
        assert_eq!(metadata.total_rows, 2);
        assert!(metadata.time_range.is_some());
        assert_eq!(
            metadata.time_quality,
            Some(TimeQuality {
                non_null_count: 2,
                null_count: 0,
                unique_timestamp_count: 2,
                duplicate_timestamp_count: 0,
                is_monotonic_non_decreasing: true,
                out_of_order_count: 0,
                min_gap_ms: Some(100_000),
                median_gap_ms: Some(100_000),
                max_gap_ms: Some(100_000),
            })
        );
        assert!(
            metadata
                .column_profiles
                .iter()
                .any(|profile| profile.name == "ts" && profile.histogram.is_some())
        );
        assert!(
            metadata
                .column_profiles
                .iter()
                .any(|profile| profile.name == "value" && profile.histogram.is_some())
        );
    }

    #[test]
    fn immediate_metadata_keeps_exploration_facts_and_defers_profiles() {
        let df = DataFrame::new(
            2,
            vec![
                polars::prelude::Series::new(
                    "ts".into(),
                    vec![1_700_000_000_000_i64, 1_700_000_001_000],
                )
                .into(),
                polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
            ],
        )
        .expect("dataframe");

        let metadata = build_immediate_dataset_metadata_from_lazyframe(df.lazy(), None)
            .expect("immediate metadata");
        assert_eq!(metadata.total_rows, 2);
        assert_eq!(metadata.numeric_columns, vec!["value".to_string()]);
        assert_eq!(
            metadata.time_range,
            Some(TimeRange {
                min: 1_700_000_000_000,
                max: 1_700_000_001_000
            })
        );
        assert_eq!(metadata.profile_status, "immediate");
        assert_eq!(metadata.time_quality, None);
        assert!(metadata.column_profiles.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn metadata_uses_the_selected_time_column_and_restores_it_with_its_version() {
        let state = AppState::new(DataFrame::default(), AppConfig::default());
        let first_frame =
            frame_with_two_time_columns([0, 1_000, 2_000], [100_000, 101_000, 102_000]);
        state
            .replace_dataset_with_time_column(first_frame, Some("event_time".to_string()))
            .await
            .expect("selected source upload");
        let first_version = state.current_dataset_version().expect("first version");

        let first = get_metadata(State(state.clone()))
            .await
            .expect("first metadata")
            .0;
        assert_eq!(first.time_column.as_deref(), Some("event_time"));
        assert_eq!(
            first.time_range,
            Some(TimeRange {
                min: 100_000,
                max: 102_000
            })
        );
        assert_eq!(
            first
                .columns
                .iter()
                .filter(|column| column.name == "ts")
                .count(),
            1
        );
        assert_eq!(
            first
                .columns
                .iter()
                .filter(|column| column.name == "event_time")
                .count(),
            1
        );

        state
            .replace_dataset_with_time_column(
                frame_with_two_time_columns(
                    [700_000, 701_000, 702_000],
                    [800_000, 801_000, 802_000],
                ),
                Some("ts".to_string()),
            )
            .await
            .expect("second source upload");
        state
            .select_dataset_version(&first_version.id)
            .await
            .expect("restore first version");
        let restored = get_metadata(State(state.clone()))
            .await
            .expect("restored metadata")
            .0;
        assert_eq!(
            restored.source_version_id.as_deref(),
            Some(first_version.id.as_str())
        );
        assert_eq!(restored.time_column.as_deref(), Some("event_time"));
        assert_eq!(
            restored.time_range,
            Some(TimeRange {
                min: 100_000,
                max: 102_000
            })
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn exact_profile_keeps_its_version_time_column_across_source_changes() {
        let state = AppState::new(DataFrame::default(), AppConfig::default());
        state
            .replace_dataset_with_time_column(
                frame_with_two_time_columns([0, 1_000, 2_000], [100_000, 101_000, 102_000]),
                Some("event_time".to_string()),
            )
            .await
            .expect("first source upload");
        let first = start_profile(State(state.clone()))
            .await
            .expect("start first exact profile")
            .0;

        state
            .replace_dataset_with_time_column(
                frame_with_two_time_columns(
                    [700_000, 701_000, 702_000],
                    [800_000, 801_000, 802_000],
                ),
                Some("ts".to_string()),
            )
            .await
            .expect("replace active source");
        state
            .select_dataset_version(&first.source_version.id)
            .await
            .expect("restore profiled version");

        for _ in 0..200 {
            let response = get_profile(State(state.clone()))
                .await
                .expect("get exact profile")
                .0;
            if response.status == "ready" {
                let report: DatasetMetadata =
                    serde_json::from_value(response.metadata.expect("profile metadata"))
                        .expect("profile report");
                assert_eq!(report.time_column.as_deref(), Some("event_time"));
                assert_eq!(
                    report.time_range,
                    Some(TimeRange {
                        min: 100_000,
                        max: 102_000
                    })
                );
                assert!(
                    report
                        .column_profiles
                        .iter()
                        .any(|profile| profile.name == "event_time")
                );
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        panic!("version-bound exact profile did not finish");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn immediate_metadata_cache_keeps_identical_upload_versions_distinct() {
        let df = DataFrame::new(
            2,
            vec![
                polars::prelude::Series::new(
                    "ts".into(),
                    vec![1_700_000_000_000_i64, 1_700_000_001_000],
                )
                .into(),
                polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
            ],
        )
        .expect("dataframe");
        let mut config = AppConfig::default();
        config.retention.max_resident_versions = 1;
        let state = AppState::new(DataFrame::default(), config);

        state
            .replace_dataset(df.clone())
            .await
            .expect("first upload");
        let first = get_metadata(State(state.clone()))
            .await
            .expect("first metadata")
            .0;

        state.replace_dataset(df).await.expect("second upload");
        let second = get_metadata(State(state.clone()))
            .await
            .expect("second metadata")
            .0;
        let active = state.current_dataset_version().expect("active version");

        assert_ne!(first.source_version_id, second.source_version_id);
        assert_eq!(
            second.source_version_id.as_deref(),
            Some(active.id.as_str())
        );
        assert_eq!(second.source_version_revision, Some(active.revision));
        assert!(state.dataset_snapshot_for_version(&active.id).is_ok());
        assert!(
            state
                .dataset_snapshot_for_version(
                    first.source_version_id.as_deref().expect("first source id")
                )
                .is_err()
        );
    }

    #[test]
    fn completed_profiles_report_duplicate_out_of_order_time_quality() {
        let df = DataFrame::new(
            5,
            vec![
                polars::prelude::Series::new(
                    "ts".into(),
                    vec![
                        Some(1_700_000_003_000_i64),
                        Some(1_700_000_001_000),
                        Some(1_700_000_001_000),
                        None,
                        Some(1_700_000_005_000),
                    ],
                )
                .into(),
                polars::prelude::Series::new("value".into(), vec![1.0_f64; 5]).into(),
            ],
        )
        .expect("dataframe");

        let metadata = build_dataset_metadata(&df, false, None).expect("metadata");
        assert_eq!(
            metadata.time_quality,
            Some(TimeQuality {
                non_null_count: 4,
                null_count: 1,
                unique_timestamp_count: 3,
                duplicate_timestamp_count: 1,
                is_monotonic_non_decreasing: false,
                out_of_order_count: 1,
                min_gap_ms: Some(2_000),
                median_gap_ms: Some(2_000),
                max_gap_ms: Some(2_000),
            })
        );
    }

    #[test]
    fn immediate_metadata_uses_the_selected_real_time_column() {
        let ts = polars::prelude::Series::new("ts".into(), vec![0_i64, 1_000, 2_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .expect("ts datetime");
        let event_time =
            polars::prelude::Series::new("event_time".into(), vec![100_000_i64, 101_000, 102_000])
                .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
                .expect("event time datetime");
        let df = DataFrame::new(
            3,
            vec![
                ts.into(),
                event_time.into(),
                polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0, 3.0]).into(),
            ],
        )
        .expect("dataframe");

        let metadata =
            build_immediate_dataset_metadata_from_lazyframe(df.clone().lazy(), Some("event_time"))
                .expect("immediate metadata");
        assert_eq!(metadata.time_column.as_deref(), Some("event_time"));
        assert_eq!(
            metadata
                .columns
                .iter()
                .filter(|column| column.name == "ts")
                .count(),
            1
        );
        assert_eq!(
            metadata
                .columns
                .iter()
                .filter(|column| column.name == "event_time")
                .count(),
            1
        );
        assert_eq!(
            metadata.time_range,
            Some(TimeRange {
                min: 100_000,
                max: 102_000
            })
        );

        let exact =
            build_dataset_metadata(&df, true, Some("event_time")).expect("selected exact profile");
        assert_eq!(exact.time_column.as_deref(), Some("event_time"));
        assert_eq!(exact.time_range, metadata.time_range);
        assert_eq!(
            exact
                .column_profiles
                .iter()
                .filter(|profile| profile.name == "event_time")
                .count(),
            1
        );
    }

    #[test]
    fn exact_preview_statistics_match_with_automatic_and_explicit_time_selection() {
        let event_time = polars::prelude::Series::new(
            "event_time".into(),
            vec![
                1_700_000_000_000_i64,
                1_700_000_001_000,
                1_700_000_002_000,
                1_700_000_003_000,
            ],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("event time datetime");
        let df = DataFrame::new(
            4,
            vec![
                event_time.into(),
                polars::prelude::Series::new("value".into(), vec![0.0_f64, 2.0, 0.0, 4.0]).into(),
            ],
        )
        .expect("dataframe");

        let automatic = build_dataset_metadata_from_lazyframe(df.clone().lazy(), None)
            .expect("automatic exact preview");
        let explicit = build_dataset_metadata_from_lazyframe(df.lazy(), Some("event_time"))
            .expect("explicit exact preview");
        let automatic_value = automatic
            .column_profiles
            .iter()
            .find(|profile| profile.name == "value")
            .expect("automatic value profile");
        let explicit_value = explicit
            .column_profiles
            .iter()
            .find(|profile| profile.name == "value")
            .expect("explicit value profile");

        assert_eq!(automatic.profile_status, "exact");
        assert_eq!(explicit.profile_status, "exact");
        assert_eq!(automatic.numeric_columns, explicit.numeric_columns);
        assert_eq!(automatic.time_range, explicit.time_range);
        assert_eq!(automatic.time_quality, explicit.time_quality);
        assert_eq!(automatic_value.distinct_count, Some(3));
        assert_eq!(
            automatic_value.distinct_count,
            explicit_value.distinct_count
        );
        assert_eq!(automatic_value.zero_count, Some(2));
        assert_eq!(automatic_value.zero_count, explicit_value.zero_count);
        assert_eq!(automatic_value.median, explicit_value.median);
        assert_eq!(automatic_value.q25, explicit_value.q25);
        assert_eq!(automatic_value.q75, explicit_value.q75);
        assert_eq!(
            automatic_value
                .histogram
                .as_ref()
                .map(|histogram| &histogram.counts),
            explicit_value
                .histogram
                .as_ref()
                .map(|histogram| &histogram.counts)
        );
        assert!(explicit_value.histogram.is_some());
    }

    #[test]
    fn integer_profiles_preserve_exact_identity_and_extrema() {
        let i64_values = vec![9_007_199_254_740_992_i64, 9_007_199_254_740_993_i64];
        let signed = DataFrame::new(
            2,
            vec![polars::prelude::Series::new("value".into(), i64_values).into()],
        )
        .expect("signed integer frame");
        let signed_profile = build_dataset_metadata(&signed, false, None)
            .expect("signed profile")
            .column_profiles
            .into_iter()
            .find(|profile| profile.name == "value")
            .expect("signed value profile");
        assert_eq!(signed_profile.distinct_count, Some(2));
        assert_eq!(signed_profile.is_constant, Some(false));
        assert_eq!(
            signed_profile.min_exact.as_deref(),
            Some("9007199254740992")
        );
        assert_eq!(
            signed_profile.max_exact.as_deref(),
            Some("9007199254740993")
        );

        let unsigned = DataFrame::new(
            2,
            vec![polars::prelude::Series::new("value".into(), vec![u64::MAX - 1, u64::MAX]).into()],
        )
        .expect("unsigned integer frame");
        let unsigned_profile = build_dataset_metadata(&unsigned, false, None)
            .expect("unsigned profile")
            .column_profiles
            .into_iter()
            .find(|profile| profile.name == "value")
            .expect("unsigned value profile");
        assert_eq!(unsigned_profile.distinct_count, Some(2));
        assert_eq!(unsigned_profile.is_constant, Some(false));
        assert_eq!(
            unsigned_profile.min_exact.as_deref(),
            Some("18446744073709551614")
        );
        assert_eq!(
            unsigned_profile.max_exact.as_deref(),
            Some("18446744073709551615")
        );

        let signed_boundary = DataFrame::new(
            2,
            vec![polars::prelude::Series::new("value".into(), vec![i64::MIN, i64::MAX]).into()],
        )
        .expect("signed boundary frame");
        let boundary_profile = build_dataset_metadata(&signed_boundary, false, None)
            .expect("signed boundary profile")
            .column_profiles
            .into_iter()
            .find(|profile| profile.name == "value")
            .expect("boundary value profile");
        assert_eq!(boundary_profile.distinct_count, Some(2));
        assert_eq!(
            boundary_profile.min_exact.as_deref(),
            Some("-9223372036854775808")
        );
        assert_eq!(
            boundary_profile.max_exact.as_deref(),
            Some("9223372036854775807")
        );
    }

    #[test]
    fn explicit_time_column_errors_name_missing_and_unsupported_fields() {
        let date = polars::prelude::Series::new(
            "date".into(),
            vec![1_700_000_000_000_i64, 1_700_000_001_000],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("date datetime");
        let df = DataFrame::new(
            2,
            vec![
                date.into(),
                polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
            ],
        )
        .expect("dataframe");

        let missing =
            build_dataset_metadata_from_lazyframe(df.clone().lazy(), Some("missing_time"))
                .expect_err("missing override must fail");
        assert!(missing.to_string().contains("missing_time"));
        assert!(missing.to_string().contains("not found"));

        let wrong_type = build_dataset_metadata_from_lazyframe(df.lazy(), Some("value"))
            .expect_err("numeric signal must not be accepted as a time override");
        assert!(wrong_type.to_string().contains("value"));
        assert!(
            wrong_type
                .to_string()
                .contains("date, datetime, or integer timestamp")
        );
    }

    #[test]
    fn immediate_metadata_honors_datetime_time_override_as_datetime() {
        let timestamps = polars::prelude::Series::new(
            "recorded_at".into(),
            vec![1_700_000_000_000_i64, 1_700_000_001_000],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .expect("datetime");
        let df = DataFrame::new(
            2,
            vec![
                timestamps.into(),
                polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
            ],
        )
        .expect("dataframe");

        let metadata =
            build_immediate_dataset_metadata_from_lazyframe(df.lazy(), Some("recorded_at"))
                .expect("immediate metadata");
        assert_eq!(metadata.time_column.as_deref(), Some("recorded_at"));
        assert_eq!(
            metadata.time_range,
            Some(TimeRange {
                min: 1_700_000_000_000,
                max: 1_700_000_001_000
            })
        );
    }

    #[test]
    fn metadata_counts_non_finite_numeric_values_without_polluting_extrema() {
        let df = DataFrame::new(
            5,
            vec![
                polars::prelude::Series::new("ts".into(), vec![1_i64, 2, 3, 4, 5]).into(),
                polars::prelude::Series::new(
                    "value".into(),
                    vec![
                        Some(2.0_f64),
                        Some(f64::NAN),
                        Some(f64::INFINITY),
                        Some(f64::NEG_INFINITY),
                        None,
                    ],
                )
                .into(),
            ],
        )
        .expect("dataframe");

        let metadata = build_dataset_metadata(&df, true, None).expect("metadata");
        let profile = metadata
            .column_profiles
            .iter()
            .find(|profile| profile.name == "value")
            .expect("value profile");
        assert_eq!(profile.non_finite_count, 3);
        assert_eq!(profile.finite_count, Some(1));
        assert_eq!(profile.zero_count, Some(0));
        assert_eq!(profile.distinct_count, Some(1));
        assert_eq!(profile.is_constant, Some(true));
        assert_eq!(profile.min, Some(2.0));
        assert_eq!(profile.max, Some(2.0));
    }

    #[test]
    fn completed_profiles_report_numeric_distribution_and_constant_facts() {
        let df = DataFrame::new(
            5,
            vec![
                polars::prelude::Series::new("ts".into(), vec![1_i64, 2, 3, 4, 5]).into(),
                polars::prelude::Series::new("spread".into(), vec![0.0_f64, 1.0, 2.0, 3.0, 4.0])
                    .into(),
                polars::prelude::Series::new("constant".into(), vec![7.0_f64; 5]).into(),
            ],
        )
        .expect("dataframe");

        let metadata = build_dataset_metadata(&df, false, None).expect("metadata");
        let spread = metadata
            .column_profiles
            .iter()
            .find(|profile| profile.name == "spread")
            .expect("spread profile");
        assert_eq!(spread.finite_count, Some(5));
        assert_eq!(spread.zero_count, Some(1));
        assert_eq!(spread.distinct_count, Some(5));
        assert_eq!(spread.is_constant, Some(false));
        assert_eq!(spread.q25, Some(1.0));
        assert_eq!(spread.median, Some(2.0));
        assert_eq!(spread.q75, Some(3.0));
        assert_eq!(spread.interquartile_range, Some(2.0));
        let constant = metadata
            .column_profiles
            .iter()
            .find(|profile| profile.name == "constant")
            .expect("constant profile");
        assert_eq!(constant.distinct_count, Some(1));
        assert_eq!(constant.is_constant, Some(true));
        assert_eq!(constant.interquartile_range, Some(0.0));
    }

    #[test]
    fn float_distinct_counts_preserve_signed_zero_and_skip_non_finite_values() {
        let df = DataFrame::new(
            4,
            vec![
                polars::prelude::Series::new(
                    "signed_zero".into(),
                    vec![-0.0_f64, 0.0, f64::NAN, f64::INFINITY],
                )
                .into(),
                polars::prelude::Series::new(
                    "varied".into(),
                    vec![1.0_f64, 1.0, 2.0, f64::NEG_INFINITY],
                )
                .into(),
            ],
        )
        .expect("float profile frame");
        let metadata = build_dataset_metadata(&df, false, None).expect("exact profile");
        let signed_zero = metadata
            .column_profiles
            .iter()
            .find(|profile| profile.name == "signed_zero")
            .expect("signed-zero profile");
        assert_eq!(signed_zero.finite_count, Some(2));
        assert_eq!(signed_zero.non_finite_count, 2);
        assert_eq!(signed_zero.distinct_count, Some(1));
        assert_eq!(signed_zero.is_constant, Some(true));

        let varied = metadata
            .column_profiles
            .iter()
            .find(|profile| profile.name == "varied")
            .expect("varied profile");
        assert_eq!(varied.finite_count, Some(3));
        assert_eq!(varied.non_finite_count, 1);
        assert_eq!(varied.distinct_count, Some(2));
        assert_eq!(varied.is_constant, Some(false));
    }

    #[test]
    fn completed_profiles_report_zero_runs_and_skip_nulls() {
        let base = 1_700_000_000_000_i64;
        let df = DataFrame::new(
            7,
            vec![
                polars::prelude::Series::new(
                    "ts".into(),
                    (0..7).map(|index| base + index * 1_000).collect::<Vec<_>>(),
                )
                .into(),
                polars::prelude::Series::new(
                    "signal".into(),
                    vec![
                        Some(0.0_f64),
                        Some(1.0),
                        None,
                        Some(0.0),
                        Some(1.0),
                        Some(0.0),
                        Some(0.0),
                    ],
                )
                .into(),
            ],
        )
        .expect("dataframe");

        let metadata = build_dataset_metadata(&df, false, None).expect("metadata");
        let profile = metadata
            .column_profiles
            .iter()
            .find(|profile| profile.name == "signal")
            .expect("signal profile");
        assert_eq!(profile.zero_count, Some(4));
        assert_eq!(profile.longest_zero_run, Some(2));
        assert_eq!(profile.longest_zero_run_start_ms, Some(base + 5_000));
        assert_eq!(profile.longest_zero_run_end_ms, Some(base + 6_000));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sample_dataset_exact_profile_completes() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ETTm2.csv");
        let artifacts = tempfile::tempdir().expect("artifact directory");
        let mut config = AppConfig::default();
        config.data.artifact_dir = Some(artifacts.path().to_path_buf());
        let state = AppState::new(DataFrame::default(), config);
        let loaded = edatime_ingest::ingest::load_lazyframe_partial(
            &path,
            &edatime_ingest::ingest::IngestParams::default(),
        )
        .expect("sample ingest");
        state
            .replace_dataset_lazy_root(
                loaded.frame,
                Some("ETTm2.csv".into()),
                loaded.time_column_name.expect("time column"),
            )
            .await
            .expect("managed sample upload");
        let _ = start_profile(State(state.clone())).await.expect("start");
        for _ in 0..1000 {
            let response = get_profile(State(state.clone())).await.expect("profile").0;
            assert!(
                matches!(response.status.as_str(), "queued" | "running" | "ready"),
                "unexpected profile state: {} {:?}",
                response.status,
                response.job
            );
            if response.status == "ready" {
                let report: DatasetMetadata =
                    serde_json::from_value(response.metadata.expect("report"))
                        .expect("profile metadata");
                assert_eq!(report.total_rows, 69_680);
                assert_eq!(report.column_profiles.len(), 8);
                assert_eq!(report.profile_status, "exact");
                for column in &report.column_profiles {
                    assert_eq!(column.non_null_count, report.total_rows);
                    assert_eq!(column.null_count, 0);
                }
                let hufl = report
                    .column_profiles
                    .iter()
                    .find(|column| column.name == "HUFL")
                    .expect("HUFL profile");
                assert!(hufl.min.is_some() && hufl.max.is_some());
                assert!(hufl.histogram.is_some());
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("sample profile did not finish");
    }

    #[tokio::test]
    async fn exact_profile_job_is_reused_and_publishes_source_bound_metadata() {
        let df = DataFrame::new(
            3,
            vec![
                polars::prelude::Series::new("ts".into(), vec![1_i64, 2, 3]).into(),
                polars::prelude::Series::new("value".into(), vec![Some(1.0_f64), None, Some(3.0)])
                    .into(),
            ],
        )
        .expect("dataframe");
        let state = AppState::new(df, AppConfig::default());

        let first = start_profile(State(state.clone()))
            .await
            .expect("start profile")
            .0;
        let second = start_profile(State(state.clone()))
            .await
            .expect("reuse profile")
            .0;
        assert_eq!(
            first.job.as_ref().map(|job| &job.id),
            second.job.as_ref().map(|job| &job.id)
        );
        assert!(matches!(
            first.status.as_str(),
            "queued" | "running" | "ready"
        ));

        let mut report = None;
        for _ in 0..100 {
            let response = get_profile(State(state.clone()))
                .await
                .expect("get profile")
                .0;
            if response.status == "ready" {
                report = response.metadata;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        let report = report.expect("completed exact profile");
        assert_eq!(
            report["source_version_id"],
            serde_json::json!(first.source_version.id)
        );
        assert_eq!(
            report["revision"],
            serde_json::json!(first.source_version.revision)
        );
        assert_eq!(
            report["column_profiles"][1]["null_count"],
            serde_json::json!(1)
        );
    }

    #[tokio::test]
    async fn sampled_profile_is_bounded_and_marked_as_an_estimate() {
        let rows = SAMPLED_PROFILE_ROW_CAP + 5;
        let df = DataFrame::new(
            rows,
            vec![
                polars::prelude::Series::new(
                    "ts".into(),
                    (0..rows).map(|value| value as i64).collect::<Vec<_>>(),
                )
                .into(),
                polars::prelude::Series::new(
                    "value".into(),
                    (0..rows).map(|value| value as f64).collect::<Vec<_>>(),
                )
                .into(),
            ],
        )
        .expect("dataframe");
        let state = AppState::new(df, AppConfig::default());

        let start = start_sample_profile(State(state.clone()))
            .await
            .expect("start sample profile")
            .0;
        assert_eq!(start.algorithm_version, SAMPLED_PROFILE_ALGORITHM_VERSION);

        let mut report = None;
        for _ in 0..100 {
            let response = get_sample_profile(State(state.clone()))
                .await
                .expect("get sample profile")
                .0;
            if response.status == "ready" {
                report = response.metadata;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        let report = report.expect("completed sampled profile");
        assert_eq!(report["profile_status"], serde_json::json!("sampled"));
        assert_eq!(report["profile_sampling"]["source_rows"], serde_json::json!(rows));
        assert!(report.get("time_quality").is_none());
        let value_profile = report["column_profiles"].as_array().unwrap().iter().find(|profile| profile["name"] == "value").unwrap();
        assert_eq!(value_profile["max"], serde_json::json!((rows - 1) as f64));
        assert_eq!(
            report["profile_sample_rows"],
            serde_json::json!(SAMPLED_PROFILE_ROW_CAP)
        );
        assert_eq!(
            report["total_rows"],
            serde_json::json!(SAMPLED_PROFILE_ROW_CAP)
        );
    }

    #[test]
    fn builds_metadata_from_csv_path_without_full_ingest() {
        let file = tempfile::NamedTempFile::new().expect("tempfile");
        fs::write(
            file.path(),
            "time,value,other\n2024-01-01T00:00:00Z,1,10\n2024-01-01T00:00:01Z,2,20\n",
        )
        .expect("write csv");

        let metadata = build_dataset_metadata_from_path_with_time_column(file.path(), None)
            .expect("metadata from path");
        assert_eq!(metadata.total_rows, 2);
        assert_eq!(
            metadata.numeric_columns,
            vec!["value".to_string(), "other".to_string()]
        );
        assert!(metadata.time_range.is_some());
    }

    #[test]
    fn lazy_csv_profile_counts_non_finite_values() {
        let file = tempfile::NamedTempFile::new().expect("tempfile");
        fs::write(
            file.path(),
            "time,value\n2024-01-01T00:00:00Z,1\n2024-01-01T00:00:01Z,NaN\n",
        )
        .expect("write csv");

        let metadata = build_dataset_metadata_from_path_with_time_column(file.path(), None)
            .expect("metadata from csv");
        let profile = metadata
            .column_profiles
            .iter()
            .find(|profile| profile.name == "value")
            .expect("value profile");
        assert_eq!(profile.non_finite_count, 1);
    }

    #[test]
    fn builds_metadata_from_csv_path_without_time_column() {
        let file = tempfile::NamedTempFile::new().expect("tempfile");
        fs::write(file.path(), "value,other\n1,10\n2,20\n").expect("write csv");

        let metadata = build_dataset_metadata_from_path_with_time_column(file.path(), None)
            .expect("metadata from path");
        assert_eq!(metadata.total_rows, 2);
        assert_eq!(metadata.time_column, None);
        assert_eq!(metadata.time_range, None);
        assert_eq!(
            metadata.numeric_columns,
            vec!["value".to_string(), "other".to_string()]
        );
    }

    #[test]
    fn builds_metadata_from_csv_path_with_unix_time_seconds() {
        let file = tempfile::NamedTempFile::new().expect("tempfile");
        fs::write(file.path(), "timestamp,value\n1700000000,1\n1700000001,2\n").expect("write csv");

        let metadata = build_dataset_metadata_from_path_with_time_column(file.path(), None)
            .expect("metadata from path");
        assert_eq!(metadata.total_rows, 2);
        assert!(metadata.time_range.is_some());
        let tr = metadata.time_range.unwrap();
        assert_eq!(tr.min, 1700000000000);
        assert_eq!(tr.max, 1700000001000);
    }
}
