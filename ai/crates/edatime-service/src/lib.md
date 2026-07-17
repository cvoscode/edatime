# crates/edatime-service/src/lib.rs
> edatime-service — Axum HTTP service layer.

## Modules
- `handlers` — Axum HTTP route handlers (split into `routes/`, `analytics/`, `causal/`, `scatter/`)
- `middleware` — CORS helpers, CSP header builder, rate-limit middleware
- `rates` — Token-bucket per-IP rate limiter
- `metrics` — `AppMetrics` re-export / wrappers
- `error` — `AppError` → HTTP response conversion
- `analytics` — Analytics request/response DTOs (rolling, anomaly, fft, spectrogram, transform, outlier, drift)
- `causal` — PCMCI / PCMCI+ causal discovery algorithm (submodules: `data`, `graph`, `independence`, `pc`, `lpcmci`, `pcmci`, `pcmciplus`)
- `dto` — Shared DTOs (scatter payloads, scatter matrix, drift payloads, etc.)
- `router` — Top-level `api_router()` builder (mounted under `/api/v1`)
- `state` — Service-level state helpers
- `streaming_export` — Streaming response writers for large exports

## Re-exports
- `router as routes` — backwards compatibility alias (consumers can do `use edatime_service::routes::api_router`)