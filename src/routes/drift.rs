//! `POST /api/drift/stats` — Temporal drift analysis for a single column.

use axum::{extract::State, response::Response, Json};
use chrono::{DateTime, NaiveDateTime, Utc};
use polars::prelude::col;
use serde::Deserialize;

use crate::analytics::compute_temporal_drift;
use crate::error::AppError;
use crate::pipeline::filter_time_range;
use crate::state::AppState;
use crate::validation::validate_time_window;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftQuery {
    pub column: String,
    pub window: String,
    pub reference_start: String,
    pub reference_end: String,
}

fn window_ms(window: &str) -> i64 {
    match window {
        "hourly" => 3600 * 1000,
        "weekly" => 7 * 24 * 3600 * 1000,
        _ => 24 * 3600 * 1000, // daily
    }
}

fn parse_datetime(s: &str) -> Result<DateTime<Utc>, AppError> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Ok(dt.with_timezone(&Utc));
    }
    let ndt = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M")
        .map_err(|_| AppError::bad_request(format!("invalid datetime '{}'", s)))?;
    Ok(DateTime::from_naive_utc_and_offset(ndt, Utc))
}

#[tracing::instrument(skip(state))]
pub async fn post_drift_stats(
    State(state): State<AppState>,
    Json(query): Json<DriftQuery>,
) -> Result<Response, AppError> {
    let window_size = window_ms(&query.window);

    let ref_start = parse_datetime(&query.reference_start)?;
    let ref_end = parse_datetime(&query.reference_end)?;
    validate_time_window(ref_start, ref_end)?;

    let lf = state.dataset_snapshot();
    let ctx = state.ts_context(&lf)?;
    let ts_col = ctx.ts_col;
    let multiplier = ctx.multiplier;

    let ref_start_ms = ref_start.timestamp_millis() * multiplier;
    let ref_end_ms = ref_end.timestamp_millis() * multiplier;

    // Collect once to find max timestamp
    let lf_max = lf.clone();
    let max_ts_i64: i64 = tokio::task::block_in_place(|| {
        let df = match lf_max
            .select([col(&ts_col).cast(polars::prelude::DataType::Int64).max()])
            .collect()
        {
            Ok(df) => df,
            Err(_) => return ref_end_ms,
        };
        let col = match df.get_column_names().first() {
            Some(n) => match df.column(n) {
                Ok(c) => c,
                Err(_) => return ref_end_ms,
            },
            None => return ref_end_ms,
        };
        match col.as_materialized_series().get(0) {
            Ok(v) => v.try_extract::<i64>().unwrap_or(ref_end_ms),
            Err(_) => ref_end_ms,
        }
    });

    let curr_start_ms = ref_end_ms as f64;
    let curr_end_ms = max_ts_i64 as f64;

    // filter_time_range now returns LazyFrame; collect once for compute_temporal_drift
    let filtered_lf = filter_time_range(lf, ref_start_ms, max_ts_i64, &[], &ts_col)?;
    let df = tokio::task::block_in_place(|| {
        filtered_lf.with_new_streaming(true).collect()
    })
    .map_err(|e| AppError::io(e.to_string()))?;

    // Normalize multiplier:
    // we convert from whatever unit the column uses back to ms
    let result = compute_temporal_drift(
        &df,
        &query.column,
        window_size,
        ref_start_ms as f64,
        ref_end_ms as f64,
        curr_start_ms,
        curr_end_ms,
        20,  // n_bins
        0.05,   // ks_threshold
        0.0,    // wasserstein_threshold (derive from data)
        0.1,    // psi_minor
        0.2,    // psi_major
    )?;

    let body =
        serde_json::to_string(&result).map_err(|e| AppError::internal(e.to_string()))?;
    Response::builder()
        .header("content-type", "application/json")
        .body(body.into())
        .map_err(|e| AppError::internal(e.to_string()))
}