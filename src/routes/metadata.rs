use axum::{extract::State, Json};
use crate::state::AppState;
use crate::error::AppError;
use polars::prelude::{DataFrame, DataType, TimeUnit};
use serde::Serialize;
use tokio::task;

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
