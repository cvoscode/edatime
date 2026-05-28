# crates/edatime-service/src/handlers/routes/aggregate.rs
> `GET /api/aggregate` — bucket-aggregated bar/heatmap data.

## Struct (Query Params)

### `AggregateQuery`
- `start: DateTime<Utc>`
- `end: DateTime<Utc>`
- `columns: Option<String>`
- `buckets: usize` — default: 50
- `window_mode: AggregateWindowMode` — Buckets, Tumbling, Sliding
- `window_ms: Option<i64>`
- `step_ms: Option<i64>`
- `agg: AggFn` — Mean, Sum, Min, Max, Count
- `format: Option<String>`

## Handler

- `get_aggregate(State(state): State<AppState>, Query(params): Query<AggregateQuery>) -> Result<impl IntoResponse, AppError>`