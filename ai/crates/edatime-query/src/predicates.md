# crates/edatime-query/src/predicates.rs
> Composable predicate builders for LazyFrame filters.

## Struct: PredicateBuilder
- `pub fn new() -> Self`
- `pub fn time_range(mut self, col_name: &str, start: i64, end: i64) -> Self`
- `pub fn numeric_range(mut self, col_name: &str, min: f64, max: f64) -> Self`
- `pub fn is_null(mut self, col_name: &str) -> Self`
- `pub fn build(self) -> Option<Expr>`
- `pub fn apply_to(self, lf: LazyFrame) -> Result<LazyFrame, AppError>`