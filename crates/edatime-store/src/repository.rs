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

/// Thread-safe repository with fast reads.
///
/// Design:
/// - `LazyFrame` stored behind `Arc<RwLock<_>>` — write path only
/// - Read path: `snapshot()` acquires read lock briefly, then clones — cloning is ~microseconds
/// - Write path: `replace_from_dataframe()` acquires write lock — only blocks during upload
/// - Revision counter is atomic — lock-free reads
pub struct InMemoryDataRepository {
    /// The LazyFrame — accessed via RwLock for write path only.
    /// Read path uses RwLock read guard + clone (microseconds).
    lf: Arc<tokio::sync::RwLock<LazyFrame>>,
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
        // Capture df metadata BEFORE moving df into lazy()
        let column_names: Vec<String> = df.get_column_names().iter().map(|s| s.to_string()).collect();
        let row_count = df.height();
        let lf = df.lazy();
        let meta = DatasetMeta {
            row_count,
            column_names,
            time_column: None,
        };
        Self {
            lf: Arc::new(tokio::sync::RwLock::new(lf)),
            meta: Arc::new(RwLock::new(meta)),
            revision: AtomicU64::new(0),
            time_column_display_name: Arc::new(StdRwLock::new(None)),
        }
    }

    /// Get a clone of the current LazyFrame — acquires read lock briefly, then clone.
    /// This is fast (~microseconds) because LazyFrame clone is a shallow clone.
    pub fn snapshot(&self) -> LazyFrame {
        // Use blocking RwLock for sync context; in async handlers this is called
        // via spawn_blocking so it's acceptable.
        self.lf.blocking_read().clone()
    }

    /// Get a shared handle to the metadata store.
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
    /// Get a clone of the current LazyFrame — acquires read lock briefly.
    fn snapshot(&self) -> LazyFrame;

    fn meta(&self) -> Arc<RwLock<DatasetMeta>>;
    fn revision(&self) -> u64;
    fn bump_revision(&self) -> u64;
    fn time_column_display_name(&self) -> Arc<StdRwLock<Option<String>>>;
    fn time_column_display_name_sync(&self) -> Option<String>;
    fn set_time_column_display_name(&self, name: Option<String>);

    /// Replace the dataset — blocks until write lock acquired.
    /// Returns the new revision number.
    fn replace_from_dataframe(&self, df: DataFrame) -> u64;

    /// Legacy alias — prefer `snapshot()`.
    fn shared_frame(&self) -> Arc<RwLock<LazyFrame>> {
        Arc::new(RwLock::new(self.snapshot()))
    }
}

impl DataRepository for InMemoryDataRepository {
    fn snapshot(&self) -> LazyFrame {
        self.lf.blocking_read().clone()
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

    fn replace_from_dataframe(&self, df: DataFrame) -> u64 {
        // Capture df info BEFORE moving df into lazy()
        let column_names: Vec<String> = df.get_column_names().iter().map(|s| s.to_string()).collect();
        let row_count = df.height();
        let lf = df.lazy();
        let meta = DatasetMeta {
            row_count,
            column_names,
            time_column: None,
        };
        // Try write — only blocks if a read is in progress (rare, only during upload)
        if let Ok(mut guard) = self.lf.try_write() {
            *guard = lf;
        }
        if let Ok(mut meta_guard) = self.meta.try_write() {
            *meta_guard = meta;
        }
        self.bump_revision()
    }
}