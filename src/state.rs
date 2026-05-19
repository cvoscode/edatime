use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::sync::Arc;

use polars::prelude::{DataFrame, LazyFrame, IntoLazy, SchemaExt};
use tokio::sync::RwLock;

use crate::cache::{DriftCache, ResponseCache};
use crate::config::AppConfig;
use crate::db::DbPool;
use crate::error::AppError;
use crate::metrics::AppMetrics;
use crate::query::QueryEntry;
use crate::repository::{DataRepository, InMemoryDataRepository};

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
        let cache = Arc::new(ResponseCache::new(config.cache.to_runtime_config()));
        let metrics = Arc::new(AppMetrics::new());
        let max_stored = config.query.max_stored.max(1);
        Self {
            repository,
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

    /// Return a shared handle to the in-memory LazyFrame.
    pub async fn dataset_snapshot(&self) -> Arc<RwLock<LazyFrame>> {
        self.repository.shared_frame()
    }

/// Clone only the requested columns from the shared frame.
/// Returns LazyFrame with projection; callers collect if needed.
    pub async fn dataset_snapshot_for_columns(&self, columns: &[&str]) -> Result<LazyFrame, AppError> {
        let lock = self.repository.shared_frame();
        let guard = lock.read().await;
        let schema = guard
            .clone()
            .collect_schema()
            .map_err(|e| AppError::internal(format!("LazyFrame schema unavailable: {}", e)))?;
        let col_names: Vec<String> = schema
            .iter_fields()
            .filter(|f| columns.iter().any(|&col| col == f.name().as_str()))
            .map(|f| f.name().to_string())
            .collect();

        if col_names.is_empty() {
            Ok(guard.clone())
        } else {
            Ok(guard.clone().select(
                col_names
                    .iter()
                    .map(|s| polars::prelude::col(s.as_str()))
                    .collect::<Vec<_>>(),
            ))
        }
    }

    pub async fn replace_dataset(&self, df: DataFrame) -> u64 {
        let lf = df.clone().lazy();
        let column_names: Vec<String> = df.get_column_names().iter().map(|s| s.to_string()).collect();
        let row_count = df.height();
        let meta = crate::repository::DatasetMeta {
            row_count,
            column_names,
            time_column: None,
        };
        let shared_frame = self.repository.shared_frame();
        let meta_store = self.repository.meta();
        {
            let mut guard = shared_frame.write().await;
            *guard = lf;
        }
        {
            let mut meta_guard = meta_store.write().await;
            *meta_guard = meta;
        }
        self.repository.bump_revision()
    }

    pub fn set_time_column_display_name(&self, name: Option<String>) {
        self.repository.set_time_column_display_name(name);
    }

    pub fn time_column_display_name_sync(&self) -> Option<String> {
        self.repository.time_column_display_name_sync()
    }

    /// Returns TsContext (ts_col name, multiplier, dtype) for the time column.
    /// All route handlers that duplicate the 3-line pattern should use this.
    pub fn ts_context(&self, lf: &LazyFrame) -> Result<crate::temporal::TsContext, AppError> {
        let ts_col = self
            .time_column_display_name_sync()
            .unwrap_or_else(|| "ts".to_string());
        crate::temporal::ts_context(lf, &ts_col)
    }

    pub async fn dataset_rows(&self) -> usize {
        let lock = self.repository.shared_frame();
        let lf = lock.read().await;
        lf.clone()
            .select([polars::prelude::len().cast(polars::prelude::DataType::UInt64)])
            .with_new_streaming(true)
            .collect()
            .map(|df| df.height())
            .unwrap_or(0)
    }

    pub fn dataset_revision(&self) -> u64 {
        self.repository.revision()
    }

    /// Push a query entry to the ring buffer.
    pub fn push_query(&self, entry: QueryEntry) {
        let Ok(mut log) = self.query_log.lock().map_err(|e| e.into_inner()) else {
            tracing::warn!("query_log lock failed, dropping entry");
            return
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
            return Vec::new()
        };
        log.drain(..).collect()
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