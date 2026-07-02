# ai/crates/edatime-service/src/handlers/routes/mod.md
> Top-level API router for the edatime HTTP service.

## Functions
- `api_router() -> Router<AppState>`
  - Registers `/api` routes, including `GET|POST /scatter/points`, `POST /scatter/matrix`, `POST /scatter/export/parquet`, `GET /scatter/correlations`, `GET /scatter/correlations/matrix`, `POST /drift/stats`, and `POST /drift/investigate`.
- `analytics_router() -> Router<AppState>`
  - Registers nested `/api/analytics` routes for rolling bands, anomalies, FFT, spectrogram, spectral filter, causal discovery, and outlier removal.
- `health() -> impl IntoResponse`
  - Returns `{ "status": "ok" }`.
