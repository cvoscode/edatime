use axum::{
    Router,
    extract::{DefaultBodyLimit, Request},
    http::{Method, header},
    middleware::{Next, from_fn},
    response::Response,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    services::ServeDir,
    trace::TraceLayer,
};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use edatime_core::config::AppConfig;
use edatime_service::middleware;
use edatime_service::rates;
use edatime_service::routes;
use edatime_service::state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "edatime=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = match AppConfig::load() {
        Ok(c) => c,
        Err(error) => {
            tracing::warn!("Could not load config: {error}. Using defaults.");
            AppConfig::default()
        }
    };

    let max_upload_bytes = config.upload.max_upload_bytes;
    let bind_address = config.bind_address();
    let state = AppState::new(polars::prelude::DataFrame::default(), config.clone());

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

    let rate_limit_fn =
        middleware::rate_limit_middleware(rate_limiter, std::sync::Arc::clone(&state.metrics));

    let frontend_dir = std::env::var("EDATIME_FRONTEND_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("frontend")
                .join("dist")
        });

    let app = Router::new()
        .nest("/api", routes::api_router())
        .nest("/api/v1", routes::api_router())
        .fallback_service(ServeDir::new(frontend_dir))
        .layer(from_fn(frontend_cache_control_middleware))
        .layer(DefaultBodyLimit::max(max_upload_bytes))
        .layer(CompressionLayer::new().gzip(true))
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
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::error!("failed to install Ctrl+C handler: {}", e);
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(e) => tracing::error!("failed to install SIGTERM handler: {}", e),
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => tracing::info!("received Ctrl+C, shutting down"),
        () = terminate => tracing::info!("received SIGTERM, shutting down"),
    }
}

async fn frontend_cache_control_middleware(req: Request, next: Next) -> Response {
    let path = req.uri().path().to_owned();
    let is_frontend_request =
        matches!(*req.method(), Method::GET | Method::HEAD) && !path.starts_with("/api");
    let mut response = next.run(req).await;

    if is_frontend_request && response.status().is_success() {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-store, no-cache, must-revalidate"),
        );
        response
            .headers_mut()
            .insert(header::PRAGMA, header::HeaderValue::from_static("no-cache"));
        response
            .headers_mut()
            .insert(header::EXPIRES, header::HeaderValue::from_static("0"));
    }

    response
}
