use axum::{
    extract::{Query, State},
    Json,
    response::{IntoResponse, Response},
    http::header,
};
use serde::Deserialize;
use chrono::{DateTime, Utc};
use polars::prelude::*;
use serde_json::json;

use crate::state::AppState;
use crate::arrow_export::dataframe_to_arrow_ipc;
use crate::error::AppError;

#[derive(Deserialize, Debug)]
pub struct DataQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub width: usize,
    pub columns: Option<String>,
    pub format: Option<String>,
}

#[tracing::instrument(skip(state))]
pub async fn get_data(
    State(state): State<AppState>,
    Query(query): Query<DataQuery>,
) -> Result<Response, AppError> {
    tracing::info!("get_data endpoint called with params: {:?}", query);
    
    let df_lock = state.df.read().await;
    let df = df_lock.clone();

    // Support comma-separated columns
    let value_col_str = query.columns.unwrap_or_else(|| "value".to_string());
    let value_cols: Vec<&str> = value_col_str.split(',').collect();

    if value_cols.is_empty() {
        return Err(AppError::BadRequest("No columns provided".into()));
    }

    let ts_dtype = df
        .column("ts")
        .map_err(|e| AppError::BadRequest(format!("Missing ts column: {}", e)))?
        .as_materialized_series()
        .dtype()
        .clone();

    let unit_multiplier: i64 = match ts_dtype {
        DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
        DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
        DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
        _ => 1_000,
    };

    let start_ts = query.start.timestamp_millis() * unit_multiplier;
    let end_ts = query.end.timestamp_millis() * unit_multiplier;

    let mut select_exprs = vec![col("ts")];
    for &c in &value_cols {
        select_exprs.push(col(c));
    }

    let filtered_df = tokio::task::block_in_place(|| {
        df.lazy()
            .filter(col("ts").cast(DataType::Int64).gt_eq(lit(start_ts)))
            .filter(col("ts").cast(DataType::Int64).lt_eq(lit(end_ts)))
            .select(select_exprs)
            .collect()
    }).map_err(|e| AppError::PolarsError(e.to_string()))?;

    // Drop lock as soon as possible
    drop(df_lock);
    
    let target_points = query.width * 2;

    let downsampled = downsample_multi_columns(&filtered_df, "ts", &value_cols, target_points)
        .map_err(|e| AppError::Internal(format!("Failed to downsample multi: {:?}", e)))?;

    let requested_format = query.format.as_deref().unwrap_or("arrow");
    if requested_format.eq_ignore_ascii_case("json") {
        let ts_ms_divisor: i64 = match ts_dtype {
            DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
            DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
            DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
            DataType::Date => 1,
            _ => 1,
        };

        let ts_series = downsampled
            .column("ts")
            .map_err(|e| AppError::Internal(format!("Missing ts in downsampled frame: {}", e)))?
            .as_materialized_series()
            .cast(&DataType::Int64)
            .map_err(|e| AppError::Internal(format!("Failed to cast ts to i64: {}", e)))?;

        let ts: Vec<f64> = ts_series
            .i64()
            .map_err(|e| AppError::Internal(format!("Failed to view ts as i64: {}", e)))?
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
        for &col_name in &value_cols {
            let col_series = downsampled
                .column(col_name)
                .map_err(|e| AppError::Internal(format!("Missing column '{}' in downsampled frame: {}", col_name, e)))?
                .as_materialized_series()
                .cast(&DataType::Float64)
                .map_err(|e| AppError::Internal(format!("Failed to cast '{}' to f64: {}", col_name, e)))?;

            let vals: Vec<f64> = col_series
                .f64()
                .map_err(|e| AppError::Internal(format!("Failed to read '{}' as f64: {}", col_name, e)))?
                .into_iter()
                .map(|v| v.unwrap_or(f64::NAN))
                .collect();

            values.insert(col_name.to_string(), json!(vals));
        }

        return Ok(Json(json!({
            "ts": ts,
            "values": values,
        }))
        .into_response());
    }

    let ipc_bytes = dataframe_to_arrow_ipc(downsampled)
        .map_err(|e| AppError::Internal(format!("Failed to serialize to arrow ipc: {:?}", e)))?;

    tracing::debug!("Successfully generated IPC response of {} bytes", ipc_bytes.len());

    Ok((
        [(header::CONTENT_TYPE, "application/vnd.apache.arrow.stream")],
        ipc_bytes,
    ).into_response())
}

fn downsample_multi_columns(
    df: &DataFrame,
    ts_col: &str,
    value_cols: &[&str],
    target_points: usize,
) -> PolarsResult<DataFrame> {
    if df.height() <= target_points {
        return Ok(df.clone());
    }

    crate::downsample::downsample_dataframe_multi(df, ts_col, value_cols, target_points)
}
