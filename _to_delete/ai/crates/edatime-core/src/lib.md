# crates/edatime-core/src/lib.rs
> Pure data types, traits, pipeline IR. Zero external I/O. Re-exports Polars types.

## Re-exports
- `ResponseCache` [deps: [cache][1]]
- `AppError` [deps: [error][2]]
- `range_predicate`, `time_predicate` [deps: [expr][3]]
- `ResponseMeta`, `edatime_headers` [deps: [http][4]]
- `AppMetrics` [deps: [metrics][5]]
- `Pipeline`, `PipelineStage`, `ProjectStage`, `SortStage`, `TimeFilterStage` [deps: [pipeline][6]]
- `col`, `lit` (Polars)
- `DataFrame`, `DataType`, `DatasetMeta`, `Expr`, `LazyFrame`, `Revision`, `TimeContext` [deps: [types][7]]

---
[1]: cache.md
[2]: error.md
[3]: expr.md
[4]: http.md
[5]: metrics.md
[6]: pipeline.md
[7]: types.md