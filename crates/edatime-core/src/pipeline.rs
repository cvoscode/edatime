//! Composable pipeline IR for lazy DataFrame transformations.
//!
//! Each stage is a function `LazyFrame → LazyFrame` (no collection).
//! The [`Pipeline`] struct holds an ordered list of stages and applies
//! them sequentially so the Polars query optimizer can push operations
//! down to the scan level.

use crate::{
    error::AppError,
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
}

impl TimeFilterStage {
    /// Construct from explicit bounds.
    pub fn new(ts_col: String, start_ts: i64, end_ts: i64) -> Self {
        Self {
            ts_col,
            start_ts,
            end_ts,
        }
    }
    /// Construct from optional bounds — returns None when both are None.
    pub fn optional(ts_col: String, start: Option<i64>, end: Option<i64>) -> Option<Self> {
        match (start, end) {
            (None, None) => None,
            (s, e) => Some(Self {
                ts_col,
                start_ts: s.unwrap_or(i64::MIN),
                end_ts: e.unwrap_or(i64::MAX),
            }),
        }
    }
}

impl PipelineStage for TimeFilterStage {
    fn apply(&self, lf: LazyFrame) -> LazyFrame {
        lf.filter(
            col(&self.ts_col)
                .cast(DataType::Int64)
                .gt_eq(lit(self.start_ts))
                .and(
                    col(&self.ts_col)
                        .cast(DataType::Int64)
                        .lt_eq(lit(self.end_ts)),
                ),
        )
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
    #[allow(dead_code)]
    pub fn explain(&self, lf: LazyFrame) -> Result<String, AppError> {
        self.apply(lf)
            .explain(false)
            .map_err(|e| AppError::Query(e.to_string()))
    }

    /// Execute the pipeline.
    pub fn execute(self, lf: LazyFrame) -> Result<DataFrame, AppError> {
        self.apply(lf)
            .collect()
            .map_err(|e| AppError::Query(e.to_string()))
    }
}
