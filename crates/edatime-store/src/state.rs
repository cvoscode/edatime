use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::sync::Mutex;

use polars::prelude::{DataFrame, LazyFrame, SchemaExt};
use tokio::sync::RwLock;

use crate::cache::{DriftCache, ResponseCache};
use crate::db::DbPool;
use crate::repository::{DataRepository, InMemoryDataRepository};
use edatime_core::config::AppConfig;
use edatime_core::error::AppError;
use edatime_core::metrics::AppMetrics;
use edatime_core::temporal::{TsContext, ts_context};
use edatime_query::executor::{ExecutionContext, QueryExecutor};
use edatime_query::query::QueryEntry;

/// Live database connection state, set after a successful `/api/database/connect`.
#[derive(Clone, Debug)]
pub struct DbConnectionInfo {
    pub schema: String,
    pub table: String,
    pub time_column: Option<String>,
}

#[allow(clippy::clone_on_ref_ptr)]
pub struct AppState {
    pub repository: Arc<dyn DataRepository>,
    pub query_executor: Arc<QueryExecutor>,
    pub cache: Arc<ResponseCache>,
    pub metrics: Arc<AppMetrics>,
    pub config: Arc<AppConfig>,
    pub db_pool: Arc<RwLock<Option<Arc<DbPool>>>>,
    pub db_info: Arc<RwLock<Option<DbConnectionInfo>>>,
    pub drift_cache: DriftCache,
    pub query_log: Arc<Mutex<VecDeque<QueryEntry>>>,
    pub query_counter: Arc<std::sync::atomic::AtomicU64>,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            repository: Arc::clone(&self.repository),
            query_executor: Arc::clone(&self.query_executor),
            cache: Arc::clone(&self.cache),
            metrics: Arc::clone(&self.metrics),
            config: Arc::clone(&self.config),
            db_pool: Arc::clone(&self.db_pool),
            db_info: Arc::clone(&self.db_info),
            drift_cache: Arc::clone(&self.drift_cache),
            query_log: Arc::clone(&self.query_log),
            query_counter: Arc::clone(&self.query_counter),
        }
    }
}

impl AppState {
    pub fn new(df: DataFrame, config: AppConfig) -> Self {
        let repository = Arc::new(InMemoryDataRepository::new(df));
        let cache = Arc::new(ResponseCache::new(crate::cache::CacheConfig {
            ttl: std::time::Duration::from_secs(config.cache.ttl_seconds.max(1)),
            max_entries: config.cache.max_entries.max(1),
            max_bytes: config.cache.max_bytes.max(1024),
        }));
        let metrics = Arc::new(AppMetrics::new());
        let max_stored = config.query.max_stored.max(1);
        // QueryExecutor uses Streaming mode by default for memory efficiency.
        let query_executor = Arc::new(QueryExecutor::new(ExecutionContext::Streaming));
        Self {
            repository,
            query_executor,
            cache,
            metrics,
            config: Arc::new(config),
            db_pool: Arc::new(RwLock::new(None)),
            db_info: Arc::new(RwLock::new(None)),
            drift_cache: Arc::new(std::sync::Mutex::new(HashMap::new())),
            query_log: Arc::new(Mutex::new(VecDeque::with_capacity(max_stored))),
            query_counter: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    pub async fn has_db_connection(&self) -> bool {
        self.db_pool.read().await.is_some()
    }

    /// Return a snapshot LazyFrame — no lock involved.
    /// Cloning LazyFrame is cheap (~microseconds).
    pub fn dataset_snapshot(&self) -> LazyFrame {
        self.repository.snapshot()
    }

    /// Clone only the requested columns from the shared frame.
    /// Returns LazyFrame with projection; callers collect if needed.
    pub async fn dataset_snapshot_for_columns(
        &self,
        columns: &[&str],
    ) -> Result<LazyFrame, AppError> {
        let lf = self.repository.snapshot();
        let schema = lf
            .clone()
            .collect_schema()
            .map_err(|e| AppError::internal(format!("LazyFrame schema unavailable: {}", e)))?;
        let col_names: Vec<String> = schema
            .iter_fields()
            .filter(|f| columns.iter().any(|&col| col == f.name().as_str()))
            .map(|f| f.name().to_string())
            .collect();

        if col_names.is_empty() {
            Ok(lf.clone())
        } else {
            Ok(lf.clone().select(
                col_names
                    .iter()
                    .map(|s| polars::prelude::col(s.as_str()))
                    .collect::<Vec<_>>(),
            ))
        }
    }

    pub async fn replace_dataset(&self, df: DataFrame) -> Result<u64, std::io::Error> {
        let rev = self.repository.replace_from_dataframe(df)
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::WouldBlock, "failed to acquire write lock"))?;
        // Invalidate cached responses so stale data is never served after upload.
        self.cache.invalidate_all().await;
        Ok(rev)
    }

    pub fn set_time_column_display_name(&self, name: Option<String>) {
        self.repository.set_time_column_display_name(name);
    }

    pub fn time_column_display_name_sync(&self) -> Option<String> {
        self.repository.time_column_display_name_sync()
    }

    /// Returns TsContext (ts_col name, multiplier, dtype) for the time column.
    /// All route handlers that duplicate the 3-line pattern should use this.
    pub fn ts_context(&self, lf: &LazyFrame) -> Result<TsContext, AppError> {
        let ts_col = self
            .time_column_display_name_sync()
            .unwrap_or_else(|| "ts".to_string());
        ts_context(lf, &ts_col)
    }

    /// Returns row count without forcing a full collect of the active frame.
    /// Uses `count()` on the repository's metadata — O(1) instead of O(n).
    pub async fn dataset_rows(&self) -> usize {
        let meta = self.repository.meta();
        let meta = meta.read().unwrap();
        meta.row_count
    }

    pub fn dataset_revision(&self) -> u64 {
        self.repository.revision()
    }

    /// Push a query entry to the ring buffer.
    pub fn push_query(&self, entry: QueryEntry) {
        let Ok(mut log) = self.query_log.lock().map_err(|e| e.into_inner()) else {
            tracing::warn!("query_log lock failed, dropping entry");
            return;
        };
        let max = self.config.query.max_stored.max(1);
        while log.len() >= max {
            log.pop_front();
        }
        log.push_back(entry);
    }

    /// Drain all query entries (for export).
    pub fn drain_queries(&self) -> Vec<QueryEntry> {
        let Ok(mut log) = self.query_log.lock().map_err(|e| e.into_inner()) else {
            tracing::warn!("query_log drain failed, returning empty");
            return Vec::new();
        };
        log.drain(..).collect::<Vec<_>>()
    }

    pub fn next_query_id(&self) -> u64 {
        self.query_counter
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            + 1
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new(DataFrame::default(), AppConfig::default())
    }
}
