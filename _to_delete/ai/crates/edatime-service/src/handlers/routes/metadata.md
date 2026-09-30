# crates/edatime-service/src/handlers/routes/metadata.rs
> `GET /api/v1/metadata` — dataset column metadata.

## Handler

- `get_metadata(State(state): State<AppState>) -> Result<impl IntoResponse, AppError>`
  - Returns dataset row count, column names, time column.