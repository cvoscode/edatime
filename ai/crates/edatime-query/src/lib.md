# crates/edatime-query/src/lib.rs
> edatime-query — LazyFrame query engine with composable transformations. Zero external I/O; all execution via spawn_blocking to Rayon pool.

## Modules
- `aggregations` — Windowed aggregation primitives (mean/sum/min/max/count, tumbling & sliding)
- `arrow_export` — LazyFrame → Arrow IPC export
- `downsample` — MinMaxLTTB downsampling
- `executor` — `QueryExecutor`, `ExecutionContext` (Rayon-backed blocking pool)
- `filters` — Range and adaptive line filter parsing / application
- `pipeline` — Composable query pipeline IR
- `predicates` — Polars predicate builders
- `query` — `QueryEntry`, `DataQuery`
- `transforms` — LazyFrame transformation helpers
- `validation` — Input validation utilities
- `temporal` — Time-context detection and resolution
- `cleaning` — Cleaning-plan IR + dataset-aware validation (consumed by `routes/cleaning`)
- `derived` — Derived-column derivation (e.g. resampling, computed columns) for cleaning plans