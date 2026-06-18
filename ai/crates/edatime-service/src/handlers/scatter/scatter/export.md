# crates/edatime-service/src/handlers/scatter/scatter/export.rs
> Scatter Parquet export handler — POST /api/scatter/export/parquet.

## Handler
- `pub async fn post_scatter_export_parquet(State(state): State<AppState>, Json(params): Json<ScatterPointsQuery>) -> Result<Response, AppError>`
  - Exports scatter points to Parquet format.
  - Reads time column from `state.ts_context()` when time filtering is needed.
  - Accepts the same canonical line-filter payload as `post_scatter_points`, including compatibility `id` fields.
