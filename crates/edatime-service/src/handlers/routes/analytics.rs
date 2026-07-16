//! `GET /api/analytics/rolling` — rolling statistics bands
//! `GET /api/analytics/anomalies` — anomaly detection
//! `GET /api/analytics/fft` — frequency-domain analysis

use std::sync::Arc;

use axum::{
    Json,
    extract::{Query, State},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::Value;

use crate::analytics;
use crate::error::AppError;
use crate::handlers::routes::shared::{
    ExecutionIdentity, add_execution_identity_headers, current_execution_identity,
    downsample_by_stride, filter_preamble_with_plan,
};
use edatime_query::query;
use edatime_query::validation::validate_numeric_columns_lazy;
use edatime_store::state::AppState;

// ── Rolling Statistics ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RollingQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    /// Rolling window size in number of samples (default: 50)
    pub window: Option<usize>,
    pub cleaning_plan: Option<String>,
}

fn analytics_response<T: serde::Serialize>(value: T, identity: &ExecutionIdentity) -> Response {
    add_execution_identity_headers(Json(value).into_response(), identity)
}

/// Decode a POST analytics body while requiring a real plan envelope instead
/// of URL-encoded JSON. The existing GET query structs keep the serialized
/// envelope string for backwards compatibility; all execution still runs
/// through the same validated preamble.
fn decode_plan_aware_post<T: DeserializeOwned>(mut value: Value) -> Result<T, AppError> {
    if let Some(plan) = value.get_mut("cleaning_plan") {
        let envelope: crate::handlers::routes::cleaning::PlanRequestEnvelope =
            serde_json::from_value(std::mem::take(plan)).map_err(|error| {
                AppError::bad_request(format!("Invalid cleaning plan envelope: {error}"))
            })?;
        *plan = Value::String(serde_json::to_string(&envelope).map_err(|error| {
            AppError::internal(format!("Serialize cleaning plan envelope: {error}"))
        })?);
    }
    serde_json::from_value(value)
        .map_err(|error| AppError::bad_request(format!("Invalid analytics request: {error}")))
}

#[tracing::instrument(skip(state))]
pub async fn get_rolling(
    State(state): State<AppState>,
    Query(params): Query<RollingQuery>,
) -> Result<Response, AppError> {
    let (value_cols, filtered, identity) = filter_preamble_with_plan(
        &state,
        params.start,
        params.end,
        params.columns.as_deref(),
        params.cleaning_plan.as_deref(),
    )
    .await?;
    let params = Arc::new(params);
    let metrics = Arc::clone(&state.metrics);

    // Phase 0.1: capture the route-level window clamp bounds before the
    // window is moved into the spawn_blocking closure so the telemetry
    // record reflects the same value the worker actually computed on.
    let window = params.window.unwrap_or(50).clamp(2, 10_000);
    let rows_in = filtered.height() as u64;
    let columns_in = value_cols.len() as u64;

    let queue_start = std::time::Instant::now();
    metrics.record_cpu_submit(edatime_core::metrics::CpuStage::Analytics);
    let closure_metrics = Arc::clone(&metrics);
    // Carry compute_ns out of the closure so the single rolling telemetry
    // record reflects both the worker compute time and the post-spawn
    // response-byte measurement.
    let compute_ns_holder = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let holder_for_closure = Arc::clone(&compute_ns_holder);
    let bands = tokio::task::spawn_blocking({
        let filtered = filtered.clone();
        let value_cols = value_cols.clone();
        move || {
            let queue_wait_ns = queue_start.elapsed().as_nanos() as u64;
            closure_metrics
                .record_cpu_started(edatime_core::metrics::CpuStage::Analytics, queue_wait_ns);
            let compute_start = std::time::Instant::now();
            let result = analytics::compute_rolling_bands(&filtered, &value_cols, window);
            let compute_ns = compute_start.elapsed().as_nanos() as u64;
            closure_metrics.record_cpu_completed(edatime_core::metrics::CpuStage::Analytics);
            // Stash compute_ns for the outer-scope record. We only stash
            // on the success path so the metric describes a real
            // computation, not a validation failure bubbling up.
            if result.is_ok() {
                holder_for_closure.store(compute_ns, std::sync::atomic::Ordering::Relaxed);
            }
            result
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

    // Phase 0.1: emit a single rolling telemetry record that combines
    // worker compute time (from the closure) and response bytes (from
    // serializing the final payload once here for size measurement only).
    let response_payload = serde_json::json!({ "bands": &bands });
    let response_bytes = serde_json::to_vec(&response_payload)
        .map(|b| b.len() as u64)
        .unwrap_or(0);
    let compute_ns = compute_ns_holder.load(std::sync::atomic::Ordering::Relaxed);
    metrics.record_rolling(rows_in, columns_in, response_bytes, compute_ns);

    Ok(analytics_response(response_payload, &identity))
}

pub async fn post_rolling(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Response, AppError> {
    get_rolling(State(state), Query(decode_plan_aware_post(body)?)).await
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
    pub cleaning_plan: Option<String>,
}

#[tracing::instrument(skip(state))]
pub async fn get_anomalies(
    State(state): State<AppState>,
    Query(params): Query<AnomalyQuery>,
) -> Result<Response, AppError> {
    let params = Arc::new(params);
    let (value_cols, filtered, identity) = filter_preamble_with_plan(
        &state,
        params.start,
        params.end,
        params.columns.as_deref(),
        params.cleaning_plan.as_deref(),
    )
    .await?;

    let method = params.method.as_deref().unwrap_or("zscore");
    let (regions, summary_stats) = tokio::task::spawn_blocking({
        let params = params.clone();
        let filtered = filtered.clone();
        let value_cols = value_cols.clone();
        let method = method.to_string();
        move || {
            let regions = match method.as_str() {
                "iqr" => {
                    let k = params.threshold.unwrap_or(1.5);
                    analytics::detect_anomalies_iqr(&filtered, &value_cols, k)
                }
                _ => {
                    let threshold = params.threshold.unwrap_or(3.0);
                    analytics::detect_anomalies_zscore(&filtered, &value_cols, threshold)
                }
            }?;
            let summary_stats = analytics::compute_summary_stats(&filtered, &value_cols)?;
            Ok::<_, AppError>((regions, summary_stats))
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

    Ok(analytics_response(
        serde_json::json!({
            "method": method,
            "threshold": params.threshold.unwrap_or(if method == "iqr" { 1.5 } else { 3.0 }),
            "regions": regions,
            "summary_stats": summary_stats,
        }),
        &identity,
    ))
}

pub async fn post_anomalies(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Response, AppError> {
    get_anomalies(State(state), Query(decode_plan_aware_post(body)?)).await
}

// ── FFT / PSD ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct FftQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    /// Max points for FFT (default: 8192, will downsample if data is larger)
    pub max_points: Option<usize>,
    pub cleaning_plan: Option<String>,
}

#[tracing::instrument(skip(state))]
pub async fn get_fft(
    State(state): State<AppState>,
    Query(params): Query<FftQuery>,
) -> Result<Response, AppError> {
    let (value_cols, filtered, identity) = filter_preamble_with_plan(
        &state,
        params.start,
        params.end,
        params.columns.as_deref(),
        params.cleaning_plan.as_deref(),
    )
    .await?;

    let max_pts = params.max_points.unwrap_or(8192).max(64);
    let work_df = downsample_by_stride(filtered, max_pts, "FFT")?;

    let results = tokio::task::spawn_blocking({
        let work_df = work_df.clone();
        let value_cols = value_cols.clone();
        move || analytics::compute_fft(&work_df, &value_cols, None)
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

    Ok(analytics_response(
        serde_json::json!({
            "sample_count": work_df.height(),
            "results": results,
        }),
        &identity,
    ))
}

pub async fn post_fft(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Response, AppError> {
    get_fft(State(state), Query(decode_plan_aware_post(body)?)).await
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
    /// Optional server-side colorbar normalization:
    /// `none` (default), `minmax`, `zscore`, or `robust`.
    pub normalize: Option<String>,
    /// Optional server-side outlier clipping: `none`, `percentile`, or `iqr`.
    pub clip: Option<String>,
    /// Threshold for the active clip mode (percentage on each tail for
    /// `percentile`, k multiplier for `iqr`).
    pub clip_param: Option<f64>,
    pub cleaning_plan: Option<String>,
}

#[tracing::instrument(skip(state))]
pub async fn get_spectrogram(
    State(state): State<AppState>,
    Query(params): Query<SpectrogramQuery>,
) -> Result<Response, AppError> {
    let (value_cols, filtered, identity) = filter_preamble_with_plan(
        &state,
        params.start,
        params.end,
        Some(params.column.as_str()),
        params.cleaning_plan.as_deref(),
    )
    .await?;
    let col = &value_cols[0];

    let max_pts = params.max_points.unwrap_or(32768).max(256);
    let work_df = downsample_by_stride(filtered, max_pts, "Spectrogram")?;

    let win_size = params.window_size.unwrap_or(256).clamp(16, 4096);
    let hop = params.hop_size.unwrap_or(win_size / 2).clamp(1, win_size);
    let scale = analytics::ScaleOptions::from_query(
        params.normalize.as_deref(),
        params.clip.as_deref(),
        params.clip_param,
    )?;

    let result = tokio::task::spawn_blocking({
        let work_df = work_df.clone();
        let col = col.to_string();
        move || {
            let mut result = analytics::compute_spectrogram(&work_df, &col, win_size, hop)?;
            if scale.mode != analytics::ScaleMode::None || scale.clip != analytics::ClipMode::None {
                analytics::apply_spectrogram_scale(&mut result, scale)?;
            }
            Ok::<_, AppError>(result)
        }
    })
    .await
    .map_err(|e| AppError::internal(format!("Join error: {e}")))??;

    Ok(analytics_response(
        serde_json::json!({
            "sample_count": work_df.height(),
            "result": result,
        }),
        &identity,
    ))
}

pub async fn post_spectrogram(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Response, AppError> {
    get_spectrogram(State(state), Query(decode_plan_aware_post(body)?)).await
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
    pub cleaning_plan: Option<String>,
}

#[tracing::instrument(skip(state))]
pub async fn get_spectral_filter(
    State(state): State<AppState>,
    Query(params): Query<SpectralFilterQuery>,
) -> Result<Response, AppError> {
    let col_opt = Some(params.column.clone());

    // Resolve optional start/end from dataset time range when not provided.
    let (start, end) = match (params.start, params.end) {
        (Some(s), Some(e)) => (s, e),
        (opt_s, opt_e) => {
            let (lf_snap, time_column) = match params
                .cleaning_plan
                .as_deref()
                .filter(|raw| !raw.trim().is_empty())
            {
                Some(raw) => {
                    let envelope: crate::handlers::routes::cleaning::PlanRequestEnvelope =
                        serde_json::from_str(raw).map_err(|error| {
                            AppError::bad_request(format!(
                                "Invalid cleaning plan envelope: {error}"
                            ))
                        })?;
                    let time_column = envelope.plan.time_column.clone();
                    let (_version, _hash, frame) =
                        crate::handlers::routes::cleaning::compile_request_frame(
                            &state, &envelope,
                        )?;
                    (frame, time_column)
                }
                None => (
                    state.dataset_snapshot(),
                    state
                        .time_column_display_name_sync()
                        .unwrap_or_else(|| "ts".to_string()),
                ),
            };
            let ctx = edatime_core::temporal::ts_context(&lf_snap, &time_column)?;
            let ts_col = ctx.ts_col;
            let multiplier = ctx.multiplier;
            let df_snap = state
                .query_executor
                .execute_async(lf_snap)
                .await
                .map_err(|e| AppError::io(format!("ts probe failed: {e}")))?;
            let ts_col_series = df_snap
                .column(&ts_col)
                .map_err(|e| {
                    AppError::bad_request(format!("Missing ts column '{}': {}", ts_col, e))
                })?
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
            let dataset_start = DateTime::from_timestamp_millis(min_ms).unwrap_or_else(epoch_zero);
            let dataset_end = DateTime::from_timestamp_millis(max_ms).unwrap_or_else(epoch_zero);
            (opt_s.unwrap_or(dataset_start), opt_e.unwrap_or(dataset_end))
        }
    };

    let (value_cols, filtered, identity) = filter_preamble_with_plan(
        &state,
        start,
        end,
        col_opt.as_deref(),
        params.cleaning_plan.as_deref(),
    )
    .await?;
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

    Ok(analytics_response(
        serde_json::json!({
            "column": col,
            "ts": ts_ms,
            "values": filtered_values,
            "filter_type": params.filter_type,
            "low_hz": low_hz,
            "high_hz": high_hz,
            "sample_count": ts_ms.len(),
        }),
        &identity,
    ))
}

pub async fn post_spectral_filter(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Response, AppError> {
    get_spectral_filter(State(state), Query(decode_plan_aware_post(body)?)).await
}

/// Internal type used to accept either a comma-separated string
/// (`"HUFL,HULL"`) or a JSON array (`["HUFL", "HULL"]`) for the
/// `columns` field. The frontend already follows the string shape;
/// the array shape is a strict improvement for hand-written clients.
fn deserialize_columns<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{self, Visitor};
    use std::fmt;

    struct ColumnsVisitor;

    impl<'de> Visitor<'de> for ColumnsVisitor {
        type Value = Option<String>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a comma-separated string or an array of strings")
        }

        fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
            Ok(Some(v))
        }

        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut parts: Vec<String> = Vec::new();
            while let Some(value) = seq.next_element::<String>()? {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    parts.push(trimmed.to_string());
                }
            }
            if parts.is_empty() {
                Ok(None)
            } else {
                Ok(Some(parts.join(",")))
            }
        }
    }

    deserializer.deserialize_any(ColumnsVisitor)
}

// ── Causal Graph (Native Rust — PCMCI / PCMCI+) ───────────────────────────

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CausalGraphRequest {
    /// Columns to include in the causal search (comma-separated string or JSON array)
    #[serde(default, deserialize_with = "deserialize_columns")]
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
    #[serde(default)]
    pub cleaning_plan: Option<crate::handlers::routes::cleaning::PlanRequestEnvelope>,
}

const MAX_CAUSAL_TAU_MAX: usize = 128;
const MAX_CAUSAL_WORK_UNITS: u128 = 25_000_000;

fn parse_causal_tau_max(requested: Option<usize>) -> Result<usize, AppError> {
    let tau_max = requested.unwrap_or(3);
    if !(1..=MAX_CAUSAL_TAU_MAX).contains(&tau_max) {
        return Err(AppError::bad_request(format!(
            "tau_max must be between 1 and {MAX_CAUSAL_TAU_MAX}"
        )));
    }
    Ok(tau_max)
}

fn estimate_causal_work_units(
    n_cols: usize,
    tau_max: usize,
    max_points: usize,
    method: &str,
    test: crate::causal::IndependenceTestKind,
    sig_samples: usize,
) -> u128 {
    let lag_terms = (tau_max as u128) + 1;
    let base = (n_cols as u128) * (n_cols as u128) * lag_terms * (max_points as u128);

    let method_factor = match method {
        "bivci" => 6u128,
        "pcmciplus" => 12u128,
        "lpcmci" => 15u128,
        _ => 10u128,
    };
    let test_factor = match test {
        crate::causal::IndependenceTestKind::ParCorr => 10u128,
        crate::causal::IndependenceTestKind::RobustParCorr => 12u128,
        crate::causal::IndependenceTestKind::Gsquared => 18u128,
        crate::causal::IndependenceTestKind::CmiSymb => 18u128,
        // CMI-KNN performs an O(n²) neighbor scan for every permutation.
        // Scale the existing baseline by both requested shuffle samples and
        // input size so a seemingly small column/lag request cannot admit a
        // multi-minute computation on a long series.
        crate::causal::IndependenceTestKind::CmiKnn => {
            let sample_factor = (max_points as u128).div_ceil(256).max(1);
            let shuffle_factor = (sig_samples as u128).div_ceil(200).max(1);
            60u128
                .saturating_mul(sample_factor)
                .saturating_mul(shuffle_factor)
        }
    };

    base.saturating_mul(method_factor)
        .saturating_mul(test_factor)
        / 100
}

#[tracing::instrument(skip(state))]
pub async fn post_causal_graph(
    State(state): State<AppState>,
    Json(params): Json<CausalGraphRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (lf, identity) = if let Some(envelope) = params.cleaning_plan.as_ref() {
        let (version, hash, frame) =
            crate::handlers::routes::cleaning::compile_request_frame(&state, envelope)?;
        (frame, ExecutionIdentity::from_version(version, Some(hash)))
    } else {
        (
            state.dataset_snapshot(),
            current_execution_identity(&state)?,
        )
    };
    let cols = query::parse_columns(params.columns.as_deref());
    let limits = &state.config.validation;
    let value_cols = validate_numeric_columns_lazy(&lf, &cols, limits)?;

    if value_cols.len() < 2 {
        return Err(AppError::bad_request("Need at least 2 numeric columns"));
    }
    if value_cols.len() > 20 {
        return Err(AppError::bad_request("Too many columns (max 20)"));
    }
    let df = state
        .query_executor
        .execute_async(lf)
        .await
        .map_err(|e| AppError::io(e.to_string()))?;

    let tau_max = parse_causal_tau_max(params.tau_max)?;
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
    let sig_samples = params.sig_samples.unwrap_or(200).clamp(10, 1000);

    let work_units = estimate_causal_work_units(
        value_cols.len(),
        tau_max,
        max_pts.min(df.height()),
        &method,
        test_kind,
        sig_samples,
    );
    if work_units > MAX_CAUSAL_WORK_UNITS {
        return Err(AppError::bad_request(format!(
            "causal request is too large for stable runtime at tau_max={tau_max}; reduce columns, tau max, or max points"
        )));
    }

    let n_preliminary_iterations = params.n_preliminary_iterations.unwrap_or(1).clamp(0, 5);
    let knn = params.knn.unwrap_or(10).clamp(1, 100);
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

    Ok(analytics_response(result, &identity))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::{
        AnomalyQuery, CausalGraphRequest, estimate_causal_work_units, get_anomalies,
        post_causal_graph,
    };
    use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
    use chrono::TimeZone;
    use edatime_core::config::AppConfig;
    use edatime_store::state::AppState;
    use polars::prelude::{DataFrame, NamedFrom, Series};
    use serde_json::Value;

    #[tokio::test(flavor = "multi_thread")]
    async fn causal_route_preserves_response_shape_for_pcmci() {
        let df = DataFrame::new(
            6,
            vec![
                Series::new("x".into(), [1.0_f64, 2.0, 3.0, 4.0, 5.0, 6.0]).into(),
                Series::new("y".into(), [0.0_f64, 0.5, 1.0, 1.5, 2.0, 2.5]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());

        let response = post_causal_graph(
            State(state),
            Json(CausalGraphRequest {
                columns: Some("x,y".to_string()),
                tau_max: Some(1),
                pc_alpha: Some(0.2),
                alpha: Some(0.05),
                method: Some("pcmci".to_string()),
                test: Some("par_corr".to_string()),
                max_points: Some(100),
                max_conds_dim: Some(1),
                fdr_method: Some("none".to_string()),
                n_preliminary_iterations: Some(1),
                knn: None,
                sig_samples: None,
                cleaning_plan: None,
            }),
        )
        .await
        .expect("causal route should succeed")
        .into_response();

        assert_eq!(
            response
                .headers()
                .get("x-edatime-source-version")
                .and_then(|value| value.to_str().ok()),
            Some("source-0")
        );

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should read");
        let json: Value = serde_json::from_slice(&body).expect("response should be json");

        assert!(json.get("graph").is_some());
        assert!(json.get("val_matrix").is_some());
        assert!(json.get("p_matrix").is_some());
        assert!(json.get("columns").is_some());
        assert!(json.get("tau_max").is_some());
        assert!(json.get("links").is_some());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn causal_route_accepts_tau_max_128_without_clamping() {
        let df = DataFrame::new(
            512,
            vec![
                Series::new("x".into(), (0..512).map(|i| i as f64).collect::<Vec<_>>()).into(),
                Series::new(
                    "y".into(),
                    (0..512).map(|i| (i as f64) * 0.5).collect::<Vec<_>>(),
                )
                .into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());

        let response = post_causal_graph(
            State(state),
            Json(CausalGraphRequest {
                columns: Some("x,y".to_string()),
                tau_max: Some(128),
                pc_alpha: Some(0.2),
                alpha: Some(0.05),
                method: Some("pcmci".to_string()),
                test: Some("par_corr".to_string()),
                max_points: Some(512),
                max_conds_dim: Some(1),
                fdr_method: Some("none".to_string()),
                n_preliminary_iterations: Some(1),
                knn: None,
                sig_samples: None,
                cleaning_plan: None,
            }),
        )
        .await
        .expect("causal route should succeed")
        .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should read");
        let json: Value = serde_json::from_slice(&body).expect("response should be json");

        assert_eq!(json.get("tau_max").and_then(Value::as_u64), Some(128));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn causal_route_rejects_excessive_high_lag_work() {
        let row_count = 5_000usize;
        let columns: Vec<_> = (0..8)
            .map(|idx| {
                Series::new(
                    format!("c{idx}").into(),
                    (0..row_count)
                        .map(|row| row as f64 * (idx as f64 + 1.0))
                        .collect::<Vec<_>>(),
                )
                .into()
            })
            .collect();
        let df = DataFrame::new(row_count, columns).expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());

        let err = post_causal_graph(
            State(state),
            Json(CausalGraphRequest {
                columns: Some("c0,c1,c2,c3,c4,c5,c6,c7".to_string()),
                tau_max: Some(128),
                pc_alpha: Some(0.2),
                alpha: Some(0.05),
                method: Some("pcmci".to_string()),
                test: Some("par_corr".to_string()),
                max_points: Some(5_000),
                max_conds_dim: Some(1),
                fdr_method: Some("none".to_string()),
                n_preliminary_iterations: Some(1),
                knn: None,
                sig_samples: None,
                cleaning_plan: None,
            }),
        )
        .await
        .err()
        .expect("oversized causal request should be rejected");
        let response = err.into_response();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should read");
        let json: Value = serde_json::from_slice(&body).expect("response should be json");
        assert!(
            json["message"]
                .as_str()
                .unwrap_or_default()
                .contains("causal request is too large"),
            "unexpected error body: {json}"
        );
    }

    #[test]
    fn cmi_knn_work_estimate_scales_with_samples_and_shuffle_count() {
        let baseline = estimate_causal_work_units(
            2,
            3,
            1_000,
            "pcmci",
            crate::causal::IndependenceTestKind::CmiKnn,
            200,
        );
        let larger = estimate_causal_work_units(
            2,
            3,
            5_000,
            "pcmci",
            crate::causal::IndependenceTestKind::CmiKnn,
            400,
        );
        assert!(larger > baseline);
    }

    // ── Fix 5.1/5.2 regression tests ─────────────────────────────────────

    /// `CausalGraphRequest` accepts both the documented comma-separated string and the alternative JSON
    /// array form. Previously, a singular `column` (the obvious typo)
    /// was silently ignored, leading to a misleading "No valid numeric
    /// columns were requested" error. `deny_unknown_fields` now rejects
    /// singular `column` upfront.
    #[test]
    fn causal_request_accepts_comma_separated_columns() {
        let body = serde_json::json!({"columns": "x,y", "tau_max": 1});
        let req: CausalGraphRequest = serde_json::from_value(body).expect("parse");
        assert_eq!(req.columns.as_deref(), Some("x,y"));
    }

    #[test]
    fn causal_request_accepts_json_array_columns() {
        let body = serde_json::json!({"columns": ["x", "y"], "tau_max": 1});
        let req: CausalGraphRequest = serde_json::from_value(body).expect("parse");
        assert_eq!(req.columns.as_deref(), Some("x,y"));
    }

    #[test]
    fn causal_request_rejects_singular_column_field() {
        // Regression test for audit issue 5.2: a singular `column`
        // field was previously silently dropped, leading to a
        // misleading "No valid numeric columns were requested" error.
        // `deny_unknown_fields` now rejects it with 422.
        let body = serde_json::json!({"column": "x", "tau_max": 1});
        let result: Result<CausalGraphRequest, _> = serde_json::from_value(body);
        assert!(
            result.is_err(),
            "singular `column` must be rejected, got {result:?}"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn anomaly_route_includes_global_summary_stats() {
        let ts_ms: Vec<i64> = vec![
            1_514_764_800_000,
            1_517_424_000_000,
            1_520_169_600_000,
            1_522_915_200_000,
        ];
        let df = DataFrame::new(
            4,
            vec![
                Series::new("ts".into(), ts_ms)
                    .cast(&polars::prelude::DataType::Datetime(
                        polars::prelude::TimeUnit::Milliseconds,
                        None,
                    ))
                    .expect("cast ts")
                    .into(),
                Series::new("HUFL".into(), [1.0_f64, 2.0, 3.0, 4.0]).into(),
                Series::new("HULL".into(), [10.0_f64, 20.0, 30.0, 40.0]).into(),
            ],
        )
        .expect("test dataframe should build");
        let state = AppState::new(df, AppConfig::default());

        let response = get_anomalies(
            State(state),
            axum::extract::Query(AnomalyQuery {
                start: chrono::Utc.with_ymd_and_hms(2018, 1, 1, 0, 0, 0).unwrap(),
                end: chrono::Utc.with_ymd_and_hms(2018, 5, 1, 0, 0, 0).unwrap(),
                columns: Some("HUFL,HULL".to_string()),
                method: Some("zscore".to_string()),
                threshold: Some(3.0),
                cleaning_plan: None,
            }),
        )
        .await
        .expect("anomaly route should succeed");

        assert_eq!(
            response
                .headers()
                .get("x-edatime-source-version")
                .and_then(|value| value.to_str().ok()),
            Some("source-0")
        );
        assert_eq!(
            response
                .headers()
                .get("x-edatime-plan-hash")
                .and_then(|value| value.to_str().ok()),
            Some("none")
        );

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should read");
        let json: Value = serde_json::from_slice(&body).expect("response should be json");
        let summary = json
            .get("summary_stats")
            .expect("summary stats should be present");

        assert_eq!(summary.get("min").and_then(Value::as_f64), Some(1.0));
        assert_eq!(summary.get("max").and_then(Value::as_f64), Some(40.0));
        assert!(summary.get("mean").and_then(Value::as_f64).is_some());
        assert!(summary.get("std").and_then(Value::as_f64).is_some());
    }
}
