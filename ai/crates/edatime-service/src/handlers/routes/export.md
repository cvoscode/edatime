# crates/edatime-service/src/handlers/routes/export.rs
> `GET /api/export/parquet` — export dataset as Parquet.

## Handler
- `export_parquet(State(state): State<AppState>, Query(params): Query<DataQuery>) -> Result<impl IntoResponse, AppError>`
  - Returns Parquet file as binary response.
  - Uses configurable time column from `state.ts_context()` instead of hardcoded `ts`.
