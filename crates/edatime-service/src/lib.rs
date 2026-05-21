//! edatime-service — Axum HTTP service layer.

pub mod handlers;
pub mod middleware;
pub mod rates;
pub mod metrics;
pub mod error;
pub mod analytics;
pub mod causal;
pub mod dto;
pub mod router;
pub mod state;

// Re-export router as routes for backwards compatibility with consumers
// that expect `edatime_service::routes::api_router`
pub use crate::router as routes;