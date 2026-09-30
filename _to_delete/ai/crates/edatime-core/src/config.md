# crates/edatime-core/src/config.rs
> AppConfig loading from env/env files.

## Structs

### `AppConfig`
- `server: ServerConfig`
- `cache: CacheSettings`
- `rate_limit: RateLimitSettings`
- `upload: UploadSettings`
- `data: DataSettings`
- `validation: ValidationSettings`
- `database: DatabaseSettings`
- `query: QuerySettings`
- `load() -> Result<Self, AppError>` [deps: [error][1]]
- `bind_address(&self) -> std::net::SocketAddr`

### `ServerConfig`
- `host: String`
- `port: u16`
- `csp_extra_origins: Vec<String>`

### `CacheSettings`
- `ttl_seconds: u64`
- `max_entries: usize`
- `max_bytes: usize`
- `to_runtime_config(&self) -> CacheConfig`

### `RateLimitSettings`
- `max_requests: usize`
- `window_seconds: u64`

### `UploadSettings`
- `max_upload_bytes: usize`

### `ValidationSettings`
- `max_selected_columns: usize`
- `max_viewport_width: usize`
- `max_buckets: usize`
- `max_scatter_limit: usize`
- `max_scatter_effective_points: usize`

### `DatabaseSettings`
- `enabled: bool`
- `backend: DatabaseBackend`
- `connection_string: Option<String>`
- `table: Option<String>`
- `time_column: Option<String>`

### `QuerySettings`
- `max_stored: usize`

### `DatabaseBackend`
- `None`, `Postgres`, `Timescale`, `Sqlite`

### `CacheConfig`
- `ttl_seconds: u64`
- `max_entries: usize`
- `max_bytes: usize`

---
[1]: error.md