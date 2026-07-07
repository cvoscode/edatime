//! Simple in-memory cache with revision-based invalidation.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicU64;
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

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod proptests {
    //! Property-based tests for the in-memory response cache.
    //!
    //! Targets:
    //! - `revision` is monotonically non-decreasing across repeated writes
    //!   and strictly increasing across `clear_for_revision` calls.
    //! - `insert` then `get` round-trips the stored value.
    //! - After `clear_for_revision`, all previously-stored entries are gone.

    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(128))]

        #[test]
        fn revision_starts_at_zero(_unused in 0..1i32) {
            let cache = ResponseCache::new();
            prop_assert_eq!(cache.revision(), 0);
        }

        #[test]
        fn clear_for_revision_increments_monotonically(n in 1usize..64) {
            let cache = ResponseCache::new();
            let mut prev = 0u64;
            for _ in 0..n {
                cache.clear_for_revision();
                let now = cache.revision();
                prop_assert!(now > prev, "revision must strictly increase: {prev} -> {now}");
                prev = now;
            }
        }

        #[test]
        fn insert_then_get_returns_value(
            key in "[a-zA-Z0-9_]{1,32}",
            value in proptest::collection::vec(any::<u8>(), 0..256),
        ) {
            let cache = ResponseCache::new();
            cache.insert(key.clone(), value.clone());
            let got = cache.get(&key);
            prop_assert_eq!(got, Some(value));
        }

        #[test]
        fn clear_drops_all_entries(
            entries in proptest::collection::vec(
                ("[a-zA-Z0-9_]{1,16}", proptest::collection::vec(any::<u8>(), 0..32)),
                0..32,
            ),
        ) {
            let cache = ResponseCache::new();
            for (k, v) in &entries {
                cache.insert(k.clone(), v.clone());
            }
            cache.clear_for_revision();
            for (k, _) in &entries {
                prop_assert!(
                    cache.get(k).is_none(),
                    "key {} should be cleared after clear_for_revision",
                    k
                );
            }
        }

        #[test]
        fn distinct_keys_do_not_clobber(
            keys in proptest::collection::hash_set("[a-zA-Z0-9_]{1,16}", 1..32),
            value in proptest::collection::vec(any::<u8>(), 0..64),
        ) {
            let cache = ResponseCache::new();
            for k in &keys {
                cache.insert(k.clone(), value.clone());
            }
            for k in &keys {
                prop_assert_eq!(cache.get(k), Some(value.clone()));
            }
        }
    }
}
