use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use polars::prelude::DataFrame;
use tokio::sync::RwLock;

pub trait DataRepository: Send + Sync {
    fn shared_frame(&self) -> Arc<RwLock<DataFrame>>;
    fn revision(&self) -> u64;
    fn bump_revision(&self) -> u64;
}

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

    pub async fn snapshot(&self) -> DataFrame {
        self.frame.read().await.clone()
    }

    pub async fn row_count(&self) -> usize {
        self.frame.read().await.height()
    }

    pub async fn replace(&self, df: DataFrame) -> u64 {
        *self.frame.write().await = df;
        self.bump_revision()
    }
}

impl DataRepository for InMemoryDataRepository {
    fn shared_frame(&self) -> Arc<RwLock<DataFrame>> {
        Arc::clone(&self.frame)
    }

    fn revision(&self) -> u64 {
        self.revision.load(Ordering::Relaxed)
    }

    fn bump_revision(&self) -> u64 {
        self.revision.fetch_add(1, Ordering::Relaxed) + 1
    }
}
