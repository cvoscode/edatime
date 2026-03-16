//! `GET /api/aggregate` — bucket-aggregated data for bar / heatmap charts.

use axum::{
    extract::{Query, State},
    response::Response,
};

use crate::error::AppError;
use crate::query::AggregateQuery;
use crate::services::aggregate_service::AggregateService;
use crate::state::AppState;

#[tracing::instrument(skip(state))]
pub async fn get_aggregate(
    State(state): State<AppState>,
    Query(params): Query<AggregateQuery>,
) -> Result<Response, AppError> {
    tracing::info!("get_aggregate called with params: {:?}", params);
    AggregateService::new(state).get_aggregate(params).await
}
