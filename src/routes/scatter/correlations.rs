//! Scatter correlation handler — GET /api/scatter/correlations

use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;

use crate::error::AppError;
use crate::state::AppState;
use crate::stats;

use super::{CorrelationItem, collect_xy_pairs, numeric_columns};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScatterCorrelationsQuery {
    pub base: Option<String>,
    pub threshold: Option<f64>,
}

#[derive(Debug, serde::Serialize)]
pub struct ScatterCorrelationsResponse {
    pub base_column: String,
    pub threshold: f64,
    pub numeric_columns: Vec<String>,
    pub correlations: Vec<CorrelationItem>,
    pub suggestions: Vec<CorrelationItem>,
}

fn build_correlation_item(
    df: &polars::prelude::DataFrame,
    base: &str,
    other: &str,
) -> Result<CorrelationItem, AppError> {
    let pairs = collect_xy_pairs(df, base, other)?;
    let pearson = stats::pearson(&pairs);
    let spearman = stats::spearman(&pairs);

    Ok(CorrelationItem {
        column: other.to_string(),
        count: pairs.len(),
        pearson,
        spearman,
    })
}

#[tracing::instrument(skip(state))]
pub async fn get_scatter_correlations(
    State(state): State<AppState>,
    Query(params): Query<ScatterCorrelationsQuery>,
) -> Result<Json<ScatterCorrelationsResponse>, AppError> {
    tracing::info!(
        "get_scatter_correlations called with base={:?}, threshold={:?}",
        params.base,
        params.threshold
    );

    let df = state.dataset_snapshot().await;

    let threshold = params.threshold.unwrap_or(0.7).clamp(0.0, 1.0);
    let requested_base = params.base.clone();

    tokio::task::spawn_blocking(move || {
        let mut numeric = numeric_columns(&df);
        numeric.sort();

        if numeric.len() < 2 {
            return Err(AppError::bad_request(
                "Need at least two numeric columns for scatter correlations",
            ));
        }

        let base_column = if let Some(base) = requested_base {
            if !numeric.iter().any(|c| c == &base) {
                return Err(AppError::bad_request(format!(
                    "Base column '{}' is not numeric/temporal",
                    base
                )));
            }
            base
        } else {
            numeric
                .iter()
                .find(|c| c.as_str() != "ts")
                .cloned()
                .unwrap_or_else(|| numeric[0].clone())
        };

        let mut correlations = Vec::new();
        for col in numeric.iter().filter(|c| *c != &base_column) {
            correlations.push(build_correlation_item(&df, &base_column, col)?);
        }

        correlations.sort_by(|a, b| {
            let a_score = a
                .pearson
                .map(|v| v.abs())
                .unwrap_or(0.0)
                .max(a.spearman.map(|v| v.abs()).unwrap_or(0.0));
            let b_score = b
                .pearson
                .map(|v| v.abs())
                .unwrap_or(0.0)
                .max(b.spearman.map(|v| v.abs()).unwrap_or(0.0));
            b_score.total_cmp(&a_score)
        });

        let suggestions: Vec<CorrelationItem> = correlations
            .iter()
            .filter(|item| {
                item.pearson.map(|v| v.abs()).unwrap_or(0.0) >= threshold
                    || item.spearman.map(|v| v.abs()).unwrap_or(0.0) >= threshold
            })
            .cloned()
            .collect();

        Ok(Json(ScatterCorrelationsResponse {
            base_column,
            threshold,
            numeric_columns: numeric,
            correlations,
            suggestions,
        }))
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join scatter correlation task: {:?}", e)))?
}
