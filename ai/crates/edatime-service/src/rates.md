# crates/edatime-service/src/rates.rs
> Token-bucket rate limiter implementation.

## Struct

### `RateLimiter`
- `max_requests: usize`
- `window_secs: u64`
- `tokens: Arc<Mutex<HashMap<IpAddr, (u64, Instant)>>>`

## Methods
- `new(max_requests: usize, window_seconds: u64) -> Self`
- `check(&self, ip: IpAddr) -> bool`
  - Returns true if request is allowed.