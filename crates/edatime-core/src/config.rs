use std::{
    env, fs,
    path::{Path, PathBuf},
};

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
    /// Origins allowed to make cross-origin API requests. Empty means that
    /// browsers may use only the normal same-origin application surface.
    pub cors_allowed_origins: Vec<String>,
    /// Direct peer IPs which are allowed to supply forwarding headers.
    pub trusted_proxy_ips: Vec<String>,
    /// Explicit escape hatch for deployments which bind publicly without an
    /// authentication layer in front of edatime.
    pub allow_insecure_public: bool,
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
    pub max_clients: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct UploadSettings {
    pub max_upload_bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DataSettings {
    /// Optional managed directory for durable Parquet dataset artifacts.
    /// Leaving this unset preserves the current in-memory-only behavior.
    pub artifact_dir: Option<PathBuf>,
    /// Optional aggregate cap for managed Parquet artifacts.
    pub max_artifact_bytes: Option<u64>,
    /// Optional cap on retained managed dataset versions. The active lineage is
    /// always kept intact, so a smaller value never corrupts recovery.
    pub max_artifact_versions: Option<usize>,
    /// Avoid relying on unmeasured external-sort behavior when a managed scan
    /// must remain bounded. Operators can opt into streaming sort explicitly.
    pub require_sorted_scan_backed: bool,
}

impl Default for DataSettings {
    fn default() -> Self {
        Self {
            artifact_dir: None,
            max_artifact_bytes: None,
            max_artifact_versions: None,
            require_sorted_scan_backed: true,
        }
    }
}

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
    /// Maximum concurrent interactive `QueryExecutor::execute_async` calls.
    pub max_interactive_concurrency: usize,
    /// Maximum concurrent sink-backed materialization/export calls.
    pub max_background_concurrency: usize,
}

impl Default for QuerySettings {
    fn default() -> Self {
        Self {
            max_stored: 512,
            max_interactive_concurrency: 4,
            max_background_concurrency: 1,
        }
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
            cors_allowed_origins: Vec::new(),
            trusted_proxy_ips: Vec::new(),
            allow_insecure_public: false,
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
            max_clients: 10_000,
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

    /// Refuse an accidentally public unauthenticated listener. Operators that
    /// intentionally put edatime behind a trusted authenticated gateway must
    /// opt in explicitly.
    pub fn validate_bind_security(&self) -> Result<(), AppError> {
        let address = self.bind_address();
        if !address.ip().is_loopback() && !self.server.allow_insecure_public {
            return Err(AppError::bad_request(format!(
                "Refusing public bind on {} without server.allow_insecure_public=true",
                address.ip()
            )));
        }
        Ok(())
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
        if let Ok(max_clients) = env::var("EDATIME_RATE_LIMIT_MAX_CLIENTS")
            && let Ok(max_clients) = max_clients.parse::<usize>()
            && max_clients > 0
        {
            self.rate_limit.max_clients = max_clients;
        }
        if let Ok(origins) = env::var("EDATIME_CORS_ALLOWED_ORIGINS") {
            self.server.cors_allowed_origins = origins
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect();
        }
        if let Ok(proxies) = env::var("EDATIME_TRUSTED_PROXY_IPS") {
            self.server.trusted_proxy_ips = proxies
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect();
        }
        if let Ok(allow_public) = env::var("EDATIME_ALLOW_INSECURE_PUBLIC")
            && let Ok(allow_public) = allow_public.parse::<bool>()
        {
            self.server.allow_insecure_public = allow_public;
        }
        if let Ok(max_upload_bytes) = env::var("EDATIME_MAX_UPLOAD_BYTES")
            && let Ok(max_upload_bytes) = max_upload_bytes.parse::<usize>()
        {
            self.upload.max_upload_bytes = max_upload_bytes;
        }
        if let Ok(artifact_dir) = env::var("EDATIME_ARTIFACT_DIR") {
            let artifact_dir = artifact_dir.trim();
            if !artifact_dir.is_empty() {
                self.data.artifact_dir = Some(PathBuf::from(artifact_dir));
            }
        }
        if let Ok(max_artifact_bytes) = env::var("EDATIME_MAX_ARTIFACT_BYTES")
            && let Ok(max_artifact_bytes) = max_artifact_bytes.parse::<u64>()
        {
            self.data.max_artifact_bytes = Some(max_artifact_bytes);
        }
        if let Ok(max_artifact_versions) = env::var("EDATIME_MAX_ARTIFACT_VERSIONS")
            && let Ok(max_artifact_versions) = max_artifact_versions.parse::<usize>()
            && max_artifact_versions > 0
        {
            self.data.max_artifact_versions = Some(max_artifact_versions);
        }
        if let Ok(require_sorted) = env::var("EDATIME_REQUIRE_SORTED_SCAN_BACKED")
            && let Ok(require_sorted) = require_sorted.parse::<bool>()
        {
            self.data.require_sorted_scan_backed = require_sorted;
        }
        if let Ok(max_interactive) = env::var("EDATIME_MAX_INTERACTIVE_QUERIES")
            && let Ok(max_interactive) = max_interactive.parse::<usize>()
            && max_interactive > 0
        {
            self.query.max_interactive_concurrency = max_interactive;
        }
        if let Ok(max_background) = env::var("EDATIME_MAX_BACKGROUND_JOBS")
            && let Ok(max_background) = max_background.parse::<usize>()
            && max_background > 0
        {
            self.query.max_background_concurrency = max_background;
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

    #[test]
    fn artifact_directory_can_be_overridden_from_env() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        let previous = env::var("EDATIME_ARTIFACT_DIR").ok();

        unsafe {
            env::set_var("EDATIME_ARTIFACT_DIR", "/tmp/edatime-artifacts");
        }

        let mut config = AppConfig::default();
        config.apply_env_overrides();
        assert_eq!(
            config.data.artifact_dir,
            Some(PathBuf::from("/tmp/edatime-artifacts"))
        );

        match previous {
            Some(value) => unsafe {
                env::set_var("EDATIME_ARTIFACT_DIR", value);
            },
            None => unsafe {
                env::remove_var("EDATIME_ARTIFACT_DIR");
            },
        }
    }

    #[test]
    fn artifact_quota_can_be_overridden_from_env() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        let previous = env::var("EDATIME_MAX_ARTIFACT_BYTES").ok();

        unsafe {
            env::set_var("EDATIME_MAX_ARTIFACT_BYTES", "1048576");
        }

        let mut config = AppConfig::default();
        config.apply_env_overrides();
        assert_eq!(config.data.max_artifact_bytes, Some(1_048_576));

        match previous {
            Some(value) => unsafe {
                env::set_var("EDATIME_MAX_ARTIFACT_BYTES", value);
            },
            None => unsafe {
                env::remove_var("EDATIME_MAX_ARTIFACT_BYTES");
            },
        }
    }

    #[test]
    fn artifact_version_retention_can_be_overridden_from_env() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        let previous = env::var("EDATIME_MAX_ARTIFACT_VERSIONS").ok();

        unsafe {
            env::set_var("EDATIME_MAX_ARTIFACT_VERSIONS", "3");
        }

        let mut config = AppConfig::default();
        config.apply_env_overrides();
        assert_eq!(config.data.max_artifact_versions, Some(3));

        match previous {
            Some(value) => unsafe {
                env::set_var("EDATIME_MAX_ARTIFACT_VERSIONS", value);
            },
            None => unsafe {
                env::remove_var("EDATIME_MAX_ARTIFACT_VERSIONS");
            },
        }
    }

    #[test]
    fn sorted_scan_backed_requirement_defaults_to_true_and_can_be_overridden() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        let previous = env::var("EDATIME_REQUIRE_SORTED_SCAN_BACKED").ok();
        assert!(AppConfig::default().data.require_sorted_scan_backed);

        unsafe {
            env::set_var("EDATIME_REQUIRE_SORTED_SCAN_BACKED", "false");
        }
        let mut config = AppConfig::default();
        config.apply_env_overrides();
        assert!(!config.data.require_sorted_scan_backed);

        match previous {
            Some(value) => unsafe {
                env::set_var("EDATIME_REQUIRE_SORTED_SCAN_BACKED", value);
            },
            None => unsafe {
                env::remove_var("EDATIME_REQUIRE_SORTED_SCAN_BACKED");
            },
        }
    }

    #[test]
    fn query_admission_limits_can_be_overridden_from_env() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        let previous_interactive = env::var("EDATIME_MAX_INTERACTIVE_QUERIES").ok();
        let previous_background = env::var("EDATIME_MAX_BACKGROUND_JOBS").ok();
        unsafe {
            env::set_var("EDATIME_MAX_INTERACTIVE_QUERIES", "7");
            env::set_var("EDATIME_MAX_BACKGROUND_JOBS", "2");
        }

        let mut config = AppConfig::default();
        config.apply_env_overrides();
        assert_eq!(config.query.max_interactive_concurrency, 7);
        assert_eq!(config.query.max_background_concurrency, 2);

        match previous_interactive {
            Some(value) => unsafe { env::set_var("EDATIME_MAX_INTERACTIVE_QUERIES", value) },
            None => unsafe { env::remove_var("EDATIME_MAX_INTERACTIVE_QUERIES") },
        }
        match previous_background {
            Some(value) => unsafe { env::set_var("EDATIME_MAX_BACKGROUND_JOBS", value) },
            None => unsafe { env::remove_var("EDATIME_MAX_BACKGROUND_JOBS") },
        }
    }

    #[test]
    fn public_bind_requires_explicit_insecure_opt_in() {
        let mut config = AppConfig::default();
        config.server.host = "0.0.0.0".to_string();
        assert!(config.validate_bind_security().is_err());

        config.server.allow_insecure_public = true;
        assert!(config.validate_bind_security().is_ok());
    }

    #[test]
    fn loopback_bind_is_allowed_by_default() {
        assert!(AppConfig::default().validate_bind_security().is_ok());
    }
}

#[cfg(test)]
mod proptests {
    //! Property-based tests for `AppConfig` defaults and overrides.
    //!
    //! Targets:
    //! - Validation bounds must always be self-consistent
    //!   (`min ≤ max`, non-zero caps, sane positive integers) so the
    //!   `validate_*` helpers in the service layer can never get a config
    //!   that violates its own contract.
    //! - `AppConfig::default()` is reproducible across calls (idempotent).

    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(64))]

        #[test]
        fn validation_default_bounds_are_consistent(_unused in 0..1i32) {
            let v = ValidationSettings::default();
            prop_assert!(v.min_viewport_width > 0);
            prop_assert!(v.max_viewport_width > v.min_viewport_width);
            prop_assert!(v.max_buckets > 0);
            prop_assert!(v.max_scatter_limit > 0);
            prop_assert!(v.default_scatter_limit > 0);
            prop_assert!(v.default_scatter_limit <= v.max_scatter_limit);
            prop_assert!(v.max_scatter_effective_points > 0);
            prop_assert!(v.max_color_cardinality > 0);
            prop_assert!(v.max_selected_columns > 0);
        }

        #[test]
        fn app_config_default_is_idempotent(_unused in 0..1i32) {
            // Two independent defaults must agree — guards against accidental
            // global state leaking into Default impls. We compare the
            // observable validation contract rather than serializing the whole
            // struct (which is Deserialize-only).
            let a = AppConfig::default().validation;
            let b = AppConfig::default().validation;
            prop_assert_eq!(a.max_selected_columns, b.max_selected_columns);
            prop_assert_eq!(a.min_viewport_width, b.min_viewport_width);
            prop_assert_eq!(a.max_viewport_width, b.max_viewport_width);
            prop_assert_eq!(a.max_buckets, b.max_buckets);
            prop_assert_eq!(a.max_scatter_limit, b.max_scatter_limit);
            prop_assert_eq!(a.default_scatter_limit, b.default_scatter_limit);
        }
    }
}
