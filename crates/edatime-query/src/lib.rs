//! edatime-query — LazyFrame query engine with composable transformations.
//! Zero external I/O; all execution via spawn_blocking to Rayon pool.

pub mod aggregations;
pub mod executor;
pub mod predicates;
pub mod query;
pub mod transforms;
