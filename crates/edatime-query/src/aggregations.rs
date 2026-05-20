//! Aggregation function composers.

use edatime_core::types::{Expr, col};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AggFn {
    Mean,
    Sum,
    Min,
    Max,
    Count,
}

impl AggFn {
    pub fn to_expr(&self, col_name: &str) -> Expr {
        match self {
            AggFn::Mean => col(col_name).mean(),
            AggFn::Sum => col(col_name).sum(),
            AggFn::Min => col(col_name).min(),
            AggFn::Max => col(col_name).max(),
            AggFn::Count => col(col_name).count(),
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            AggFn::Mean => "mean",
            AggFn::Sum => "sum",
            AggFn::Min => "min",
            AggFn::Max => "max",
            AggFn::Count => "count",
        }
    }
}

impl From<&str> for AggFn {
    fn from(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "sum" => AggFn::Sum,
            "min" => AggFn::Min,
            "max" => AggFn::Max,
            "count" => AggFn::Count,
            _ => AggFn::Mean,
        }
    }
}
