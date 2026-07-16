use std::path::Path;

use axum::{Json, extract::State};
use polars::prelude::{
    DataFrame, DataType, Expr, LazyCsvReader, LazyFileListReader, LazyFrame, ScanArgsParquet,
    SchemaExt, col, len,
};
use serde::Serialize;

use crate::error::AppError;
use edatime_core::stats;
use edatime_core::temporal;
use edatime_store::{
    jobs::{JobKind, JobRecord, JobStatus},
    state::{AppState, ProfileCacheEntry},
    versions::DatasetVersionRecord,
};

const PROFILE_ALGORITHM_VERSION: &str = "exact-v1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResponse {
    pub algorithm_version: String,
    pub source_version: DatasetVersionRecord,
    pub status: String,
    pub job: Option<JobRecord>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
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
    pub profile_status: String,
    pub total_rows: usize,
    pub columns: Vec<ColumnMetadata>,
    pub numeric_columns: Vec<String>,
    pub time_column: Option<String>,
    pub time_range: Option<TimeRange>,
    pub column_profiles: Vec<ColumnProfile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ColumnMetadata {
    pub name: String,
    pub dtype: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TimeRange {
    pub min: i64,
    pub max: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ColumnProfile {
    pub name: String,
    pub dtype: String,
    pub non_null_count: usize,
    pub null_count: usize,
    pub non_finite_count: usize,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub histogram: Option<stats::Histogram>,
}

fn detect_time_column(
    schema: &polars::prelude::Schema,
    override_column: Option<&str>,
) -> Option<(String, DataType)> {
    // If user explicitly specified a column, use it regardless of type
    if let Some(column_name) = override_column
        && let Some(dtype) = schema.get(column_name)
    {
        return Some((column_name.to_string(), dtype.clone()));
    }

    if let Some(dtype) = schema.get("ts")
        && matches!(
            dtype,
            DataType::Datetime(_, _) | DataType::Date | DataType::Int64 | DataType::Int32
        )
    {
        return Some(("ts".to_string(), dtype.clone()));
    }

    // Prefer explicit temporal columns first.
    if let Some(field) = schema.iter_fields().find(|field| {
        let dtype = field.dtype();
        matches!(dtype, DataType::Datetime(_, _) | DataType::Date)
    }) {
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

/// Build a `ColumnProfile` from pre-computed aggregate columns.
fn profile_from_aggregate(
    agg: &DataFrame,
    index: usize,
    name: &str,
    dtype: &DataType,
) -> ColumnProfile {
    let non_null_count = read_u64_agg(agg, &format!("__{index}_non_null"));
    let null_count = read_u64_agg(agg, &format!("__{index}_null"));
    let non_finite_count = read_u64_agg(agg, &format!("__{index}_non_finite"));

    let (min, max) = if dtype.is_numeric() {
        (
            read_f64_agg(agg, &format!("__{index}_min")),
            read_f64_agg(agg, &format!("__{index}_max")),
        )
    } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
        (
            read_i64_agg(agg, &format!("__{index}_tmin"))
                .map(|v| temporal::native_to_epoch_ms(v, dtype)),
            read_i64_agg(agg, &format!("__{index}_tmax"))
                .map(|v| temporal::native_to_epoch_ms(v, dtype)),
        )
    } else {
        (None, None)
    };

    ColumnProfile {
        name: name.to_string(),
        dtype: dtype.to_string(),
        non_null_count,
        null_count,
        non_finite_count,
        min,
        max,
        histogram: None,
    }
}

/// Resolve a `TimeRange` from aggregate columns for a detected time column.
fn time_range_from_aggregate(agg: &DataFrame, index: usize, dtype: &DataType) -> Option<TimeRange> {
    if dtype.is_numeric() {
        // Numeric time columns: read as f64, round to i64,
        // then apply the integer heuristic in `native_to_epoch_ms`.
        let min_raw = read_f64_agg(agg, &format!("__{index}_min"))?;
        let max_raw = read_f64_agg(agg, &format!("__{index}_max"))?;
        Some(TimeRange {
            min: temporal::native_to_epoch_ms(min_raw.round() as i64, &DataType::Int64).round()
                as i64,
            max: temporal::native_to_epoch_ms(max_raw.round() as i64, &DataType::Int64).round()
                as i64,
        })
    } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
        let min_raw = read_i64_agg(agg, &format!("__{index}_tmin"))?;
        let max_raw = read_i64_agg(agg, &format!("__{index}_tmax"))?;
        Some(TimeRange {
            min: temporal::native_to_epoch_ms(min_raw, dtype).round() as i64,
            max: temporal::native_to_epoch_ms(max_raw, dtype).round() as i64,
        })
    } else {
        None
    }
}

fn build_dataset_metadata_from_lazyframe(
    lf: LazyFrame,
    time_column_override: Option<&str>,
) -> Result<DatasetMetadata, AppError> {
    let schema_ref = lf
        .clone()
        .collect_schema()
        .map_err(|e| AppError::bad_request(format!("Failed to infer schema: {e}")))?;
    let schema = schema_ref.as_ref();

    let time_col = detect_time_column(schema, time_column_override);
    let time_col_name = time_col.as_ref().map(|(name, _)| name.clone());

    if time_col.is_none() && time_column_override.is_some() {
        return Err(AppError::bad_request(
            "Specified time column not found in the file",
        ));
    }

    let mut columns = Vec::with_capacity(schema.len());
    let mut numeric_columns = Vec::new();
    let mut exprs: Vec<Expr> = Vec::with_capacity(schema.len() * 4 + 1);
    exprs.push(len().cast(DataType::UInt64).alias("__total_rows"));

    for (index, field) in schema.iter_fields().enumerate() {
        let name = field.name().to_string();
        let dtype = field.dtype().clone();

        columns.push(ColumnMetadata {
            name: name.clone(),
            dtype: dtype.to_string(),
        });

        if dtype.is_numeric() && Some(name.as_str()) != time_col_name.as_deref() {
            numeric_columns.push(name.clone());
        }

        exprs.push(
            col(&name)
                .count()
                .cast(DataType::UInt64)
                .alias(format!("__{index}_non_null")),
        );
        exprs.push(
            col(&name)
                .null_count()
                .cast(DataType::UInt64)
                .alias(format!("__{index}_null")),
        );

        if dtype.is_numeric() {
            exprs.push(
                col(&name)
                    .cast(DataType::Float64)
                    .is_finite()
                    .not()
                    .sum()
                    .cast(DataType::UInt64)
                    .alias(format!("__{index}_non_finite")),
            );
            exprs.push(
                col(&name)
                    .cast(DataType::Float64)
                    .min()
                    .alias(format!("__{index}_min")),
            );
            exprs.push(
                col(&name)
                    .cast(DataType::Float64)
                    .max()
                    .alias(format!("__{index}_max")),
            );
        } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            exprs.push(
                col(&name)
                    .cast(DataType::Int64)
                    .min()
                    .alias(format!("__{index}_tmin")),
            );
            exprs.push(
                col(&name)
                    .cast(DataType::Int64)
                    .max()
                    .alias(format!("__{index}_tmax")),
            );
        }
    }

    if numeric_columns.is_empty() {
        return Err(AppError::bad_request(
            "File must contain at least one numeric column",
        ));
    }

    let aggregate = lf
        .select(exprs)
        .collect()
        .map_err(|e| AppError::bad_request(format!("Failed to profile uploaded file: {e}")))?;

    if aggregate.height() == 0 {
        return Err(AppError::bad_request(
            "Failed to profile uploaded file (empty result)",
        ));
    }

    let total_rows = read_u64_agg(&aggregate, "__total_rows");

    let mut column_profiles = Vec::with_capacity(schema.len());
    for (index, field) in schema.iter_fields().enumerate() {
        column_profiles.push(profile_from_aggregate(
            &aggregate,
            index,
            &field.name().to_string(),
            field.dtype(),
        ));
    }

    let time_range = time_col_name
        .as_ref()
        .and_then(|time_col_name| {
            schema
                .iter_fields()
                .enumerate()
                .find(|(_, field)| field.name().as_str() == time_col_name)
        })
        .and_then(|(index, field)| time_range_from_aggregate(&aggregate, index, field.dtype()));

    Ok(DatasetMetadata {
        revision: 0,
        source_version_id: None,
        source_version_revision: None,
        root_source_version_id: None,
        parent_source_version_id: None,
        dataset_fingerprint: None,
        schema_fingerprint: None,
        source_name: None,
        profile_status: "exact".to_string(),
        total_rows,
        columns,
        numeric_columns,
        time_column: time_col_name,
        time_range,
        column_profiles,
    })
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
    let time_col = detect_time_column(schema, time_column_override);
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
    if numeric_columns.is_empty() {
        return Err(AppError::bad_request(
            "File must contain at least one numeric column",
        ));
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
        profile_status: "immediate".to_string(),
        total_rows,
        columns,
        numeric_columns,
        time_column: time_col_name,
        time_range,
        column_profiles: Vec::new(),
    })
}

pub fn build_dataset_metadata(
    df: &DataFrame,
    include_histograms: bool,
    time_column_display_name: Option<&str>,
) -> Result<DatasetMetadata, AppError> {
    let total_rows = df.height();
    let schema = df.schema();
    let time_col = detect_time_column(schema.as_ref(), None);
    let time_col_name = time_col
        .as_ref()
        .map(|(name, _)| name.as_str())
        .unwrap_or("ts");

    let mut columns = Vec::with_capacity(df.width());
    let mut numeric_columns = Vec::new();
    let mut column_profiles = Vec::with_capacity(df.width());

    for series in df.materialized_column_iter() {
        let name = series.name().as_str().to_string();
        let dtype = series.dtype().clone();

        let display_name = time_column_display_name
            .filter(|_| name == "ts")
            .map(String::from)
            .unwrap_or_else(|| name.clone());

        columns.push(ColumnMetadata {
            name: display_name.clone(),
            dtype: dtype.to_string(),
        });

        if dtype.is_numeric() && name != time_col_name {
            numeric_columns.push(name.clone());
        }

        let null_count = series.null_count();
        let non_null_count = series.len().saturating_sub(null_count);
        let mut profile = ColumnProfile {
            name: display_name.clone(),
            dtype: dtype.to_string(),
            non_null_count,
            null_count,
            non_finite_count: 0,
            min: None,
            max: None,
            histogram: None,
        };

        if dtype.is_numeric() {
            let casted = series.cast(&DataType::Float64)?;
            let values = casted.f64()?;
            let mut min = f64::INFINITY;
            let mut max = f64::NEG_INFINITY;
            let mut finite_count = 0usize;
            let mut non_finite_count = 0usize;

            for value in values.into_iter().flatten() {
                if !value.is_finite() {
                    non_finite_count += 1;
                    continue;
                }
                min = min.min(value);
                max = max.max(value);
                finite_count += 1;
            }

            if min.is_finite() && max.is_finite() {
                profile.min = Some(min);
                profile.max = Some(max);
                if include_histograms {
                    profile.histogram = stats::build_histogram_from_finite_iter(
                        values
                            .into_iter()
                            .flatten()
                            .filter(|value| value.is_finite()),
                        min,
                        max,
                        finite_count,
                    );
                }
            }
            profile.non_finite_count = non_finite_count;
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

    let time_column_for_response = time_column_display_name
        .filter(|_| time_col_name == "ts")
        .map(String::from)
        .or_else(|| time_col.as_ref().map(|(name, _)| name.clone()));

    Ok(DatasetMetadata {
        revision: 0,
        source_version_id: None,
        source_version_revision: None,
        root_source_version_id: None,
        parent_source_version_id: None,
        dataset_fingerprint: None,
        schema_fingerprint: None,
        source_name: None,
        profile_status: "exact".to_string(),
        total_rows,
        columns,
        numeric_columns,
        time_column: time_column_for_response,
        time_range,
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

fn apply_time_column_display_name(metadata: &mut DatasetMetadata, display_name: Option<&str>) {
    let Some(display_name) = display_name.filter(|name| !name.trim().is_empty()) else {
        return;
    };
    if metadata.time_column.as_deref() != Some("ts") {
        return;
    }
    for column in &mut metadata.columns {
        if column.name == "ts" {
            column.name = display_name.to_string();
        }
    }
    metadata.time_column = Some(display_name.to_string());
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
    build_immediate_dataset_metadata_from_lazyframe(lf, time_column_override)
}

#[tracing::instrument(skip(state))]
pub async fn get_metadata(
    State(state): State<AppState>,
) -> Result<Json<DatasetMetadata>, AppError> {
    // Capture state handles for spawn_blocking — snapshot must run on blocking thread.
    let repo = state.repository.clone();

    let metadata = tokio::task::spawn_blocking(move || {
        let lf = repo.snapshot();
        let time_col_display = repo.time_column_display_name_sync();
        let mut metadata = build_immediate_dataset_metadata_from_lazyframe(lf, None)?;
        apply_time_column_display_name(&mut metadata, time_col_display.as_deref());
        Ok::<_, AppError>(metadata)
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join metadata task: {e:?}")))??;

    let revision = state.repository.revision();
    let version = state.current_dataset_version()?;
    let mut metadata = metadata;
    metadata.revision = revision;
    metadata.source_version_id = Some(version.id);
    metadata.source_version_revision = Some(version.revision);
    metadata.root_source_version_id = Some(version.root_id);
    metadata.parent_source_version_id = version.parent_id;
    metadata.dataset_fingerprint = Some(version.dataset_fingerprint);
    metadata.schema_fingerprint = Some(version.schema_fingerprint);
    metadata.source_name = version.source_name;
    Ok(Json(metadata))
}

fn profile_cache_key(version: &DatasetVersionRecord) -> String {
    format!(
        "{PROFILE_ALGORITHM_VERSION}:{}:{}:{}",
        version.id, version.revision, version.dataset_fingerprint
    )
}

fn profile_response(state: &AppState) -> Result<ProfileResponse, AppError> {
    let version = state.current_dataset_version()?;
    let entry = state.cached_profile(&profile_cache_key(&version));
    let job = entry
        .as_ref()
        .and_then(|entry| state.jobs.record(&entry.job_id));
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
        algorithm_version: PROFILE_ALGORITHM_VERSION.to_string(),
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
    Ok(Json(profile_response(&state)?))
}

/// Start (or reuse) an admitted exact profile job for the active source. The
/// job publishes only a fully computed result, so callers never confuse a
/// partial aggregate with an exact quality finding.
pub async fn start_profile(
    State(state): State<AppState>,
) -> Result<Json<ProfileResponse>, AppError> {
    let version = state.current_dataset_version()?;
    let key = profile_cache_key(&version);
    if let Some(entry) = state.cached_profile(&key) {
        let active = state.jobs.record(&entry.job_id).is_some_and(|job| {
            matches!(
                job.status,
                JobStatus::Queued | JobStatus::Running | JobStatus::Cancelling
            )
        });
        if entry.result.is_some() || active {
            return Ok(Json(profile_response(&state)?));
        }
    }
    // Capture the immutable source before publishing a job. A failed lookup is
    // a request error, never a reason to profile whichever source is current
    // by the time a background task begins.
    let snapshot = state.dataset_snapshot_for_version(&version.id)?;

    let job = state.jobs.create(JobKind::Profile);
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
            Some("collecting exact source profile".to_string()),
        );
        if job.is_cancelled() {
            worker_state.jobs.complete(&job);
            return;
        }

        let frame = match worker_state
            .query_executor
            .execute_background_async(snapshot)
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
            Some("building exact quality report".to_string()),
        );
        let display_name = worker_state.time_column_display_name_sync();
        let report = match tokio::task::spawn_blocking(move || {
            build_dataset_metadata(&frame, true, display_name.as_deref())
        })
        .await
        {
            Ok(Ok(report)) => report,
            Ok(Err(error)) => {
                worker_state.jobs.fail(&job, error.to_string());
                return;
            }
            Err(error) => {
                worker_state
                    .jobs
                    .fail(&job, format!("Failed to join profile task: {error}"));
                return;
            }
        };
        if job.is_cancelled() {
            worker_state.jobs.complete(&job);
            return;
        }

        let mut report = report;
        report.revision = worker_version.revision;
        report.source_version_id = Some(worker_version.id.clone());
        report.source_version_revision = Some(worker_version.revision);
        report.root_source_version_id = Some(worker_version.root_id.clone());
        report.parent_source_version_id = worker_version.parent_id.clone();
        report.dataset_fingerprint = Some(worker_version.dataset_fingerprint.clone());
        report.schema_fingerprint = Some(worker_version.schema_fingerprint.clone());
        report.source_name = worker_version.source_name.clone();
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

    Ok(Json(profile_response(&state)?))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use edatime_core::config::AppConfig;
    use polars::prelude::{IntoLazy, NamedFrom, TimeUnit};
    use std::fs;

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
        assert!(metadata.column_profiles.is_empty());
    }

    #[test]
    fn immediate_metadata_relabels_canonical_time_only_after_resolution() {
        let df = DataFrame::new(
            2,
            vec![
                polars::prelude::Series::new("ts".into(), vec![1_i64, 2]).into(),
                polars::prelude::Series::new("value".into(), vec![1.0_f64, 2.0]).into(),
            ],
        )
        .expect("dataframe");
        let mut metadata = build_immediate_dataset_metadata_from_lazyframe(df.lazy(), None)
            .expect("immediate metadata");

        apply_time_column_display_name(&mut metadata, Some("recorded_at"));

        assert_eq!(metadata.time_column.as_deref(), Some("recorded_at"));
        assert!(
            metadata
                .columns
                .iter()
                .any(|column| column.name == "recorded_at")
        );
        assert_eq!(
            metadata.time_range,
            Some(TimeRange {
                min: 1_000,
                max: 2_000
            })
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
        assert_eq!(profile.min, Some(2.0));
        assert_eq!(profile.max, Some(2.0));
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
