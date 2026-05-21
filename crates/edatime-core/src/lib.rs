// edatime-core - pure data types, traits, and pipeline IR.
// Zero external I/O dependencies.  All Polars types re-exported for convenience.

pub mod cache;
pub mod config;
pub mod error;
pub mod expr;
pub mod http;
pub mod metrics;
pub mod pipeline;
pub mod stats;
pub mod temporal;
pub mod types;

pub use cache::ResponseCache;
pub use error::AppError;
pub use expr::{range_predicate, time_predicate};
pub use http::ResponseMeta;
pub use http::edatime_headers as add_edatime_headers;
pub use metrics::AppMetrics;
pub use pipeline::{Pipeline, PipelineStage, ProjectStage, SortStage, TimeFilterStage};
pub use polars::prelude::{col, lit};
pub use types::{DataFrame, DataType, DatasetMeta, Expr, LazyFrame, Revision, TimeContext};

// Re-export polars prelude for downstream convenience
pub use polars::prelude::IntoLazy;
pub use polars::prelude::Schema as PolarsSchema;
pub use polars::prelude::SchemaRef as PolarsSchemaRef;
