//! `POST /api/drift/stats` — Temporal distribution drift analysis.
//!
//! Computes KS test, Wasserstein distance, and Population Stability Index (PSI)
//! for a numeric column across temporal windows compared to a reference window.

use axum::{Json, extract::State, response::IntoResponse};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::analytics;
use crate::error::AppError;
use crate::query;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct DriftRequest {
    /// Column to analyse drift for.
    pub column: String,
    /// Temporal window granularity: "hourly" | "daily" | "weekly"
    pub window: Option<String>,
    /// Start of the reference (baseline) window.
    pub reference_start: DateTime<Utc>,
    /// End of the reference (baseline) window.
    pub reference_end: DateTime<Utc>,
    /// Start of the current (monitoring) range.
    /// Defaults to `reference_end` if omitted.
    pub current_start: Option<DateTime<Utc>>,
    /// End of the current (monitoring) range.
    /// Defaults to the dataset's latest timestamp if omitted.
    pub current_end: Option<DateTime<Utc>>,
    /// Number of histogram / PSI bins (default: 10, clamped 4–50).
    pub n_bins: Option<usize>,
    /// KS test p-value threshold for alerting (default: 0.05, informational only).
    pub ks_threshold: Option<f64>,
    /// Wasserstein distance threshold (default: 0.1 × reference std).
    pub wasserstein_threshold: Option<f64>,
    /// PSI minor (yellow) threshold (default: 0.1).
    pub psi_minor_threshold: Option<f64>,
    /// PSI major (red) threshold (default: 0.2).
    pub psi_major_threshold: Option<f64>,
}

#[tracing::instrument(skip(state, payload))]
pub async fn post_drift_stats(
    State(state): State<AppState>,
    Json(payload): Json<DriftRequest>,
) -> Result<impl IntoResponse, AppError> {
    let df = state.dataset_snapshot().await;
    if df.height() == 0 {
        return Err(AppError::bad_request("Dataset is empty. Upload data first."));
    }

    // Validate column exists and is numeric
    let limits = &state.config.validation;
    let cols = Some(payload.column.clone());
    let parsed = query::parse_columns(&cols);
    let _validated = crate::validation::validate_numeric_columns(&df, &parsed, limits)?;

    // Convert reference and current times to dataset-native epoch-ms
    let multiplier = query::unit_multiplier_for_ts(&df)?;
    let ref_start_ms = payload.reference_start.timestamp_millis() as f64 * multiplier as f64;
    let ref_end_ms = payload.reference_end.timestamp_millis() as f64 * multiplier as f64;

    if ref_start_ms >= ref_end_ms {
        return Err(AppError::bad_request(
            "reference_start must be before reference_end",
        ));
    }

    // Determine monitoring range — default to [ref_end, dataset max]
    let ts_col = df
        .column("ts")
        .map(|c| c.as_materialized_series())
        .ok();
    let dataset_max_ms: f64 = ts_col
        .as_ref()
        .and_then(|s| {
            let cast = s.cast(&polars::prelude::DataType::Int64).ok()?;
            let max_val = cast.i64().ok()?.into_iter().flatten().max()?;
            Some(max_val as f64 * multiplier as f64)
        })
        .unwrap_or(ref_end_ms);

    let curr_start_ms = payload
        .current_start
        .map(|t| t.timestamp_millis() as f64 * multiplier as f64)
        .unwrap_or(ref_end_ms);
    let curr_end_ms = payload
        .current_end
        .map(|t| t.timestamp_millis() as f64 * multiplier as f64)
        .unwrap_or(dataset_max_ms);

    if curr_start_ms >= curr_end_ms {
        return Err(AppError::bad_request(
            "current monitoring range is empty — ensure current_start < current_end",
        ));
    }

    // Window size in milliseconds
    let window_str = payload.window.as_deref().unwrap_or("daily");
    let window_ms: i64 = match window_str {
        "hourly" => 3_600_000,
        "weekly" => 7 * 86_400_000,
        _ => 86_400_000, // daily default
    };

    let n_bins = payload.n_bins.unwrap_or(10).clamp(4, 50);
    let ks_threshold = payload.ks_threshold.unwrap_or(0.05).clamp(0.001, 1.0);
    let psi_minor = payload.psi_minor_threshold.unwrap_or(0.1).clamp(0.0, 1.0);
    let psi_major = payload.psi_major_threshold.unwrap_or(0.2).clamp(0.0, 1.0);

    // Wasserstein threshold defaults to a small fraction; computed after we
    // know the reference std, but we allow explicit override.
    // We'll pass through 0.0 to signal "auto" and let analytics compute it.
    let wasserstein_threshold = payload.wasserstein_threshold.unwrap_or(0.0);

    let column = payload.column.clone();
    let response = tokio::task::block_in_place(move || {
        analytics::compute_temporal_drift(
            &df,
            &column,
            window_ms,
            ref_start_ms,
            ref_end_ms,
            curr_start_ms,
            curr_end_ms,
            n_bins,
            ks_threshold,
            wasserstein_threshold,
            psi_minor,
            psi_major,
        )
    })?;

    Ok(Json(response))
}
