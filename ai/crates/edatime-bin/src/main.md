# crates/edatime-bin/src/main.rs
> Main binary entry point — sets up Axum Router with CORS, compression, rate limiting, CSP, trace logging, graceful shutdown.

## Function

### `main() -> impl Future<Output = ()>`
- Loads AppConfig from env/config file
- Creates AppState with default DataFrame
- Sets up RateLimiter
- Configures CorsLayer, CompressionLayer, TraceLayer, CSP layer
- Mounts `routes::api_router()` at `/api` and `/api/v1`
- Serves frontend from `frontend/dist` for non-API routes
- Binds TCP listener and runs axum server