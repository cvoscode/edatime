//! Full metrics implementation — shared across all crates.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;

#[derive(Debug, Default, Serialize)]
pub struct ScatterSamplingSnapshot {
    pub requests: u64,
    pub total_points_seen: u64,
    pub total_points_returned: u64,
}

#[derive(Debug, Serialize)]
pub struct MetricsSnapshot {
    pub uptime_seconds: u64,
    pub total_requests: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub rate_limited_requests: u64,
    pub scatter_sampling: ScatterSamplingSnapshot,
    pub request_counts: HashMap<String, u64>,
    pub average_request_ms: f64,
    pub dataset_rows: usize,
    pub dataset_revision: u64,
}

/// Full metrics shared by AppState (store) and middleware (service).
#[derive(Debug)]
pub struct AppMetrics {
    started_at: Instant,
    total_requests: AtomicU64,
    total_request_duration_ns: AtomicU64,
    cache_hits: AtomicU64,
    cache_misses: AtomicU64,
    rate_limited_requests: AtomicU64,
    scatter_requests: AtomicU64,
    scatter_points_seen: AtomicU64,
    scatter_points_returned: AtomicU64,
    request_counts: Mutex<HashMap<String, u64>>,
}

impl Default for AppMetrics {
    fn default() -> Self {
        Self::new()
    }
}

impl AppMetrics {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
            total_requests: AtomicU64::new(0),
            total_request_duration_ns: AtomicU64::new(0),
            cache_hits: AtomicU64::new(0),
            cache_misses: AtomicU64::new(0),
            rate_limited_requests: AtomicU64::new(0),
            scatter_requests: AtomicU64::new(0),
            scatter_points_seen: AtomicU64::new(0),
            scatter_points_returned: AtomicU64::new(0),
            request_counts: Mutex::new(HashMap::new()),
        }
    }

    pub fn record_request(&self, method: &str, path: &str, status: u16, duration_ns: u64) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.total_request_duration_ns
            .fetch_add(duration_ns, Ordering::Relaxed);
        let key = format!("{} {} {}", method, path, status);
        if let Ok(mut counts) = self.request_counts.lock() {
            *counts.entry(key).or_insert(0) += 1;
        }
    }

    pub fn record_cache_hit(&self) {
        self.cache_hits.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_cache_miss(&self) {
        self.cache_misses.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_rate_limited(&self) {
        self.rate_limited_requests.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_scatter_sampling(&self, total_points: usize, returned_points: usize) {
        self.scatter_requests.fetch_add(1, Ordering::Relaxed);
        self.scatter_points_seen
            .fetch_add(total_points as u64, Ordering::Relaxed);
        self.scatter_points_returned
            .fetch_add(returned_points as u64, Ordering::Relaxed);
    }

    pub fn record_requests(&self, count: u64) {
        self.total_requests.fetch_add(count, Ordering::Relaxed);
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }

    /// Returns a full snapshot for JSON serialization.
    pub fn snapshot(&self, dataset_rows: usize, dataset_revision: u64) -> MetricsSnapshot {
        let total = self.total_requests.load(Ordering::Relaxed);
        let total_ns = self.total_request_duration_ns.load(Ordering::Relaxed);
        let avg_ms = if total > 0 {
            (total_ns as f64 / total as f64) / 1_000_000.0
        } else {
            0.0
        };
        let request_counts = self
            .request_counts
            .lock()
            .map(|c| c.clone())
            .unwrap_or_default();

        MetricsSnapshot {
            uptime_seconds: self.started_at.elapsed().as_secs(),
            total_requests: total,
            cache_hits: self.cache_hits.load(Ordering::Relaxed),
            cache_misses: self.cache_misses.load(Ordering::Relaxed),
            rate_limited_requests: self.rate_limited_requests.load(Ordering::Relaxed),
            scatter_sampling: ScatterSamplingSnapshot {
                requests: self.scatter_requests.load(Ordering::Relaxed),
                total_points_seen: self.scatter_points_seen.load(Ordering::Relaxed),
                total_points_returned: self.scatter_points_returned.load(Ordering::Relaxed),
            },
            request_counts,
            average_request_ms: avg_ms,
            dataset_rows,
            dataset_revision,
        }
    }
}