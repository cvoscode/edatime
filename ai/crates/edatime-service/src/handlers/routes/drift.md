# crates/edatime-service/src/handlers/routes/drift.rs
> `POST /api/drift/stats` — temporal drift analysis.

## Struct (Request)

### `DriftStatsRequest`
- `columns: Option<String>` — columns to analyze
- `window_ms: Option<i64>` — time window in milliseconds
- `method: Option<String>` — drift detection method

## Handler

- `post_drift_stats(State(state): State<AppState>, Json(params): Json<DriftStatsRequest>) -> Result<impl IntoResponse, AppError>`