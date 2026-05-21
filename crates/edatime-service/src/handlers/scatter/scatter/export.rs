//! Scatter export handlers — Parquet export of filtered scatter data.

use axum::{Json, extract::State, http::{HeaderValue, header}, response::Response};
use crate::arrow_export::dataframe_to_parquet;
use crate::error::AppError;
use crate::state::AppState;

use super::{ScatterPointsQuery, parse_scatter_filters, parse_scatter_line_filters};
use super::collect::collect_filtered_scatter_frame;

#[tracing::instrument(skip(state))]
pub async fn post_scatter_export_parquet(
    State(state): State<AppState>,
    Json(params): Json<ScatterPointsQuery>,
) -> Result<Response, AppError> {
    let lf = state.dataset_snapshot();

    let x = params.x.clone();
    let y = params.y.clone();
    let color = params.color.clone().filter(|s| !s.trim().is_empty());
    let size = params.size.clone().filter(|s| !s.trim().is_empty());
    let filters = parse_scatter_filters(params.filters.as_deref())?;
    let line_filters = parse_scatter_line_filters(params.line_filters.as_deref())?;

    let lazy_frame = collect_filtered_scatter_frame(
        lf,
        &x,
        &y,
        color.as_deref(),
        size.as_deref(),
        params.start,
        params.end,
        &filters,
        &line_filters,
    )?;
    let filtered = state.query_executor.execute_async(lazy_frame).await?;

    let bytes = dataframe_to_parquet(filtered)
        .map_err(|e| AppError::io(format!("Parquet serialization: {}", e)))?;
    let mut response = Response::new(bytes.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-parquet"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=edatime_scatter_filtered.parquet"),
    );
    Ok(response)
}