use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use bytes::Bytes;

/// Correlation matrices and aligned sample counts. Unrequested metrics are
/// empty in a mode-specific working cache entry.
#[derive(Debug, Clone, PartialEq)]
pub struct CorrelationMatrixCacheEntry {
    pub columns: Vec<String>,
    pub pearson_raw: Vec<Vec<Option<f64>>>,
    pub spearman_raw: Vec<Vec<Option<f64>>>,
    pub kendall_raw: Vec<Vec<Option<f64>>>,
    pub pearson_diff: Vec<Vec<Option<f64>>>,
    pub spearman_diff: Vec<Vec<Option<f64>>>,
    pub kendall_diff: Vec<Vec<Option<f64>>>,
    pub counts: Vec<Vec<usize>>,
    pub diff_counts: Vec<Vec<usize>>,
}

type WorkingCorrelationKey = (String, String, &'static str);
type WorkingCorrelationSlot = Arc<tokio::sync::OnceCell<CorrelationMatrixCacheEntry>>;

struct WorkingCorrelationEntry {
    key: WorkingCorrelationKey,
    slot: WorkingCorrelationSlot,
    estimated_bytes: usize,
}

/// Bounded results for immutable source/plan/mode combinations. Each slot
/// coalesces its own computation without blocking requests for other plans.
pub struct WorkingCorrelationCache {
    entries: VecDeque<WorkingCorrelationEntry>,
    max_bytes: usize,
    total_bytes: usize,
}

impl Default for WorkingCorrelationCache {
    fn default() -> Self {
        Self::new(32 * 1024 * 1024)
    }
}

impl WorkingCorrelationCache {
    const MAX_ENTRIES: usize = 24;

    pub fn new(max_bytes: usize) -> Self {
        Self {
            entries: VecDeque::new(),
            max_bytes,
            total_bytes: 0,
        }
    }

    /// Reconcile a producer's reservation before its result is published.
    /// Retention uses the result's actual owned capacities; an evicted
    /// producer must never resize a newer slot with the same logical key.
    pub fn record_result_size(&mut self, slot: &WorkingCorrelationSlot, actual_bytes: usize) {
        let Some(index) = self
            .entries
            .iter()
            .position(|entry| Arc::ptr_eq(&entry.slot, slot))
        else {
            return;
        };
        let Some(mut entry) = self.entries.remove(index) else {
            return;
        };
        self.total_bytes = self.total_bytes.saturating_sub(entry.estimated_bytes);
        if actual_bytes > self.max_bytes {
            return;
        }
        while self.total_bytes.saturating_add(actual_bytes) > self.max_bytes {
            let Some(oldest) = self.entries.pop_front() else {
                break;
            };
            self.total_bytes = self.total_bytes.saturating_sub(oldest.estimated_bytes);
        }
        entry.estimated_bytes = actual_bytes;
        self.total_bytes = self.total_bytes.saturating_add(actual_bytes);
        self.entries.push_back(entry);
    }

    pub fn entry(
        &mut self,
        source_version: String,
        plan_hash: String,
        mode: &'static str,
        estimated_bytes: usize,
    ) -> WorkingCorrelationSlot {
        let key = (source_version, plan_hash, mode);
        if let Some(index) = self.entries.iter().position(|entry| entry.key == key)
            && let Some(entry) = self.entries.remove(index)
        {
            self.entries.push_back(WorkingCorrelationEntry {
                key: entry.key,
                slot: Arc::clone(&entry.slot),
                estimated_bytes: entry.estimated_bytes,
            });
            return entry.slot;
        }

        let slot = Arc::new(tokio::sync::OnceCell::new());
        if estimated_bytes > self.max_bytes {
            return slot;
        }
        while self.entries.len() >= Self::MAX_ENTRIES
            || self.total_bytes.saturating_add(estimated_bytes) > self.max_bytes
        {
            let Some(oldest) = self.entries.pop_front() else {
                break;
            };
            self.total_bytes = self.total_bytes.saturating_sub(oldest.estimated_bytes);
        }
        self.total_bytes = self.total_bytes.saturating_add(estimated_bytes);
        self.entries.push_back(WorkingCorrelationEntry {
            key,
            slot: Arc::clone(&slot),
            estimated_bytes,
        });
        slot
    }
}

impl CorrelationMatrixCacheEntry {
    /// Conservative heap estimate for cache admission. Counts Vec headers,
    /// row capacities, and owned column names as well as their elements.
    pub fn estimated_bytes(&self) -> usize {
        fn matrix_bytes<T>(matrix: &[Vec<T>]) -> usize {
            matrix
                .len()
                .saturating_mul(std::mem::size_of::<Vec<T>>())
                .saturating_add(
                    matrix
                        .iter()
                        .map(|row| row.capacity().saturating_mul(std::mem::size_of::<T>()))
                        .fold(0usize, usize::saturating_add),
                )
        }

        std::mem::size_of::<Self>()
            .saturating_add(
                self.columns
                    .capacity()
                    .saturating_mul(std::mem::size_of::<String>())
                    .saturating_add(
                        self.columns
                            .iter()
                            .map(|column| column.capacity())
                            .fold(0usize, usize::saturating_add),
                    ),
            )
            .saturating_add(matrix_bytes(&self.pearson_raw))
            .saturating_add(matrix_bytes(&self.spearman_raw))
            .saturating_add(matrix_bytes(&self.kendall_raw))
            .saturating_add(matrix_bytes(&self.pearson_diff))
            .saturating_add(matrix_bytes(&self.spearman_diff))
            .saturating_add(matrix_bytes(&self.kendall_diff))
            .saturating_add(matrix_bytes(&self.counts))
            .saturating_add(matrix_bytes(&self.diff_counts))
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CacheConfig {
    pub ttl: Duration,
    pub max_entries: usize,
    pub max_bytes: usize,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            ttl: Duration::from_secs(60),
            max_entries: 128,
            max_bytes: 32 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CachedResponse {
    pub content_type: &'static str,
    pub body: Arc<Bytes>,
    pub is_downsampled: bool,
    pub returned_rows: usize,
    pub target_points: usize,
    pub time_column: Option<String>,
    pub extra_headers: Vec<(String, String)>,
}

impl CachedResponse {
    pub fn json(
        body: Vec<u8>,
        is_downsampled: bool,
        returned_rows: usize,
        target_points: usize,
        time_column: Option<String>,
    ) -> Self {
        Self {
            content_type: "application/json",
            body: Arc::new(Bytes::from(body)),
            is_downsampled,
            returned_rows,
            target_points,
            time_column,
            extra_headers: Vec::new(),
        }
    }

    pub fn arrow(
        body: Vec<u8>,
        is_downsampled: bool,
        returned_rows: usize,
        target_points: usize,
        time_column: Option<String>,
    ) -> Self {
        Self {
            content_type: "application/vnd.apache.arrow.stream",
            body: Arc::new(Bytes::from(body)),
            is_downsampled,
            returned_rows,
            target_points,
            time_column,
            extra_headers: Vec::new(),
        }
    }

    pub fn with_extra_headers(mut self, headers: Vec<(String, String)>) -> Self {
        self.extra_headers = headers;
        self
    }

    pub fn body_len(&self) -> usize {
        self.body.as_ref().len()
    }
}

#[derive(Debug, Clone)]
struct CacheEntry {
    inserted_at: Instant,
    response: CachedResponse,
}

#[derive(Debug)]
struct CacheState {
    entries: HashMap<String, CacheEntry>,
    order: VecDeque<String>,
    total_bytes: usize,
    last_pruned: Instant,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheSnapshot {
    pub entries: usize,
    pub resident_bytes: usize,
    pub evictions: u64,
    pub expirations: u64,
    pub coalesced_waiters: u64,
    pub computes: u64,
    pub in_flight: usize,
}

#[derive(Debug)]
pub enum CacheReservation {
    Hit {
        response: CachedResponse,
        coalesced: bool,
    },
    Producer(CacheProducer),
}

#[derive(Debug)]
pub struct CacheProducer {
    cache: Arc<ResponseCache>,
    key: String,
    sender: Option<tokio::sync::watch::Sender<bool>>,
}

impl Drop for CacheProducer {
    fn drop(&mut self) {
        let Ok(mut flights) = self
            .cache
            .in_flight
            .lock()
            .map_err(|error| error.into_inner())
        else {
            return;
        };
        flights.remove(&self.key);
        if let Some(sender) = self.sender.take() {
            let _ = sender.send(true);
        }
    }
}

impl Default for CacheState {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            order: VecDeque::new(),
            total_bytes: 0,
            last_pruned: Instant::now(),
        }
    }
}

#[derive(Debug)]
/// TTL-based in-memory response cache for query results.
/// Stores serialized `CachedResponse` objects (JSON or Arrow) keyed by cache key string.
/// Uses revision-based invalidation (call `invalidate_all`) when the underlying
/// dataset changes.
pub struct ResponseCache {
    config: CacheConfig,
    // No .await inside critical sections — std::sync::Mutex is cheaper and
    // correctly conveys "blocking, not async" to the Tokio executor.
    state: std::sync::Mutex<CacheState>,
    in_flight: std::sync::Mutex<HashMap<String, tokio::sync::watch::Receiver<bool>>>,
    evictions: AtomicU64,
    expirations: AtomicU64,
    coalesced_waiters: AtomicU64,
    computes: AtomicU64,
}

impl ResponseCache {
    pub fn new(config: CacheConfig) -> Self {
        Self {
            config,
            state: std::sync::Mutex::new(CacheState::default()),
            in_flight: std::sync::Mutex::new(HashMap::new()),
            evictions: AtomicU64::new(0),
            expirations: AtomicU64::new(0),
            coalesced_waiters: AtomicU64::new(0),
            computes: AtomicU64::new(0),
        }
    }

    /// Return a warm response or reserve one producer slot for a cold key.
    /// Waiters never duplicate work: they observe producer completion, then
    /// read the immutable cached bytes. If a producer is cancelled or fails,
    /// exactly one waiter is elected to retry.
    pub async fn reserve(self: &Arc<Self>, key: &str) -> CacheReservation {
        let mut coalesced = false;
        loop {
            if let Some(response) = self.get(key).await {
                return CacheReservation::Hit {
                    response,
                    coalesced,
                };
            }

            let receiver = {
                let mut flights = self
                    .in_flight
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                if let Some(receiver) = flights.get(key) {
                    Some(receiver.clone())
                } else {
                    let (sender, receiver) = tokio::sync::watch::channel(false);
                    flights.insert(key.to_string(), receiver);
                    self.computes.fetch_add(1, Ordering::Relaxed);
                    return CacheReservation::Producer(CacheProducer {
                        cache: Arc::clone(self),
                        key: key.to_string(),
                        sender: Some(sender),
                    });
                }
            };

            if let Some(mut receiver) = receiver {
                self.coalesced_waiters.fetch_add(1, Ordering::Relaxed);
                coalesced = true;
                let _ = receiver.changed().await;
            }
        }
    }

    pub async fn get(&self, key: &str) -> Option<CachedResponse> {
        let mut state = self.state.lock().map_err(|e| e.into_inner()).ok()?;
        self.maybe_prune(&mut state);
        state.entries.get(key).map(|entry| entry.response.clone())
    }

    pub async fn insert(&self, key: String, response: CachedResponse) {
        let Ok(mut state) = self.state.lock().map_err(|e| e.into_inner()) else {
            return;
        };
        self.maybe_prune(&mut state);

        if let Some(previous) = state.entries.remove(&key) {
            state.total_bytes = state
                .total_bytes
                .saturating_sub(previous.response.body_len());
        }
        state.order.retain(|existing_key| existing_key != &key);

        state.total_bytes = state.total_bytes.saturating_add(response.body_len());
        state.order.push_back(key.clone());
        state.entries.insert(
            key,
            CacheEntry {
                inserted_at: Instant::now(),
                response,
            },
        );

        while state.entries.len() > self.config.max_entries
            || state.total_bytes > self.config.max_bytes
        {
            let Some(oldest_key) = state.order.pop_front() else {
                break;
            };
            if let Some(entry) = state.entries.remove(&oldest_key) {
                state.total_bytes = state.total_bytes.saturating_sub(entry.response.body_len());
                self.evictions.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    /// Only run the O(n) TTL sweep when at least half the TTL has elapsed
    /// since the last prune, avoiding needless work on every cache access.
    fn maybe_prune(&self, state: &mut CacheState) {
        let now = Instant::now();
        let half_ttl = self.config.ttl / 2;
        if now.duration_since(state.last_pruned) >= half_ttl {
            let expired = Self::prune_expired(state, self.config.ttl);
            self.expirations
                .fetch_add(expired as u64, Ordering::Relaxed);
            state.last_pruned = now;
        }
    }

    fn prune_expired(state: &mut CacheState, ttl: Duration) -> usize {
        let now = Instant::now();
        let mut expired = 0;
        state.order.retain(|key| {
            let keep = state
                .entries
                .get(key)
                .map(|entry| now.duration_since(entry.inserted_at) < ttl)
                .unwrap_or(false);
            if !keep && let Some(entry) = state.entries.remove(key) {
                state.total_bytes = state.total_bytes.saturating_sub(entry.response.body_len());
                expired += 1;
            }
            keep
        });
        expired
    }

    pub fn snapshot(&self) -> CacheSnapshot {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let flights = self
            .in_flight
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        CacheSnapshot {
            entries: state.entries.len(),
            resident_bytes: state.total_bytes,
            evictions: self.evictions.load(Ordering::Relaxed),
            expirations: self.expirations.load(Ordering::Relaxed),
            coalesced_waiters: self.coalesced_waiters.load(Ordering::Relaxed),
            computes: self.computes.load(Ordering::Relaxed),
            in_flight: flights.len(),
        }
    }

    /// Clear all cached entries.
    pub async fn invalidate_all(&self) {
        let Ok(mut state) = self.state.lock().map_err(|e| e.into_inner()) else {
            return;
        };
        state.entries.clear();
        state.order.clear();
        state.total_bytes = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::{
        CacheConfig, CacheReservation, CachedResponse, ResponseCache, WorkingCorrelationCache,
    };
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn working_correlation_cache_bounds_results_and_keeps_recent_modes() {
        let mut cache = WorkingCorrelationCache::new(1024);
        let first = cache.entry("source".into(), "plan-0".into(), "pearson_raw", 1);
        let oldest = cache.entry("source".into(), "plan-1".into(), "pearson_raw", 1);
        for index in 2..WorkingCorrelationCache::MAX_ENTRIES {
            cache.entry("source".into(), format!("plan-{index}"), "pearson_raw", 1);
        }
        assert!(Arc::ptr_eq(
            &first,
            &cache.entry("source".into(), "plan-0".into(), "pearson_raw", 1)
        ));
        let spearman = cache.entry("source".into(), "plan-0".into(), "spearman_raw", 1);
        assert!(!Arc::ptr_eq(&first, &spearman));
        assert_eq!(cache.entries.len(), WorkingCorrelationCache::MAX_ENTRIES);
        assert!(Arc::ptr_eq(
            &first,
            &cache.entry("source".into(), "plan-0".into(), "pearson_raw", 1)
        ));
        assert!(!Arc::ptr_eq(
            &oldest,
            &cache.entry("source".into(), "plan-1".into(), "pearson_raw", 1)
        ));
        assert!(!Arc::ptr_eq(
            &first,
            &cache.entry("another-source".into(), "plan-0".into(), "pearson_raw", 1)
        ));
        assert_eq!(cache.entries.len(), WorkingCorrelationCache::MAX_ENTRIES);
    }

    #[test]
    fn working_correlation_cache_evicts_by_reserved_bytes_and_skips_oversized_entries() {
        let mut cache = WorkingCorrelationCache::new(10);
        let first = cache.entry("source".into(), "plan-1".into(), "pearson_raw", 6);
        let _second = cache.entry("source".into(), "plan-2".into(), "pearson_raw", 6);

        assert_eq!(cache.total_bytes, 6);
        assert_eq!(cache.entries.len(), 1);
        let reinserted = cache.entry("source".into(), "plan-1".into(), "pearson_raw", 6);
        assert!(!Arc::ptr_eq(&first, &reinserted));
        assert_eq!(cache.total_bytes, 6);
        assert_eq!(cache.entries.len(), 1);

        let entry_count = cache.entries.len();
        let oversized = cache.entry("source".into(), "plan-3".into(), "pearson_raw", 11);
        assert_eq!(cache.entries.len(), entry_count);
        assert_eq!(cache.total_bytes, 6);
        assert!(Arc::ptr_eq(
            &reinserted,
            &cache.entry("source".into(), "plan-1".into(), "pearson_raw", 6)
        ));
        assert!(!Arc::ptr_eq(&reinserted, &oversized));
    }

    #[test]
    fn working_correlation_cache_reconciles_actual_result_bytes() {
        let mut cache = WorkingCorrelationCache::new(10);
        let first = cache.entry("source".into(), "plan-1".into(), "pearson_raw", 2);
        let second = cache.entry("source".into(), "plan-2".into(), "pearson_raw", 2);
        cache.record_result_size(&second, 9);
        assert_eq!(cache.total_bytes, 9);
        assert_eq!(cache.entries.len(), 1);
        assert!(Arc::ptr_eq(&cache.entries[0].slot, &second));
        // Completion of an evicted producer cannot evict/resize its successor.
        cache.record_result_size(&first, 10);
        assert_eq!(cache.total_bytes, 9);
        cache.record_result_size(&second, 11);
        assert_eq!(cache.total_bytes, 0);
        assert!(cache.entries.is_empty());
    }

    #[test]
    fn working_correlation_cache_ignores_result_from_replaced_slot() {
        let mut cache = WorkingCorrelationCache::new(10);
        let previous = cache.entry("source".into(), "plan".into(), "pearson_raw", 6);
        cache.entry("source".into(), "another".into(), "pearson_raw", 6);
        let current = cache.entry("source".into(), "plan".into(), "pearson_raw", 6);
        cache.record_result_size(&previous, 1);
        assert_eq!(cache.total_bytes, 6);
        assert!(Arc::ptr_eq(&cache.entries[0].slot, &current));
    }

    fn test_cache() -> Arc<ResponseCache> {
        Arc::new(ResponseCache::new(CacheConfig {
            ttl: Duration::from_secs(60),
            max_entries: 8,
            max_bytes: 1024 * 1024,
        }))
    }

    #[tokio::test]
    async fn cold_burst_elects_exactly_one_producer() {
        let cache = test_cache();
        let producer = match cache.reserve("same-key").await {
            CacheReservation::Producer(producer) => producer,
            CacheReservation::Hit { .. } => panic!("cold cache unexpectedly hit"),
        };
        let mut waiters = Vec::new();
        for _ in 0..31 {
            let cache = Arc::clone(&cache);
            waiters.push(tokio::spawn(async move { cache.reserve("same-key").await }));
        }
        for _ in 0..100 {
            if cache.snapshot().coalesced_waiters == 31 {
                break;
            }
            tokio::task::yield_now().await;
        }
        assert_eq!(cache.snapshot().coalesced_waiters, 31);

        cache
            .insert(
                "same-key".to_string(),
                CachedResponse::json(vec![1, 2, 3], false, 1, 1, None),
            )
            .await;
        drop(producer);

        for waiter in waiters {
            match waiter.await.expect("waiter join") {
                CacheReservation::Hit {
                    response,
                    coalesced,
                } => {
                    assert!(coalesced);
                    assert_eq!(response.body.as_ref().as_ref(), &[1, 2, 3]);
                }
                CacheReservation::Producer(_) => panic!("waiter duplicated successful work"),
            }
        }
        let snapshot = cache.snapshot();
        assert_eq!(snapshot.computes, 1);
        assert_eq!(snapshot.in_flight, 0);
    }

    #[tokio::test]
    async fn cancelled_producer_allows_one_waiter_to_retry() {
        let cache = test_cache();
        let producer = match cache.reserve("retry-key").await {
            CacheReservation::Producer(producer) => producer,
            CacheReservation::Hit { .. } => panic!("cold cache unexpectedly hit"),
        };
        let waiter_cache = Arc::clone(&cache);
        let waiter = tokio::spawn(async move { waiter_cache.reserve("retry-key").await });
        for _ in 0..100 {
            if cache.snapshot().coalesced_waiters == 1 {
                break;
            }
            tokio::task::yield_now().await;
        }
        drop(producer);
        let retry = waiter.await.expect("waiter join");
        assert!(matches!(retry, CacheReservation::Producer(_)));
        assert_eq!(cache.snapshot().computes, 2);
    }
}
