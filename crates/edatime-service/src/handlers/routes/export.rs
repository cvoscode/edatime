use axum::{
    extract::{Query, State},
    response::Response,
};
use chrono::{DateTime, Utc};
use polars::prelude::col;
use serde::Deserialize;

use crate::error::AppError;
use crate::streaming_export::lazy_parquet_response;
use edatime_query::filters::{apply_filters, parse_line_filters, parse_range_filters};
use edatime_query::query;
use edatime_query::validation::{validate_numeric_columns_lazy, validate_time_window};
use edatime_store::state::AppState;

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ExportParquetQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub columns: Option<String>,
    pub filters: Option<String>,
    pub line_filters: Option<String>,
}

#[tracing::instrument(skip(state))]
pub async fn export_parquet(
    State(state): State<AppState>,
    Query(params): Query<ExportParquetQuery>,
) -> Result<Response, AppError> {
    validate_time_window(params.start, params.end)?;

    let lf = state.dataset_snapshot();
    let limits = &state.config.validation;
    let parsed_cols = query::parse_columns(params.columns.as_deref());
    let value_cols = validate_numeric_columns_lazy(&lf, &parsed_cols, limits)?;
    let ctx = state.ts_context(&lf)?;
    let ts_col = ctx.ts_col;
    let filters = parse_range_filters(params.filters.as_deref())?;
    let line_filters = parse_line_filters(params.line_filters.as_deref())?;

    let start_ms = params.start.timestamp_millis() as f64;
    let end_ms = params.end.timestamp_millis() as f64;

    let filtered = apply_filters(
        lf,
        Some(ts_col.as_str()),
        Some(start_ms),
        Some(end_ms),
        &filters,
        &line_filters,
    )?;
    let mut select_exprs = vec![col(ts_col.as_str())];
    for col_name in &value_cols {
        select_exprs.push(col(col_name.as_str()));
    }
    lazy_parquet_response(
        &state.query_executor,
        filtered.select(select_exprs),
        "edatime_timeseries_filtered.parquet",
    )
    .await
}
