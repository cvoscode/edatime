use axum::{
    extract::{Query, State},
    http::{HeaderValue, header},
    response::Response,
};
use chrono::{DateTime, Utc};
use polars::prelude::col;
use serde::Deserialize;

use edatime_query::arrow_export::dataframe_to_parquet;
use crate::error::AppError;
use edatime_query::filters::{apply_filters, parse_line_filters, parse_range_filters};
use edatime_query::query;
use edatime_store::state::AppState;
use edatime_query::validation::{validate_numeric_columns_lazy, validate_time_window};

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
    let filters = parse_range_filters(params.filters.as_deref())?;
    let line_filters = parse_line_filters(params.line_filters.as_deref())?;

    let start_ms = params.start.timestamp_millis() as f64;
    let end_ms = params.end.timestamp_millis() as f64;

    let filtered = tokio::task::spawn_blocking(move || {
        let filtered_lf = apply_filters(lf.clone(), Some(start_ms), Some(end_ms), &filters, &line_filters)?;

        let mut select_exprs = vec![col("ts")];
        for col_name in &value_cols {
            select_exprs.push(col(col_name.as_str()));
        }

        filtered_lf
            .with_new_streaming(true)
            .select(select_exprs)
            .collect()
            .map_err(|e| AppError::io(format!("export collect error: {}", e)))
    })
    .await
    .map_err(|e| AppError::internal(format!("Failed to join export task: {:?}", e)))??;

    let bytes = dataframe_to_parquet(filtered)
        .map_err(|e| AppError::io(format!("Parquet serialization: {}", e)))?;

    let mut response = Response::new(bytes.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-parquet"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=edatime_timeseries_filtered.parquet"),
    );
    Ok(response)
}
