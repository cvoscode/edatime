use std::{env, fs, path::Path};

use serde::Deserialize;

use crate::cache::CacheConfig;
use crate::error::AppError;

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub cache: CacheSettings,
    pub rate_limit: RateLimitSettings,
    pub upload: UploadSettings,
    pub data: DataSettings,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DataSettings {
    pub sample_data_path: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            cache: CacheSettings::default(),
            rate_limit: RateLimitSettings::default(),
            upload: UploadSettings::default(),
            data: DataSettings::default(),
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 3000,
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
            max_requests: 120,
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

impl Default for DataSettings {
    fn default() -> Self {
        Self {
            sample_data_path: "sample.csv".to_string(),
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

    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.server.host, self.server.port)
    }

    fn apply_env_overrides(&mut self) {
        if let Ok(host) = env::var("EDATIME_HOST") {
            if !host.trim().is_empty() {
                self.server.host = host;
            }
        }
        if let Ok(port) = env::var("EDATIME_PORT") {
            if let Ok(port) = port.parse::<u16>() {
                self.server.port = port;
            }
        }
        if let Ok(sample_data_path) = env::var("EDATIME_SAMPLE_DATA") {
            if !sample_data_path.trim().is_empty() {
                self.data.sample_data_path = sample_data_path;
            }
        }
        if let Ok(ttl_seconds) = env::var("EDATIME_CACHE_TTL_SECONDS") {
            if let Ok(ttl_seconds) = ttl_seconds.parse::<u64>() {
                self.cache.ttl_seconds = ttl_seconds;
            }
        }
        if let Ok(max_entries) = env::var("EDATIME_CACHE_MAX_ENTRIES") {
            if let Ok(max_entries) = max_entries.parse::<usize>() {
                self.cache.max_entries = max_entries;
            }
        }
        if let Ok(max_bytes) = env::var("EDATIME_CACHE_MAX_BYTES") {
            if let Ok(max_bytes) = max_bytes.parse::<usize>() {
                self.cache.max_bytes = max_bytes;
            }
        }
        if let Ok(max_requests) = env::var("EDATIME_RATE_LIMIT_MAX_REQUESTS") {
            if let Ok(max_requests) = max_requests.parse::<usize>() {
                self.rate_limit.max_requests = max_requests;
            }
        }
        if let Ok(window_seconds) = env::var("EDATIME_RATE_LIMIT_WINDOW_SECONDS") {
            if let Ok(window_seconds) = window_seconds.parse::<u64>() {
                self.rate_limit.window_seconds = window_seconds;
            }
        }
        if let Ok(max_upload_bytes) = env::var("EDATIME_MAX_UPLOAD_BYTES") {
            if let Ok(max_upload_bytes) = max_upload_bytes.parse::<usize>() {
                self.upload.max_upload_bytes = max_upload_bytes;
            }
        }
    }
}

impl CacheSettings {
    pub fn to_runtime_config(&self) -> CacheConfig {
        CacheConfig {
            ttl: std::time::Duration::from_secs(self.ttl_seconds.max(1)),
            max_entries: self.max_entries.max(1),
            max_bytes: self.max_bytes.max(1024),
        }
    }
}
