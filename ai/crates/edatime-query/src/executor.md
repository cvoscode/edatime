# crates/edatime-query/src/executor.rs
> Query executor with proper thread pool separation. CPU-bound Polars work runs on Rayon pool via spawn_blocking.

## Enums

### `ExecutionContext`
- `Eager`
- `Streaming`
- `Parallel`

## Struct

### `QueryExecutor`
- `ctx: ExecutionContext`
- `thread_pool: Arc<ThreadPool>`

## Methods
- `new(ctx: ExecutionContext) -> Self`
- `execute_async(&self, lf: LazyFrame) -> Result<DataFrame, AppError>` [deps: [../../edatime-core/src/error][1]]
- `execute(&self, lf: LazyFrame) -> Result<DataFrame, AppError>` [deps: [../../edatime-core/src/error][1]]
- `collect_eager(&self, lf: LazyFrame) -> Result<DataFrame, AppError>`
- `collect_streaming(&self, lf: LazyFrame) -> Result<DataFrame, AppError>`
- `collect_parallel(&self, lf: LazyFrame) -> Result<DataFrame, AppError>`

---
[1]: ../../edatime-core/src/error.md