use std::collections::HashMap;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RateLimitResult {
    pub allowed: bool,
    pub retry_after_seconds: Option<u64>,
    pub remaining_requests: usize,
}

#[derive(Debug, Clone, Copy)]
struct ClientWindow {
    started_at: Instant,
    requests: usize,
}

#[derive(Debug)]
struct LimiterState {
    clients: HashMap<String, ClientWindow>,
    last_pruned: Instant,
}

#[derive(Debug)]
pub struct RateLimiter {
    max_requests: usize,
    max_clients: usize,
    window: Duration,
    // Async mutex — no blocking of the Tokio executor thread. Expiry is
    // periodic rather than an O(client_count) sweep on every request.
    state: Mutex<LimiterState>,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window_seconds: u64, max_clients: usize) -> Self {
        Self {
            max_requests,
            max_clients: max_clients.max(1),
            window: Duration::from_secs(window_seconds.max(1)),
            state: Mutex::new(LimiterState {
                clients: HashMap::new(),
                last_pruned: Instant::now(),
            }),
        }
    }

    pub async fn check(&self, client_ip: &str) -> RateLimitResult {
        let now = Instant::now();
        let mut state = self.state.lock().await;
        // tokio::sync::Mutex does not expose poisoning — the guard is always
        // returned even after a panic, providing access to the underlying data.
        // (The std::sync::Mutex approach of checking Err(poisoned) does not apply here.)
        let prune_interval = self.window.min(Duration::from_secs(1));
        if now.duration_since(state.last_pruned) >= prune_interval {
            state
                .clients
                .retain(|_, window| now.duration_since(window.started_at) < self.window);
            state.last_pruned = now;
        }

        if !state.clients.contains_key(client_ip) && state.clients.len() >= self.max_clients {
            return RateLimitResult {
                allowed: false,
                retry_after_seconds: Some(self.window.as_secs().max(1)),
                remaining_requests: 0,
            };
        }

        let entry = state
            .clients
            .entry(client_ip.to_string())
            .or_insert(ClientWindow {
                started_at: now,
                requests: 0,
            });

        if now.duration_since(entry.started_at) >= self.window {
            entry.started_at = now;
            entry.requests = 0;
        }

        if entry.requests >= self.max_requests {
            let retry_after = self
                .window
                .saturating_sub(now.duration_since(entry.started_at))
                .as_secs()
                .max(1);
            return RateLimitResult {
                allowed: false,
                retry_after_seconds: Some(retry_after),
                remaining_requests: 0,
            };
        }

        entry.requests += 1;
        RateLimitResult {
            allowed: true,
            retry_after_seconds: None,
            remaining_requests: self.max_requests.saturating_sub(entry.requests),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn blocks_after_limit_is_reached() {
        let limiter = RateLimiter::new(2, 60, 100);
        assert!(limiter.check("127.0.0.1").await.allowed);
        assert!(limiter.check("127.0.0.1").await.allowed);
        let third = limiter.check("127.0.0.1").await;
        assert!(!third.allowed);
        assert_eq!(third.remaining_requests, 0);
    }

    #[tokio::test]
    async fn caps_distinct_client_state() {
        let limiter = RateLimiter::new(10, 60, 2);
        assert!(limiter.check("client-a").await.allowed);
        assert!(limiter.check("client-b").await.allowed);
        assert!(!limiter.check("client-c").await.allowed);
        assert!(limiter.check("client-a").await.allowed);
    }
}
