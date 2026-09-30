# ai/crates/edatime-service/src/handlers/routes/data.md
> `GET /api/v1/data` and `POST /api/v1/data` handlers for filtered time-series data with optional lookaround buffering, cleaning-plan awareness, LTTB reduction, and cached Arrow/JSON responses.

## Handlers
- `get_data(State(state): State<AppState>, Query(params): Query<DataQuery>) -> Result<Response, AppError>`
  - Validates time window, width, and numeric columns.
  - Extends the requested time window by `lookaround_ms` before filtering when the query provides it.
  - Applies time filtering and projection, runs LTTB reduction, and caches the serialized Arrow/JSON response.
  - Adds response headers including `x-edatime-downsampled`, `x-edatime-returned-rows`, `x-edatime-target-points`, `x-edatime-time-column`, `x-edatime-empty`, `x-edatime-filtered-rows`, and `x-edatime-dropped-rows`.
- `post_data(State(state): State<AppState>, Json(params): Json<DataQuery>) -> Result<Response, AppError>`
  - JSON-body counterpart of `get_data`. Used by the frontend when many filters / adaptive line filters would otherwise exceed query-string length limits.
  - Returns the same response shape and headers as `GET /api/v1/data`.

## Query / payload structs
- `DataQuery { start, end, width, columns?, color_column?, lookaround_ms?, format? }` — accepted by both GET and POST. `PlanAwareDataQuery` extends `DataQuery` with an optional `cleaning_plan` so the response can transparently use a previously computed cleaning plan instead of recomputing it.
