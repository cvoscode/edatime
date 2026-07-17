# crates/edatime-store/src/cache.rs
> TTL-based in-memory response cache with Arrow/JSON serialization, plus the correlation matrix cache entry shared between the store and the scatter service.

## Structs

### `CacheConfig`
- `ttl: std::time::Duration` — default 60s
- `max_entries: usize` — default 128
- `max_bytes: usize` — default 32 MiB

### `CorrelationMatrixCacheEntry`
- `columns: Vec<String>`
- `pearson_raw: Vec<Vec<Option<f64>>>`
- `spearman_raw: Vec<Vec<Option<f64>>>`
- `kendall_raw: Vec<Vec<Option<f64>>>`
- `pearson_diff: Vec<Vec<Option<f64>>>`
- `spearman_diff: Vec<Vec<Option<f64>>>`
- `kendall_diff: Vec<Vec<Option<f64>>>`
- `counts: Vec<Vec<usize>>`
- Revision-scoped NxN correlation matrix payload carrying raw and first-difference matrices for all three correlation modes. Stored on `AppState::correlation_matrix_cache` and invalidated by `replace_dataset` / `clear_correlation_matrix_cache`. Consumed by [edatime-service/scatter/correlations][2] via `cached_correlation_matrix` and `store_correlation_matrix_if_current`.

### `CachedResponse`
- `status: StatusCode`
- `content_type: &'static str` — `"application/json"` or `"application/vnd.apache.arrow.stream"`
- `body: Arc<Bytes>` — shared, refcounted buffer (no copy on response)
- `is_downsampled: bool`
- `returned_rows: usize`
- `target_points: usize`
- `time_column: Option<String>`  [deps: [data handler][1]]
- `extra_headers: Vec<(String, String)>`

### `CachedResponse`
- `json(body: Vec<u8>, is_downsampled: bool, returned_rows: usize, target_points: usize, time_column: Option<String>) -> Self`
- `arrow(body: Vec<u8>, is_downsampled: bool, returned_rows: usize, target_points: usize, time_column: Option<String>) -> Self`
- `with_extra_headers(headers: Vec<(String, String)>) -> Self`
- `body_len(&self) -> usize`
- `into_response(self, cache_status: &'static str) -> Response<Body>` — emits `x-edatime-cache`, `x-edatime-downsampled`, `x-edatime-returned-rows`, `x-edatime-target-points`, `x-edatime-time-column`, plus any extra headers and `Cache-Control: public, max-age=60`.

### `ResponseCache`
- TTL-keyed response cache with revision-based invalidation (`invalidate_all` on dataset change).
- `new(config: CacheConfig) -> Self`
- `async get(&self, key: &str) -> Option<CachedResponse>`
- `async insert(&self, key: String, response: CachedResponse)`
- `invalidate_all(&self)` — called when the underlying dataset changes.
---
[1]: ../../edatime-service/src/handlers/routes/data.md
[2]: ../../edatime-service/src/handlers/scatter/correlations.md
