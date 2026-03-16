//! `GET /api/data` — full dataset

use axum::{
    extract::{Query, State},
    response::Response,
};

use crate::error::AppError;
use crate::query::DataQuery;
use crate::services::data_service::DataService;
use crate::state::AppState;

#[tracing::instrument(skip(state))]
pub async fn get_data(
    State(state): State<AppState>,
    Query(params): Query<DataQuery>,
) -> Result<Response, AppError> {
    tracing::info!("get_data called with params: {:?}", params);
    DataService::new(state).get_data(params).await
}
