# crates/edatime-service/src/handlers/scatter/scatter/points.rs
> Scatter points handlers — GET/POST /api/scatter/points.

## Handler
- `pub async fn get_scatter_points(State(state): State<AppState>, Query(params): Query<ScatterPointsQuery>) -> Result<Response, AppError>`
- `pub async fn post_scatter_points(State(state): State<AppState>, Json(params): Json<ScatterPointsQuery>) -> Result<Response, AppError>`

## Internal
- `async fn scatter_points_response(state: AppState, params: ScatterPointsQuery) -> Result<Response, AppError>`