use std::sync::{
    Arc, RwLock as StdRwLock,
    atomic::{AtomicU64, Ordering},
};

use edatime_core::error::AppError;
use polars::prelude::{DataFrame, IntoLazy, LazyFrame};

#[derive(Debug, Clone, Default)]
pub struct DatasetMeta {
    pub row_count: usize,
    pub column_names: Vec<String>,
    pub time_column: Option<String>,
}

/// Thread-safe repository with fast reads.
///
/// Design:
/// - `LazyFrame` stored behind `Arc<StdRwLock<_>>` — sync RwLock for all access paths
/// - Both read path (`snapshot()`) and write path (`replace_from_dataframe()`) use std sync primitives
/// - This allows calling snapshot() from async handlers without blocking the runtime
/// - Revision counter is atomic — lock-free reads
pub struct InMemoryDataRepository {
    /// The LazyFrame — accessed via StdRwLock (sync, not async).
    /// Read path: `snapshot()` acquires read lock briefly, then clones — cloning is ~microseconds.
    /// Write path: `replace_from_dataframe()` acquires write lock — only blocks during upload.
    lf: Arc<StdRwLock<LazyFrame>>,
    meta: Arc<StdRwLock<DatasetMeta>>,
    revision: Arc<AtomicU64>,
    time_column_display_name: Arc<StdRwLock<Option<String>>>,
}

impl Clone for InMemoryDataRepository {
    fn clone(&self) -> Self {
        Self {
            lf: Arc::clone(&self.lf),
            meta: Arc::clone(&self.meta),
            revision: Arc::clone(&self.revision),
            time_column_display_name: Arc::clone(&self.time_column_display_name),
        }
    }
}

impl InMemoryDataRepository {
    pub fn new(df: DataFrame) -> Self {
        // Capture df metadata BEFORE moving df into lazy()
        let column_names: Vec<String> = df
            .get_column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
        let row_count = df.height();
        let lf = df.lazy();
        let meta = DatasetMeta {
            row_count,
            column_names,
            time_column: None,
        };
        Self {
            lf: Arc::new(StdRwLock::new(lf)),
            meta: Arc::new(StdRwLock::new(meta)),
            revision: Arc::new(AtomicU64::new(0)),
            time_column_display_name: Arc::new(StdRwLock::new(None)),
        }
    }

    /// Get a clone of the current LazyFrame — acquires read lock briefly, then clone.
    /// This is fast (~microseconds) because LazyFrame clone is a shallow clone.
    pub fn snapshot(&self) -> LazyFrame {
        self.lf
            .read()
            .unwrap_or_else(|error| {
                tracing::warn!("dataset read lock poisoned; recovering the last frame");
                error.into_inner()
            })
            .clone()
    }

    /// Get a shared handle to the metadata store.
    pub fn meta(&self) -> Arc<StdRwLock<DatasetMeta>> {
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

    fn meta(&self) -> Arc<StdRwLock<DatasetMeta>>;
    fn revision(&self) -> u64;
    fn bump_revision(&self) -> u64;
    fn time_column_display_name(&self) -> Arc<StdRwLock<Option<String>>>;
    fn time_column_display_name_sync(&self) -> Option<String>;
    fn set_time_column_display_name(&self, name: Option<String>);

    /// Replace the dataset — blocks until write lock acquired.
    /// Returns the new revision number, or `Err` if a write lock was poisoned.
    fn replace_from_dataframe(&self, df: DataFrame) -> Result<u64, AppError>;
    /// Replace the active source with a lazy scan and persisted metadata
    /// without collecting its rows into memory.
    fn replace_from_lazyframe(&self, frame: LazyFrame, meta: DatasetMeta) -> Result<u64, AppError>;
}

impl DataRepository for InMemoryDataRepository {
    fn snapshot(&self) -> LazyFrame {
        InMemoryDataRepository::snapshot(self)
    }

    fn meta(&self) -> Arc<StdRwLock<DatasetMeta>> {
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
        self.time_column_display_name
            .read()
            .unwrap_or_else(|error| {
                tracing::warn!("time-column read lock poisoned; recovering the last value");
                error.into_inner()
            })
            .clone()
    }

    fn set_time_column_display_name(&self, name: Option<String>) {
        let mut guard = self
            .time_column_display_name
            .write()
            .unwrap_or_else(|error| {
                tracing::warn!("time-column write lock poisoned; replacing the value");
                error.into_inner()
            });
        *guard = name;
    }

    fn replace_from_dataframe(&self, df: DataFrame) -> Result<u64, AppError> {
        // Capture df info BEFORE moving df into lazy()
        let column_names: Vec<String> = df
            .get_column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
        let row_count = df.height();
        let lf = df.lazy();
        let meta = DatasetMeta {
            row_count,
            column_names,
            time_column: None,
        };
        // Use blocking write — only blocks if a snapshot is being collected concurrently.
        // This is the write path for uploads, which should block reads briefly.
        // Acquire metadata first because its lock handle is public. A caller may
        // hold it while taking a frame snapshot, so the reverse order could
        // deadlock. Holding both before mutation also prevents a new frame from
        // being exposed with stale metadata.
        let mut meta_guard = self
            .meta
            .write()
            .map_err(|_| AppError::internal("dataset meta write lock poisoned"))?;
        let mut frame_guard = self
            .lf
            .write()
            .map_err(|_| AppError::internal("dataset write lock poisoned"))?;

        *frame_guard = lf;
        *meta_guard = meta;

        Ok(self.bump_revision())
    }

    fn replace_from_lazyframe(&self, frame: LazyFrame, meta: DatasetMeta) -> Result<u64, AppError> {
        let mut meta_guard = self
            .meta
            .write()
            .map_err(|_| AppError::internal("dataset meta write lock poisoned"))?;
        let mut frame_guard = self
            .lf
            .write()
            .map_err(|_| AppError::internal("dataset write lock poisoned"))?;

        *frame_guard = frame;
        *meta_guard = meta;

        Ok(self.bump_revision())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repository() -> InMemoryDataRepository {
        InMemoryDataRepository::new(DataFrame::empty())
    }

    #[test]
    fn clones_share_the_revision_counter() {
        let repository = repository();
        let clone = repository.clone();

        assert_eq!(clone.bump_revision(), 1);
        assert_eq!(repository.revision(), 1);
    }

    #[test]
    fn time_column_updates_are_visible_to_all_clones() {
        let repository = repository();
        let clone = repository.clone();

        repository.set_time_column_display_name(Some("recorded_at".to_owned()));

        assert_eq!(
            clone.time_column_display_name_sync().as_deref(),
            Some("recorded_at")
        );
    }
}
