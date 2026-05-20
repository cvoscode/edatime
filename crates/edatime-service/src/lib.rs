//! edatime-service — Axum HTTP service layer.
//! Depends on query, store, ingest; handles routing, middleware, handlers.

pub mod router;
pub mod state;
pub mod middleware;
pub mod handlers;
pub mod dto;
