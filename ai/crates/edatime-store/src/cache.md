# crates/edatime-store/src/cache.rs
> TTL-based in-memory response cache with Arrow/JSON serialization.

## Structs

### `CacheConfig`
- `ttl: std::time::Duration`
- `max_entries: usize`
- `max_bytes: usize`

### `CachedResponse`
- `arrow: Option<Vec<u8>>`
- `json: Option<Vec<u8>>`
- `is_downsampled: bool`
- `returned_rows: usize`
- `target_points: Option<usize>`
- `ts_col: Option<String>`
- `created_at: std::time::Instant`

### `DriftCache`
- Thread-safe store for drift statistics results.

## Methods

### `ResponseCache`
- `new(config: CacheConfig) -> Self`
- `get(&self, key: &str) -> Option<CachedResponse>`
- `insert(&self, key: String, value: CachedResponse)`
- `invalidate_all(&self)`
- `len(&self) -> usize`

### `CachedResponse`
- `arrow(data: Vec<u8>, is_downsampled: bool, returned_rows: usize, target_points: Option<usize>, ts_col: Option<String>) -> Self`
- `json(data: Vec<u8>, is_downsampled: bool, returned_rows: usize, target_points: Option<usize>, ts_col: Option<String>) -> Self`
- `into_response(self, hit: &str) -> Response`
- `is_expired(&self) -> bool`