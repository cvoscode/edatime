pub mod aggregate;
pub mod data;
pub mod metadata;
pub mod scatter;
pub mod upload;

use axum::response::IntoResponse;
use axum::Json;

#[tracing::instrument]
pub async fn health() -> impl IntoResponse {
    tracing::debug!("health check");
    Json(serde_json::json!({ "status": "ok" }))
}
