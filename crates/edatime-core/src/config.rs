use std::{
    env, fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;

use crate::error::DomainError;

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
    pub budgets: WorkBudgetSettings,
    pub retention: RetentionSettings,
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
    /// Upload parsing and dataframe construction can temporarily retain more
    /// than the wire payload. Serialize those sessions by default so several
    /// simultaneous uploads cannot multiply that resident-memory peak.
    pub max_concurrent_uploads: usize,
    /// Maximum time an upload waits for an admission permit.
    pub queue_timeout_ms: u64,
    /// Conservative resident-memory estimate reserved for one upload while
    /// decoding and replacing the active dataset. This is an admission guard,
    /// not a process RSS hard limit; parser and decompression implementations
    /// may allocate outside the estimate.
    pub max_estimated_resident_bytes: usize,
    /// Multiplier applied to the wire payload when reserving the estimate.
    /// It accounts for decoded values, validity buffers, and parser overhead.
    pub resident_memory_multiplier: usize,
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
    /// Directory holding the built-in sample datasets served by
    /// `/api/v1/sample/{name}`. Defaults to the repository root.
    pub sample_dir: PathBuf,
}

impl Default for DataSettings {
    fn default() -> Self {
        Self {
            artifact_dir: None,
            max_artifact_bytes: Some(20 * 1024 * 1024 * 1024),
            max_artifact_versions: Some(12),
            require_sorted_scan_backed: true,
            sample_dir: Path::new(env!("CARGO_MANIFEST_DIR")).join("../.."),
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
    /// Maximum concurrent filesystem/parser blocking operations.
    pub max_blocking_io_concurrency: usize,
    /// Maximum waiters admitted per workload class before immediate rejection.
    pub max_queued_per_class: usize,
    /// Maximum time a worker may wait for an execution slot.
    pub queue_timeout_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct WorkBudgetSettings {
    pub max_scatter_matrix_pairs: usize,
    pub max_scatter_matrix_points: usize,
    /// Approximate row-by-pair operations allowed per correlation request.
    pub max_correlation_work_units: u64,
    pub max_rolling_cells: usize,
    pub max_spectrogram_cells: usize,
    pub max_analytics_points: usize,
    pub max_causal_work_units: u64,
    pub max_cleaning_stages: usize,
    pub max_database_rows: usize,
    pub max_database_bytes: usize,
    pub database_timeout_seconds: u64,
    pub max_json_body_bytes: usize,
}

impl Default for WorkBudgetSettings {
    fn default() -> Self {
        Self {
            max_scatter_matrix_pairs: 64,
            max_scatter_matrix_points: 1_000_000,
            max_correlation_work_units: 25_000_000,
            max_rolling_cells: 2_000_000,
            max_spectrogram_cells: 2_000_000,
            max_analytics_points: 65_536,
            max_causal_work_units: 250_000_000,
            max_cleaning_stages: 50,
            max_database_rows: 1_000_000,
            max_database_bytes: 512 * 1024 * 1024,
            database_timeout_seconds: 30,
            max_json_body_bytes: 2 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct RetentionSettings {
    pub max_terminal_jobs: usize,
    pub terminal_job_ttl_seconds: u64,
    pub max_profile_entries: usize,
    pub max_resident_versions: usize,
    pub max_resident_bytes: u64,
}

impl Default for RetentionSettings {
    fn default() -> Self {
        Self {
            max_terminal_jobs: 256,
            terminal_job_ttl_seconds: 3_600,
            max_profile_entries: 32,
            max_resident_versions: 8,
            max_resident_bytes: 1024 * 1024 * 1024,
        }
    }
}

impl Default for QuerySettings {
    fn default() -> Self {
        Self {
            max_stored: 512,
            max_interactive_concurrency: 4,
            max_background_concurrency: 1,
            max_blocking_io_concurrency: 2,
            max_queued_per_class: 16,
            queue_timeout_ms: 2_000,
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
            max_concurrent_uploads: 1,
            queue_timeout_ms: 1_000,
            max_estimated_resident_bytes: 1024 * 1024 * 1024,
            resident_memory_multiplier: 4,
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
    pub fn load() -> Result<Self, DomainError> {
        let config_path = env::var("EDATIME_CONFIG").unwrap_or_else(|_| "config.toml".to_string());
        let mut config = if Path::new(&config_path).exists() {
            let contents = fs::read_to_string(&config_path).map_err(|error| {
                DomainError::internal(format!("Failed to read config '{config_path}': {error}"))
            })?;
            toml::from_str::<AppConfig>(&contents).map_err(|error| {
                DomainError::internal(format!("Failed to parse config '{config_path}': {error}"))
            })?
        } else {
            AppConfig::default()
        };

        config.apply_env_overrides()?;
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
    pub fn validate_bind_security(&self) -> Result<(), DomainError> {
        let address = self.bind_address();
        if !address.ip().is_loopback() && !self.server.allow_insecure_public {
            return Err(DomainError::bad_request(format!(
                "Refusing public bind on {} without server.allow_insecure_public=true",
                address.ip()
            )));
        }
        Ok(())
    }

    /// Apply `EDATIME_*` environment overrides. A variable that is set but
    /// cannot be parsed (or is out of range) is an error rather than being
    /// ignored, so a typo cannot silently leave a safety limit at its default.
    fn apply_env_overrides(&mut self) -> Result<(), DomainError> {
        if let Some(host) = read_env("EDATIME_HOST")? {
            let host = host.trim();
            if !host.is_empty() {
                self.server.host = host.to_string();
            }
        }
        set_from_env(&mut self.server.port, "EDATIME_PORT")?;
        set_from_env(&mut self.cache.ttl_seconds, "EDATIME_CACHE_TTL_SECONDS")?;
        set_from_env(&mut self.cache.max_entries, "EDATIME_CACHE_MAX_ENTRIES")?;
        set_from_env(&mut self.cache.max_bytes, "EDATIME_CACHE_MAX_BYTES")?;
        set_from_env(
            &mut self.rate_limit.max_requests,
            "EDATIME_RATE_LIMIT_MAX_REQUESTS",
        )?;
        set_from_env(
            &mut self.rate_limit.window_seconds,
            "EDATIME_RATE_LIMIT_WINDOW_SECONDS",
        )?;
        set_positive_from_env(
            &mut self.rate_limit.max_clients,
            "EDATIME_RATE_LIMIT_MAX_CLIENTS",
        )?;
        set_from_env(
            &mut self.server.allow_insecure_public,
            "EDATIME_ALLOW_INSECURE_PUBLIC",
        )?;
        set_from_env(
            &mut self.upload.max_upload_bytes,
            "EDATIME_MAX_UPLOAD_BYTES",
        )?;
        set_positive_from_env(
            &mut self.upload.max_concurrent_uploads,
            "EDATIME_MAX_CONCURRENT_UPLOADS",
        )?;
        set_positive_from_env(
            &mut self.upload.queue_timeout_ms,
            "EDATIME_UPLOAD_QUEUE_TIMEOUT_MS",
        )?;
        set_some_from_env(
            &mut self.data.max_artifact_bytes,
            "EDATIME_MAX_ARTIFACT_BYTES",
        )?;
        set_some_positive_from_env(
            &mut self.data.max_artifact_versions,
            "EDATIME_MAX_ARTIFACT_VERSIONS",
        )?;
        set_from_env(
            &mut self.data.require_sorted_scan_backed,
            "EDATIME_REQUIRE_SORTED_SCAN_BACKED",
        )?;
        set_positive_from_env(
            &mut self.query.max_interactive_concurrency,
            "EDATIME_MAX_INTERACTIVE_QUERIES",
        )?;
        set_positive_from_env(
            &mut self.query.max_background_concurrency,
            "EDATIME_MAX_BACKGROUND_JOBS",
        )?;
        set_positive_from_env(
            &mut self.query.max_blocking_io_concurrency,
            "EDATIME_MAX_BLOCKING_IO",
        )?;
        set_positive_from_env(
            &mut self.query.max_queued_per_class,
            "EDATIME_MAX_QUEUED_WORK",
        )?;
        set_positive_from_env(
            &mut self.query.queue_timeout_ms,
            "EDATIME_WORK_QUEUE_TIMEOUT_MS",
        )?;
        set_positive_from_env(
            &mut self.retention.max_resident_versions,
            "EDATIME_MAX_RESIDENT_VERSIONS",
        )?;
        set_positive_from_env(
            &mut self.retention.max_resident_bytes,
            "EDATIME_MAX_RESIDENT_BYTES",
        )?;
        set_positive_from_env(
            &mut self.retention.max_terminal_jobs,
            "EDATIME_MAX_TERMINAL_JOBS",
        )?;
        set_positive_from_env(
            &mut self.retention.terminal_job_ttl_seconds,
            "EDATIME_TERMINAL_JOB_TTL_SECONDS",
        )?;
        set_positive_from_env(
            &mut self.retention.max_profile_entries,
            "EDATIME_MAX_PROFILE_ENTRIES",
        )?;
        set_positive_from_env(
            &mut self.budgets.max_analytics_points,
            "EDATIME_MAX_ANALYTICS_POINTS",
        )?;
        set_positive_from_env(
            &mut self.budgets.max_correlation_work_units,
            "EDATIME_MAX_CORRELATION_WORK_UNITS",
        )?;
        set_positive_from_env(
            &mut self.budgets.max_database_rows,
            "EDATIME_MAX_DATABASE_ROWS",
        )?;
        set_positive_from_env(
            &mut self.budgets.max_database_bytes,
            "EDATIME_MAX_DATABASE_BYTES",
        )?;
        set_positive_from_env(
            &mut self.budgets.database_timeout_seconds,
            "EDATIME_DATABASE_TIMEOUT_SECONDS",
        )?;
        set_from_env(
            &mut self.validation.min_viewport_width,
            "EDATIME_MIN_VIEWPORT_WIDTH",
        )?;
        set_from_env(
            &mut self.validation.max_viewport_width,
            "EDATIME_MAX_VIEWPORT_WIDTH",
        )?;
        set_from_env(
            &mut self.validation.default_scatter_limit,
            "EDATIME_DEFAULT_SCATTER_LIMIT",
        )?;
        set_from_env(
            &mut self.validation.max_scatter_limit,
            "EDATIME_MAX_SCATTER_LIMIT",
        )?;
        set_from_env(
            &mut self.validation.max_color_cardinality,
            "EDATIME_MAX_COLOR_CARDINALITY",
        )?;
        if let Some(origins) = read_env("EDATIME_CORS_ALLOWED_ORIGINS")? {
            self.server.cors_allowed_origins = split_csv(&origins);
        }
        if let Some(proxies) = read_env("EDATIME_TRUSTED_PROXY_IPS")? {
            self.server.trusted_proxy_ips = split_csv(&proxies);
        }
        if let Some(sample_dir) = read_env("EDATIME_SAMPLE_DATA_DIR")? {
            let sample_dir = sample_dir.trim();
            if !sample_dir.is_empty() {
                self.data.sample_dir = PathBuf::from(sample_dir);
            }
        }
        if let Some(artifact_dir) = read_env("EDATIME_ARTIFACT_DIR")? {
            let artifact_dir = artifact_dir.trim();
            if !artifact_dir.is_empty() {
                self.data.artifact_dir = Some(PathBuf::from(artifact_dir));
            }
        }
        if let Some(db_url) = read_env("EDATIME_DATABASE_URL")? {
            let db_url = db_url.trim();
            if !db_url.is_empty() {
                self.database.connection_string = Some(db_url.to_string());
                self.database.enabled = true;
            }
        }
        if let Some(backend) = read_env("EDATIME_DATABASE_BACKEND")? {
            self.database.backend = match backend.trim().to_lowercase().as_str() {
                "postgres" => DatabaseBackend::Postgres,
                "timescale" => DatabaseBackend::Timescale,
                other => {
                    return Err(DomainError::bad_request(format!(
                        "EDATIME_DATABASE_BACKEND must be 'postgres' or 'timescale', got '{other}'"
                    )));
                }
            };
        }
        Ok(())
    }
}

/// Read an environment variable; `None` when unset, an error when not UTF-8.
fn read_env(name: &str) -> Result<Option<String>, DomainError> {
    match env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(env::VarError::NotUnicode(_)) => Err(DomainError::bad_request(format!(
            "{name} must be valid UTF-8"
        ))),
    }
}

fn parse_env<T: std::str::FromStr>(name: &str) -> Result<Option<T>, DomainError> {
    read_env(name)?
        .map(|raw| {
            raw.trim().parse::<T>().map_err(|_| {
                DomainError::bad_request(format!("{name} has an invalid value '{}'", raw.trim()))
            })
        })
        .transpose()
}

fn parse_positive_env<T>(name: &str) -> Result<Option<T>, DomainError>
where
    T: std::str::FromStr + Default + PartialOrd,
{
    let value = parse_env::<T>(name)?;
    if value.as_ref().is_some_and(|value| *value <= T::default()) {
        return Err(DomainError::bad_request(format!(
            "{name} must be greater than zero"
        )));
    }
    Ok(value)
}

fn set_from_env<T: std::str::FromStr>(target: &mut T, name: &str) -> Result<(), DomainError> {
    if let Some(value) = parse_env(name)? {
        *target = value;
    }
    Ok(())
}

fn set_positive_from_env<T>(target: &mut T, name: &str) -> Result<(), DomainError>
where
    T: std::str::FromStr + Default + PartialOrd,
{
    if let Some(value) = parse_positive_env(name)? {
        *target = value;
    }
    Ok(())
}

fn set_some_from_env<T: std::str::FromStr>(
    target: &mut Option<T>,
    name: &str,
) -> Result<(), DomainError> {
    if let Some(value) = parse_env(name)? {
        *target = Some(value);
    }
    Ok(())
}

fn set_some_positive_from_env<T>(target: &mut Option<T>, name: &str) -> Result<(), DomainError>
where
    T: std::str::FromStr + Default + PartialOrd,
{
    if let Some(value) = parse_positive_env(name)? {
        *target = Some(value);
    }
    Ok(())
}

fn split_csv(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
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
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn invalid_env_values_are_reported_instead_of_ignored() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        unsafe {
            env::set_var("EDATIME_PORT", "not-a-port");
        }
        let mut config = AppConfig::default();
        let error = config.apply_env_overrides().unwrap_err().to_string();
        unsafe {
            env::remove_var("EDATIME_PORT");
        }
        assert!(error.contains("EDATIME_PORT"), "{error}");
        assert_eq!(config.server.port, ServerConfig::default().port);
    }

    #[test]
    fn zero_is_rejected_for_positive_only_limits() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        unsafe {
            env::set_var("EDATIME_MAX_INTERACTIVE_QUERIES", "0");
        }
        let mut config = AppConfig::default();
        let error = config.apply_env_overrides().unwrap_err().to_string();
        unsafe {
            env::remove_var("EDATIME_MAX_INTERACTIVE_QUERIES");
        }
        assert!(error.contains("greater than zero"), "{error}");
    }

    #[test]
    fn default_scatter_limit_can_be_overridden_from_env() {
        let _guard = env_lock().lock().expect("env lock should not be poisoned");
        let previous = env::var("EDATIME_DEFAULT_SCATTER_LIMIT").ok();

        unsafe {
            env::set_var("EDATIME_DEFAULT_SCATTER_LIMIT", "345678");
        }

        let mut config = AppConfig::default();
        config.apply_env_overrides().unwrap();
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
        config.apply_env_overrides().unwrap();
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
        config.apply_env_overrides().unwrap();
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
        config.apply_env_overrides().unwrap();
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
        config.apply_env_overrides().unwrap();
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
        config.apply_env_overrides().unwrap();
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
