//! Distribution histogram handlers — GET/POST /api/scatter/distributions

use axum::{
    Json,
    extract::{Query, State},
};
use polars::prelude::*;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;
use crate::stats;

use super::{
    ScatterFilterSpec, ScatterLineFilterSpec, apply_scatter_filters, parse_scatter_filters,
    parse_scatter_line_filters, series_to_scatter_values,
};

const MAX_DISTRIBUTION_BINS: usize = 100;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DistributionsGetQuery {
    pub columns: String,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub filters: Option<String>,
    pub line_filters: Option<String>,
    pub bins: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DistributionsPostBody {
    pub columns: Vec<String>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub filters: Option<Vec<ScatterFilterSpec>>,
    pub line_filters: Option<Vec<ScatterLineFilterSpec>>,
    pub bins: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct ColumnHistogramData {
    pub bin_edges: Vec<f64>,
    pub counts: Vec<u64>,
}

#[derive(Debug, Serialize)]
pub struct ColumnDistributionResult {
    pub name: String,
    pub dtype: String,
    pub count: usize,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub std_dev: Option<f64>,
    pub median: Option<f64>,
    pub q1: Option<f64>,
    pub q3: Option<f64>,
    pub histogram: Option<ColumnHistogramData>,
}

#[derive(Debug, Serialize)]
pub struct DistributionsResponse {
    pub total_rows: usize,
    pub columns: Vec<ColumnDistributionResult>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

#[tracing::instrument(skip(state))]
pub async fn get_distributions(
    State(state): State<AppState>,
    Query(query): Query<DistributionsGetQuery>,
) -> Result<Json<DistributionsResponse>, AppError> {
    let columns: Vec<String> = query
        .columns
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let filters = parse_scatter_filters(query.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(query.line_filters.as_deref())?;
    let bins = query.bins.unwrap_or(24);
    compute_distributions(
        state,
        columns,
        query.start,
        query.end,
        filters,
        line_filters,
        bins,
    )
    .await
}

#[tracing::instrument(skip(state))]
pub async fn post_distributions(
    State(state): State<AppState>,
    Json(body): Json<DistributionsPostBody>,
) -> Result<Json<DistributionsResponse>, AppError> {
    let bins = body.bins.unwrap_or(24);
    let filters = body.filters.unwrap_or_default();
    let line_filters = body.line_filters.unwrap_or_default();
    compute_distributions(
        state,
        body.columns,
        body.start,
        body.end,
        filters,
        line_filters,
        bins,
    )
    .await
}

// ── Core logic ───────────────────────────────────────────────────────────────

fn build_distribution_histogram(
    values: &[f64],
    min: f64,
    max: f64,
    bins: usize,
) -> Option<ColumnHistogramData> {
    let hist = stats::build_histogram_with_bins(values, min, max, bins)?;
    Some(ColumnHistogramData {
        bin_edges: hist.bin_edges,
        counts: hist.counts,
    })
}

async fn compute_distributions(
    state: AppState,
    columns: Vec<String>,
    start: Option<f64>,
    end: Option<f64>,
    filters: Vec<ScatterFilterSpec>,
    line_filters: Vec<ScatterLineFilterSpec>,
    bins: usize,
) -> Result<Json<DistributionsResponse>, AppError> {
    if columns.is_empty() {
        return Err(AppError::bad_request("At least one column is required"));
    }

    let bins = bins.clamp(2, MAX_DISTRIBUTION_BINS);

    let df = state.dataset_snapshot().await;

    let total_rows = df.height();
    if total_rows == 0 {
        return Ok(Json(DistributionsResponse {
            total_rows: 0,
            columns: vec![],
        }));
    }

    tokio::task::spawn_blocking(move || {
        let mut valid_columns: Vec<String> = Vec::new();
        for name in &columns {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(series) = df.column(trimmed) {
                let dtype = series.dtype();
                if dtype.is_numeric() || matches!(dtype, DataType::Datetime(_, _) | DataType::Date)
                {
                    if !valid_columns.iter().any(|c: &String| c == trimmed) {
                        valid_columns.push(trimmed.to_string());
                    }
                }
            }
        }

        if valid_columns.is_empty() {
            return Ok(Json(DistributionsResponse {
                total_rows,
                columns: vec![],
            }));
        }

        let lf = apply_scatter_filters(&df, start, end, &filters, &line_filters)?;
        let select_exprs: Vec<Expr> = valid_columns.iter().map(|c| col(c.as_str())).collect();
        let filtered_df = lf
            .select(select_exprs)
            .collect()
            .map_err(|e| AppError::io(e.to_string()))?;

        let filtered_rows = filtered_df.height();
        let mut results = Vec::with_capacity(valid_columns.len());

        for col_name in &valid_columns {
            let dtype_str = df
                .column(col_name)
                .map(|s| format!("{}", s.dtype()))
                .unwrap_or_default();

            let values: Vec<f64> = match series_to_scatter_values(&filtered_df, col_name) {
                Ok(vals) => vals.into_iter().flatten().collect(),
                Err(_) => continue,
            };

            let count = values.len();
            let s = stats::compute_column_stats(&values);

            let histogram = match (s.min, s.max) {
                (Some(mn), Some(mx)) => build_distribution_histogram(&values, mn, mx, bins),
                _ => None,
            };

            results.push(ColumnDistributionResult {
                name: col_name.clone(),
                dtype: dtype_str,
                count,
                min: s.min,
                max: s.max,
                mean: s.mean,
                std_dev: s.std_dev,
                median: s.median,
                q1: s.q1,
                q3: s.q3,
                histogram,
            });
        }

        Ok(Json(DistributionsResponse {
            total_rows: filtered_rows,
            columns: results,
        }))
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join distributions task: {:?}", e)))?
}
