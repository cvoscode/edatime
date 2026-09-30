//! edatime-query — LazyFrame query engine with composable transformations.
//! Zero external I/O; all execution goes through `QueryExecutor`.

pub mod aggregations;
pub mod arrow_export;
pub mod cleaning;
pub mod derived;
pub mod downsample;
pub mod executor;
pub mod filters;
pub mod pipeline;
pub mod query;
pub mod temporal;
pub mod transforms;
pub mod validation;
