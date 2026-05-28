# crates/edatime-core/src/expr.rs
> Expression builder helpers — composable, reusable Polars expressions for pipeline stages and query builders.

## Functions

### Time predicates
- `time_predicate(ts_col: &str, start: i64, end: i64) -> Expr`
  - Build a time predicate: ts_col in [start, end] (inclusive).
- `time_predicate_opt(ts_col: &str, start: Option<i64>, end: Option<i64>) -> Option<Expr>`
  - Build a time predicate from optional bounds — None means unbounded.

### Numeric range predicates
- `range_predicate(col_name: &str, min: f64, max: f64) -> Expr`
  - Build a numeric range filter: col in [min, max] (inclusive).
- `range_predicate_opt(col_name: &str, min: Option<f64>, max: Option<f64>) -> Option<Expr>`
  - Build a numeric range predicate from Option bounds.

### Categorical predicates
- `in_predicate(col_name: &str, values: &[String]) -> Expr`
  - Build an IN-predicate for categorical columns.
- `not_null_predicate(col_name: &str) -> Expr`
  - Build an is-not-null predicate.

### Combinators
- `and_all(exprs: Vec<Option<Expr>>) -> Option<Expr>`
  - Combine multiple optional predicates with AND.