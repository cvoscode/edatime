pub mod aggregate;
pub mod analytics;
pub mod cleaning;
pub mod config;
pub mod data;
pub mod database;
pub mod drift;
pub mod jobs;
pub mod metadata;
pub mod metrics;
pub mod shared;
pub mod upload;

// Re-export scatter from parent module (handlers::scatter)
pub use crate::handlers::scatter;

use axum::Router;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, extract::DefaultBodyLimit, extract::State};

use edatime_store::state::AppState;

pub fn api_router(max_json_body_bytes: usize) -> Router<AppState> {
    let json_routes = Router::new()
        .route("/health", get(health))
        .route("/build", get(build_identity))
        .route("/contract", get(api_contract))
        .route("/capabilities", get(capabilities))
        .route("/data", post(data::post_data))
        .route("/cleaning/validate", post(cleaning::validate))
        .route("/cleaning/preview", post(cleaning::preview))
        .route(
            "/cleaning/propose/outliers",
            post(cleaning::propose_outliers),
        )
        .route("/cleaning/apply", post(cleaning::apply))
        .route("/cleaning/export/data", post(cleaning::export_data))
        .route("/cleaning/export/plan", post(cleaning::export_plan))
        .route("/cleaning/export/code", post(cleaning::export_code))
        .route("/cleaning/export/manifest", post(cleaning::export_manifest))
        .route("/cleaning/export/bundle", post(cleaning::export_bundle))
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
        .route("/scatter/points", post(scatter::post_scatter_points))
        .route("/scatter/matrix", post(scatter::post_scatter_matrix))
        .route(
            "/scatter/export/parquet",
            post(scatter::post_scatter_export_parquet),
        )
        .route(
            "/scatter/correlations",
            post(scatter::post_scatter_correlations),
        )
        .route(
            "/scatter/correlations/matrix",
            post(scatter::post_correlation_matrix),
        )
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
        .route("/config/database", get(config::get_database_config))
        // Aggregate endpoint
        .route("/aggregate", get(aggregate::get_aggregate))
        // Analytics endpoints
        .nest("/analytics", analytics_router())
        // Drift endpoint
        .route("/drift/stats", post(drift::post_drift_stats))
        .route("/drift/investigate", post(drift::post_drift_investigate))
        .layer(DefaultBodyLimit::max(max_json_body_bytes.max(1024)));

    let upload_routes = Router::new()
        .route("/upload", post(upload::upload_data))
        .route("/upload/preview", post(upload::preview_upload_data))
        .route("/sample/{name}", get(upload::serve_sample_file));

    json_routes.merge(upload_routes)
}

fn analytics_router() -> Router<AppState> {
    Router::new()
        .route("/rolling", post(analytics::post_rolling))
        .route("/anomalies", post(analytics::post_anomalies))
        .route("/fft", post(analytics::post_fft))
        .route("/spectrogram", post(analytics::post_spectrogram))
        .route("/spectral-filter", post(analytics::post_spectral_filter))
        .route("/causal", post(analytics::post_causal_graph))
}

#[tracing::instrument]
pub async fn health() -> impl IntoResponse {
    tracing::debug!("health check");
    Json(serde_json::json!({ "status": "ok" }))
}

#[tracing::instrument]
pub async fn build_identity() -> impl IntoResponse {
    Json(serde_json::json!({
        "package": "edatime",
        "version": env!("CARGO_PKG_VERSION"),
        "git_sha": option_env!("EDATIME_BUILD_SHA").unwrap_or("unknown"),
        "profile": option_env!("EDATIME_BUILD_PROFILE").unwrap_or("unknown"),
        "contract_version": "v1"
    }))
}

#[tracing::instrument]
pub async fn api_contract() -> impl IntoResponse {
    (
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        include_str!("../../../../../contracts/api-v1.json"),
    )
}

#[tracing::instrument(skip(state))]
pub async fn capabilities(State(state): State<AppState>) -> impl IntoResponse {
    let query = &state.config.query;
    let budgets = &state.config.budgets;
    Json(serde_json::json!({
        "contract_version": "v1",
        "admission": {
            "interactive_concurrency": query.max_interactive_concurrency,
            "background_concurrency": query.max_background_concurrency,
            "blocking_io_concurrency": query.max_blocking_io_concurrency,
            "max_queued_per_class": query.max_queued_per_class,
            "queue_timeout_ms": query.queue_timeout_ms
        },
        "budgets": {
            "scatter_matrix_pairs": budgets.max_scatter_matrix_pairs,
            "scatter_matrix_points": budgets.max_scatter_matrix_points,
            "rolling_cells": budgets.max_rolling_cells,
            "spectrogram_cells": budgets.max_spectrogram_cells,
            "causal_work_units": budgets.max_causal_work_units,
            "cleaning_stages": budgets.max_cleaning_stages,
            "database_rows": budgets.max_database_rows,
            "json_body_bytes": budgets.max_json_body_bytes
        }
    }))
}
