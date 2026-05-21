//! Application state wrapper.
//!
//! Re-exports `AppState` from `edatime_store` so that handler modules and the
//! router can use a single, consistent type without direct knowledge of the
//! store internals.

pub use edatime_store::state::AppState;