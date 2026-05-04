//! HTTP middleware: rate limiting, client IP extraction, request tracking.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use axum::{extract::ConnectInfo, http::HeaderValue, middleware::Next, response::IntoResponse};

use crate::error::AppError;
use crate::metrics::AppMetrics;
use crate::rates::RateLimiter;

/// Proxy header names examined when resolving the real client IP, in priority
/// order.  The first non-empty value wins.
const FORWARDED_HEADERS: &[&str] = &[
    "x-forwarded-for",
    "cf-connecting-ip",
    "x-real-ip",
    "true-client-ip",
];

/// Resolve the client IP address from proxy headers, falling back to the
/// direct TCP peer address recorded in [`ConnectInfo`].
///
/// The returned string is sanitised to avoid log-injection attacks (newlines,
/// control characters and excess length are stripped).
pub fn extract_client_ip(req: &axum::extract::Request) -> String {
    let headers = req.headers();

    for &header_name in FORWARDED_HEADERS {
        if let Some(ip) = headers
            .get(header_name)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            return sanitize_ip(ip);
        }
    }

    req.extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Strip control characters, newlines, and clamp length to prevent
/// log injection from spoofed proxy headers.
fn sanitize_ip(raw: &str) -> String {
    const MAX_IP_LEN: usize = 45; // max IPv6 textual length
    raw.chars()
        .filter(|c| !c.is_control())
        .take(MAX_IP_LEN)
        .collect()
}

/// Rate-limiting middleware that integrates with [`AppMetrics`].
///
/// Records per-request metrics (method, path, status, duration) regardless of
/// whether the request is rate-limited or not.
pub fn rate_limit_middleware(
    rate_limiter: Arc<RateLimiter>,
    metrics: Arc<AppMetrics>,
) -> impl Fn(
    axum::extract::Request,
    Next,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<axum::response::Response, AppError>> + Send>,
> + Clone
+ Send {
    move |req: axum::extract::Request, next: Next| {
        let rate_limiter = Arc::clone(&rate_limiter);
        let metrics = Arc::clone(&metrics);

        Box::pin(async move {
            let method = req.method().to_string();
            let path = req.uri().path().to_string();
            let started_at = Instant::now();
            let client_ip = extract_client_ip(&req);

            let result = rate_limiter.check(&client_ip);

            if !result.allowed {
                metrics.record_rate_limited();
                let mut response =
                    AppError::rate_limit("Rate limit exceeded. Please try again later.")
                        .into_response();
                if let Some(retry_after) = result.retry_after_seconds
                    && let Ok(value) = HeaderValue::from_str(&retry_after.to_string()) {
                        response
                            .headers_mut()
                            .insert(axum::http::header::RETRY_AFTER, value);
                    }
                metrics.record_request(
                    &method,
                    &path,
                    response.status().as_u16(),
                    started_at.elapsed().as_nanos() as u64,
                );
                return Ok(response);
            }

            let mut response = next.run(req).await;
            if let Ok(value) = HeaderValue::from_str(&result.remaining_requests.to_string()) {
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
            Ok(response)
        })
    }
}

/// Content-Security-Policy value applied to all responses.
///
/// `extra_origins` are embedded efficiently using a pre-built list for
/// the common-case (0 or 1 extra origin), avoiding redundant allocations.
///
/// The built-in origins (`unpkg.com`, `esm.sh`) are always included.
pub fn csp_header_value(extra_origins: &[String]) -> HeaderValue {
    // Static default — safe fallback for any header construction failure.
    const DEFAULT: &str =
        "default-src 'self' unpkg.com esm.sh; \
         script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com esm.sh; \
         style-src 'self' 'unsafe-inline'; \
         img-src 'self' data:; \
         connect-src 'self' unpkg.com esm.sh blob:";

    if extra_origins.is_empty() {
        return HeaderValue::from_static(DEFAULT);
    }

    // For one extra origin the formatted string is short enough that
    // HeaderValue::from_str always succeeds.
    if extra_origins.len() == 1 {
        let origin = &extra_origins[0];
        let value = format!(
            "default-src 'self' unpkg.com esm.sh {origin}; \
             script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com esm.sh {origin}; \
             style-src 'self' 'unsafe-inline'; \
             img-src 'self' data:; \
             connect-src 'self' unpkg.com esm.sh {origin} blob:"
        );
        return HeaderValue::from_str(&value).unwrap_or_else(|_| HeaderValue::from_static(DEFAULT));
    }

    // Multiple origins — join them and check validity.
    let extra = extra_origins.join(" ");
    let value = format!(
        "default-src 'self' unpkg.com esm.sh {extra}; \
         script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com esm.sh {extra}; \
         style-src 'self' 'unsafe-inline'; \
         img-src 'self' data:; \
         connect-src 'self' unpkg.com esm.sh {extra} blob:"
    );
    HeaderValue::from_str(&value).unwrap_or_else(|_| HeaderValue::from_static(DEFAULT))
}

