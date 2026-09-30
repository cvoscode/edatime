# crates/edatime-core/src/types.rs
> Core domain types. Re-exports Polars types for downstream convenience.

## Structs

### `DatasetMeta`
- `row_count: usize`
- `column_names: Vec<String>`
- `time_column: Option<String>`

### `TimeContext`
- `ts_col: String`
- `multiplier: i64`
- `dtype: DataType`
- `from_schema(lf: &LazyFrame, time_column: Option<&str>) -> Result<Self, AppError>` [deps: [error][1]]

### `Revision(u64)`
- `new() -> Self`
- `get() -> u64`
- `bump(&mut self) -> u64`

---
[1]: error.md