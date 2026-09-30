# ai/crates/edatime-service/src/handlers/routes/mod.md
> Top-level API router for the edatime HTTP service.

## Functions
- `api_router() -> Router<AppState>`
  - Registers `/api/v1` routes. The full route table (mounted under `/api/v1` in `main.rs` / `crates/edatime-bin/src/main.rs`):
    - `GET /health`
    - `GET|POST /data` (cleaning-plan aware; see [data.md][data])
    - `GET /export/parquet`
    - `POST /cleaning/validate`, `POST /cleaning/preview`, `POST /cleaning/propose/outliers`, `POST /cleaning/apply`, `POST /cleaning/export/data`, `POST /cleaning/export/plan`, `POST /cleaning/export/code`, `POST /cleaning/export/manifest`, `POST /cleaning/export/bundle`
    - `GET /datasets/versions`, `POST /datasets/versions/select`, `GET /datasets/storage`
    - `GET /metadata`
    - `GET|POST /profile`, `GET|POST /profile/sample`
    - `GET /metrics`
    - `GET /jobs`, `GET /jobs/{id}`, `DELETE /jobs/{id}`
    - `GET|POST /scatter/points`, `POST /scatter/matrix`, `POST /scatter/export/parquet`, `GET|POST /scatter/correlations`, `GET|POST /scatter/correlations/matrix`
    - `POST /upload`, `POST /upload/preview`, `GET /sample/{name}`
    - `POST|DELETE /database/connect`, `GET /database/status`, `GET /database/tables`, `GET /database/columns`, `POST /database/load`
    - `GET|POST /config/database`
    - `GET /aggregate`
    - nested under `/analytics`: `GET|POST /analytics/rolling`, `GET|POST /analytics/anomalies`, `GET|POST /analytics/fft`, `GET|POST /analytics/spectrogram`, `GET|POST /analytics/spectral-filter`, `POST /analytics/causal`
    - `POST /drift/stats`, `POST /drift/investigate`
- `analytics_router() -> Router<AppState>`
  - Registers nested `/api/v1/analytics` routes for rolling bands, anomalies, FFT, spectrogram, spectral filter, and causal discovery.
- `health() -> impl IntoResponse`
  - Returns `{ "status": "ok" }`.

[data]: ./data.md
