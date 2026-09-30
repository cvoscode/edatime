# crates/edatime-service/src/handlers/routes/aggregate.rs
> `GET /api/v1/aggregate` — bucket-aggregated bar/heatmap data; supports both Arrow and JSON output.

## Handler
- `#[tracing::instrument(skip(state))] pub async fn get_aggregate(State(state): State<AppState>, Query(params): Query<AggregateQuery>) -> Result<Response, AppError>` → `GET /api/v1/aggregate`
  - Validates `params.start`/`params.end` via `validate_time_window`.
  - When `params.window_mode == Buckets`, validates `params.buckets` via `validate_bucket_count`.
  - Resolves numeric columns from `params.columns` via `validate_numeric_columns_lazy`.
  - Resolves the time-context via `state.ts_context(&lf)` and multiplies start/end epoch ms by `ctx.multiplier`.
  - Builds a `Reduction`:
    - `Buckets` → `Reduction::BucketAgg { buckets, agg }`.
    - `Tumbling` / `Sliding` → `Reduction::WindowAgg { window_size_native, step_size_native, agg }`. `step_native` defaults to `window_native` for tumbling; `step_ms` is required-validated via `validate_window_ms` for sliding.
  - Reuses `pipeline::filter_time_range` (single source of truth for the projection shape) so the `ts_col` is always present.
  - Offloads `pipeline::apply_reduction` to `tokio::task::spawn_blocking` to avoid Polars' streaming runtime colliding with the Tokio worker.
  - Pushes a `QueryEntry` to `state.push_query(...)` with the chosen `reduction` (`BucketAgg { buckets, agg }` or `WindowAgg { window_ms, step_ms, agg }`) and the `ts_dtype`.
  - Inserts the result into `state.cache` under the key `agg:v{revision}:{start}:{end}:{cols}:{agg}:{window_mode}`.
  - Emits either `CachedResponse::arrow(...)` (`application/vnd.apache.arrow.stream`) or `CachedResponse::json(...)` (per-column `data` map, dtypes coerced to Float64/Int64/String).
  - Calls `cached.into_response("miss")` so the client sees `x-edatime-cache: miss`.

## Query / payload structs
- `AggregateQuery { start: DateTime<Utc>, end: DateTime<Utc>, columns?: Option<String>, buckets: usize, window_mode: AggregateWindowMode, window_ms?: Option<i64>, step_ms?: Option<i64>, agg: AggFn, format?: Option<String> }` (defined in `edatime_query::query`).
- `AggregateWindowMode::{Buckets, Tumbling, Sliding}` and `AggFn::{Mean, Sum, Min, Max, Count}` — both enums are re-exported through `edatime_query`.

## Notes
- The legacy `/api/aggregate` comment in the source file is stale; the canonical mount is `/api/v1/aggregate` (see [`./mod.md`](./mod.md)).
- JSON output drops nulls as `null` literals; numeric timestamps come back as epoch-ms Int64.
- The handler does not call `add_edatime_headers` — the `CachedResponse` machinery supplies the same headers (`x-edatime-downsampled`, `x-edatime-returned-rows`, `x-edatime-target-points`, `x-edatime-time-column`, `x-edatime-cache`).

## Cross-references
- `AggregateQuery`, `AggregateWindowMode`, `AggFn`, `ReductionSpec`, `QueryEntry`: see [`../../edatime-query/src/query.md`](../../edatime-query/src/query.md).
- `Reduction`, `pipeline::filter_time_range`, `pipeline::apply_reduction`, `pipeline::serialize_arrow`: see [`../../edatime-query/src/pipeline.md`](../../edatime-query/src/pipeline.md) and [`../../edatime-query/src/aggregations.md`](../../edatime-query/src/aggregations.md).
- Validators: see [`../../edatime-query/src/validation.md`](../../edatime-query/src/validation.md).
- `CachedResponse`, `state.cache`: see [`../../edatime-store/src/cache.md`](../../edatime-store/src/cache.md) and [`../../edatime-store/src/state.md`](../../edatime-store/src/state.md).
