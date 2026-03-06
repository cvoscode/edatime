use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
    http::{header, Method},
};
use tower_http::{
    services::ServeDir,
    cors::{Any, CorsLayer},
    trace::TraceLayer,
    set_header::SetResponseHeaderLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use std::sync::Arc;
use tokio::sync::RwLock;

mod state;
mod error;
mod ingest;
pub mod query;
pub mod pipeline;
pub mod routes;
pub mod downsample;
pub mod arrow_export;

use state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "edatime=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Default empty app state, load sample.csv if available
    let df = tokio::task::block_in_place(|| ingest::load_dataframe("sample.csv")).unwrap_or_else(|e| {
        tracing::warn!("Could not load sample.csv: {}. Starting with empty dataframe.", e);
        polars::prelude::DataFrame::default()
    });

    let state = AppState {
        df: Arc::new(RwLock::new(df)),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE]);

    let cache_layer = SetResponseHeaderLayer::overriding(
        header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("public, max-age=60")
    );

    let csp_layer = SetResponseHeaderLayer::overriding(
        header::CONTENT_SECURITY_POLICY,
        axum::http::HeaderValue::from_static("default-src 'self' unpkg.com esm.sh; script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com esm.sh; style-src 'self' 'unsafe-inline'; connect-src 'self' unpkg.com esm.sh blob:;")
    );

    let app = Router::new()
        .fallback_service(ServeDir::new("frontend"))
        .route("/api/health", get(routes::health))
        .route("/api/data", get(routes::data::get_data).layer(cache_layer))
        .route("/api/aggregate", get(routes::aggregate::get_aggregate))
        .route("/api/metadata", get(routes::metadata::get_metadata))
        .route("/api/scatter/points", get(routes::scatter::get_scatter_points).post(routes::scatter::post_scatter_points))
        .route("/api/scatter/correlations", get(routes::scatter::get_scatter_correlations))
        .route("/api/upload", post(routes::upload::upload_data))
        .route("/api/upload/preview", post(routes::upload::preview_upload_data))
        .layer(DefaultBodyLimit::disable())
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(csp_layer)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();
    tracing::info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}
