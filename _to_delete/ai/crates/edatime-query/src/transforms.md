# crates/edatime-query/src/transforms.rs
> Composable LazyFrame transformation stages (LTTB, BucketAgg).

## Struct: LttbStage
- `pub fn new(ts_col: String, value_cols: Vec<String>, target_points: usize) -> Self`

## Struct: BucketAggStage
- `pub fn new(ts_col: String, value_cols: Vec<String>, buckets: usize, agg_fn: &str) -> Self`
- `fn value_col(&self) -> &str`