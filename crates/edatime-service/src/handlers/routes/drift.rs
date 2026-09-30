//! `POST /api/v1/drift/stats` and `POST /api/v1/drift/investigate`.

use axum::{
    Json,
    extract::State,
    response::{IntoResponse, Response},
};
use chrono::{DateTime, NaiveDateTime, Utc};
use polars::prelude::col;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::analytics::drift::quantile_histogram_edges;
use crate::analytics::{
    DriftThresholds, compute_drift_investigation, compute_temporal_drift, extract_f64_column_opt,
    shared::extract_ts_epoch_ms_with_col,
};
use crate::error::AppError;
use crate::handlers::routes::shared::{ExecutionIdentity, add_execution_identity_headers};
use edatime_core::temporal::native_to_epoch_ms;
use edatime_query::pipeline::filter_time_range;
use edatime_query::validation::validate_numeric_columns_lazy;
use edatime_query::validation::validate_time_window;
use edatime_store::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DriftQuery {
    pub column: String,
    pub window: String,
    pub reference_start: String,
    pub reference_end: String,
    pub ks_pvalue_threshold: Option<f64>,
    pub es_pvalue_threshold: Option<f64>,
    pub psi_minor_threshold: Option<f64>,
    pub psi_major_threshold: Option<f64>,
    pub wasserstein_std_multiplier: Option<f64>,
    pub cleaning_plan: crate::handlers::routes::cleaning::PlanRequestEnvelope,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftPreflightColumn {
    pub column: String,
    pub reference_valid_samples: usize,
    pub comparison_valid_samples: usize,
    pub comparison_windows: usize,
    pub windows_below_minimum: usize,
    pub average_window_samples: f64,
    pub reference_to_window_ratio: Option<f64>,
    pub decision_ready: bool,
    pub warnings: Vec<String>,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftPreflightResponse {
    pub source_version_id: String,
    pub source_revision: u64,
    pub schema_fingerprint: String,
    pub plan_hash: String,
    pub window: String,
    pub decision_ready: bool,
    pub columns: Vec<DriftPreflightColumn>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DriftInvestigateQuery {
    pub columns: Vec<String>,
    pub window: String,
    pub reference_start: String,
    pub reference_end: String,
    pub comparison_start: Option<String>,
    pub comparison_end: Option<String>,
    pub segment_by: Option<String>,
    pub segment_limit: Option<usize>,
    pub ks_pvalue_threshold: Option<f64>,
    pub es_pvalue_threshold: Option<f64>,
    pub psi_minor_threshold: Option<f64>,
    pub psi_major_threshold: Option<f64>,
    pub wasserstein_std_multiplier: Option<f64>,
    pub include_quality: Option<bool>,
    pub include_change_points: Option<bool>,
    pub include_correlations: Option<bool>,
    pub cleaning_plan: crate::handlers::routes::cleaning::PlanRequestEnvelope,
}

fn window_ms(window: &str) -> i64 {
    match window {
        "hourly" => 3600 * 1000,
        "weekly" => 7 * 24 * 3600 * 1000,
        _ => 24 * 3600 * 1000, // daily
    }
}

fn validated_drift_stats_window_ms(window: &str) -> Result<i64, AppError> {
    match window {
        "hourly" | "daily" | "weekly" => Ok(window_ms(window)),
        other => Err(AppError::bad_request(format!(
            "Invalid drift window '{}'",
            other
        ))),
    }
}

fn validate_drift_stats_query(
    lf: &polars::prelude::LazyFrame,
    query: &DriftQuery,
    limits: &edatime_core::config::ValidationSettings,
) -> Result<(String, i64), AppError> {
    let columns = validate_numeric_columns_lazy(lf, std::slice::from_ref(&query.column), limits)
        .map_err(AppError::from)?;
    let column = columns
        .first()
        .cloned()
        .ok_or_else(|| AppError::bad_request("A numeric drift column is required"))?;
    let window_size = validated_drift_stats_window_ms(&query.window)?;
    Ok((column, window_size))
}

fn parse_datetime(s: &str) -> Result<DateTime<Utc>, AppError> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Ok(dt.with_timezone(&Utc));
    }
    let ndt = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M")
        .map_err(|_| AppError::bad_request(format!("invalid datetime '{}'", s)))?;
    Ok(DateTime::from_naive_utc_and_offset(ndt, Utc))
}

async fn max_timestamp_native(
    state: &AppState,
    lf: &polars::prelude::LazyFrame,
    ts_col: &str,
    fallback: i64,
) -> Result<i64, AppError> {
    let max_expr = col(ts_col).cast(polars::prelude::DataType::Int64).max();
    let max_lf = lf.clone().select([max_expr]);
    let df = state.query_executor.execute_async(max_lf).await?;
    Ok(df
        .get_column_names()
        .first()
        .and_then(|name| df.column(name).ok())
        .and_then(|column| column.as_materialized_series().get(0).ok())
        .and_then(|value| value.try_extract::<i64>().ok())
        .unwrap_or(fallback))
}

fn normalized_thresholds(
    ks_pvalue_threshold: Option<f64>,
    es_pvalue_threshold: Option<f64>,
    psi_minor_threshold: Option<f64>,
    psi_major_threshold: Option<f64>,
    wasserstein_std_multiplier: Option<f64>,
) -> DriftThresholds {
    DriftThresholds {
        ks_pvalue_threshold: ks_pvalue_threshold.unwrap_or(0.05),
        es_pvalue_threshold: es_pvalue_threshold.unwrap_or(0.05),
        wasserstein_threshold: wasserstein_std_multiplier
            .map(|multiplier| -multiplier.abs())
            .unwrap_or(0.0),
        psi_minor_threshold: psi_minor_threshold.unwrap_or(0.1),
        psi_major_threshold: psi_major_threshold.unwrap_or(0.2),
    }
}

async fn filtered_drift_df(
    state: &AppState,
    lf: polars::prelude::LazyFrame,
    query_columns: &[String],
    segment_by: Option<&str>,
    reference_start: DateTime<Utc>,
    comparison_end: DateTime<Utc>,
) -> Result<(polars::prelude::DataFrame, i64, f64), AppError> {
    let ctx = state.ts_context(&lf)?;
    let ts_col = ctx.ts_col.clone();
    let multiplier = ctx.multiplier;
    let reference_start_native = reference_start.timestamp_millis() * multiplier;
    let comparison_end_native = comparison_end.timestamp_millis() * multiplier;
    let mut selected_columns = query_columns.to_vec();
    if let Some(segment_col) = segment_by
        && !selected_columns.iter().any(|column| column == segment_col)
    {
        selected_columns.push(segment_col.to_string());
    }
    let filtered_lf = filter_time_range(
        lf,
        reference_start_native,
        comparison_end_native,
        &selected_columns,
        &ts_col,
        &ctx.dtype,
    )?;
    let df = state.query_executor.execute_async(filtered_lf).await?;
    Ok((
        df,
        comparison_end_native,
        native_to_epoch_ms(comparison_end_native, &ctx.dtype),
    ))
}

// Mirrors the preflight request fields one-to-one.
#[allow(clippy::too_many_arguments)]
fn build_drift_preflight_columns(
    df: &polars::prelude::DataFrame,
    ts_col: &str,
    columns: &[String],
    reference_start_ms: f64,
    reference_end_ms: f64,
    comparison_start_ms: f64,
    comparison_end_ms: f64,
    window_size_ms: i64,
) -> Result<Vec<DriftPreflightColumn>, AppError> {
    let timestamps = extract_ts_epoch_ms_with_col(df, ts_col)?;
    let window_size_ms = window_size_ms.max(1) as f64;
    let comparison_windows = ((comparison_end_ms - comparison_start_ms).max(0.0) / window_size_ms)
        .ceil()
        .max(1.0) as usize;
    let mut preflight = Vec::with_capacity(columns.len());

    for column in columns {
        let values = extract_f64_column_opt(df, column)?;
        let mut reference_valid_samples = 0usize;
        let mut reference_values = Vec::new();
        let mut comparison_valid_samples = 0usize;
        let mut window_counts = BTreeMap::<usize, usize>::new();
        for (timestamp, value) in timestamps.iter().zip(values.iter()) {
            let Some(value) = value else { continue };
            if *timestamp >= reference_start_ms && *timestamp < reference_end_ms {
                reference_valid_samples += 1;
                reference_values.push(*value);
            }
            if *timestamp >= comparison_start_ms && *timestamp <= comparison_end_ms {
                let index = ((*timestamp - comparison_start_ms) / window_size_ms).floor() as usize;
                if index < comparison_windows {
                    comparison_valid_samples += 1;
                    *window_counts.entry(index).or_default() += 1;
                }
            }
        }

        let usable_windows: Vec<usize> = window_counts
            .values()
            .copied()
            .filter(|count| *count >= 5)
            .collect();
        let windows_below_minimum = comparison_windows.saturating_sub(usable_windows.len());
        let average_window_samples = if usable_windows.is_empty() {
            0.0
        } else {
            usable_windows.iter().sum::<usize>() as f64 / usable_windows.len() as f64
        };
        let ratio = (average_window_samples > 0.0)
            .then_some(reference_valid_samples as f64 / average_window_samples);
        let mut warnings = Vec::new();
        let mut suggestions = Vec::new();
        if reference_valid_samples < 5 {
            warnings.push(
                "Reference has fewer than 5 valid samples; Drift cannot compute a baseline."
                    .to_string(),
            );
            suggestions.push(
                "Widen the reference range until this column has at least 5 valid samples."
                    .to_string(),
            );
        }
        if windows_below_minimum > 0 {
            warnings.push(format!(
                "{windows_below_minimum} of {comparison_windows} monitoring windows have fewer than 5 valid samples; their Drift metrics will be zeroed."
            ));
            suggestions.push(
                "Choose a longer monitoring window or inspect missing and non-finite values."
                    .to_string(),
            );
        }
        if ratio.is_some_and(|ratio| ratio > 10.0) {
            warnings.push(format!(
                "The reference is more than 10× the average usable monitoring window ({:.1}×); PSI and KS may be unreliable.",
                ratio.unwrap_or_default()
            ));
            suggestions.push("Try a longer monitoring window or a shorter reference range to reduce the sample-size imbalance.".to_string());
        }
        reference_values.sort_by(f64::total_cmp);
        if reference_valid_samples >= 5 && quantile_histogram_edges(&reference_values, 20).1 {
            warnings.push(
                "The reference has too few distinct values for stable histogram bins.".to_string(),
            );
            suggestions.push(
                "Inspect a less flat reference period or treat distribution metrics cautiously."
                    .to_string(),
            );
        }
        suggestions.sort();
        suggestions.dedup();
        let decision_ready = warnings.is_empty();
        preflight.push(DriftPreflightColumn {
            column: column.clone(),
            reference_valid_samples,
            comparison_valid_samples,
            comparison_windows,
            windows_below_minimum,
            average_window_samples,
            reference_to_window_ratio: ratio,
            decision_ready,
            warnings,
            suggestions,
        });
    }
    Ok(preflight)
}

fn drift_frame_with_identity(
    state: &AppState,
    cleaning_plan: &crate::handlers::routes::cleaning::PlanRequestEnvelope,
) -> Result<(polars::prelude::LazyFrame, ExecutionIdentity), AppError> {
    let (version, hash, frame) =
        crate::handlers::routes::cleaning::compile_request_frame(state, cleaning_plan)?;
    Ok((frame, ExecutionIdentity::from_version(version, Some(hash))))
}

#[tracing::instrument(skip(state, query))]
pub async fn post_drift_stats(
    State(state): State<AppState>,
    Json(query): Json<DriftQuery>,
) -> Result<Response, AppError> {
    let ref_start = parse_datetime(&query.reference_start)?;
    let ref_end = parse_datetime(&query.reference_end)?;
    validate_time_window(ref_start, ref_end)?;

    let (lf, identity) = drift_frame_with_identity(&state, &query.cleaning_plan)?;
    let (column_name, window_size) =
        validate_drift_stats_query(&lf, &query, &state.config.validation)?;
    let ctx = state.ts_context(&lf)?;
    let ts_col = ctx.ts_col;
    let multiplier = ctx.multiplier;

    let ref_start_native = ref_start.timestamp_millis() * multiplier;
    let ref_end_native = ref_end.timestamp_millis() * multiplier;

    let max_ts_i64 = max_timestamp_native(&state, &lf, &ts_col, ref_end_native).await?;

    let ref_start_ms = ref_start.timestamp_millis() as f64;
    let ref_end_ms = ref_end.timestamp_millis() as f64;
    let curr_start_ms = ref_end_ms;
    let curr_end_ms = native_to_epoch_ms(max_ts_i64, &ctx.dtype);

    // filter_time_range now returns LazyFrame; execute on Rayon pool
    // Include the target column in the selection so compute_temporal_drift can access it
    let filtered_lf = filter_time_range(
        lf,
        ref_start_native,
        max_ts_i64,
        std::slice::from_ref(&column_name),
        &ts_col,
        &ctx.dtype,
    )?;
    let df = state.query_executor.execute_async(filtered_lf).await?;

    let thresholds = normalized_thresholds(
        query.ks_pvalue_threshold,
        query.es_pvalue_threshold,
        query.psi_minor_threshold,
        query.psi_major_threshold,
        query.wasserstein_std_multiplier,
    );

    let result = compute_temporal_drift(
        &df,
        &column_name,
        window_size,
        ref_start_ms,
        ref_end_ms,
        curr_start_ms,
        curr_end_ms,
        20, // n_bins
        thresholds.ks_pvalue_threshold,
        thresholds.es_pvalue_threshold,
        thresholds.wasserstein_threshold,
        thresholds.psi_minor_threshold,
        thresholds.psi_major_threshold,
    )?;

    let body = serde_json::to_string(&result).map_err(|e| AppError::internal(e.to_string()))?;
    let response = Response::builder()
        .header("content-type", "application/json")
        .body(body.into())
        .map_err(|e| AppError::internal(e.to_string()))?;
    Ok(add_execution_identity_headers(response, &identity))
}

#[tracing::instrument(skip(state, query))]
pub async fn post_drift_preflight(
    State(state): State<AppState>,
    Json(query): Json<DriftInvestigateQuery>,
) -> Result<Response, AppError> {
    let window_size = validated_drift_stats_window_ms(&query.window)?;
    let reference_start = parse_datetime(&query.reference_start)?;
    let reference_end = parse_datetime(&query.reference_end)?;
    validate_time_window(reference_start, reference_end)?;
    let comparison_start = match query.comparison_start.as_deref() {
        Some(value) => parse_datetime(value)?,
        None => reference_end,
    };
    let (lf, identity) = drift_frame_with_identity(&state, &query.cleaning_plan)?;
    let comparison_end = match query.comparison_end.as_deref() {
        Some(value) => parse_datetime(value)?,
        None => {
            let ctx = state.ts_context(&lf)?;
            let max_native = max_timestamp_native(
                &state,
                &lf,
                &ctx.ts_col,
                reference_end.timestamp_millis() * ctx.multiplier,
            )
            .await?;
            DateTime::<Utc>::from_timestamp_millis(
                native_to_epoch_ms(max_native, &ctx.dtype).round() as i64,
            )
            .ok_or_else(|| AppError::bad_request("invalid comparison end derived from dataset"))?
        }
    };
    validate_time_window(comparison_start, comparison_end)?;
    let columns = validate_numeric_columns_lazy(&lf, &query.columns, &state.config.validation)
        .map_err(AppError::from)?;
    let ctx = state.ts_context(&lf)?;
    if let Some(segment_by) = query.segment_by.as_deref() {
        let schema = lf
            .clone()
            .collect_schema()
            .map_err(|error| AppError::bad_request(format!("Failed to read schema: {error}")))?;
        let dtype = schema.get(segment_by).ok_or_else(|| {
            AppError::bad_request(format!("Unknown segment column '{segment_by}'"))
        })?;
        if segment_by == ctx.ts_col
            || matches!(
                dtype,
                polars::prelude::DataType::Datetime(_, _) | polars::prelude::DataType::Date
            )
        {
            return Err(AppError::bad_request(format!(
                "Segment column '{segment_by}' cannot be the time column",
            )));
        }
    }
    let (df, _, _) = filtered_drift_df(
        &state,
        lf,
        &columns,
        query.segment_by.as_deref(),
        reference_start,
        comparison_end,
    )
    .await?;
    let column_reports = build_drift_preflight_columns(
        &df,
        &ctx.ts_col,
        &columns,
        reference_start.timestamp_millis() as f64,
        reference_end.timestamp_millis() as f64,
        comparison_start.timestamp_millis() as f64,
        comparison_end.timestamp_millis() as f64,
        window_size,
    )?;
    let response = DriftPreflightResponse {
        source_version_id: identity.source_version_id.clone(),
        source_revision: identity.source_revision,
        schema_fingerprint: identity.schema_fingerprint.clone(),
        plan_hash: identity
            .plan_hash
            .clone()
            .unwrap_or_else(|| "none".to_string()),
        window: query.window,
        decision_ready: column_reports.iter().all(|report| report.decision_ready),
        columns: column_reports,
    };
    Ok(add_execution_identity_headers(
        Json(response).into_response(),
        &identity,
    ))
}

#[tracing::instrument(skip(state, query))]
pub async fn post_drift_investigate(
    State(state): State<AppState>,
    Json(query): Json<DriftInvestigateQuery>,
) -> Result<Response, AppError> {
    let window_size = window_ms(&query.window);
    let reference_start = parse_datetime(&query.reference_start)?;
    let reference_end = parse_datetime(&query.reference_end)?;
    validate_time_window(reference_start, reference_end)?;

    let comparison_start = match query.comparison_start.as_deref() {
        Some(value) => parse_datetime(value)?,
        None => reference_end,
    };
    let (lf, identity) = drift_frame_with_identity(&state, &query.cleaning_plan)?;
    let comparison_end = match query.comparison_end.as_deref() {
        Some(value) => parse_datetime(value)?,
        None => {
            let ctx = state.ts_context(&lf)?;
            let max_native = max_timestamp_native(
                &state,
                &lf,
                &ctx.ts_col,
                reference_end.timestamp_millis() * ctx.multiplier,
            )
            .await?;
            DateTime::<Utc>::from_timestamp_millis(
                native_to_epoch_ms(max_native, &ctx.dtype).round() as i64,
            )
            .ok_or_else(|| AppError::bad_request("invalid comparison end derived from dataset"))?
        }
    };
    validate_time_window(comparison_start, comparison_end)?;

    let limits = &state.config.validation;
    let columns =
        validate_numeric_columns_lazy(&lf, &query.columns, limits).map_err(AppError::from)?;
    let ctx = state.ts_context(&lf)?;
    if let Some(segment_by) = query.segment_by.as_deref() {
        let schema = lf
            .clone()
            .collect_schema()
            .map_err(|error| AppError::bad_request(format!("Failed to read schema: {error}")))?;
        let dtype = schema.get(segment_by).ok_or_else(|| {
            AppError::bad_request(format!("Unknown segment column '{segment_by}'"))
        })?;
        if segment_by == ctx.ts_col
            || matches!(
                dtype,
                polars::prelude::DataType::Datetime(_, _) | polars::prelude::DataType::Date
            )
        {
            return Err(AppError::bad_request(format!(
                "Segment column '{segment_by}' cannot be the time column",
            )));
        }
    }

    let (df, _, _) = filtered_drift_df(
        &state,
        lf,
        &columns,
        query.segment_by.as_deref(),
        reference_start,
        comparison_end,
    )
    .await?;
    let thresholds = normalized_thresholds(
        query.ks_pvalue_threshold,
        query.es_pvalue_threshold,
        query.psi_minor_threshold,
        query.psi_major_threshold,
        query.wasserstein_std_multiplier,
    );
    let response = compute_drift_investigation(
        &df,
        &columns,
        query.segment_by.as_deref(),
        query.segment_limit.unwrap_or(8),
        window_size,
        reference_start.timestamp_millis() as f64,
        reference_end.timestamp_millis() as f64,
        comparison_start.timestamp_millis() as f64,
        comparison_end.timestamp_millis() as f64,
        20,
        thresholds,
        query.include_quality.unwrap_or(true),
        query.include_change_points.unwrap_or(true),
        query.include_correlations.unwrap_or(true),
    )?;
    Ok(add_execution_identity_headers(
        Json(response).into_response(),
        &identity,
    ))
}

#[cfg(test)]
mod tests;
