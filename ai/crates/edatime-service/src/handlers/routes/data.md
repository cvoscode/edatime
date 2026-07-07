# ai/crates/edatime-service/src/handlers/routes/data.md
> `GET /api/data` handler for filtered time-series data with optional lookaround buffering, LTTB reduction, and cached Arrow/JSON responses.

## Handler
- `get_data(State(state): State<AppState>, Query(params): Query<DataQuery>) -> Result<Response, AppError>`
  - Validates time window, width, and numeric columns.
  - Extends the requested time window by `lookaround_ms` before filtering when the query provides it.
  - Applies time filtering and projection, runs LTTB reduction, and caches the serialized Arrow/JSON response.
  - Adds response headers including `x-edatime-downsampled`, `x-edatime-returned-rows`, `x-edatime-target-points`, `x-edatime-time-column`, `x-edatime-empty`, `x-edatime-filtered-rows`, and `x-edatime-dropped-rows`.
