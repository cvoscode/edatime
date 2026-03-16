use axum::{
    Json,
    extract::{Multipart, State},
    response::IntoResponse,
};

use crate::error::AppError;
use crate::services::upload_service::UploadService;
use crate::state::AppState;

#[tracing::instrument(skip(state, multipart))]
pub async fn upload_data(
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Received file upload request");
    Ok(Json(
        UploadService::new(state).upload_data(multipart).await?,
    ))
}

#[tracing::instrument(skip(state, multipart))]
pub async fn preview_upload_data(
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tracing::info!("Received upload preview request");
    Ok(Json(
        UploadService::new(state)
            .preview_upload_data(multipart)
            .await?,
    ))
}
