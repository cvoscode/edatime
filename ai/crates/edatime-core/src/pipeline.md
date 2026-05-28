# crates/edatime-core/src/pipeline.rs
> Composable pipeline IR for lazy DataFrame transformations. Each stage is a function LazyFrame → LazyFrame.

## Trait

### `PipelineStage` [deps: [types][1]]
- `apply(&self, lf: LazyFrame) -> LazyFrame`
- `name(&self) -> &'static str`

## Structs

### `TimeFilterStage`
- `start_ts: i64`
- `end_ts: i64`
- `ts_col: String`
- `new(ts_col: String, start_ts: i64, end_ts: i64) -> Self`
- `optional(ts_col: String, start: Option<i64>, end: Option<i64>) -> Option<Self>`

### `ProjectStage`
- `columns: Vec<String>`

### `SortStage`
- `by_column: String`
- `descending: bool`

## Composed Pipeline

### `Pipeline`
- `new() -> Self`
- `then(self, stage: impl PipelineStage + 'static) -> Self` [deps: [types][1]]
- `apply(&self, lf: LazyFrame) -> LazyFrame`
- `len(&self) -> usize`
- `is_empty(&self) -> bool`
- `explain(&self, lf: LazyFrame) -> Result<String, AppError>` [deps: [error][2]]
- `execute(self, lf: LazyFrame) -> Result<DataFrame, AppError>` [deps: [error][2]]

---
[1]: types.md
[2]: error.md