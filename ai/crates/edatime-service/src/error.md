# crates/edatime-service/src/error.rs
> Service-level error handling — maps AppError to HTTP responses.

## Trait Implementation
- `impl IntoResponse for AppError` — converts AppError to appropriate HTTP status code.