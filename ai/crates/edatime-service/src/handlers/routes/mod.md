# crates/edatime-service/src/handlers/routes/mod.rs
> API router — defines all HTTP routes for the edatime HTTP service.

## Functions

### `api_router() -> Router<AppState>`
Routes:
```
GET  /api/health
GET  /api/data
GET  /api/export/parquet
GET  /api/metadata
GET  /api/metrics
GET  /api/scatter/points         (GET + POST)
POST /api/scatter/export/parquet
GET  /api/scatter/correlations
GET  /api/scatter/correlations/matrix
POST /api/upload
POST /api/upload/preview
GET  /api/sample/{name}
POST /api/database/connect       (DELETE too)
GET  /api/database/status
GET  /api/database/tables
GET  /api/database/columns
POST /api/database/load
GET  /api/config/database        (POST too)
GET  /api/aggregate
POST /api/transform
POST /api/drift/stats

Analytics router (/api/analytics/):
GET  /rolling
GET  /anomalies
GET  /fft
GET  /spectrogram
GET  /spectral-filter
POST /causal
POST /remove_outliers
```

### `analytics_router() -> Router<AppState>`
Nested router for analytics endpoints.

### `health() -> impl IntoResponse`