//! Composable pipeline IR for lazy DataFrame transformations.
//!
//! Each stage is a function `LazyFrame → LazyFrame` (no collection).
//! The [`Pipeline`] struct holds an ordered list of stages and applies
//! them sequentially so the Polars query optimizer can push operations
//! down to the scan level.

use crate::{
    error::DomainError,
    types::{DataType, LazyFrame},
};
use polars::prelude::*;

/// A single composable pipeline stage.
pub trait PipelineStage: Send + Sync {
    fn apply(&self, lf: LazyFrame) -> LazyFrame;
    fn name(&self) -> &'static str;
}

/// Time-range filter stage — pushes predicate to scan level.
pub struct TimeFilterStage {
    pub start_ts: i64,
    pub end_ts: i64,
    pub ts_col: String,
    pub ts_dtype: DataType,
}

impl TimeFilterStage {
    /// Construct from explicit bounds.
    pub fn new(ts_col: String, ts_dtype: DataType, start_ts: i64, end_ts: i64) -> Self {
        Self {
            ts_col,
            ts_dtype,
            start_ts,
            end_ts,
        }
    }
}

impl PipelineStage for TimeFilterStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        lf.filter(crate::temporal::native_time_range(
            &self.ts_col,
            &self.ts_dtype,
            self.start_ts,
            self.end_ts,
        ))
    }

    fn name(&self) -> &'static str {
        "time_filter"
    }
}

/// Column projection stage — enables projection pushdown.
pub struct ProjectStage {
    pub columns: Vec<String>,
}

impl PipelineStage for ProjectStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        let exprs: Vec<Expr> = self.columns.iter().map(col).collect();
        lf.select(exprs)
    }

    fn name(&self) -> &'static str {
        "project"
    }
}

// ── Sort ───────────────────────────────────────────────────────────────────────

/// Sort stage — orders rows by one or more columns.
pub struct SortStage {
    pub by_column: String,
    pub descending: bool,
}

impl PipelineStage for SortStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        lf.sort(
            [&self.by_column],
            SortMultipleOptions::default().with_order_descending(self.descending),
        )
    }
    fn name(&self) -> &'static str {
        "sort"
    }
}

// ── Composed Pipeline ──────────────────────────────────────────────────────────

/// Composed pipeline — ordered list of stages.
/// LazyFrame → [stage₀, stage₁, …] → LazyFrame
#[derive(Default)]
pub struct Pipeline {
    stages: Vec<Box<dyn PipelineStage>>,
}

impl Pipeline {
    pub fn new() -> Self {
        Self { stages: Vec::new() }
    }

    /// Append a stage to the pipeline.
    pub fn then(mut self, stage: impl PipelineStage + 'static) -> Self {
        self.stages.push(Box::new(stage));
        self
    }

    /// Apply all stages sequentially to the input LazyFrame.
    pub fn apply(&self, lf: LazyFrame) -> LazyFrame {
        let mut result = lf;
        for stage in &self.stages {
            result = stage.apply(result);
        }
        result
    }

    /// Number of stages in the pipeline.
    pub fn len(&self) -> usize {
        self.stages.len()
    }

    pub fn is_empty(&self) -> bool {
        self.stages.is_empty()
    }

    /// Explain the pipeline as a query plan string (for debugging).
    pub fn explain(&self, lf: LazyFrame) -> Result<String, DomainError> {
        self.apply(lf)
            .explain(false)
            .map_err(|e| DomainError::Query(e.to_string()))
    }

    /// Execute the pipeline.
    pub fn execute(self, lf: LazyFrame) -> Result<DataFrame, DomainError> {
        self.apply(lf)
            .collect()
            .map_err(|e| DomainError::Query(e.to_string()))
    }
}
