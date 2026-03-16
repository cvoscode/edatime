use axum::{
    Router, extract::ConnectInfo, extract::DefaultBodyLimit, http::HeaderMap, http::Method,
    middleware::from_fn, response::IntoResponse,
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
    trace::TraceLayer,
};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

pub mod arrow_export;
mod cache;
mod config;
pub mod downsample;
mod error;
mod ingest;
mod metrics;
pub mod pipeline;
pub mod query;
mod rates;
mod repository;
pub mod routes;
mod services;
mod state;
mod validation;

use config::AppConfig;
use error::AppError;
use state::AppState;

fn forwarded_client_ip(headers: &HeaderMap) -> Option<String> {
    let forwarded = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    forwarded
        .or_else(|| {
            headers
                .get("cf-connecting-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            headers
                .get("true-client-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn client_ip_from_request(req: &axum::extract::Request) -> String {
    if let Some(ip) = forwarded_client_ip(req.headers()) {
        return ip;
    }

    req.extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

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

    // Default empty app state, load sample.csv if available
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
    let metrics = state.metrics.clone();

    // Create rate limiter
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
        axum::http::HeaderValue::from_static(
            "default-src 'self' unpkg.com esm.sh; script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com esm.sh; style-src 'self' 'unsafe-inline'; connect-src 'self' unpkg.com esm.sh blob:;",
        ),
    );

    // Rate limiting middleware
    let rate_limit_middleware = from_fn(
        move |req: axum::extract::Request, next: axum::middleware::Next| {
            let rate_limiter = Arc::clone(&rate_limiter);
            let metrics = Arc::clone(&metrics);
            async move {
                let method = req.method().to_string();
                let path = req.uri().path().to_string();
                let started_at = Instant::now();

                let client_ip = client_ip_from_request(&req);

                let result = rate_limiter.check(&client_ip);

                if !result.allowed {
                    metrics.record_rate_limited();
                    let mut response =
                        AppError::rate_limit("Rate limit exceeded. Please try again later.")
                            .into_response();
                    if let Some(retry_after) = result.retry_after_seconds {
                        if let Ok(value) =
                            axum::http::HeaderValue::from_str(&retry_after.to_string())
                        {
                            response
                                .headers_mut()
                                .insert(axum::http::header::RETRY_AFTER, value);
                        }
                    }
                    metrics.record_request(
                        &method,
                        &path,
                        response.status().as_u16(),
                        started_at.elapsed().as_nanos() as u64,
                    );
                    return Ok::<_, AppError>(response);
                }

                let mut response = next.run(req).await;
                if let Ok(value) =
                    axum::http::HeaderValue::from_str(&result.remaining_requests.to_string())
                {
                    response
                        .headers_mut()
                        .insert("x-ratelimit-remaining", value);
                }
                metrics.record_request(
                    &method,
                    &path,
                    response.status().as_u16(),
                    started_at.elapsed().as_nanos() as u64,
                );
                Ok::<_, AppError>(response)
            }
        },
    );

    let app = Router::new()
        .nest("/api", routes::api_router())
        .nest("/api/v1", routes::api_router())
        .fallback_service(ServeDir::new("frontend"))
        .layer(DefaultBodyLimit::max(max_upload_bytes))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(csp_layer)
        .layer(rate_limit_middleware)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind_address).await.unwrap();
    tracing::info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
