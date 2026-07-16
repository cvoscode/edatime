//! edatime-service — Axum HTTP service layer.

pub mod analytics;
pub mod causal;
pub mod dto;
pub mod error;
pub mod handlers;
pub mod metrics;
pub mod middleware;
pub mod rates;
pub mod router;
pub mod state;
pub(crate) mod streaming_export;

// Re-export router as routes for backwards compatibility with consumers
// that expect `edatime_service::routes::api_router`
pub use crate::router as routes;
