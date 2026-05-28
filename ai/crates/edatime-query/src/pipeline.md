# crates/edatime-query/src/pipeline.rs
> Composable data pipeline: filter → reduce → serialize. Each chart-type endpoint can assemble its own pipeline from these building blocks.

## Functions

### Filtering
- `filter_time_range(lf: LazyFrame, start_ts: i64, end_ts: i64, select_cols: &[String], ts_col: &str) -> Result<LazyFrame, AppError>` [deps: [../../edatime-core/src/error][1]]

### Reduction
- `apply_reduction(df: &DataFrame, value_cols: &[String], extra_cols: &[String], strategy: &Reduction, ts_col: &str) -> Result<(DataFrame, bool), AppError>`

## Enum

### `Reduction`
- `Lttb { target_points: usize }` — LTTB downsampling for line charts
- `BucketAgg { buckets: usize, agg: AggFn }` — Bucket-aggregation for bar/heatmap
- `WindowAgg { window_size_native: i64, step_size_native: i64, agg: AggFn }` — Window aggregation
- `None` — Pass data through

### Serialization
- `serialize_arrow(df: DataFrame, ts_col: &str) -> Result<Vec<u8>, AppError>`
- `serialize_json(df: &DataFrame, value_cols: &[String], color_col: Option<&String>, ts_dtype: &DataType, ts_col: &str) -> Result<serde_json::Value, AppError>`

---
[1]: ../../edatime-core/src/error.md