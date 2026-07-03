use std::{env, fs, path::Path};

use serde::Deserialize;

use crate::error::AppError;

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
#[derive(Default)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub cache: CacheSettings,
    pub rate_limit: RateLimitSettings,
    pub upload: UploadSettings,
    pub data: DataSettings,
    pub validation: ValidationSettings,
    pub database: DatabaseSettings,
    pub query: QuerySettings,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub csp_extra_origins: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct CacheSettings {
    pub ttl_seconds: u64,
    pub max_entries: usize,
    pub max_bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct RateLimitSettings {
    pub max_requests: usize,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct UploadSettings {
    pub max_upload_bytes: usize,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct DataSettings {}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct ValidationSettings {
    pub max_selected_columns: usize,
    pub min_viewport_width: usize,
    pub max_viewport_width: usize,
    pub max_buckets: usize,
    pub max_scatter_limit: usize,
    pub default_scatter_limit: usize,
    pub max_scatter_effective_points: usize,
    pub max_color_cardinality: usize,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct DatabaseSettings {
    pub enabled: bool,
    pub backend: DatabaseBackend,
    pub connection_string: Option<String>,
    pub table: Option<String>,
    pub time_column: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct QuerySettings {
    pub max_stored: usize,
}

impl Default for QuerySettings {
    fn default() -> Self {
        Self { max_stored: 512 }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseBackend {
    #[default]
    None,
    Postgres,
    Timescale,
    Sqlite,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 3000,
            csp_extra_origins: Vec::new(),
        }
    }
}

impl Default for CacheSettings {
    fn default() -> Self {
        Self {
            ttl_seconds: 60,
            max_entries: 128,
            max_bytes: 32 * 1024 * 1024,
        }
    }
}

impl Default for RateLimitSettings {
    fn default() -> Self {
        Self {
            // High default — this is a local analytics tool; rate limiting guards
            // against runaway loops, not public traffic.
            max_requests: 1000,
            window_seconds: 60,
        }
    }
}

impl Default for UploadSettings {
    fn default() -> Self {
        Self {
            max_upload_bytes: 256 * 1024 * 1024,
        }
    }
}

impl Default for ValidationSettings {
    fn default() -> Self {
        Self {
            max_selected_columns: 100,
            // Frontend `services/api/timeseries.ts` already clamps width to a
            // minimum of 50; enforcing the same floor server-side makes the
            // backend authoritative so the `width=1` escape hatch
            // (audit issue 1.2) cannot reappear.
            min_viewport_width: 50,
            max_viewport_width: 20_000,
            max_buckets: 10_000,
            max_scatter_limit: 5_000_000,
            // Keep the user-visible default conservative so a typical EDA
            // session does not allocate megabytes of points by accident
            // (audit issue 2.6). Operators can raise this via config.toml
            // for "all points" workflows.
            default_scatter_limit: 200_000,
            max_scatter_effective_points: 200_000,
            // Top-N distinct labels preserved in the scatter categorical
            // color legend before the long tail collapses into "Other"
            // (audit issue 2.2).
            max_color_cardinality: 64,
        }
    }
}

impl AppConfig {
    pub fn load() -> Result<Self, AppError> {
        let config_path = env::var("EDATIME_CONFIG").unwrap_or_else(|_| "config.toml".to_string());
        let mut config = if Path::new(&config_path).exists() {
            let contents = fs::read_to_string(&config_path).map_err(|error| {
                AppError::internal(format!("Failed to read config '{config_path}': {error}"))
            })?;
            toml::from_str::<AppConfig>(&contents).map_err(|error| {
                AppError::internal(format!("Failed to parse config '{config_path}': {error}"))
            })?
        } else {
            AppConfig::default()
        };

        config.apply_env_overrides();
        Ok(config)
    }

    pub fn bind_address(&self) -> std::net::SocketAddr {
        use std::net::{IpAddr, Ipv4Addr, SocketAddr};
        let ip: IpAddr = self
            .server
            .host
            .parse()
            .unwrap_or(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));
        SocketAddr::new(ip, self.server.port)
    }

    fn apply_env_overrides(&mut self) {
        if let Ok(host) = env::var("EDATIME_HOST") {
            let host = host.trim().to_string();
            if !host.is_empty() {
                self.server.host = host;
            }
        }
        if let Ok(port) = env::var("EDATIME_PORT")
            && let Ok(port) = port.parse::<u16>()
        {
            self.server.port = port;
        }
        if let Ok(ttl_seconds) = env::var("EDATIME_CACHE_TTL_SECONDS")
            && let Ok(ttl_seconds) = ttl_seconds.parse::<u64>()
        {
            self.cache.ttl_seconds = ttl_seconds;
        }
        if let Ok(max_entries) = env::var("EDATIME_CACHE_MAX_ENTRIES")
            && let Ok(max_entries) = max_entries.parse::<usize>()
        {
            self.cache.max_entries = max_entries;
        }
        if let Ok(max_bytes) = env::var("EDATIME_CACHE_MAX_BYTES")
            && let Ok(max_bytes) = max_bytes.parse::<usize>()
        {
            self.cache.max_bytes = max_bytes;
        }
        if let Ok(max_requests) = env::var("EDATIME_RATE_LIMIT_MAX_REQUESTS")
            && let Ok(max_requests) = max_requests.parse::<usize>()
        {
            self.rate_limit.max_requests = max_requests;
        }
        if let Ok(window_seconds) = env::var("EDATIME_RATE_LIMIT_WINDOW_SECONDS")
            && let Ok(window_seconds) = window_seconds.parse::<u64>()
        {
            self.rate_limit.window_seconds = window_seconds;
        }
        if let Ok(max_upload_bytes) = env::var("EDATIME_MAX_UPLOAD_BYTES")
            && let Ok(max_upload_bytes) = max_upload_bytes.parse::<usize>()
        {
            self.upload.max_upload_bytes = max_upload_bytes;
        }
        if let Ok(min_width) = env::var("EDATIME_MIN_VIEWPORT_WIDTH")
            && let Ok(min_width) = min_width.parse::<usize>()
        {
            self.validation.min_viewport_width = min_width;
        }
        if let Ok(max_width) = env::var("EDATIME_MAX_VIEWPORT_WIDTH")
            && let Ok(max_width) = max_width.parse::<usize>()
        {
            self.validation.max_viewport_width = max_width;
        }
        if let Ok(default_scatter) = env::var("EDATIME_DEFAULT_SCATTER_LIMIT")
            && let Ok(default_scatter) = default_scatter.parse::<usize>()
        {
            self.validation.default_scatter_limit = default_scatter;
        }
        if let Ok(max_scatter) = env::var("EDATIME_MAX_SCATTER_LIMIT")
            && let Ok(max_scatter) = max_scatter.parse::<usize>()
        {
            self.validation.max_scatter_limit = max_scatter;
        }
        if let Ok(max_card) = env::var("EDATIME_MAX_COLOR_CARDINALITY")
            && let Ok(max_card) = max_card.parse::<usize>()
        {
            self.validation.max_color_cardinality = max_card;
        }
        if let Ok(db_url) = env::var("EDATIME_DATABASE_URL") {
            let db_url = db_url.trim().to_string();
            if !db_url.is_empty() {
                self.database.connection_string = Some(db_url);
                self.database.enabled = true;
            }
        }
        if let Ok(db_backend) = env::var("EDATIME_DATABASE_BACKEND") {
            match db_backend.trim().to_lowercase().as_str() {
                "postgres" => self.database.backend = DatabaseBackend::Postgres,
                "sqlite" => self.database.backend = DatabaseBackend::Sqlite,
                _ => {}
            }
        }
    }
}

/// Cache configuration for runtime use.
/// Defined here so edatime-core is self-contained;
/// edatime-store re-exports its own copy with axum dependencies.
#[derive(Debug, Clone, Copy)]
pub struct CacheConfig {
    pub ttl_seconds: u64,
    pub max_entries: usize,
    pub max_bytes: usize,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            ttl_seconds: 60,
            max_entries: 128,
            max_bytes: 32 * 1024 * 1024,
        }
    }
}

impl CacheSettings {
    pub fn to_runtime_config(&self) -> CacheConfig {
        CacheConfig {
            ttl_seconds: self.ttl_seconds.max(1),
            max_entries: self.max_entries.max(1),
            max_bytes: self.max_bytes.max(1024),
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn default_scatter_limit_can_be_overridden_from_env() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        let previous = env::var("EDATIME_DEFAULT_SCATTER_LIMIT").ok();

        unsafe {
            env::set_var("EDATIME_DEFAULT_SCATTER_LIMIT", "345678");
        }

        let mut config = AppConfig::default();
        config.apply_env_overrides();
        assert_eq!(config.validation.default_scatter_limit, 345_678);

        match previous {
            Some(value) => unsafe {
                env::set_var("EDATIME_DEFAULT_SCATTER_LIMIT", value);
            },
            None => unsafe {
                env::remove_var("EDATIME_DEFAULT_SCATTER_LIMIT");
            },
        }
    }
}
