# crates/edatime-query/src/aggregations.rs
> Aggregation function composers (Mean, Sum, Min, Max, Count).

## Enum: AggFn
- `AggFn::Mean`
- `AggFn::Sum`
- `AggFn::Min`
- `AggFn::Max`
- `AggFn::Count`

## Methods
- `pub fn to_expr(&self, col_name: &str) -> Expr`
  - Converts AggFn to Polars expression.
- `pub fn as_str(&self) -> &'static str`
  - Returns string name of aggregation function.