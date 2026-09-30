//! Exact and sampled dataset profiling: schema/time-column resolution, time
//! quality, column statistics and histograms. Pure computation over Polars
//! frames; the HTTP handlers live in the parent module.

use std::{collections::HashSet, fmt::Display, hash::Hash, path::Path};

use polars::prelude::{
    DataFrame, DataType, LazyCsvReader, LazyFileListReader, LazyFrame, ScanArgsParquet, SchemaExt,
    col, len,
};

use super::{ColumnMetadata, ColumnProfile, DatasetMetadata, TimeQuality, TimeRange};
use crate::error::AppError;
use edatime_core::stats;
use edatime_core::temporal;

pub(super) fn profile_sample_indices(rows: usize, cap: usize) -> Vec<u32> {
    let target = rows.min(cap);
    let mut random = 0xeda71_u64;
    (0..target)
        .map(|bucket| {
            let start = bucket * rows / target;
            let end = (bucket + 1) * rows / target;
            random ^= random << 13;
            random ^= random >> 7;
            random ^= random << 17;
            let index = if bucket == 0 {
                0
            } else if bucket + 1 == target {
                rows - 1
            } else {
                start + random as usize % (end - start)
            };
            index as u32
        })
        .collect()
}

pub(super) fn detect_time_column(schema: &polars::prelude::Schema) -> Option<(String, DataType)> {
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

pub(super) fn resolve_time_column(
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

pub(super) fn cast_u64_to_usize(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

/// Extract a u64 aggregate column, cast to usize.
pub(super) fn read_u64_agg(agg: &DataFrame, col_name: &str) -> usize {
    agg.column(col_name)
        .ok()
        .and_then(|s| s.u64().ok())
        .and_then(|v| v.get(0))
        .map(cast_u64_to_usize)
        .unwrap_or(0)
}

/// Extract an f64 aggregate column.
pub(super) fn read_f64_agg(agg: &DataFrame, col_name: &str) -> Option<f64> {
    agg.column(col_name)
        .ok()
        .and_then(|s| s.f64().ok())
        .and_then(|v| v.get(0))
}

/// Extract an i64 aggregate column.
pub(super) fn read_i64_agg(agg: &DataFrame, col_name: &str) -> Option<i64> {
    agg.column(col_name)
        .ok()
        .and_then(|s| s.i64().ok())
        .and_then(|v| v.get(0))
}

pub(super) fn percentile(sorted: &[f64], quantile: f64) -> Option<f64> {
    let last_index = sorted.len().checked_sub(1)?;
    let position = quantile.clamp(0.0, 1.0) * last_index as f64;
    let lower = position.floor() as usize;
    let upper = position.ceil() as usize;
    let fraction = position - lower as f64;
    Some(sorted[lower] + (sorted[upper] - sorted[lower]) * fraction)
}

#[derive(Debug)]
pub(super) struct ExactIntegerSummary {
    distinct_count: usize,
    min_exact: Option<String>,
    max_exact: Option<String>,
}

pub(super) fn summarize_integer_values<T>(
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

pub(super) fn exact_integer_summary(
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

pub(super) fn time_quality_from_frame(
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

pub(super) fn build_dataset_metadata_from_lazyframe(
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
pub(super) fn build_immediate_dataset_metadata_from_lazyframe(
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
