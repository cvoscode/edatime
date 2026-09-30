//! A small insertion-ordered map with a hard entry limit.
//!
//! Used for the per-source caches (profiles, metadata, compiled cleaning
//! plans) whose keys are opaque ids: eviction follows insertion order, not key
//! order, and every insert re-enforces the bound.

use std::collections::{HashMap, VecDeque};
use std::hash::Hash;

#[derive(Debug)]
pub struct BoundedMap<K, V> {
    entries: HashMap<K, V>,
    /// Oldest first. Contains exactly the keys of `entries`.
    order: VecDeque<K>,
}

impl<K, V> Default for BoundedMap<K, V> {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            order: VecDeque::new(),
        }
    }
}

impl<K: Hash + Eq + Clone, V> BoundedMap<K, V> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn get(&self, key: &K) -> Option<&V> {
        self.entries.get(key)
    }

    /// Insert or replace `key`, marking it the newest entry, then evict until
    /// at most `capacity` (minimum one) entries remain. Entries for which
    /// `prefer_evict` is true go first (oldest of those), so in-flight work can
    /// outlive completed results; the entry just inserted is never evicted.
    pub fn insert_bounded(
        &mut self,
        key: K,
        value: V,
        capacity: usize,
        prefer_evict: impl Fn(&V) -> bool,
    ) {
        if self.entries.insert(key.clone(), value).is_some() {
            self.order.retain(|existing| existing != &key);
        }
        self.order.push_back(key);
        let capacity = capacity.max(1);
        while self.entries.len() > capacity {
            let newest = self.order.len() - 1;
            let victim = self
                .order
                .iter()
                .take(newest)
                .position(|candidate| self.entries.get(candidate).is_some_and(&prefer_evict))
                .or(if newest > 0 { Some(0) } else { None });
            let Some(index) = victim else { break };
            if let Some(evicted) = self.order.remove(index) {
                self.entries.remove(&evicted);
            }
        }
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.order.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::BoundedMap;

    #[test]
    fn evicts_in_insertion_order_not_key_order() {
        let mut map = BoundedMap::new();
        for key in ["z", "y", "a"] {
            map.insert_bounded(key.to_string(), 0, 2, |_| false);
        }
        assert!(map.get(&"z".to_string()).is_none());
        assert!(map.get(&"y".to_string()).is_some());
        assert!(map.get(&"a".to_string()).is_some());
    }

    #[test]
    fn preferred_entries_are_evicted_before_older_pending_ones() {
        let mut map = BoundedMap::new();
        map.insert_bounded("pending", false, 2, |done| *done);
        map.insert_bounded("done", true, 2, |done| *done);
        map.insert_bounded("new", true, 2, |done| *done);
        assert!(map.get(&"pending").is_some());
        assert!(map.get(&"done").is_none());
        assert_eq!(map.len(), 2);
    }

    #[test]
    fn reinserting_refreshes_position_and_never_exceeds_capacity() {
        let mut map = BoundedMap::new();
        map.insert_bounded(1, "a", 2, |_| false);
        map.insert_bounded(2, "b", 2, |_| false);
        map.insert_bounded(1, "a2", 2, |_| false);
        map.insert_bounded(3, "c", 2, |_| false);
        assert!(map.get(&2).is_none());
        assert_eq!(map.get(&1), Some(&"a2"));
        assert_eq!(map.len(), 2);
    }
}
