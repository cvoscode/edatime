pub mod aggregate;
pub mod data;
pub mod export;
pub mod metadata;
pub mod metrics;
pub mod scatter;
pub mod upload;

use axum::Json;
use axum::Router;
use axum::response::IntoResponse;
use axum::routing::{get, post};

use crate::state::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/data", get(data::get_data))
        .route("/aggregate", get(aggregate::get_aggregate))
        .route("/export/parquet", get(export::export_parquet))
        .route("/metadata", get(metadata::get_metadata))
        .route("/metrics", get(metrics::get_metrics))
        .route(
            "/scatter/points",
            get(scatter::get_scatter_points).post(scatter::post_scatter_points),
        )
        .route(
            "/scatter/export/parquet",
            post(scatter::post_scatter_export_parquet),
        )
        .route(
            "/scatter/correlations",
            get(scatter::get_scatter_correlations),
        )
        .route(
            "/scatter/distributions",
            get(scatter::get_distributions).post(scatter::post_distributions),
        )
        .route("/upload", post(upload::upload_data))
        .route("/upload/preview", post(upload::preview_upload_data))
}

#[tracing::instrument]
pub async fn health() -> impl IntoResponse {
    tracing::debug!("health check");
    Json(serde_json::json!({ "status": "ok" }))
}
