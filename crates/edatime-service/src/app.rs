//! Canonical application assembly shared by the production binary and tests.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    Router,
    extract::{DefaultBodyLimit, Request},
    http::{HeaderValue, Method, header},
    middleware::{Next, from_fn},
    response::Response,
};
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, CorsLayer},
    services::ServeDir,
    trace::TraceLayer,
};

use crate::{middleware, rates, routes};
use edatime_store::state::AppState;

/// Assemble the exact middleware and route stack used in production.
pub fn build_app(state: AppState, frontend_dir: PathBuf) -> Router {
    let max_upload_bytes = state.config.upload.max_upload_bytes;
    let rate_limiter = Arc::new(rates::RateLimiter::new(
        state.config.rate_limit.max_requests,
        state.config.rate_limit.window_seconds,
        state.config.rate_limit.max_clients,
    ));
    let trusted_proxy_ips = Arc::new(
        state
            .config
            .server
            .trusted_proxy_ips
            .iter()
            .cloned()
            .collect::<HashSet<_>>(),
    );
    let rate_limit_fn = middleware::rate_limit_middleware(
        rate_limiter,
        Arc::clone(&state.metrics),
        trusted_proxy_ips,
    );

    let allowed_origins = state
        .config
        .server
        .cors_allowed_origins
        .iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect::<Vec<_>>();
    let mut cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::HeaderName::from_static("x-request-id"),
        ]);
    if !allowed_origins.is_empty() {
        cors = cors.allow_origin(AllowOrigin::list(allowed_origins));
    }

    let csp_layer = tower_http::set_header::SetResponseHeaderLayer::overriding(
        header::CONTENT_SECURITY_POLICY,
        middleware::csp_header_value(&state.config.server.csp_extra_origins),
    );

    Router::new()
        .nest(
            "/api/v1",
            routes::api_router(state.config.budgets.max_json_body_bytes),
        )
        .fallback_service(ServeDir::new(frontend_dir))
        .layer(from_fn(frontend_cache_control_middleware))
        .layer(DefaultBodyLimit::max(max_upload_bytes))
        .layer(CompressionLayer::new().gzip(true))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(csp_layer)
        .layer(from_fn(rate_limit_fn))
        // Added last so it is the outer boundary and can normalize rejections
        // emitted by every inner route or middleware layer.
        .layer(from_fn(middleware::request_context_middleware))
        .with_state(state)
}

async fn frontend_cache_control_middleware(req: Request, next: Next) -> Response {
    let path = req.uri().path().to_owned();
    let is_frontend_request =
        matches!(*req.method(), Method::GET | Method::HEAD) && !path.starts_with("/api");
    let mut response = next.run(req).await;

    if is_frontend_request && response.status().is_success() {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store, no-cache, must-revalidate"),
        );
        response
            .headers_mut()
            .insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
        response
            .headers_mut()
            .insert(header::EXPIRES, HeaderValue::from_static("0"));
    }

    response
}
