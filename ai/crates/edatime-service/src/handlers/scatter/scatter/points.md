# crates/edatime-service/src/handlers/scatter/scatter/points.rs
> Scatter points handlers — GET/POST /api/scatter/points.

## Handler
- `pub async fn get_scatter_points(State(state): State<AppState>, Query(params): Query<ScatterPointsQuery>) -> Result<Response, AppError>`
- `pub async fn post_scatter_points(State(state): State<AppState>, Json(params): Json<ScatterPointsQuery>) -> Result<Response, AppError>`

## Internal
- `async fn scatter_points_response(state: AppState, params: ScatterPointsQuery) -> Result<Response, AppError>`
  - Returns Arrow IPC with standardized column names (`x`, `y`, `color_value`, `color_label`) and metadata headers (`x-edatime-scatter-x`, `x-edatime-scatter-y`, `x-edatime-scatter-color`).
  - Uses configurable time column from `state.ts_context()` when time filtering is needed.
