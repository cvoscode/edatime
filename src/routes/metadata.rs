use axum::{extract::State, Json};
use crate::state::AppState;
use crate::error::AppError;
use polars::prelude::{DataFrame, DataType, SchemaExt, TimeUnit};
use serde::Serialize;
use tokio::task;
use std::path::Path;

#[derive(Serialize)]
pub struct DatasetMetadata {
    pub total_rows: usize,
    pub columns: Vec<ColumnMetadata>,
    pub numeric_columns: Vec<String>,
    pub time_range: Option<TimeRange>,
    pub column_profiles: Vec<ColumnProfile>,
}

#[derive(Serialize)]
pub struct ColumnMetadata {
    pub name: String,
    pub dtype: String,
}

#[derive(Serialize)]
pub struct TimeRange {
    pub min: i64,
    pub max: i64,
}

#[derive(Serialize)]
pub struct ColumnProfile {
    pub name: String,
    pub dtype: String,
    pub non_null_count: usize,
    pub null_count: usize,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub histogram: Option<Histogram>,
}

#[derive(Serialize)]
pub struct Histogram {
    pub bin_edges: Vec<f64>,
    pub counts: Vec<u64>,
}

fn unit_divisor_for_dtype(dtype: &DataType) -> i64 {
    match dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
        DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
        DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
        DataType::Date => 1,
        _ => 1,
    }
}

fn temporal_to_epoch_ms(value: i64, dtype: &DataType) -> f64 {
    match dtype {
        DataType::Date => (value * 86_400_000) as f64,
        _ => (value / unit_divisor_for_dtype(dtype)) as f64,
    }
}

fn cast_u64_to_usize(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

fn detect_time_column(schema: &polars::prelude::Schema) -> Option<(String, DataType)> {
    // Prefer a canonical name if present.
    if let Some(dtype) = schema.get("ts") {
        if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            return Some(("ts".to_string(), dtype.clone()));
        }
    }

    for field in schema.iter_fields() {
        let dtype = field.dtype();
        if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            return Some((field.name().to_string(), dtype.clone()));
        }
    }
    None
}

/// Build dataset metadata by scanning a file lazily (out-of-core).
///
/// Used by `/api/upload/preview` so the Upload page can show correct row counts
/// and per-column stats even when the dataset is larger than any in-memory
/// preview cap.
pub fn build_dataset_metadata_from_path(path: &Path) -> Result<DatasetMetadata, AppError> {
    use polars::prelude::*;

    let path_str = path
        .to_str()
        .ok_or_else(|| AppError::BadRequest("Invalid upload path".to_string()))?;
    let is_parquet = path.extension().map_or(false, |ext| ext == "parquet");

    let lf = if is_parquet {
        let args = ScanArgsParquet::default();
        LazyFrame::scan_parquet(path_str.into(), args)
            .map_err(|e| AppError::BadRequest(format!("Failed to scan parquet: {e}")))?
    } else {
        LazyCsvReader::new(path_str.into())
            .with_try_parse_dates(true)
            .finish()
            .map_err(|e| AppError::BadRequest(format!("Failed to scan csv: {e}")))?
    };

    let schema_ref = lf
        .clone()
        .collect_schema()
        .map_err(|e| AppError::BadRequest(format!("Failed to infer schema: {e}")))?;
    let schema = schema_ref.as_ref();

    let mut columns: Vec<ColumnMetadata> = Vec::with_capacity(schema.len());
    let mut numeric_columns: Vec<String> = Vec::new();
    let mut column_profiles: Vec<ColumnProfile> = Vec::with_capacity(schema.len());

    let time_col = detect_time_column(schema)
        .ok_or_else(|| AppError::BadRequest("File must contain at least one datetime/date column".to_string()))?;
    let time_col_name = time_col.0;
    let time_col_dtype = time_col.1;

    // Build aggregation expressions.
    // We alias by index to avoid escaping issues with column names.
    let mut exprs: Vec<Expr> = Vec::with_capacity(schema.len() * 4 + 3);
    exprs.push(len().cast(DataType::UInt64).alias("__total_rows"));

    for (idx, field) in schema.iter_fields().enumerate() {
        let name = field.name().to_string();
        let dtype = field.dtype().clone();

        columns.push(ColumnMetadata {
            name: name.clone(),
            dtype: dtype.to_string(),
        });

        if dtype.is_numeric() && name != time_col_name {
            numeric_columns.push(name.clone());
        }

        exprs.push(col(&name).count().cast(DataType::UInt64).alias(&format!("__{idx}_non_null")));
        exprs.push(col(&name).null_count().cast(DataType::UInt64).alias(&format!("__{idx}_null")));

        if dtype.is_numeric() {
            exprs.push(col(&name).cast(DataType::Float64).min().alias(&format!("__{idx}_min")));
            exprs.push(col(&name).cast(DataType::Float64).max().alias(&format!("__{idx}_max")));
        } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            exprs.push(col(&name).cast(DataType::Int64).min().alias(&format!("__{idx}_tmin")));
            exprs.push(col(&name).cast(DataType::Int64).max().alias(&format!("__{idx}_tmax")));
        }
    }

    if numeric_columns.is_empty() {
        return Err(AppError::BadRequest(
            "File must contain at least one numeric column".to_string(),
        ));
    }

    let agg_df = lf
        .select(exprs)
        .collect()
        .map_err(|e| AppError::BadRequest(format!("Failed to compute metadata: {e}")))?;

    if agg_df.height() == 0 {
        return Err(AppError::BadRequest("Failed to compute metadata (empty result)".to_string()));
    }

    let total_rows = agg_df
        .column("__total_rows")
        .ok()
        .and_then(|s| s.u64().ok())
        .and_then(|ca| ca.get(0))
        .unwrap_or(0);

    // Fill column profiles from the aggregate row.
    for (idx, field) in schema.iter_fields().enumerate() {
        let name = field.name().to_string();
        let dtype = field.dtype().clone();

        let non_null = agg_df
            .column(&format!("__{idx}_non_null"))
            .ok()
            .and_then(|s| s.u64().ok())
            .and_then(|ca| ca.get(0))
            .unwrap_or(0);
        let nulls = agg_df
            .column(&format!("__{idx}_null"))
            .ok()
            .and_then(|s| s.u64().ok())
            .and_then(|ca| ca.get(0))
            .unwrap_or(0);

        let mut profile = ColumnProfile {
            name: name.clone(),
            dtype: dtype.to_string(),
            non_null_count: cast_u64_to_usize(non_null),
            null_count: cast_u64_to_usize(nulls),
            min: None,
            max: None,
            histogram: None,
        };

        if dtype.is_numeric() {
            let minv = agg_df
                .column(&format!("__{idx}_min"))
                .ok()
                .and_then(|s| s.f64().ok())
                .and_then(|ca| ca.get(0));
            let maxv = agg_df
                .column(&format!("__{idx}_max"))
                .ok()
                .and_then(|s| s.f64().ok())
                .and_then(|ca| ca.get(0));
            profile.min = minv;
            profile.max = maxv;
        } else if matches!(dtype, DataType::Datetime(_, _) | DataType::Date) {
            let min_raw = agg_df
                .column(&format!("__{idx}_tmin"))
                .ok()
                .and_then(|s| s.i64().ok())
                .and_then(|ca| ca.get(0));
            let max_raw = agg_df
                .column(&format!("__{idx}_tmax"))
                .ok()
                .and_then(|s| s.i64().ok())
                .and_then(|ca| ca.get(0));
            profile.min = min_raw.map(|v| temporal_to_epoch_ms(v, &dtype));
            profile.max = max_raw.map(|v| temporal_to_epoch_ms(v, &dtype));
        }

        column_profiles.push(profile);
    }

    // Compute time range using the detected time column.
    let time_range = {
        let idx = schema
            .iter_fields()
            .enumerate()
            .find(|(_, f)| f.name().as_str() == time_col_name.as_str())
            .map(|(i, _)| i);

        if let Some(idx) = idx {
            let min_raw = agg_df
                .column(&format!("__{idx}_tmin"))
                .ok()
                .and_then(|s| s.i64().ok())
                .and_then(|ca| ca.get(0));
            let max_raw = agg_df
                .column(&format!("__{idx}_tmax"))
                .ok()
                .and_then(|s| s.i64().ok())
                .and_then(|ca| ca.get(0));
            if let (Some(min_val), Some(max_val)) = (min_raw, max_raw) {
                let min_ms = temporal_to_epoch_ms(min_val, &time_col_dtype).round() as i64;
                let max_ms = temporal_to_epoch_ms(max_val, &time_col_dtype).round() as i64;
                if max_ms > min_ms {
                    Some(TimeRange { min: min_ms, max: max_ms })
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    };

    Ok(DatasetMetadata {
        total_rows: cast_u64_to_usize(total_rows),
        columns,
        numeric_columns,
        time_range,
        column_profiles,
    })
}

pub fn build_dataset_metadata(df: &DataFrame, include_histograms: bool) -> Result<DatasetMetadata, AppError> {
    const HIST_BINS: usize = 24;

    let total_rows = df.height();
    let dtypes = df.dtypes();
    let column_names = df.get_column_names();

    let mut columns = Vec::new();
    let mut numeric_columns = Vec::new();
    let mut column_profiles = Vec::new();

    for (i, dt) in dtypes.iter().enumerate() {
        let name = column_names[i].to_string();
        columns.push(ColumnMetadata {
            name: name.clone(),
            dtype: dt.to_string(),
        });

        let series = df.column(&name)?.as_materialized_series();
        let null_count = series.null_count();
        let non_null_count = series.len().saturating_sub(null_count);

        let mut profile = ColumnProfile {
            name: name.clone(),
            dtype: dt.to_string(),
            non_null_count,
            null_count,
            min: None,
            max: None,
            histogram: None,
        };

        if dt.is_numeric() {
            if name != "ts" {
                numeric_columns.push(name.clone());
            }

            let casted = series.cast(&DataType::Float64)?;
            let values = casted.f64()?;

            let mut min = f64::INFINITY;
            let mut max = f64::NEG_INFINITY;
            let mut finite_count: usize = 0;

            for value in values.into_iter().flatten() {
                if !value.is_finite() {
                    continue;
                }
                finite_count += 1;
                if value < min {
                    min = value;
                }
                if value > max {
                    max = value;
                }
            }

            if finite_count > 0 {
                profile.min = Some(min);
                profile.max = Some(max);

                if include_histograms {
                    if max > min {
                        let mut counts = vec![0u64; HIST_BINS];
                        let span = max - min;

                        for value in values.into_iter().flatten() {
                            if !value.is_finite() {
                                continue;
                            }
                            let mut idx = (((value - min) / span) * (HIST_BINS as f64)).floor() as isize;
                            if idx < 0 {
                                idx = 0;
                            }
                            if idx >= HIST_BINS as isize {
                                idx = HIST_BINS as isize - 1;
                            }
                            counts[idx as usize] += 1;
                        }

                        let mut bin_edges = Vec::with_capacity(HIST_BINS + 1);
                        for edge_idx in 0..=HIST_BINS {
                            let edge = min + (span * (edge_idx as f64) / (HIST_BINS as f64));
                            bin_edges.push(edge);
                        }

                        profile.histogram = Some(Histogram { bin_edges, counts });
                    } else {
                        profile.histogram = Some(Histogram {
                            bin_edges: vec![min, max],
                            counts: vec![finite_count as u64],
                        });
                    }
                }
            }
        } else if matches!(dt, DataType::Datetime(_, _) | DataType::Date) {
            if let Ok(casted) = series.cast(&DataType::Int64) {
                if let Ok(Some(min_raw)) = casted.min::<i64>() {
                    profile.min = Some(temporal_to_epoch_ms(min_raw, dt));
                }
                if let Ok(Some(max_raw)) = casted.max::<i64>() {
                    profile.max = Some(temporal_to_epoch_ms(max_raw, dt));
                }
            }
        }

        column_profiles.push(profile);
    }

    let time_range = if let Ok(ts_col) = df.column("ts") {
        let ts_series = ts_col.as_materialized_series();
        let unit_divisor = unit_divisor_for_dtype(ts_series.dtype());

        if let Ok(Some(min_val)) = ts_series.min::<i64>() {
            if let Ok(Some(max_val)) = ts_series.max::<i64>() {
                let (min_ms, max_ms) = if matches!(ts_series.dtype(), DataType::Date) {
                    (min_val * 86_400_000, max_val * 86_400_000)
                } else {
                    (min_val / unit_divisor, max_val / unit_divisor)
                };

                Some(TimeRange {
                    min: min_ms,
                    max: max_ms,
                })
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    Ok(DatasetMetadata {
        total_rows,
        columns,
        numeric_columns,
        time_range,
        column_profiles,
    })
}

#[tracing::instrument(skip(state))]
pub async fn get_metadata(State(state): State<AppState>) -> Result<Json<DatasetMetadata>, AppError> {
    tracing::info!("get_metadata endpoint called");
    
    let df_lock = state.df.read().await;
    let df = df_lock.clone();
    drop(df_lock);

    task::spawn_blocking(move || build_dataset_metadata(&df, true).map(Json))
    .await
    .map_err(|e| AppError::Internal(format!("Failed to join blocking task: {:?}", e)))?
}
