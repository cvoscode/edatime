use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use polars::prelude::DataFrame;
use tokio::sync::RwLock;

#[derive(Debug)]
pub struct InMemoryDataRepository {
    frame: Arc<RwLock<DataFrame>>,
    revision: AtomicU64,
}

impl InMemoryDataRepository {
    pub fn new(df: DataFrame) -> Self {
        Self {
            frame: Arc::new(RwLock::new(df)),
            revision: AtomicU64::new(0),
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
}
