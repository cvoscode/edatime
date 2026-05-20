//! Composable predicate builders for LazyFrame filters.

use edatime_core::error::AppError;
use edatime_core::types::{LazyFrame, DataType, Expr, col, lit};

pub struct PredicateBuilder {
    conditions: Vec<Expr>,
}

impl PredicateBuilder {
    pub fn new() -> Self {
        Self { conditions: Vec::new() }
    }

    pub fn time_range(mut self, col_name: &str, start: i64, end: i64) -> Self {
        self.conditions.push(
            col(col_name).cast(DataType::Int64).gt_eq(lit(start))
                .and(col(col_name).cast(DataType::Int64).lt_eq(lit(end))),
        );
        self
    }

    pub fn numeric_range(mut self, col_name: &str, min: f64, max: f64) -> Self {
        self.conditions.push(
            col(col_name).gt_eq(lit(min)).and(col(col_name).lt_eq(lit(max))),
        );
        self
    }

    pub fn is_null(mut self, col_name: &str) -> Self {
        self.conditions.push(col(col_name).is_null());
        self
    }

    pub fn build(self) -> Option<Expr> {
        if self.conditions.is_empty() {
            None
        } else {
            Some(self.conditions.into_iter().reduce(|a, b| a.and(b)).unwrap())
        }
    }

    pub fn apply_to(self, lf: LazyFrame) -> Result<LazyFrame, AppError> {
        match self.build() {
            Some(expr) => Ok(lf.filter(expr)),
            None => Ok(lf),
        }
    }
}

impl Default for PredicateBuilder {
    fn default() -> Self { Self::new() }
}
