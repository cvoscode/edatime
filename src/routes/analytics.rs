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
use polars::prelude::{DataFrame, IntoLazy};

// ── Shared Helpers ─────────────────────────────────────────────────────────

/// Common preamble: validate time window, snapshot dataset, parse & validate
/// columns, compute time-range filter. Returns `(value_cols, filtered_df)`.
async fn filter_preamble(
    state: &AppState,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    columns: &Option<String>,
) -> Result<(Vec<String>, DataFrame), AppError> {
    validate_time_window(start, end)?;
    let df = state.dataset_snapshot().await;
    let cols = query::parse_columns(columns);
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns(&df, &cols, limits)?;
    let multiplier = query::unit_multiplier_for_ts(&df)?;
    let start_ts = start.timestamp_millis() * multiplier;
    let end_ts = end.timestamp_millis() * multiplier;
    let filtered = pipeline::filter_time_range(df.lazy(), start_ts, end_ts, &value_cols)?;
    Ok((value_cols, filtered))
}

/// Downsample a DataFrame by taking every Nth row when it exceeds `max_pts`.
fn downsample_by_stride(df: DataFrame, max_pts: usize, label: &str) -> Result<DataFrame, AppError> {
    if df.height() <= max_pts {
        return Ok(df);
    }
    let step = df.height() / max_pts;
    let indices: Vec<u32> = (0..df.height())
        .step_by(step.max(1))
        .take(max_pts)
        .map(|i| i as u32)
        .collect();
    use polars::prelude::NamedFrom;
    let idx_ca = polars::prelude::IdxCa::new("idx".into(), &indices);
    df.take(&idx_ca)
        .map_err(|e| AppError::internal(format!("{label} downsample: {e}")))
}

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
    let (value_cols, filtered) =
        filter_preamble(&state, params.start, params.end, &params.columns).await?;
    let window = params.window.unwrap_or(50).clamp(2, 10_000);

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
    let (value_cols, filtered) =
        filter_preamble(&state, params.start, params.end, &params.columns).await?;

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
    let (value_cols, filtered) =
        filter_preamble(&state, params.start, params.end, &params.columns).await?;

    let max_pts = params.max_points.unwrap_or(8192).clamp(64, 65536);
    let work_df = downsample_by_stride(filtered, max_pts, "FFT")?;

    let results =
        tokio::task::block_in_place(|| analytics::compute_fft(&work_df, &value_cols, None))?;

    Ok(Json(serde_json::json!({
        "sample_count": work_df.height(),
        "results": results,
    })))
}

// ── Spectrogram (STFT) ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SpectrogramQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub column: String,
    /// FFT window size in samples (default: 256)
    pub window_size: Option<usize>,
    /// Hop size in samples (default: window_size / 2)
    pub hop_size: Option<usize>,
    /// Max total samples (default: 32768)
    pub max_points: Option<usize>,
}

#[tracing::instrument(skip(state))]
pub async fn get_spectrogram(
    State(state): State<AppState>,
    Query(params): Query<SpectrogramQuery>,
) -> Result<impl IntoResponse, AppError> {
    let col_opt = Some(params.column.clone());
    let (value_cols, filtered) =
        filter_preamble(&state, params.start, params.end, &col_opt).await?;
    let col = &value_cols[0];

    let max_pts = params.max_points.unwrap_or(32768).clamp(256, 131072);
    let work_df = downsample_by_stride(filtered, max_pts, "Spectrogram")?;

    let win_size = params.window_size.unwrap_or(256).clamp(16, 4096);
    let hop = params.hop_size.unwrap_or(win_size / 2).clamp(1, win_size);

    let result = tokio::task::block_in_place(|| {
        analytics::compute_spectrogram(&work_df, col, win_size, hop)
    })?;

    Ok(Json(serde_json::json!({
        "sample_count": work_df.height(),
        "result": result,
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

// ── Outlier Removal ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct OutlierRemovalRequest {
    /// Columns to check for outliers (comma-separated or JSON array)
    pub columns: Option<String>,
    /// Detection method: "zscore" (default) or "iqr"
    pub method: Option<String>,
    /// Threshold: z-score cutoff (default 3.0) or IQR multiplier (default 1.5)
    pub threshold: Option<f64>,
    /// If set, use rolling window approach with this window size
    pub window: Option<usize>,
}

#[tracing::instrument(skip(state))]
pub async fn post_remove_outliers(
    State(state): State<AppState>,
    Json(params): Json<OutlierRemovalRequest>,
) -> Result<impl IntoResponse, AppError> {
    let df = state.dataset_snapshot().await;
    let cols = query::parse_columns(&params.columns);
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns(&df, &cols, limits)?;

    let method = params.method.as_deref().unwrap_or("zscore");
    let threshold = params
        .threshold
        .unwrap_or(if method == "iqr" { 1.5 } else { 3.0 });

    let (new_df, result) = tokio::task::block_in_place(|| {
        if let Some(window) = params.window {
            analytics::remove_outliers_windowed(&df, &value_cols, method, threshold, window)
        } else {
            analytics::remove_outliers_global(&df, &value_cols, method, threshold)
        }
    })?;

    let _revision = state.replace_dataset(new_df).await;
    state.cache.invalidate_all().await;

    Ok(Json(serde_json::json!(result)))
}

// ── Time Distributions ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct TimeDistributionQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    /// Number of time windows (default: 20)
    pub windows: Option<usize>,
    /// Number of histogram bins per window (default: 24)
    pub bins: Option<usize>,
}

#[tracing::instrument(skip(state))]
pub async fn get_time_distributions(
    State(state): State<AppState>,
    Query(params): Query<TimeDistributionQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (value_cols, filtered) =
        filter_preamble(&state, params.start, params.end, &params.columns).await?;

    let n_windows = params.windows.unwrap_or(20);
    let n_bins = params.bins.unwrap_or(24);

    let results = tokio::task::block_in_place(|| {
        analytics::compute_time_distributions(&filtered, &value_cols, n_windows, n_bins)
    })?;

    Ok(Json(serde_json::json!({
        "columns": results,
    })))
}

// ── Causal Graph (Native Rust — PCMCI / PCMCI+) ───────────────────────────

#[derive(Debug, Deserialize)]
pub struct CausalGraphRequest {
    pub columns: Option<String>,
    /// Maximum time lag (default: 3)
    pub tau_max: Option<usize>,
    /// Significance level for PC condition selection (default: 0.2)
    pub pc_alpha: Option<f64>,
    /// Final significance level for MCI tests (default: 0.05)
    pub alpha: Option<f64>,
    /// "pcmci" (default), "pcmciplus", "fullci", "bivci", "lpcmci"
    pub method: Option<String>,
    /// Independence test: "par_corr" (default), "cmi_knn", "robust_parcorr",
    /// "gsquared", "cmi_symb"
    pub test: Option<String>,
    /// Max data points (default: 5000)
    pub max_points: Option<usize>,
    /// Max condition set dimension for PC step
    pub max_conds_dim: Option<usize>,
    /// FDR correction: "none" (default) or "fdr_bh"
    pub fdr_method: Option<String>,
    /// Number of preliminary iterations for LPCMCI (default: 1)
    pub n_preliminary_iterations: Option<usize>,
}

#[tracing::instrument(skip(state))]
pub async fn post_causal_graph(
    State(state): State<AppState>,
    Json(params): Json<CausalGraphRequest>,
) -> Result<impl IntoResponse, AppError> {
    let df = state.dataset_snapshot().await;
    let cols = query::parse_columns(&params.columns);
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns(&df, &cols, limits)?;

    if value_cols.len() < 2 {
        return Err(AppError::bad_request("Need at least 2 numeric columns"));
    }
    if value_cols.len() > 20 {
        return Err(AppError::bad_request("Too many columns (max 20)"));
    }

    let tau_max = params.tau_max.unwrap_or(3).clamp(1, 10);
    let pc_alpha = params.pc_alpha.unwrap_or(0.2).clamp(0.001, 0.5);
    let alpha = params.alpha.unwrap_or(0.05).clamp(0.001, 0.5);
    let method = params.method.as_deref().unwrap_or("pcmci").to_string();
    let max_pts = params.max_points.unwrap_or(5000).clamp(100, 50_000);
    let max_conds_dim = params.max_conds_dim;
    let fdr_method = params.fdr_method.clone().unwrap_or_else(|| "none".to_string());

    let test_kind = match params.test.as_deref() {
        Some("cmi_knn") => crate::causal::IndependenceTestKind::CmiKnn,
        Some("robust_parcorr") => crate::causal::IndependenceTestKind::RobustParCorr,
        Some("gsquared") => crate::causal::IndependenceTestKind::Gsquared,
        Some("cmi_symb") => crate::causal::IndependenceTestKind::CmiSymb,
        _ => crate::causal::IndependenceTestKind::ParCorr,
    };

    let n_preliminary_iterations = params.n_preliminary_iterations.unwrap_or(1).clamp(0, 5);

    // Build CausalDataFrame directly from Polars DataFrame
    let causal_df = tokio::task::block_in_place(|| {
        crate::causal::CausalDataFrame::from_polars(&df, &value_cols, max_pts)
    })?;

    // Run causal discovery on the blocking thread pool (CPU-intensive)
    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        use crate::causal::{CondIndTest, Pcmci, PcmciPlus};
        use crate::causal::pcmci::PcmciConfig;

        let cond_test = CondIndTest::new(test_kind);

        let config = PcmciConfig {
            tau_min: if method == "pcmciplus" || method == "lpcmci" { 0 } else { 1 },
            tau_max,
            pc_alpha,
            alpha_level: alpha,
            max_conds_dim,
            max_combinations: 1,
            max_conds_py: None,
            max_conds_px: None,
            fdr_method,
        };

        let causal_result = match method.as_str() {
            "pcmciplus" => {
                let engine = PcmciPlus::new(&causal_df, &cond_test);
                engine.run(&config)
            }
            "fullci" => {
                let engine = Pcmci::new(&causal_df, &cond_test);
                engine.run_fullci(&config)
            }
            "bivci" => {
                let engine = Pcmci::new(&causal_df, &cond_test);
                engine.run_bivci(&config)
            }
            "lpcmci" => {
                let engine = crate::causal::Lpcmci::new(&causal_df, &cond_test);
                engine.run(&config, n_preliminary_iterations)
            }
            _ => {
                let engine = Pcmci::new(&causal_df, &cond_test);
                engine.run(&config)
            }
        };

        serde_json::to_value(&causal_result)
            .map_err(|e| AppError::internal(format!("Serialize causal result: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

    Ok(Json(result))
}
