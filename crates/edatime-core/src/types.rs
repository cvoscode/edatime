//! Core domain types for edatime-core.
//!
//! Re-exports commonly used Polars types so downstream crates can avoid
//! spelling out the full `polars::prelude::` path every time.

pub use polars::prelude::{DataFrame, LazyFrame, IntoLazy};
pub use polars::prelude::{DataType, TimeUnit, Expr, col, lit};
pub use polars::prelude::Schema as PolarsSchema;
pub use polars::prelude::SchemaRef as PolarsSchemaRef;

/// Dataset metadata — column names, row count, and optional time column.
#[derive(Debug, Clone, Default)]
pub struct DatasetMeta {
    pub row_count: usize,
    pub column_names: Vec<String>,
    pub time_column: Option<String>,
}

/// Time context — carries timestamp multiplier, column name, and Polars dtype.
/// Extracted from state.rs ts_context().
#[derive(Debug, Clone)]
pub struct TimeContext {
    pub ts_col: String,
    pub multiplier: i64,
    pub dtype: DataType,
}

impl TimeContext {
    /// Derive TimeContext from a LazyFrame and an optional time-column name.
    pub fn from_schema(lf: &LazyFrame, time_column: Option<&str>) -> Result<Self, crate::error::AppError> {
        let ts_col_name = time_column.unwrap_or("ts").to_string();
        let dtype = Self::ts_dtype_lazy(lf, &ts_col_name)?;
        let multiplier = Self::unit_multiplier(&dtype);
        Ok(Self {
            ts_col: ts_col_name,
            multiplier,
            dtype,
        })
    }

    fn ts_dtype_lazy(lf: &LazyFrame, ts_col: &str) -> Result<DataType, crate::error::AppError> {
        let schema = lf.clone().collect_schema()
            .map_err(|e| crate::error::AppError::Internal(format!("LazyFrame schema unavailable: {}", e)))?;
        schema.get(ts_col)
            .cloned()
            .ok_or_else(|| crate::error::AppError::NotFound(format!("Missing time column '{}'", ts_col)))
    }

    fn unit_multiplier(dtype: &DataType) -> i64 {
        match dtype {
            DataType::Datetime(TimeUnit::Nanoseconds, _) => 1_000_000,
            DataType::Datetime(TimeUnit::Microseconds, _) => 1_000,
            DataType::Datetime(TimeUnit::Milliseconds, _) => 1,
            DataType::Date => 1,
            _ => 1,
        }
    }
}

/// Revision counter for cache invalidation and dataset versioning.
#[derive(Debug, Clone, Copy, Default)]
pub struct Revision(u64);

impl Revision {
    pub fn new() -> Self {
        Self(0)
    }

    pub fn get(&self) -> u64 {
        self.0
    }

    pub fn bump(&mut self) -> u64 {
        let prev = self.0;
        self.0 = self.0.wrapping_add(1);
        prev
    }
}
