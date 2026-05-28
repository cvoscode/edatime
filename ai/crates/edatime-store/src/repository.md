# crates/edatime-store/src/repository.rs
> Thread-safe in-memory LazyFrame repository with fast reads and revision tracking.

## Struct

### `DatasetMeta`
- `row_count: usize`
- `column_names: Vec<String>`
- `time_column: Option<String>`

### `InMemoryDataRepository`
- `lf: Arc<StdRwLock<LazyFrame>>`
- `meta: Arc<StdRwLock<DatasetMeta>>`
- `revision: AtomicU64`
- `time_column_display_name: Arc<StdRwLock<Option<String>>>`

## Methods
- `new(df: DataFrame) -> Self`
- `snapshot(&self) -> LazyFrame` [deps: [state][1]]
- `meta(&self) -> Arc<StdRwLock<DatasetMeta>>`
- `revision(&self) -> u64`
- `bump_revision(&self) -> u64`
- `time_column_display_name(&self) -> Arc<StdRwLock<Option<String>>>`

## Trait

### `DataRepository`
- `snapshot(&self) -> LazyFrame`
- `meta(&self) -> Arc<StdRwLock<DatasetMeta>>`
- `revision(&self) -> u64`
- `bump_revision(&self) -> u64`
- `time_column_display_name(&self) -> Arc<StdRwLock<Option<String>>>`
- `time_column_display_name_sync(&self) -> Option<String>`
- `set_time_column_display_name(&self, name: Option<String>)`
- `replace_from_dataframe(&self, df: DataFrame) -> Result<u64, ()>`

---
[1]: state.md