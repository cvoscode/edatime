//! edatime — workspace root facade.
//!
//! All implementation lives in workspace crates:
//! - edatime-core: core types, pipeline, cache, error
//! - edatime-store: data repository, state management
//! - edatime-query: query executor, filters, pipeline
//! - edatime-service: HTTP handlers, routing, middleware
//! - edatime-ingest: data ingestion
//!
//! This root crate re-exports the owning workspace crates so the historical
//! `edatime::*` paths keep resolving for tests and downstream consumers.

// analytics — analytics service implementations
pub use edatime_service::analytics;

// cache — request cache + cached response types
pub use edatime_store::cache;

// config — runtime configuration
pub use edatime_core::config;

// error — application errors
pub use edatime_core::error;

// filters — range and line filter parsing/evaluation
pub use edatime_query::filters;

// metrics — runtime metrics
pub use edatime_service::metrics;

// pipeline — query pipeline reductions and time filtering
pub use edatime_query::pipeline;

// repository — in-memory data repository
pub use edatime_store::repository;

// stats — column statistics, histograms, drift tests
pub use edatime_core::stats;

// temporal — timestamp conversion helpers
pub use edatime_core::temporal;

// validation — request validation helpers
pub use edatime_query::validation;
