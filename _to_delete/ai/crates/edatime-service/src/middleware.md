# crates/edatime-service/src/middleware.rs
> Rate limiting middleware, CSP header value.

## Functions

- `rate_limit_middleware(limiter: Arc<RateLimiter>, metrics: Arc<AppMetrics>) -> impl Fn(...)`
  - Token-bucket rate limiting per IP.
- `csp_header_value(extra_origins: &[String]) -> String`
  - Build Content-Security-Policy header value.