# crates/edatime-service/src/handlers/scatter/scatter/correlations.rs
> Scatter correlation handler — `GET /api/scatter/correlations`, `GET /api/scatter/correlations/matrix`. Responses are backed by a revision-scoped NxN correlation matrix cache on `AppState`.

## Struct: ScatterCorrelationsQuery
- `{ base: Option<String>, threshold: Option<f64> }`

## Struct: ScatterCorrelationsResponse
- `{ base_column: String, threshold: f64, numeric_columns: Vec<String>, correlations: Vec<CorrelationItem>, suggestions: Vec<SuggestionItem> }`

## Struct: CorrelationItem
- `{ column: String, count: usize, pearson: Option<f64>, spearman: Option<f64> }`

## Struct: SuggestionItem
- `{ x: String, y: String, correlation: f64 }` — explicit base/partner pair with absolute correlation (matches `frontend/src/types.ts CorrelationSuggestion`).

## Struct: CorrelationMatrixResponse
- `{ columns: Vec<String>, pearson: Vec<Vec<Option<f64>>>, spearman: Vec<Vec<Option<f64>>> }`

## Internal Structs
- `CorrelationMatrixData` — `{ columns, pearson, spearman, counts }` matrix payload with `from_cache` / `into_cache` / `to_response` conversions.

## Handlers
- `pub async fn get_scatter_correlations(State(state): State<AppState>, Query(params): Query<ScatterCorrelationsQuery>) -> Result<Json<ScatterCorrelationsResponse>, AppError>`
  - First checks `state.cached_correlation_matrix(revision)` and returns the cached result on hit. Otherwise computes via `tokio::task::spawn_blocking`, stores the matrix in the cache, and projects it into the response.
- `pub async fn get_correlation_matrix(State(state): State<AppState>) -> Result<Json<CorrelationMatrixResponse>, AppError>`
  - Same cache-first path; falls back to a fresh `compute_correlation_matrix` and stores the result.

## Functions
- `pub fn spawn_correlation_matrix_warmup(state: AppState) -> tokio::task::JoinHandle<()>`
  - Background task that warms the cache for the current dataset revision. No-op if the cache is already populated.
- `compute_correlation_matrix(lf: LazyFrame) -> Result<CorrelationMatrixData, AppError>` — fills the symmetric pearson/spearman matrices.
- `build_scatter_correlations_from_matrix_data(data, base, threshold) -> Result<ScatterCorrelationsResponse, AppError>` — projects a cached matrix into the scatter-correlations response.

---
[1]: ../../../../edatime-store/src/cache.md#CorrelationMatrixCacheEntry
