//! Expression builder helpers — composable, reusable Polars expressions.
//! These are the building blocks for pipeline stages and query builders.

use polars::prelude::*;

// ── Time predicates ──────────────────────────────────────────────────────────

/// Build a time predicate: ts_col in [start, end] (inclusive).
/// Handles cast to Int64 for datetime columns so predicate pushdown works
/// correctly regardless of the underlying datetime unit.
pub fn time_predicate(ts_col: &str, start: i64, end: i64) -> Expr {
    col(ts_col)
        .cast(DataType::Int64)
        .gt_eq(lit(start))
        .and(col(ts_col).cast(DataType::Int64).lt_eq(lit(end)))
}

/// Build a time predicate from Option bounds — None means unbounded.
pub fn time_predicate_opt(ts_col: &str, start: Option<i64>, end: Option<i64>) -> Option<Expr> {
    match (start, end) {
        (None, None) => None,
        (Some(s), Some(e)) => Some(time_predicate(ts_col, s, e)),
        (Some(s), None) => Some(col(ts_col).cast(DataType::Int64).gt_eq(lit(s))),
        (None, Some(e)) => Some(col(ts_col).cast(DataType::Int64).lt_eq(lit(e))),
    }
}

// ── Numeric range predicates ──────────────────────────────────────────────────

/// Build a numeric range filter: col in [min, max] (inclusive).
pub fn range_predicate(col_name: &str, min: f64, max: f64) -> Expr {
    col(col_name)
        .gt_eq(lit(min))
        .and(col(col_name).lt_eq(lit(max)))
}

/// Build a numeric range predicate from Option bounds.
pub fn range_predicate_opt(col_name: &str, min: Option<f64>, max: Option<f64>) -> Option<Expr> {
    match (min, max) {
        (None, None) => None,
        (Some(m), Some(n)) => Some(range_predicate(col_name, m, n)),
        (Some(m), None) => Some(col(col_name).gt_eq(lit(m))),
        (None, Some(n)) => Some(col(col_name).lt_eq(lit(n))),
    }
}

// ── Categorical predicates ───────────────────────────────────────────────────

/// Build an IN-predicate for categorical columns.
#[allow(dead_code)]
pub fn in_predicate(col_name: &str, values: &[String]) -> Expr {

    let sc: StringChunked = values.iter().map(|s| s.as_str()).collect();
    let s: Series = sc.into_series();
    col(col_name).is_in(lit(s), false)
}

/// Build an is-not-null predicate.
#[allow(dead_code)]
pub fn not_null_predicate(col_name: &str) -> Expr {
    col(col_name).is_not_null()
}

// ── Predicate combinators ────────────────────────────────────────────────────

/// Combine multiple optional predicates with AND.
/// Only non-None predicates are included.
/// Returns None if the input vec is empty or all are None.
pub fn and_all(exprs: Vec<Option<Expr>>) -> Option<Expr> {
    let defined: Vec<Expr> = exprs.into_iter().flatten().collect();
    if defined.is_empty() {
        None
    } else {
        Some(defined.into_iter().reduce(|a, b| a.and(b)).unwrap())
    }
}
