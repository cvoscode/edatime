//! Read-only operational visibility for session-scoped admitted work.

use axum::{
    Json,
    extract::{Path, State},
};

use crate::error::AppError;
use edatime_store::{jobs::JobRecord, state::AppState};

pub async fn list_jobs(State(state): State<AppState>) -> Json<Vec<JobRecord>> {
    Json(state.jobs.list())
}

pub async fn get_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<JobRecord>, AppError> {
    state
        .jobs
        .record(&id)
        .map(Json)
        .ok_or_else(|| AppError::bad_request("Unknown session job"))
}

pub async fn cancel_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<JobRecord>, AppError> {
    state
        .jobs
        .cancel(&id)
        .map(Json)
        .ok_or_else(|| AppError::bad_request("Unknown session job"))
}
