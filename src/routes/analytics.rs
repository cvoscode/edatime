//! `GET /api/analytics/rolling` — rolling statistics bands
//! `GET /api/analytics/anomalies` — anomaly detection
//! `GET /api/analytics/fft` — frequency-domain analysis
//! `POST /api/transform` — column transformation expressions

use std::sync::Arc;

use axum::{
    Json,
    extract::{Query, State},
    response::IntoResponse,
};
use chrono::{DateTime, Utc, TimeZone};
use serde::Deserialize;

use crate::analytics;
use crate::error::AppError;
use crate::query;
use crate::routes::shared::{downsample_by_stride, filter_preamble};
use crate::state::AppState;
use crate::validation::validate_numeric_columns_lazy;

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
        filter_preamble(&state, params.start, params.end, params.columns.as_deref()).await?;
    let params = Arc::new(params);

    let bands = tokio::task::spawn_blocking({
        let params = params.clone();
        let filtered = filtered.clone();
        let value_cols = value_cols.clone();
        move || analytics::compute_rolling_bands(&filtered, &value_cols, params.window.unwrap_or(50).clamp(2, 10_000))
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

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
    let params = Arc::new(params);
    let (value_cols, filtered) =
        filter_preamble(&state, params.start, params.end, params.columns.as_deref()).await?;

    let method = params.method.as_deref().unwrap_or("zscore");
    let regions = tokio::task::spawn_blocking({
        let params = params.clone();
        let filtered = filtered.clone();
        let value_cols = value_cols.clone();
        let method = method.to_string();
        move || match method.as_str() {
            "iqr" => {
                let k = params.threshold.unwrap_or(1.5);
                analytics::detect_anomalies_iqr(&filtered, &value_cols, k)
            }
            _ => {
                let threshold = params.threshold.unwrap_or(3.0);
                analytics::detect_anomalies_zscore(&filtered, &value_cols, threshold)
            }
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

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
        filter_preamble(&state, params.start, params.end, params.columns.as_deref()).await?;

    let max_pts = params.max_points.unwrap_or(8192).max(64);
    let work_df = downsample_by_stride(filtered, max_pts, "FFT")?;

    let results = tokio::task::spawn_blocking({
        let work_df = work_df.clone();
        let value_cols = value_cols.clone();
        move || analytics::compute_fft(&work_df, &value_cols, None)
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

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
    let (value_cols, filtered) =
        filter_preamble(&state, params.start, params.end, Some(params.column.as_str())).await?;
    let col = &value_cols[0];

    let max_pts = params.max_points.unwrap_or(32768).max(256);
    let work_df = downsample_by_stride(filtered, max_pts, "Spectrogram")?;

    let win_size = params.window_size.unwrap_or(256).clamp(16, 4096);
    let hop = params.hop_size.unwrap_or(win_size / 2).clamp(1, win_size);

    let result = tokio::task::spawn_blocking({
        let work_df = work_df.clone();
        let col = col.to_string();
        move || analytics::compute_spectrogram(&work_df, &col, win_size, hop)
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

    Ok(Json(serde_json::json!({
        "sample_count": work_df.height(),
        "result": result,
    })))
}

// ── Spectral Filter ────────────────────────────────────────────────────────

/// `GET /api/analytics/spectral-filter` — apply frequency-domain filter, return filtered signal
#[derive(Debug, Deserialize)]
pub struct SpectralFilterQuery {
    /// Start of the time range. Defaults to the dataset's earliest timestamp when omitted.
    pub start: Option<DateTime<Utc>>,
    /// End of the time range. Defaults to the dataset's latest timestamp when omitted.
    pub end: Option<DateTime<Utc>>,
    pub column: String,
    /// Filter type: lowpass | highpass | bandpass | bandstop
    pub filter_type: String,
    /// Low cutoff frequency in Hz (required for highpass, bandpass, bandstop)
    pub low_hz: Option<f64>,
    /// High cutoff frequency in Hz (required for lowpass, bandpass, bandstop)
    pub high_hz: Option<f64>,
    /// Override sample rate (auto-detected from data if not provided)
    pub sample_rate_hz: Option<f64>,
    /// Max points (default: 16384)
    pub max_points: Option<usize>,
}

#[tracing::instrument(skip(state))]
pub async fn get_spectral_filter(
    State(state): State<AppState>,
    Query(params): Query<SpectralFilterQuery>,
) -> Result<impl IntoResponse, AppError> {
    let col_opt = Some(params.column.clone());

    // Resolve optional start/end from dataset time range when not provided.
    let (start, end) = match (params.start, params.end) {
        (Some(s), Some(e)) => (s, e),
        (opt_s, opt_e) => {
            let lf_snap = state.dataset_snapshot().await.read().await.clone();
            let ctx = state.ts_context(&lf_snap)?;
            let ts_col = ctx.ts_col;
            let multiplier = ctx.multiplier;
            let df_snap = lf_snap
                .with_new_streaming(true)
                .collect()
                .map_err(|e| AppError::io(format!("ts probe failed: {e}")))?;
            let ts_col_series = df_snap
                .column(&ts_col)
                .map_err(|e| AppError::bad_request(format!("Missing ts column '{}': {}", ts_col, e)))?
                .as_materialized_series();
            let cast = ts_col_series
                .cast(&polars::prelude::DataType::Int64)
                .map_err(|e| AppError::internal(format!("ts cast failed: {e}")))?;
            let ca = cast
                .i64()
                .map_err(|e| AppError::internal(format!("ts i64 failed: {e}")))?;
            let min_native = ca.into_iter().flatten().min().unwrap_or(0);
            let max_native = ca.into_iter().flatten().max().unwrap_or(0);
            let min_ms = min_native / multiplier;
            let max_ms = max_native / multiplier;
            let epoch_zero = || -> DateTime<Utc> {
                Utc.with_ymd_and_hms(1970, 1, 1, 0, 0, 0)
                    .single()
                    .unwrap_or(Utc::now())
            };
            let dataset_start = DateTime::from_timestamp_millis(min_ms)
                .unwrap_or_else(epoch_zero);
            let dataset_end = DateTime::from_timestamp_millis(max_ms)
                .unwrap_or_else(epoch_zero);
            (opt_s.unwrap_or(dataset_start), opt_e.unwrap_or(dataset_end))
        }
    };

    let (value_cols, filtered) =
        filter_preamble(&state, start, end, col_opt.as_deref()).await?;
    let col = &value_cols[0];

    let max_pts = params.max_points.unwrap_or(16384).clamp(64, 65536);
    let work_df = downsample_by_stride(filtered, max_pts, "SpectralFilter")?;

    let filter_type: analytics::FilterType = match params.filter_type.as_str() {
        "lowpass" => analytics::FilterType::Lowpass,
        "highpass" => analytics::FilterType::Highpass,
        "bandpass" => analytics::FilterType::Bandpass,
        "bandstop" => analytics::FilterType::Bandstop,
        other => {
            return Err(AppError::bad_request(format!(
                "Unknown filter_type: {other}"
            )));
        }
    };

    let low_hz = params.low_hz;
    let high_hz = params.high_hz;
    let sr = params.sample_rate_hz;

    let (ts_ms, filtered_values) = tokio::task::spawn_blocking({
        let work_df = work_df.clone();
        let col = col.to_string();
        move || analytics::apply_spectral_filter(&work_df, &col, filter_type, low_hz, high_hz, sr)
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

    Ok(Json(serde_json::json!({
        "column": col,
        "ts": ts_ms,
        "values": filtered_values,
        "filter_type": params.filter_type,
        "low_hz": low_hz,
        "high_hz": high_hz,
        "sample_count": ts_ms.len(),
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

    let lf = state.dataset_snapshot().await.read().await.clone();

    let new_df = tokio::task::spawn_blocking({
        let lf = lf.clone();
        let expression = expression.clone();
        let output_name = output_name.clone();
        move || analytics::apply_column_transform_lazy(&lf, &expression, &output_name)
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

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
    let lf = state.dataset_snapshot().await.read().await.clone();
    let cols = query::parse_columns(params.columns.as_deref());
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns_lazy(&lf, &cols, limits)?;
    let df = lf.with_new_streaming(true).collect().map_err(|e| AppError::io(e.to_string()))?;

    let method = params.method.as_deref().unwrap_or("zscore");
    let threshold = params
        .threshold
        .unwrap_or(if method == "iqr" { 1.5 } else { 3.0 });

    let (new_df, result) = tokio::task::spawn_blocking({
        let df = df.clone();
        let value_cols = value_cols.clone();
        let method = method.to_string();
        move || {
            if let Some(window) = params.window {
                analytics::remove_outliers_windowed(&df, &value_cols, &method, threshold, window)
            } else {
                analytics::remove_outliers_global(&df, &value_cols, &method, threshold)
            }
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

    let _revision = state.replace_dataset(new_df).await;
    state.cache.invalidate_all().await;

    Ok(Json(serde_json::json!(result)))
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
    /// Number of nearest neighbors for CMI-KNN test (default: 10)
    pub knn: Option<usize>,
    /// Number of shuffle samples for CMI-KNN significance test (default: 200)
    pub sig_samples: Option<usize>,
}

#[tracing::instrument(skip(state))]
pub async fn post_causal_graph(
    State(state): State<AppState>,
    Json(params): Json<CausalGraphRequest>,
) -> Result<impl IntoResponse, AppError> {
    let lf = state.dataset_snapshot().await.read().await.clone();
    let cols = query::parse_columns(params.columns.as_deref());
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns_lazy(&lf, &cols, limits)?;

    if value_cols.len() < 2 {
        return Err(AppError::bad_request("Need at least 2 numeric columns"));
    }
    if value_cols.len() > 20 {
        return Err(AppError::bad_request("Too many columns (max 20)"));
    }
    let df = lf.with_new_streaming(true).collect().map_err(|e| AppError::io(e.to_string()))?;

    let tau_max = params.tau_max.unwrap_or(3).clamp(1, 10);
    let pc_alpha = params.pc_alpha.unwrap_or(0.2).clamp(0.001, 0.5);
    let alpha = params.alpha.unwrap_or(0.05).clamp(0.001, 0.5);
    let method = params.method.as_deref().unwrap_or("pcmci").to_string();
    let max_pts = params.max_points.unwrap_or(5000).clamp(100, 50_000);
    let max_conds_dim = params.max_conds_dim;
    let fdr_method = params
        .fdr_method
        .clone()
        .unwrap_or_else(|| "none".to_string());

    let test_kind = match params.test.as_deref() {
        Some("cmi_knn") => crate::causal::IndependenceTestKind::CmiKnn,
        Some("robust_parcorr") => crate::causal::IndependenceTestKind::RobustParCorr,
        Some("gsquared") => crate::causal::IndependenceTestKind::Gsquared,
        Some("cmi_symb") => crate::causal::IndependenceTestKind::CmiSymb,
        _ => crate::causal::IndependenceTestKind::ParCorr,
    };

    let n_preliminary_iterations = params.n_preliminary_iterations.unwrap_or(1).clamp(0, 5);
    let knn = params.knn.unwrap_or(10).clamp(1, 100);
    let sig_samples = params.sig_samples.unwrap_or(200).clamp(10, 1000);

    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        use crate::causal::pcmci::PcmciConfig;
        use crate::causal::{CondIndTest, Pcmci, PcmciPlus};

        let causal_df = crate::causal::CausalDataFrame::from_polars(&df, &value_cols, max_pts)?;

        let mut cond_test = CondIndTest::new(test_kind);
        cond_test.knn = knn;
        cond_test.sig_samples = sig_samples;

        let config = PcmciConfig {
            tau_min: if method == "pcmciplus" || method == "lpcmci" {
                0
            } else {
                1
            },
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
