# crates/edatime-service/src/handlers/routes/data.rs
> `GET /api/data` — full dataset with LTTB downsampling.

## Handler

### `get_data(State(state): State<AppState>, Query(params): Query<DataQuery>) -> Result<Response, AppError>`
- Validates time window, width, numeric columns
- Applies time filter + column projection via Pipeline [deps: [edatime-core/pipeline][1]]
- Executes via QueryExecutor [deps: [edatime-query/executor][2]]
- Applies LTTB reduction [deps: [edatime-query/pipeline][3]]
- Returns Arrow IPC or JSON via CachedResponse [deps: [edatime-store/cache][4]]

---
[1]: ../../../edatime-core/src/pipeline.md
[2]: ../../../edatime-query/src/executor.md
[3]: ../../../edatime-query/src/pipeline.md
[4]: ../../../edatime-store/src/cache.md