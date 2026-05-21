//! edatime — workspace root re-export for backwards compatibility.
//!
//! All implementation has moved to workspace crates:
//! - edatime-core: core types, pipeline, cache, error
//! - edatime-store: data repository, state management
//! - edatime-query: query executor, filters, pipeline
//! - edatime-service: HTTP handlers, routing, middleware
//! - edatime-ingest: data ingestion
//!
//! This root crate is kept minimal so that `edatime::*` references
//! from older code or tests continue to resolve during the transition.
