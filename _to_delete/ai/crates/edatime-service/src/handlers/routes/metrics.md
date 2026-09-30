# crates/edatime-service/src/handlers/routes/metrics.rs
> `GET /api/v1/metrics` — application metrics snapshot.

## Handler

- `get_metrics(State(state): State<AppState>) -> Result<impl IntoResponse, AppError>`
  - Returns MetricsSnapshot: uptime, request counts, cache hits/misses, rate-limited requests, average request ms, dataset rows/revision.