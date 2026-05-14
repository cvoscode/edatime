pub mod aggregate;
pub mod analytics;
pub mod config;
pub mod data;
pub mod database;
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
            "/scatter/correlations/matrix",
            get(scatter::get_correlation_matrix),
        )
        .route("/upload", post(upload::upload_data))
        .route("/upload/preview", post(upload::preview_upload_data))
        .route("/sample/{name}", get(upload::serve_sample_file))
        // Database / TimescaleDB endpoints
        .route(
            "/database/connect",
            post(database::post_connect).delete(database::delete_connect),
        )
        .route("/database/status", get(database::get_status))
        .route("/database/tables", get(database::get_tables))
        .route("/database/columns", get(database::get_columns))
        .route("/database/load", post(database::post_load))
        // Config endpoints
        .route(
            "/config/database",
            get(config::get_database_config).post(config::post_database_config),
        )
        // Analytics endpoints
        .nest("/analytics", analytics_router())
        .route("/transform", post(analytics::post_transform))
}

fn analytics_router() -> Router<AppState> {
    Router::new()
        .route("/rolling", get(analytics::get_rolling))
        .route("/anomalies", get(analytics::get_anomalies))
        .route("/fft", get(analytics::get_fft))
        .route("/spectrogram", get(analytics::get_spectrogram))
        .route("/spectral-filter", get(analytics::get_spectral_filter))
        .route("/causal", post(analytics::post_causal_graph))
        .route("/remove_outliers", post(analytics::post_remove_outliers))
}

#[tracing::instrument]
pub async fn health() -> impl IntoResponse {
    tracing::debug!("health check");
    Json(serde_json::json!({ "status": "ok" }))
}
