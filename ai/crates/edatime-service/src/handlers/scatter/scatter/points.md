# crates/edatime-service/src/handlers/scatter/scatter/points.rs
> Scatter points handlers — GET/POST /api/scatter/points.

## Handler
- `pub async fn get_scatter_points(State(state): State<AppState>, Query(params): Query<ScatterPointsQuery>) -> Result<Response, AppError>`
- `pub async fn post_scatter_points(State(state): State<AppState>, Json(params): Json<ScatterPointsQuery>) -> Result<Response, AppError>`

## Internal
- `async fn scatter_points_response(state: AppState, params: ScatterPointsQuery) -> Result<Response, AppError>`
  - Returns Arrow IPC with **standardized column names** (`x`, `y`, `color_value`, `color_label`).
  - Uses configurable time column from `state.ts_context()` when time filtering or line_filters are needed.
  - Caches responses under a dataset-revision-scoped key and returns `x-edatime-cache: hit|miss`.
  - Headers: `x-edatime-scatter-x`, `x-edatime-scatter-y`, `x-edatime-scatter-color`, `x-edatime-scatter-total`, `x-edatime-scatter-returned`, `x-edatime-color-min/max`, `x-edatime-size-min/max`, `x-edatime-scatter-color-kind`, `x-edatime-scatter-size`.

## Test
- `scatter_points_allow_color_column_matching_axis` — verifies color column can match axis column names.
- `scatter_points_cache_reuses_identical_requests` — verifies the response cache hits on repeated requests.
- `scatter_points_accept_line_filters_with_compatibility_id_field` — verifies compatibility `id` support in `line_filters`.

---
[1]: ../../../state.md
