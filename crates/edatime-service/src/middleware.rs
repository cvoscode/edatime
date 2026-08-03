//! HTTP middleware: rate limiting, client IP extraction, request tracking.

use std::collections::HashSet;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::{Body, Bytes, HttpBody},
    extract::ConnectInfo,
    http::HeaderValue,
    middleware::Next,
    response::IntoResponse,
};
use http_body::{Frame, SizeHint};
use tracing::Instrument;

use crate::error::AppError;
use crate::rates::RateLimiter;
use edatime_core::metrics::AppMetrics;

/// Proxy header names examined when resolving the real client IP, in priority
/// order.  The first non-empty value wins.
const FORWARDED_HEADERS: &[&str] = &[
    "x-forwarded-for",
    "cf-connecting-ip",
    "x-real-ip",
    "true-client-ip",
];

tokio::task_local! {
    static REQUEST_ID: String;
}

static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

pub fn current_request_id() -> Option<String> {
    REQUEST_ID.try_with(Clone::clone).ok()
}

fn next_request_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    let sequence = REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("req-{millis:x}-{sequence:x}")
}

fn valid_request_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

/// Establish one request identity for logs, errors, and response headers and
/// normalize Axum extractor/router rejections into the public error envelope.
pub async fn request_context_middleware(
    mut req: axum::extract::Request,
    next: Next,
) -> axum::response::Response {
    let request_id = req
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| valid_request_id(value))
        .map(str::to_string)
        .unwrap_or_else(next_request_id);

    if let Ok(value) = HeaderValue::from_str(&request_id) {
        req.headers_mut().insert("x-request-id", value);
    }
    let span = tracing::info_span!(
        "http_request",
        request_id = %request_id,
        method = %req.method(),
        path = %req.uri().path(),
    );

    let mut response = REQUEST_ID
        .scope(
            request_id.clone(),
            async move { next.run(req).await }.instrument(span),
        )
        .await;

    if response.status().is_client_error() && !response.headers().contains_key("x-edatime-error") {
        let status = response.status();
        let message = status
            .canonical_reason()
            .unwrap_or("Request rejected by the HTTP framework");
        response = REQUEST_ID
            .scope(request_id.clone(), async move {
                AppError::framework(status, message).into_response()
            })
            .await;
    }

    if let Ok(value) = HeaderValue::from_str(&request_id) {
        response.headers_mut().insert("x-request-id", value);
    }
    response.headers_mut().insert(
        "x-edatime-build",
        HeaderValue::from_static(env!("CARGO_PKG_VERSION")),
    );
    response.headers_mut().insert(
        "x-edatime-build-sha",
        HeaderValue::from_static(option_env!("EDATIME_BUILD_SHA").unwrap_or("unknown")),
    );
    response.headers_mut().insert(
        "x-edatime-build-profile",
        HeaderValue::from_static(option_env!("EDATIME_BUILD_PROFILE").unwrap_or("unknown")),
    );
    response
        .headers_mut()
        .insert("x-edatime-contract", HeaderValue::from_static("v1"));
    response
}

/// Resolve the client IP address from proxy headers, falling back to the
/// direct TCP peer address recorded in [`ConnectInfo`].
///
/// The returned string is sanitised to avoid log-injection attacks (newlines,
/// control characters and excess length are stripped).
pub fn extract_client_ip(
    req: &axum::extract::Request,
    trusted_proxy_ips: &HashSet<String>,
) -> String {
    let peer_ip = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip().to_string());

    let peer_is_trusted = peer_ip
        .as_ref()
        .is_some_and(|ip| trusted_proxy_ips.contains(ip));

    if peer_is_trusted {
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
    }

    peer_ip.unwrap_or_else(|| "unknown".to_string())
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
    trusted_proxy_ips: Arc<HashSet<String>>,
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
        let trusted_proxy_ips = Arc::clone(&trusted_proxy_ips);

        Box::pin(async move {
            let method = req.method().to_string();
            let path = normalized_route(req.uri().path());
            let started_at = Instant::now();
            let client_ip = extract_client_ip(&req, &trusted_proxy_ips);

            let result = rate_limiter.check(&client_ip).await;

            if !result.allowed {
                metrics.record_rate_limited();
                let mut response =
                    AppError::rate_limit("Rate limit exceeded. Please try again later.")
                        .into_response();
                if let Some(retry_after) = result.retry_after_seconds
                    && let Ok(value) = HeaderValue::from_str(&retry_after.to_string())
                {
                    response
                        .headers_mut()
                        .insert(axum::http::header::RETRY_AFTER, value);
                }
                let route_key = metrics.record_route_response(
                    &method,
                    &path,
                    response.status().as_u16(),
                    started_at.elapsed().as_nanos() as u64,
                    Some("rate_limit_exceeded"),
                );
                return Ok(track_response_body(
                    response, metrics, route_key, started_at,
                ));
            }

            let mut response = next.run(req).await;
            if let Ok(value) = HeaderValue::from_str(&result.remaining_requests.to_string()) {
                response
                    .headers_mut()
                    .insert("x-ratelimit-remaining", value);
            }
            let error_code = response
                .headers()
                .get("x-edatime-error-code")
                .and_then(|value| value.to_str().ok());
            let route_key = metrics.record_route_response(
                &method,
                &path,
                response.status().as_u16(),
                started_at.elapsed().as_nanos() as u64,
                error_code,
            );
            Ok(track_response_body(
                response, metrics, route_key, started_at,
            ))
        })
    }
}

fn normalized_route(path: &str) -> String {
    if !path.starts_with("/api/v1/") {
        return "/frontend".to_string();
    }
    let mut parts = path.split('/').collect::<Vec<_>>();
    if parts.len() >= 5 && parts.get(3) == Some(&"jobs") {
        parts[4] = "{id}";
    } else if parts.len() >= 5 && parts.get(3) == Some(&"sample") {
        parts[4] = "{name}";
    }
    parts.join("/")
}

fn track_response_body(
    response: axum::response::Response,
    metrics: Arc<AppMetrics>,
    route_key: String,
    request_started: Instant,
) -> axum::response::Response {
    let (parts, body) = response.into_parts();
    let tracked = TrackedBody {
        inner: body,
        metrics,
        route_key,
        request_started,
        bytes: 0,
        finished: false,
    };
    axum::response::Response::from_parts(parts, Body::new(tracked))
}

struct TrackedBody {
    inner: Body,
    metrics: Arc<AppMetrics>,
    route_key: String,
    request_started: Instant,
    bytes: u64,
    finished: bool,
}

impl TrackedBody {
    fn finish(&mut self, abandoned: bool) {
        if self.finished {
            return;
        }
        self.finished = true;
        self.metrics.record_body_completion(
            &self.route_key,
            self.bytes,
            self.request_started.elapsed().as_nanos() as u64,
            abandoned,
        );
    }
}

impl HttpBody for TrackedBody {
    type Data = Bytes;
    type Error = axum::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        let this = self.get_mut();
        match Pin::new(&mut this.inner).poll_frame(cx) {
            std::task::Poll::Ready(Some(Ok(frame))) => {
                if let Some(data) = frame.data_ref() {
                    this.bytes = this.bytes.saturating_add(data.len() as u64);
                }
                std::task::Poll::Ready(Some(Ok(frame)))
            }
            std::task::Poll::Ready(None) => {
                this.finish(false);
                std::task::Poll::Ready(None)
            }
            other => other,
        }
    }

    fn is_end_stream(&self) -> bool {
        self.inner.is_end_stream()
    }

    fn size_hint(&self) -> SizeHint {
        self.inner.size_hint()
    }
}

impl Drop for TrackedBody {
    fn drop(&mut self) {
        self.finish(true);
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
    const DEFAULT: &str = "default-src 'self' unpkg.com esm.sh; \
         script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com esm.sh blob:; \
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
             script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com esm.sh {origin} blob:; \
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
         script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com esm.sh {extra} blob:; \
         style-src 'self' 'unsafe-inline'; \
         img-src 'self' data:; \
         connect-src 'self' unpkg.com esm.sh {extra} blob:"
    );
    HeaderValue::from_str(&value).unwrap_or_else(|_| HeaderValue::from_static(DEFAULT))
}

#[cfg(test)]
mod tests {
    use super::extract_client_ip;
    use axum::extract::ConnectInfo;
    use axum::{body::Body, http::Request};
    use std::collections::HashSet;
    use std::net::SocketAddr;

    fn forwarded_request(peer: &str) -> Request<Body> {
        let mut request = Request::builder()
            .header("x-forwarded-for", "203.0.113.12")
            .body(Body::empty())
            .unwrap();
        request.extensions_mut().insert(ConnectInfo(
            peer.parse::<SocketAddr>().expect("valid test peer"),
        ));
        request
    }

    #[test]
    fn ignores_forwarding_headers_from_untrusted_peers() {
        let request = forwarded_request("192.0.2.5:3000");
        assert_eq!(extract_client_ip(&request, &HashSet::new()), "192.0.2.5");
    }

    #[test]
    fn accepts_forwarding_headers_from_configured_proxy() {
        let request = forwarded_request("192.0.2.5:3000");
        let trusted = HashSet::from(["192.0.2.5".to_string()]);
        assert_eq!(extract_client_ip(&request, &trusted), "203.0.113.12");
    }
}
