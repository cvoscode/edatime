use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::http::{HeaderValue, Response, StatusCode, header};

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
    pub status: StatusCode,
    pub content_type: &'static str,
    pub body: Vec<u8>,
    pub is_downsampled: bool,
    pub returned_rows: usize,
    pub target_points: usize,
}

impl CachedResponse {
    pub fn json(
        body: Vec<u8>,
        is_downsampled: bool,
        returned_rows: usize,
        target_points: usize,
    ) -> Self {
        Self {
            status: StatusCode::OK,
            content_type: "application/json",
            body,
            is_downsampled,
            returned_rows,
            target_points,
        }
    }

    pub fn arrow(
        body: Vec<u8>,
        is_downsampled: bool,
        returned_rows: usize,
        target_points: usize,
    ) -> Self {
        Self {
            status: StatusCode::OK,
            content_type: "application/vnd.apache.arrow.stream",
            body,
            is_downsampled,
            returned_rows,
            target_points,
        }
    }

    pub fn body_len(&self) -> usize {
        self.body.len()
    }

    pub fn into_response(self, cache_status: &'static str) -> Response<Body> {
        let mut response = Response::new(Body::from(self.body));
        *response.status_mut() = self.status;
        let headers = response.headers_mut();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static(self.content_type),
        );
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=60"),
        );
        headers.insert(
            "x-edatime-downsampled",
            if self.is_downsampled {
                HeaderValue::from_static("1")
            } else {
                HeaderValue::from_static("0")
            },
        );
        if let Ok(value) = HeaderValue::from_str(&self.returned_rows.to_string()) {
            headers.insert("x-edatime-returned-rows", value);
        }
        if let Ok(value) = HeaderValue::from_str(&self.target_points.to_string()) {
            headers.insert("x-edatime-target-points", value);
        }
        headers.insert("x-edatime-cache", HeaderValue::from_static(cache_status));
        response
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
pub struct ResponseCache {
    config: CacheConfig,
    state: tokio::sync::Mutex<CacheState>,
}

impl ResponseCache {
    pub fn new(config: CacheConfig) -> Self {
        Self {
            config,
            state: tokio::sync::Mutex::new(CacheState::default()),
        }
    }

    pub async fn get(&self, key: &str) -> Option<CachedResponse> {
        let mut state = self.state.lock().await;
        self.maybe_prune(&mut state);
        state.entries.get(key).map(|entry| entry.response.clone())
    }

    pub async fn insert(&self, key: String, response: CachedResponse) {
        let mut state = self.state.lock().await;
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
            }
        }
    }

    /// Only run the O(n) TTL sweep when at least half the TTL has elapsed
    /// since the last prune, avoiding needless work on every cache access.
    fn maybe_prune(&self, state: &mut CacheState) {
        let now = Instant::now();
        let half_ttl = self.config.ttl / 2;
        if now.duration_since(state.last_pruned) >= half_ttl {
            Self::prune_expired(state, self.config.ttl);
            state.last_pruned = now;
        }
    }

    fn prune_expired(state: &mut CacheState, ttl: Duration) {
        let now = Instant::now();
        state.order.retain(|key| {
            let keep = state
                .entries
                .get(key)
                .map(|entry| now.duration_since(entry.inserted_at) < ttl)
                .unwrap_or(false);
            if !keep
                && let Some(entry) = state.entries.remove(key) {
                    state.total_bytes = state.total_bytes.saturating_sub(entry.response.body_len());
                }
            keep
        });
    }

    /// Clear all cached entries.
    pub async fn invalidate_all(&self) {
        let mut state = self.state.lock().await;
        state.entries.clear();
        state.order.clear();
        state.total_bytes = 0;
    }
}
