# ai/crates/edatime-service/src/handlers/scatter/scatter/correlations.md
> Scatter correlation handler — GET /api/v1/scatter/correlations and GET /api/v1/scatter/correlations/matrix.

## Enum: CorrelationMode
- `PearsonRaw`, `SpearmanRaw`, `KendallRaw`, `PearsonDiff`, `SpearmanDiff`, `KendallDiff` [serde(rename_all = "snake_case")]
  - Selects correlation metric; Raw uses original pairs, Diff uses first-difference pairs.

## Structs
- `pub struct ScatterCorrelationsQuery { base?, threshold?, mode? }` — Request body for single-column correlations (deny_unknown_fields).
- `pub struct ScatterCorrelationsResponse { mode, base_column, threshold, numeric_columns, correlations, suggestions, top_pairs[] }` — Response with per-column correlations and globally-ranked top pairs.
- `pub struct TopPairItem { x, y, correlation, count }` — One globally-ranked pair (signed correlation).
- `pub struct CorrelationMatrixResponse { columns[], pearson_raw?, spearman_raw?, kendall_raw?, pearson_diff?, spearman_diff?, kendall_diff? }` — Full NxN matrix with all modes.
- `pub struct CorrelationMatrixQuery { mode? }` — Request body for full matrix (deny_unknown_fields).

## Private Struct: CorrelationMatrixData
Internal accumulator holding 6 correlation matrices + counts, convertible to/from cache entry and response.
- `fn from_cache(entry) -> Self`, `fn into_cache() -> CorrelationMatrixCacheEntry`, `fn to_response() -> CorrelationMatrixResponse`, `fn to_response_for_mode(mode) -> CorrelationMatrixResponse`

## Functions
- `pub async fn get_scatter_correlations(State, Query<ScatterCorrelationsQuery>) -> Result<Json<ScatterCorrelationsResponse>, AppError>` [deps: [numeric_columns][1], [collect_xy_pairs][1]]
  - Single-column correlations. Checks correlation matrix cache; falls back to compute on Rayon pool. Returns correlations sorted by |r| desc with suggestions above threshold and top-20 global pairs.

- `pub fn spawn_correlation_matrix_warmup(state: AppState) -> tokio::task::JoinHandle<()>`
  - Background warm-up: computes correlation matrix if not cached, stores result via `store_correlation_matrix_if_current`.

- `pub async fn get_correlation_matrix(State, Query<CorrelationMatrixQuery>) -> Result<Json<CorrelationMatrixResponse>, AppError>` [deps: [numeric_columns][1], [collect_xy_pairs][1]]
  - Full NxN correlation matrix. Returns cached if current; otherwise computes all 6 modes (or single mode if specified) on Rayon pool.

### Private Helpers
- `fn compute_pair_correlation(mode, pairs, diff_pairs) -> Option<f64>` — Dispatches to stats::pearson/spearman/kendall_tau based on mode.
- `fn compute_correlation_matrix_for_mode(lf, mode) -> Result<CorrelationMatrixResponse, AppError>` — Computes one correlation mode across all numeric columns.
- `fn compute_correlation_matrix(lf) -> Result<CorrelationMatrixData, AppError>` — Computes all 6 modes simultaneously (O(n²) collect).
- `fn build_scatter_correlations_from_matrix_data(data, requested_base?, threshold, mode) -> Result<ScatterCorrelationsResponse, AppError>` — Builds per-column correlations + suggestions + top pairs from matrix data.
- `fn build_scatter_correlations_from_cached_matrix(entry, requested_base?, threshold, mode)` — Thin wrapper over `from_cache` + `build_scatter_correlations_from_matrix_data`.
- `fn first_difference_pairs(pairs) -> Vec<[f64; 2]>` — Computes differences between consecutive pairs.
- `fn top_pairs_from_matrix(data, mode, limit: usize) -> Vec<TopPairItem>` — Walks upper triangle of matrix, sorts by |r| desc (ties broken by signed correlation).

[deps: [numeric_columns][1], [CorrelationMatrixCacheEntry][2], [AppError][3]]

---
[1]: ../mod.md#numeric_columns
[2]: ../../../edatime-store/src/cache.md#CorrelationMatrixCacheEntry
[3]: ../../error.md#AppError