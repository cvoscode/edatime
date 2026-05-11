use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use polars::prelude::DataFrame;
use std::sync::RwLock as StdRwLock;
use tokio::sync::RwLock;

#[derive(Debug)]
pub struct InMemoryDataRepository {
    frame: Arc<RwLock<DataFrame>>,
    revision: AtomicU64,
    time_column_display_name: Arc<StdRwLock<Option<String>>>,
}

impl InMemoryDataRepository {
    pub fn new(df: DataFrame) -> Self {
        Self {
            frame: Arc::new(RwLock::new(df)),
            revision: AtomicU64::new(0),
            time_column_display_name: Arc::new(StdRwLock::new(None)),
        }
    }

    pub fn shared_frame(&self) -> Arc<RwLock<DataFrame>> {
        Arc::clone(&self.frame)
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

    pub fn set_time_column_display_name(&self, name: Option<String>) {
        if let Ok(mut g) = self.time_column_display_name.try_write() {
            *g = name;
        }
    }

    pub fn time_column_display_name_sync(&self) -> Option<String> {
        self.time_column_display_name.read().unwrap().clone()
    }
}
