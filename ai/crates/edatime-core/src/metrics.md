# crates/edatime-core/src/metrics.rs
> Full metrics implementation — shared across all crates.

## Structs

### `ScatterSamplingSnapshot`
- `requests: u64`
- `total_points_seen: u64`
- `total_points_returned: u64`

### `MetricsSnapshot`
- `uptime_seconds: u64`
- `total_requests: u64`
- `cache_hits: u64`
- `cache_misses: u64`
- `rate_limited_requests: u64`
- `scatter_sampling: ScatterSamplingSnapshot`
- `request_counts: HashMap<String, u64>`
- `average_request_ms: f64`
- `dataset_rows: usize`
- `dataset_revision: u64`

### `AppMetrics`
- `new() -> Self`
- `record_request(&self, method: &str, path: &str, status: u16, duration_ns: u64)`
- `record_cache_hit(&self)`
- `record_cache_miss(&self)`
- `record_rate_limited(&self)`
- `record_scatter_sampling(&self, total_points: usize, returned_points: usize)`
- `record_requests(&self, count: u64)`
- `uptime_seconds(&self) -> u64`
- `snapshot(&self, dataset_rows: usize, dataset_revision: u64) -> MetricsSnapshot`