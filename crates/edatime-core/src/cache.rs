//! Simple in-memory cache with revision-based invalidation.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::Ordering;

/// Simple in-memory cache with revision-based invalidation.
///
/// Unlike a TTL-based cache, this one stores entries without eviction
/// and relies on external callers to call `clear_for_revision` when
/// the underlying dataset changes.
pub struct ResponseCache {
    store: Arc<Mutex<HashMap<String, Vec<u8>>>>,
    revision: Arc<AtomicU64>,
}

use std::sync::atomic::AtomicU64;

impl ResponseCache {
    /// Create a new empty cache.
    pub fn new() -> Self {
        Self {
            store: Arc::new(Mutex::new(HashMap::new())),
            revision: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Retrieve a cached entry by key.
    pub fn get(&self, key: &str) -> Option<Vec<u8>> {
        self.store
            .lock()
            .ok()
            .and_then(|guard| guard.get(key).cloned())
    }

    /// Insert a key/value pair into the cache.
    pub fn insert(&self, key: String, value: Vec<u8>) {
        if let Ok(mut guard) = self.store.lock() {
            guard.insert(key, value);
        }
    }

    /// Clear all entries and bump the revision counter.
    ///
    /// Call this when the dataset is replaced so that stale cached
    /// responses are not served for the new data.
    pub fn clear_for_revision(&self) {
        if let Ok(mut guard) = self.store.lock() {
            guard.clear();
        }
        self.revision.fetch_add(1, Ordering::SeqCst);
    }

    /// Return the current cache revision.
    pub fn revision(&self) -> u64 {
        self.revision.load(Ordering::SeqCst)
    }
}

impl Default for ResponseCache {
    fn default() -> Self {
        Self::new()
    }
}
