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
- `time_column: Option<String>`  [deps: [data handler][1]]
- `created_at: std::time::Instant`

### `CachedResponse`
- `arrow(data: Vec<u8>, is_downsampled: bool, returned_rows: usize, target_points: Option<usize>, time_column: Option<String>) -> Self`
- `json(data: Vec<u8>, is_downsampled: bool, returned_rows: usize, target_points: Option<usize>, time_column: Option<String>) -> Self`
- `into_response(self, hit: &str) -> Response`
- `is_expired(&self) -> bool`
---
[1]: ../../edatime-service/src/handlers/routes/data.md