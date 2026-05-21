//! edatime-query — LazyFrame query engine with composable transformations.
//! Zero external I/O; all execution via spawn_blocking to Rayon pool.

pub mod aggregations;
pub mod arrow_export;
pub mod downsample;
pub mod executor;
pub mod filters;
pub mod pipeline;
pub mod predicates;
pub mod query;
pub mod transforms;
pub mod validation;
