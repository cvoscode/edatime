//! `GET /api/analytics/rolling` — rolling statistics bands
//! `GET /api/analytics/anomalies` — anomaly detection
//! `GET /api/analytics/fft` — frequency-domain analysis
//! `POST /api/transform` — column transformation expressions

use axum::{
    Json,
    extract::{Query, State},
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::analytics;
use crate::error::AppError;
use crate::pipeline;
use crate::query;
use crate::state::AppState;
use crate::validation::{validate_numeric_columns, validate_time_window};
use polars::prelude::IntoLazy;

// ── Rolling Statistics ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RollingQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    /// Rolling window size in number of samples (default: 50)
    pub window: Option<usize>,
}

#[tracing::instrument(skip(state))]
pub async fn get_rolling(
    State(state): State<AppState>,
    Query(params): Query<RollingQuery>,
) -> Result<impl IntoResponse, AppError> {
    validate_time_window(params.start, params.end)?;

    let df = state.dataset_snapshot().await;
    let cols = query::parse_columns(&params.columns);
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns(&df, &cols, limits)?;
    let window = params.window.unwrap_or(50).clamp(2, 10_000);

    let multiplier = query::unit_multiplier_for_ts(&df)?;
    let start_ts = params.start.timestamp_millis() * multiplier;
    let end_ts = params.end.timestamp_millis() * multiplier;

    let filtered = pipeline::filter_time_range(df.lazy(), start_ts, end_ts, &value_cols)?;

    let bands = tokio::task::block_in_place(|| {
        analytics::compute_rolling_bands(&filtered, &value_cols, window)
    })?;

    Ok(Json(serde_json::json!({ "bands": bands })))
}

// ── Anomaly Detection ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AnomalyQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    /// Detection method: "zscore" (default) or "iqr"
    pub method: Option<String>,
    /// Threshold for zscore (default: 3.0) or IQR multiplier (default: 1.5)
    pub threshold: Option<f64>,
}

#[tracing::instrument(skip(state))]
pub async fn get_anomalies(
    State(state): State<AppState>,
    Query(params): Query<AnomalyQuery>,
) -> Result<impl IntoResponse, AppError> {
    validate_time_window(params.start, params.end)?;

    let df = state.dataset_snapshot().await;
    let cols = query::parse_columns(&params.columns);
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns(&df, &cols, limits)?;

    let multiplier = query::unit_multiplier_for_ts(&df)?;
    let start_ts = params.start.timestamp_millis() * multiplier;
    let end_ts = params.end.timestamp_millis() * multiplier;

    let filtered = pipeline::filter_time_range(df.lazy(), start_ts, end_ts, &value_cols)?;

    let method = params.method.as_deref().unwrap_or("zscore");
    let regions = tokio::task::block_in_place(|| match method {
        "iqr" => {
            let k = params.threshold.unwrap_or(1.5);
            analytics::detect_anomalies_iqr(&filtered, &value_cols, k)
        }
        _ => {
            let threshold = params.threshold.unwrap_or(3.0);
            analytics::detect_anomalies_zscore(&filtered, &value_cols, threshold)
        }
    })?;

    Ok(Json(serde_json::json!({
        "method": method,
        "threshold": params.threshold.unwrap_or(if method == "iqr" { 1.5 } else { 3.0 }),
        "regions": regions,
    })))
}

// ── FFT / PSD ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct FftQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    /// Max points for FFT (default: 8192, will downsample if data is larger)
    pub max_points: Option<usize>,
}

#[tracing::instrument(skip(state))]
pub async fn get_fft(
    State(state): State<AppState>,
    Query(params): Query<FftQuery>,
) -> Result<impl IntoResponse, AppError> {
    validate_time_window(params.start, params.end)?;

    let df = state.dataset_snapshot().await;
    let cols = query::parse_columns(&params.columns);
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns(&df, &cols, limits)?;

    let multiplier = query::unit_multiplier_for_ts(&df)?;
    let start_ts = params.start.timestamp_millis() * multiplier;
    let end_ts = params.end.timestamp_millis() * multiplier;

    let filtered = pipeline::filter_time_range(df.lazy(), start_ts, end_ts, &value_cols)?;

    // Downsample if too many points
    let max_pts = params.max_points.unwrap_or(8192).clamp(64, 65536);
    let work_df = if filtered.height() > max_pts {
        // Take every Nth row via lazy slice
        let step = filtered.height() / max_pts;
        let indices: Vec<u32> = (0..filtered.height())
            .step_by(step.max(1))
            .take(max_pts)
            .map(|i| i as u32)
            .collect();
        use polars::prelude::NamedFrom;
        let idx_ca = polars::prelude::IdxCa::new("idx".into(), &indices);
        filtered
            .take(&idx_ca)
            .map_err(|e| AppError::internal(format!("FFT downsample: {e}")))?
    } else {
        filtered
    };

    let results =
        tokio::task::block_in_place(|| analytics::compute_fft(&work_df, &value_cols, None))?;

    Ok(Json(serde_json::json!({
        "sample_count": work_df.height(),
        "results": results,
    })))
}

// ── Column Transformation ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct TransformRequest {
    /// Expression string, e.g. "col_a / col_b" or "log(col_a)"
    pub expression: String,
    /// Name for the output column
    pub output_name: String,
}

#[tracing::instrument(skip(state))]
pub async fn post_transform(
    State(state): State<AppState>,
    Json(params): Json<TransformRequest>,
) -> Result<impl IntoResponse, AppError> {
    let expression = params.expression.trim().to_string();
    let output_name = params.output_name.trim().to_string();

    if expression.is_empty() {
        return Err(AppError::bad_request("Expression is empty"));
    }
    if output_name.is_empty() || output_name == "ts" {
        return Err(AppError::bad_request("Invalid output column name"));
    }
    // Safety: limit expression length to prevent abuse
    if expression.len() > 500 {
        return Err(AppError::bad_request("Expression too long (max 500 chars)"));
    }

    let df = state.dataset_snapshot().await;

    let new_df = tokio::task::block_in_place(|| {
        analytics::apply_column_transform(&df, &expression, &output_name)
    })?;

    let _revision = state.replace_dataset(new_df).await;
    state.cache.invalidate_all().await;

    Ok(Json(serde_json::json!({
        "status": "ok",
        "column": output_name,
        "expression": expression,
    })))
}
