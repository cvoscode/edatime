# crates/edatime-store/src/cache.rs
> TTL-based in-memory response cache with Arrow/JSON serialization, plus the correlation matrix cache entry shared between the store and the scatter service.

## Type Aliases

### `DriftCache`
- `Arc<std::sync::Mutex<HashMap<String, (u64, Instant, Vec<u8>)>>>` — TTL-keyed drift results. [deps: [data handler][1]]

## Structs

### `CacheConfig`
- `ttl: std::time::Duration`
- `max_entries: usize`
- `max_bytes: usize`

### `CorrelationMatrixCacheEntry`
- `columns: Vec<String>`
- `pearson: Vec<Vec<Option<f64>>>`
- `spearman: Vec<Vec<Option<f64>>>`
- `counts: Vec<Vec<usize>>`
- Revision-scoped NxN correlation matrix payload. Stored on `AppState::correlation_matrix_cache` and invalidated by `replace_dataset` / `clear_correlation_matrix_cache`. Consumed by [edatime-service/scatter/correlations][2] via `cached_correlation_matrix` and `store_correlation_matrix_if_current`.

### `CachedResponse`
- `arrow: Option<Vec<u8>>`
- `json: Option<Vec<u8>>`
- `is_downsampled: bool`
- `returned_rows: usize`
- `target_points: Option<usize>`
- `time_column: Option<String>`  [deps: [data handler][1]]
- `extra_headers: Vec<(String, String)>`
- `created_at: std::time::Instant`

### `CachedResponse`
- `arrow(data: Vec<u8>, is_downsampled: bool, returned_rows: usize, target_points: Option<usize>, time_column: Option<String>) -> Self`
- `json(data: Vec<u8>, is_downsampled: bool, returned_rows: usize, target_points: Option<usize>, time_column: Option<String>) -> Self`
- `with_extra_headers(headers: Vec<(String, String)>) -> Self`
- `into_response(self, hit: &str) -> Response`
- `is_expired(&self) -> bool`
---
[1]: ../../edatime-service/src/handlers/routes/data.md
[2]: ../../edatime-service/src/handlers/scatter/scatter/correlations.md
