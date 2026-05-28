# crates/edatime-service/src/handlers/scatter/scatter/export.rs
> Scatter Parquet export handler — POST /api/scatter/export/parquet.

## Handler
- `pub async fn post_scatter_export_parquet(State(state): State<AppState>, Json(params): Json<ScatterPointsQuery>) -> Result<Response, AppError>`