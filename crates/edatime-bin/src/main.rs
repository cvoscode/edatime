//! Canonical edatime production binary.

use std::net::SocketAddr;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use edatime_core::config::AppConfig;
use edatime_service::app::build_app;
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

    if let Err(error) = config.validate_bind_security() {
        tracing::error!("{error}");
        std::process::exit(2);
    }

    let bind_address = config.bind_address();
    let state = AppState::new(polars::prelude::DataFrame::default(), config.clone());

    let frontend_dir = std::env::var("EDATIME_FRONTEND_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("frontend")
                .join("dist")
        });

    let app = build_app(state, frontend_dir.clone());

    let listener = match tokio::net::TcpListener::bind(&bind_address).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("failed to bind TCP listener on {}: {}", bind_address, e);
            std::process::exit(1);
        }
    };
    let local_addr = match listener.local_addr() {
        Ok(a) => a,
        Err(e) => {
            tracing::error!("failed to get local address: {}", e);
            std::process::exit(1);
        }
    };

    tracing::info!("edatime listening on {}", local_addr);
    tracing::info!("serving frontend from {}", frontend_dir.display());
    tracing::info!("bind address: {}", bind_address);

    if let Err(error) = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    {
        tracing::error!("server error: {error}");
        std::process::exit(1);
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!("failed to install Ctrl+C handler: {error}");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => tracing::error!("failed to install SIGTERM handler: {error}"),
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => tracing::info!("received Ctrl+C, shutting down"),
        () = terminate => tracing::info!("received SIGTERM, shutting down"),
    }
}
