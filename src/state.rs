use polars::prelude::DataFrame;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

use crate::cache::ResponseCache;
use crate::config::AppConfig;
use crate::db::DbPool;
use crate::metrics::AppMetrics;
use crate::repository::InMemoryDataRepository;

/// Short-lived in-memory cache for drift computation results.
/// Key: request parameter hash string. Value: (dataset_revision, inserted_at, json_bytes).
/// Wrapped in Arc so that cloned AppState shares the same cache rather than
/// each clone getting its own isolated (and thus useless) empty cache.
pub type DriftCache = Arc<std::sync::Mutex<HashMap<String, (u64, Instant, Vec<u8>)>>>;

/// Live database connection state, set after a successful `/api/database/connect`.
#[derive(Clone, Debug)]
pub struct DbConnectionInfo {
    /// Logical schema the selected table lives in.
    pub schema: String,
    /// Table (or hypertable) being queried.
    pub table: String,
    /// Time column used for range filtering.
    pub time_column: Option<String>,
}

#[allow(clippy::clone_on_ref_ptr)]
pub struct AppState {
    pub repository: Arc<InMemoryDataRepository>,
    pub cache: Arc<ResponseCache>,
    pub metrics: Arc<AppMetrics>,
    pub config: Arc<AppConfig>,
    /// Optional live Postgres / TimescaleDB connection pool.
    pub db_pool: Arc<RwLock<Option<Arc<DbPool>>>>,
    /// Connection metadata set alongside the pool.
    pub db_info: Arc<RwLock<Option<DbConnectionInfo>>>,
    /// Short-lived cache for drift computation results (TTL ~60s, invalidated on dataset replace).
    pub drift_cache: DriftCache,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            repository: Arc::clone(&self.repository),
            cache: Arc::clone(&self.cache),
            metrics: Arc::clone(&self.metrics),
            config: Arc::clone(&self.config),
            db_pool: Arc::clone(&self.db_pool),
            db_info: Arc::clone(&self.db_info),
            drift_cache: Arc::clone(&self.drift_cache),
        }
    }
}

impl AppState {
    pub fn new(df: DataFrame, config: AppConfig) -> Self {
        Self {
            repository: Arc::new(InMemoryDataRepository::new(df)),
            cache: Arc::new(ResponseCache::new(config.cache.to_runtime_config())),
            metrics: Arc::new(AppMetrics::new()),
            config: Arc::new(config),
            db_pool: Arc::new(RwLock::new(None)),
            db_info: Arc::new(RwLock::new(None)),
            drift_cache: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }

    /// Returns `true` if a live database connection is active.
    pub async fn has_db_connection(&self) -> bool {
        self.db_pool.read().await.is_some()
    }

    /// Return a shared handle to the in-memory frame. Callers can `read().await`
    /// to obtain a snapshot or clone the `DataFrame` when they need an owned
    /// copy for blocking work.
    pub async fn dataset_snapshot(&self) -> Arc<RwLock<DataFrame>> {
        self.repository.shared_frame()
    }

    /// Clone only the requested columns from the shared frame.
    /// Returns the full frame if column selection fails (e.g. missing `ts`).
    pub async fn dataset_snapshot_for_columns(&self, columns: &[&str]) -> DataFrame {
        let lock = self.repository.shared_frame();
        let guard = lock.read().await;
        let col_names = guard.get_column_names();
        let existing: Vec<&str> = columns
            .iter()
            .filter(|&&c| col_names.iter().any(|n| n.as_str() == c))
            .copied()
            .collect();
        drop(guard); // Release the read lock before clone()

        if existing.is_empty() {
            let full = lock.read().await;
            let df = full.clone();
            drop(full);
            df
        } else {
            let full = lock.read().await;
            match full.select(existing) {
                Ok(df) => df,
                Err(_) => full.clone(),
            }
        }
    }

    pub async fn replace_dataset(&self, df: DataFrame) -> u64 {
        *self.repository.shared_frame().write().await = df;
        self.repository.bump_revision()
    }

    pub async fn dataset_rows(&self) -> usize {
        self.repository.shared_frame().read().await.height()
    }

    pub fn dataset_revision(&self) -> u64 {
        self.repository.revision()
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new(DataFrame::default(), AppConfig::default())
    }
}
