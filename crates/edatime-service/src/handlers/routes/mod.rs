pub mod aggregate;
pub mod analytics;
pub mod cleaning;
pub mod config;
pub mod data;
pub mod database;
pub mod drift;
pub mod export;
pub mod jobs;
pub mod metadata;
pub mod metrics;
pub mod shared;
pub mod upload;

// Re-export scatter from parent module (handlers::scatter)
pub use crate::handlers::scatter;

use axum::Json;
use axum::Router;
use axum::response::IntoResponse;
use axum::routing::{get, post};

use edatime_store::state::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/data", get(data::get_data).post(data::post_data))
        .route("/export/parquet", get(export::export_parquet))
        .route("/cleaning/validate", post(cleaning::validate))
        .route("/cleaning/preview", post(cleaning::preview))
        .route("/cleaning/apply", post(cleaning::apply))
        .route("/cleaning/export/data", post(cleaning::export_data))
        .route("/cleaning/export/plan", post(cleaning::export_plan))
        .route("/datasets/versions", get(cleaning::list_versions))
        .route("/datasets/versions/select", post(cleaning::select_version))
        .route("/datasets/storage", get(cleaning::get_storage_usage))
        .route("/metadata", get(metadata::get_metadata))
        .route(
            "/profile",
            get(metadata::get_profile).post(metadata::start_profile),
        )
        .route(
            "/profile/sample",
            get(metadata::get_sample_profile).post(metadata::start_sample_profile),
        )
        .route("/metrics", get(metrics::get_metrics))
        .route("/jobs", get(jobs::list_jobs))
        .route("/jobs/{id}", get(jobs::get_job).delete(jobs::cancel_job))
        .route(
            "/scatter/points",
            get(scatter::get_scatter_points).post(scatter::post_scatter_points),
        )
        .route("/scatter/matrix", post(scatter::post_scatter_matrix))
        .route(
            "/scatter/export/parquet",
            post(scatter::post_scatter_export_parquet),
        )
        .route(
            "/scatter/correlations",
            get(scatter::get_scatter_correlations).post(scatter::post_scatter_correlations),
        )
        .route(
            "/scatter/correlations/matrix",
            get(scatter::get_correlation_matrix).post(scatter::post_correlation_matrix),
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
        // Aggregate endpoint
        .route("/aggregate", get(aggregate::get_aggregate))
        // Analytics endpoints
        .nest("/analytics", analytics_router())
        .route("/transform", post(analytics::post_transform))
        // Drift endpoint
        .route("/drift/stats", post(drift::post_drift_stats))
        .route("/drift/investigate", post(drift::post_drift_investigate))
}

fn analytics_router() -> Router<AppState> {
    Router::new()
        .route(
            "/rolling",
            get(analytics::get_rolling).post(analytics::post_rolling),
        )
        .route(
            "/anomalies",
            get(analytics::get_anomalies).post(analytics::post_anomalies),
        )
        .route("/fft", get(analytics::get_fft).post(analytics::post_fft))
        .route(
            "/spectrogram",
            get(analytics::get_spectrogram).post(analytics::post_spectrogram),
        )
        .route(
            "/spectral-filter",
            get(analytics::get_spectral_filter).post(analytics::post_spectral_filter),
        )
        .route("/causal", post(analytics::post_causal_graph))
        .route("/remove_outliers", post(analytics::post_remove_outliers))
}

#[tracing::instrument]
pub async fn health() -> impl IntoResponse {
    tracing::debug!("health check");
    Json(serde_json::json!({ "status": "ok" }))
}
