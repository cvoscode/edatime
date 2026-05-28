# crates/edatime-core/src/temporal.rs
> Shared temporal-unit conversion utilities. Every place that needs to convert between epoch-ms and native Polars timestamp should go through these helpers.

## Struct

### `TsContext`
- `ts_col: String`
- `multiplier: i64`
- `dtype: DataType`

## Functions

### Context & dtype
- `ts_context(lf: &LazyFrame, ts_col: &str) -> Result<TsContext, AppError>` [deps: [error][1]]
- `ts_dtype(df: &DataFrame, ts_col: &str) -> Result<DataType, AppError>`
- `ts_dtype_lazy(lf: &LazyFrame, ts_col: &str) -> Result<DataType, AppError>`
- `unit_multiplier(dtype: &DataType) -> i64`
  - How many native ticks fit in one millisecond. E.g. Nanoseconds → 1_000_000.
- `unit_multiplier_for_ts(df: &DataFrame, ts_col: &str) -> Result<i64, AppError>`
- `unit_multiplier_for_ts_lazy(lf: &LazyFrame, ts_col: &str) -> Result<i64, AppError>`

### Conversion
- `native_to_epoch_ms(value: i64, dtype: &DataType) -> f64`
  - Convert native Polars timestamp to epoch-milliseconds.
- `epoch_ms_to_native(value_ms: f64, dtype: &DataType, round_up: bool) -> Result<i64, AppError>`
  - Convert epoch-milliseconds to native Polars representation.

### Detection
- `detect_time_unit(max_abs: i64) -> Option<DetectedTimeUnit>`
  - Detects epoch time unit from max absolute value of timestamp column.
- `ts_to_ms_factor(unit: DetectedTimeUnit) -> i64`
  - Returns factor to multiply native timestamp by to convert to milliseconds.

### `DetectedTimeUnit`
- `Seconds`, `Milliseconds`, `Microseconds`, `Nanoseconds`

---
[1]: error.md