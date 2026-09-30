# crates/edatime-service/src/metrics.rs
> Application metrics collection and snapshot.

## Struct: ScatterSamplingSnapshot
- `{ requests: u64, total_points_seen: u64, total_points_returned: u64 }`

## Struct: MetricsSnapshot
- `{ uptime_seconds: u64, total_requests: u64, cache_hits: u64, cache_misses: u64, rate_limited_requests: u64, scatter_sampling: ScatterSamplingSnapshot, request_counts: HashMap<String, u64>, average_request_ms: f64, dataset_rows: usize, dataset_revision: u64 }`

## Struct: AppMetrics
- `pub fn new() -> Self`
- `pub fn record_request(&self, method: &str, path: &str, status: u16, duration_ns: u64)`
- `pub fn record_cache_hit(&self)`
- `pub fn record_cache_miss(&self)`
- `pub fn record_rate_limited(&self)`
- `pub fn record_scatter_sampling(&self, total_points: usize, returned_points: usize)`
- `pub fn snapshot(&self, dataset_rows: usize, dataset_revision: u64) -> MetricsSnapshot`