use std::collections::HashMap;
use std::time::{Duration, Instant};

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
pub struct RateLimiter {
    max_requests: usize,
    window: Duration,
    clients: std::sync::Mutex<HashMap<String, ClientWindow>>,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window_seconds: u64) -> Self {
        Self {
            max_requests,
            window: Duration::from_secs(window_seconds.max(1)),
            clients: std::sync::Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, client_ip: &str) -> RateLimitResult {
        let now = Instant::now();
        let mut clients = self.clients.lock().expect("rate limiter mutex poisoned");
        clients.retain(|_, window| now.duration_since(window.started_at) < self.window);

        let entry = clients
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

    #[test]
    fn blocks_after_limit_is_reached() {
        let limiter = RateLimiter::new(2, 60);
        assert!(limiter.check("127.0.0.1").allowed);
        assert!(limiter.check("127.0.0.1").allowed);
        let third = limiter.check("127.0.0.1");
        assert!(!third.allowed);
        assert_eq!(third.remaining_requests, 0);
    }
}
