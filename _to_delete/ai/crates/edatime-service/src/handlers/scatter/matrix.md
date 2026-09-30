# ai/crates/edatime-service/src/handlers/scatter/matrix.md
> Batched scatter-matrix HTTP handler — POST /api/v1/scatter/matrix.

## Structs
- `ScatterMatrixCellMeta` — `{ cell_id, x, y, total_points, returned_points, color_min, color_max, color_kind }`

## Functions
- `post_scatter_matrix(State(state): State<AppState>, Json(params): Json<ScatterMatrixQuery>) -> Result<Response, AppError>`
  - Entry point for `POST /api/v1/scatter/matrix`.
- `scatter_matrix_response(state: AppState, params: ScatterMatrixQuery) -> Result<Response, AppError>`
  - Core logic: normalizes pairs, scopes filters per cell, samples, returns Arrow IPC with `x-edatime-matrix-cells` base64 header.
- `normalize_pairs(pairs: Vec<ScatterMatrixPair>) -> Vec<ScatterMatrixPair>`
  - Deduplicates and trims pair x/y; skips empty pairs.
- `scope_filters_to_pair(filters: &[ScatterFilterSpec], pair: &ScatterMatrixPair, color_column: Option<&str>) -> Vec<ScatterFilterSpec>`
  - Filters `filters` to only those whose column is `pair.x`, `pair.y`, or the color column. Used so each matrix cell only gets the filters relevant to its axes.
