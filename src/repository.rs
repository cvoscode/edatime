use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use polars::prelude::{DataFrame, IntoLazy, LazyFrame};
use std::sync::RwLock as StdRwLock;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Default)]
pub struct DatasetMeta {
    pub row_count: usize,
    pub column_names: Vec<String>,
    pub time_column: Option<String>,
}



pub struct InMemoryDataRepository {
    lf: Arc<RwLock<LazyFrame>>,
    meta: Arc<RwLock<DatasetMeta>>,
    revision: AtomicU64,
    time_column_display_name: Arc<StdRwLock<Option<String>>>,
}

impl Clone for InMemoryDataRepository {
    fn clone(&self) -> Self {
        Self {
            lf: Arc::clone(&self.lf),
            meta: Arc::clone(&self.meta),
            revision: AtomicU64::new(self.revision.load(Ordering::Relaxed)),
            time_column_display_name: Arc::clone(&self.time_column_display_name),
        }
    }
}

impl InMemoryDataRepository {
    pub fn new(df: DataFrame) -> Self {
        let lf = df.clone().lazy();
        let column_names: Vec<String> = df.get_column_names().iter().map(|s| s.to_string()).collect();
        let row_count = df.height();
        let meta = DatasetMeta {
            row_count,
            column_names,
            time_column: None,
        };
        Self {
            lf: Arc::new(RwLock::new(lf)),
            meta: Arc::new(RwLock::new(meta)),
            revision: AtomicU64::new(0),
            time_column_display_name: Arc::new(StdRwLock::new(None)),
        }
    }

    pub fn shared_frame(&self) -> Arc<RwLock<LazyFrame>> {
        Arc::clone(&self.lf)
    }

    pub fn meta(&self) -> Arc<RwLock<DatasetMeta>> {
        Arc::clone(&self.meta)
    }

    pub fn revision(&self) -> u64 {
        self.revision.load(Ordering::Relaxed)
    }

    pub fn bump_revision(&self) -> u64 {
        self.revision.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn time_column_display_name(&self) -> Arc<StdRwLock<Option<String>>> {
        Arc::clone(&self.time_column_display_name)
    }
}

pub trait DataRepository: Send + Sync {
    fn shared_frame(&self) -> Arc<RwLock<LazyFrame>>;
    fn meta(&self) -> Arc<RwLock<DatasetMeta>>;
    fn revision(&self) -> u64;
    fn bump_revision(&self) -> u64;
    fn time_column_display_name(&self) -> Arc<StdRwLock<Option<String>>>;
    fn time_column_display_name_sync(&self) -> Option<String>;
    fn set_time_column_display_name(&self, name: Option<String>);
    fn replace_from_dataframe(&self, df: DataFrame);
}

impl DataRepository for InMemoryDataRepository {
    fn shared_frame(&self) -> Arc<RwLock<LazyFrame>> {
        Arc::clone(&self.lf)
    }

    fn meta(&self) -> Arc<RwLock<DatasetMeta>> {
        Arc::clone(&self.meta)
    }

    fn revision(&self) -> u64 {
        self.revision.load(Ordering::Relaxed)
    }

    fn bump_revision(&self) -> u64 {
        self.revision.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn time_column_display_name(&self) -> Arc<StdRwLock<Option<String>>> {
        Arc::clone(&self.time_column_display_name)
    }

    fn time_column_display_name_sync(&self) -> Option<String> {
        self.time_column_display_name.read().ok().and_then(|g| g.as_ref().cloned())
    }

    fn set_time_column_display_name(&self, name: Option<String>) {
        if let Ok(mut g) = self.time_column_display_name.try_write() {
            *g = name;
        }
    }

    fn replace_from_dataframe(&self, df: DataFrame) {
        let lf = df.clone().lazy();
        let column_names: Vec<String> = df.get_column_names().iter().map(|s| s.to_string()).collect();
        let row_count = df.height();
        let meta = DatasetMeta {
            row_count,
            column_names,
            time_column: None,
        };
        if let Ok(mut guard) = self.lf.try_write() {
            *guard = lf;
        }
        if let Ok(mut meta_guard) = self.meta.try_write() {
            *meta_guard = meta;
        }
    }
}