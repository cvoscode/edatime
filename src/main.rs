use axum::{Router, extract::DefaultBodyLimit, http::Method, middleware::from_fn};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
    trace::TraceLayer,
};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

pub mod analytics;
pub mod arrow_export;
pub mod cache;
pub mod config;
pub mod downsample;
pub mod error;
pub mod filters;
pub mod ingest;
pub mod metrics;
pub mod middleware;
pub mod pipeline;
pub mod query;
pub mod rates;
pub mod repository;
pub mod routes;
pub mod state;
pub mod stats;
pub mod temporal;
pub mod validation;

use config::AppConfig;
use state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "edatime=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::load().unwrap_or_else(|error| {
        tracing::warn!("Could not load config: {}. Using defaults.", error);
        AppConfig::default()
    });

    let sample_path = config.data.sample_data_path.clone();
    let df =
        tokio::task::block_in_place(|| ingest::load_dataframe(&sample_path)).unwrap_or_else(|e| {
            tracing::warn!(
                "Could not load {}: {}. Starting with empty dataframe.",
                sample_path,
                e
            );
            polars::prelude::DataFrame::default()
        });

    let max_upload_bytes = config.upload.max_upload_bytes;
    let bind_address = config.bind_address();
    let state = AppState::new(df, config.clone());

    let rate_limiter = Arc::new(rates::RateLimiter::new(
        config.rate_limit.max_requests,
        config.rate_limit.window_seconds,
    ));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let csp_layer = tower_http::set_header::SetResponseHeaderLayer::overriding(
        axum::http::header::CONTENT_SECURITY_POLICY,
        middleware::csp_header_value(&config.server.csp_extra_origins),
    );

    let rate_limit_fn = middleware::rate_limit_middleware(rate_limiter, state.metrics.clone());

    let frontend_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("frontend");

    let app = Router::new()
        .nest("/api", routes::api_router())
        .nest("/api/v1", routes::api_router())
        .fallback_service(ServeDir::new(frontend_dir))
        .layer(DefaultBodyLimit::max(max_upload_bytes))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(csp_layer)
        .layer(from_fn(rate_limit_fn))
        .with_state(state);

    let listener = match tokio::net::TcpListener::bind(&bind_address).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("failed to bind TCP listener on {}: {}", bind_address, e);
            std::process::exit(1);
        }
    };
    let local_addr = match listener.local_addr() {
        Ok(addr) => addr,
        Err(e) => {
            tracing::error!("failed to read local address: {}", e);
            std::process::exit(1);
        }
    };
    tracing::info!("listening on {}", local_addr);

    if let Err(e) = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    {
        tracing::error!("server error: {}", e);
        std::process::exit(1);
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => tracing::info!("received Ctrl+C, shutting down"),
        () = terminate => tracing::info!("received SIGTERM, shutting down"),
    }
}
