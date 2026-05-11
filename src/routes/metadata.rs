use std::path::Path;

use axum::{Json, extract::State};
use polars::prelude::{
    DataFrame, DataType, Expr, LazyCsvReader, LazyFileListReader, LazyFrame, ScanArgsParquet,
    SchemaExt, col, len,
};
use serde::Serialize;

use crate::error::AppError;
use crate::state::AppState;
use crate::stats;
use crate::temporal;

#[derive(Debug, Clone, Serialize)]
pub struct DatasetMetadata {
    pub revision: u64,
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
        && let Some(dtype) = schema.get(column_name) {
            return Some((column_name.to_string(), dtype.clone()));
        }

    if let Some(dtype) = schema.get("ts")
        && matches!(
            dtype,
            DataType::Datetime(_, _) | DataType::Date | DataType::Int64 | DataType::Int32
        ) {
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
        min,
        max,
        histogram: None,
    }
}

/// Resolve a `TimeRange` from aggregate columns for a detected time column.
fn time_range_from_aggregate(
    agg: &DataFrame,
    index: usize,
    dtype: &DataType,
    is_override: bool,
) -> Option<TimeRange> {
    if is_override || matches!(dtype, DataType::Int64 | DataType::Int32) {
        // Numeric / overridden time columns: read as f64, round to i64,
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
        .and_then(|(index, field)| {
            time_range_from_aggregate(
                &aggregate,
                index,
                field.dtype(),
                time_column_override.is_some(),
            )
        });

    Ok(DatasetMetadata {
        revision: 0,
        total_rows,
        columns,
        numeric_columns,
        time_column: time_col_name,
        time_range,
        column_profiles,
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

        let display_name = if name == "ts" && time_column_display_name.is_some() {
            time_column_display_name.unwrap().to_string()
        } else {
            name.clone()
        };

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
            min: None,
            max: None,
            histogram: None,
        };

        if dtype.is_numeric() {
            let casted = series.cast(&DataType::Float64)?;
            let values = casted.f64()?;
            let mut min = f64::INFINITY;
            let mut max = f64::NEG_INFINITY;
            let mut finite_values = Vec::with_capacity(non_null_count.min(4096));

            for value in values.into_iter().flatten() {
                if !value.is_finite() {
                    continue;
                }
                min = min.min(value);
                max = max.max(value);
                if include_histograms {
                    finite_values.push(value);
                }
            }

            if min.is_finite() && max.is_finite() {
                profile.min = Some(min);
                profile.max = Some(max);
                if include_histograms {
                    profile.histogram = stats::build_histogram(&finite_values, min, max);
                }
            }
        } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            let casted = series.cast(&DataType::Int64)?;
            let ints = casted.i64()?;
            let mut min_raw: Option<i64> = None;
            let mut max_raw: Option<i64> = None;
            let mut temporal_values = Vec::with_capacity(non_null_count.min(4096));
            for value in ints.into_iter().flatten() {
                min_raw = Some(min_raw.map_or(value, |current| current.min(value)));
                max_raw = Some(max_raw.map_or(value, |current| current.max(value)));
                if include_histograms {
                    temporal_values.push(temporal::native_to_epoch_ms(value, &dtype));
                }
            }
            if let Some(value) = min_raw {
                profile.min = Some(temporal::native_to_epoch_ms(value, &dtype));
            }
            if let Some(value) = max_raw {
                profile.max = Some(temporal::native_to_epoch_ms(value, &dtype));
            }
            if include_histograms
                && let (Some(min), Some(max)) = (profile.min, profile.max) {
                    profile.histogram = stats::build_histogram(&temporal_values, min, max);
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

    let time_column_for_response = if time_col_name == "ts" && time_column_display_name.is_some() {
        Some(time_column_display_name.unwrap().to_string())
    } else {
        time_col.as_ref().map(|(name, _)| name.clone())
    };

    Ok(DatasetMetadata {
        revision: 0,
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

#[tracing::instrument(skip(state))]
pub async fn get_metadata(
    State(state): State<AppState>,
) -> Result<Json<DatasetMetadata>, AppError> {
    let df = state.dataset_snapshot().await.read().await.clone();
    let revision = state.dataset_revision();
    let time_col_display = state.time_column_display_name_sync();
    let metadata = tokio::task::spawn_blocking(move || {
        build_dataset_metadata(&df, true, time_col_display.as_deref())
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join metadata task: {e:?}")))??;
    let mut metadata = metadata;
    metadata.revision = revision;
    Ok(Json(metadata))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use polars::prelude::{NamedFrom, TimeUnit};
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
