//! `POST /api/drift/stats` and `POST /api/drift/investigate`.

use axum::{Json, extract::State, response::Response};
use chrono::{DateTime, NaiveDateTime, Utc};
use polars::prelude::col;
use serde::Deserialize;

use crate::analytics::{DriftThresholds, compute_drift_investigation, compute_temporal_drift};
use crate::error::AppError;
use edatime_core::temporal::native_to_epoch_ms;
use edatime_query::pipeline::filter_time_range;
use edatime_query::validation::validate_numeric_columns_lazy;
use edatime_query::validation::validate_time_window;
use edatime_store::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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

async fn max_timestamp_native(state: &AppState, lf: &polars::prelude::LazyFrame, ts_col: &str, fallback: i64) -> Result<i64, AppError> {
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
    query_columns: &[String],
    segment_by: Option<&str>,
    reference_start: DateTime<Utc>,
    comparison_end: DateTime<Utc>,
) -> Result<(polars::prelude::DataFrame, i64, f64), AppError> {
    let lf = state.dataset_snapshot();
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
    let filtered_lf =
        filter_time_range(lf, reference_start_native, comparison_end_native, &selected_columns, &ts_col)?;
    let df = state.query_executor.execute_async(filtered_lf).await?;
    Ok((df, comparison_end_native, native_to_epoch_ms(comparison_end_native, &ctx.dtype)))
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

    let ref_start_native = ref_start.timestamp_millis() * multiplier;
    let ref_end_native = ref_end.timestamp_millis() * multiplier;

    let max_ts_i64 = max_timestamp_native(&state, &lf, &ts_col, ref_end_native).await?;

    let ref_start_ms = ref_start.timestamp_millis() as f64;
    let ref_end_ms = ref_end.timestamp_millis() as f64;
    let curr_start_ms = ref_end_ms;
    let curr_end_ms = native_to_epoch_ms(max_ts_i64, &ctx.dtype);

    // filter_time_range now returns LazyFrame; execute on Rayon pool
    // Include the target column in the selection so compute_temporal_drift can access it
    let col_name = query.column.clone();
    let filtered_lf = filter_time_range(lf, ref_start_native, max_ts_i64, &[col_name], &ts_col)?;
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
        &query.column,
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
    Response::builder()
        .header("content-type", "application/json")
        .body(body.into())
        .map_err(|e| AppError::internal(e.to_string()))
}

#[tracing::instrument(skip(state))]
pub async fn post_drift_investigate(
    State(state): State<AppState>,
    Json(query): Json<DriftInvestigateQuery>,
) -> Result<Json<crate::analytics::DriftInvestigationResponse>, AppError> {
    let window_size = window_ms(&query.window);
    let reference_start = parse_datetime(&query.reference_start)?;
    let reference_end = parse_datetime(&query.reference_end)?;
    validate_time_window(reference_start, reference_end)?;

    let comparison_start = match query.comparison_start.as_deref() {
        Some(value) => parse_datetime(value)?,
        None => reference_end,
    };
    let comparison_end = match query.comparison_end.as_deref() {
        Some(value) => parse_datetime(value)?,
        None => {
            let lf = state.dataset_snapshot();
            let ctx = state.ts_context(&lf)?;
            let max_native = max_timestamp_native(
                &state,
                &lf,
                &ctx.ts_col,
                reference_end.timestamp_millis() * ctx.multiplier,
            )
            .await?;
            DateTime::<Utc>::from_timestamp_millis(native_to_epoch_ms(max_native, &ctx.dtype).round() as i64)
                .ok_or_else(|| AppError::bad_request("invalid comparison end derived from dataset"))?
        }
    };
    validate_time_window(comparison_start, comparison_end)?;

    let lf = state.dataset_snapshot();
    let limits = &state.config.validation;
    let columns = validate_numeric_columns_lazy(&lf, &query.columns, limits)
        .map_err(AppError::from)?;
    let ctx = state.ts_context(&lf)?;
    if let Some(segment_by) = query.segment_by.as_deref() {
        let schema = lf
            .clone()
            .collect_schema()
            .map_err(|error| AppError::bad_request(format!("Failed to read schema: {error}")))?;
        let dtype = schema
            .get(segment_by)
            .ok_or_else(|| AppError::bad_request(format!("Unknown segment column '{segment_by}'")))?;
        if segment_by == ctx.ts_col || matches!(dtype, polars::prelude::DataType::Datetime(_, _) | polars::prelude::DataType::Date) {
            return Err(AppError::bad_request(format!(
                "Segment column '{segment_by}' cannot be the time column",
            )));
        }
    }

    let (df, _, _) = filtered_drift_df(
        &state,
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
    Ok(Json(response))
}
