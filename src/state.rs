use polars::prelude::DataFrame;
use std::sync::Arc;

use crate::cache::ResponseCache;
use crate::config::AppConfig;
use crate::metrics::AppMetrics;
use crate::repository::InMemoryDataRepository;

#[derive(Clone)]
pub struct AppState {
    pub repository: Arc<InMemoryDataRepository>,
    pub cache: Arc<ResponseCache>,
    pub metrics: Arc<AppMetrics>,
    pub config: Arc<AppConfig>,
}

impl AppState {
    pub fn new(df: DataFrame, config: AppConfig) -> Self {
        Self {
            repository: Arc::new(InMemoryDataRepository::new(df)),
            cache: Arc::new(ResponseCache::new(config.cache.to_runtime_config())),
            metrics: Arc::new(AppMetrics::new()),
            config: Arc::new(config),
        }
    }

    pub async fn dataset_snapshot(&self) -> DataFrame {
        self.repository.shared_frame().read().await.clone()
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
