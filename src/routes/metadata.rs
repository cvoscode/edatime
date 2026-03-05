use axum::{extract::State, Json};
use crate::state::AppState;
use crate::error::AppError;
use polars::prelude::{DataType, TimeUnit};
use serde::Serialize;
use tokio::task;

#[derive(Serialize)]
pub struct DatasetMetadata {
    pub total_rows: usize,
    pub columns: Vec<ColumnMetadata>,
    pub numeric_columns: Vec<String>,
    pub time_range: Option<TimeRange>,
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

#[tracing::instrument(skip(state))]
pub async fn get_metadata(State(state): State<AppState>) -> Result<Json<DatasetMetadata>, AppError> {
    tracing::info!("get_metadata endpoint called");
    
    let df_lock = state.df.read().await;
    let df = df_lock.clone();
    drop(df_lock);

    task::spawn_blocking(move || {
        let total_rows = df.height();
        let dtypes = df.dtypes();
        let column_names = df.get_column_names();

        let mut columns = Vec::new();
        let mut numeric_columns = Vec::new();

        for (i, dt) in dtypes.iter().enumerate() {
            let name = column_names[i].to_string();
            columns.push(ColumnMetadata {
                name: name.clone(),
                dtype: dt.to_string(),
            });

            if dt.is_numeric() {
                numeric_columns.push(name.clone());
            }
        }

        let time_range = if let Ok(ts_col) = df.column("ts") {
            let ts_series = ts_col.as_materialized_series();
            let unit_divisor = match ts_series.dtype() {
                DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
                DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
                DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
                DataType::Date => 1,
                _ => 1,
            };

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
                } else { None }
            } else { None }
        } else {
            None
        };

        Ok(Json(DatasetMetadata {
            total_rows,
            columns,
            numeric_columns,
            time_range,
        }))
    })
    .await
    .map_err(|e| AppError::Internal(format!("Failed to join blocking task: {:?}", e)))?
}
