# Copilot Instructions for edatime

edatime is an interactive time-series analytics app with a Rust/Axum/Polars backend and a vanilla-JS frontend built around ChartGPU. The main time-series transport is Apache Arrow IPC over HTTP. Secondary analytics endpoints currently use a mix of Arrow IPC and JSON depending on payload shape.

## Current stack

- Backend: Rust, Axum, Tokio, Polars, Arrow IPC, minmaxlttb, tracing
- Frontend: vanilla JavaScript, ChartGPU, plain HTML/CSS
- Shared runtime data: in-memory Polars `DataFrame` behind `Arc<RwLock<_>>`

## Current architecture

### Backend routes

- `GET /api/data`
  - filters by time range
  - downsamples with `minmaxlttb` when needed
  - returns Arrow IPC with `application/vnd.apache.arrow.stream`
- `GET /api/metadata`
- `GET /api/health`
- `GET /api/aggregate`
  - supports Arrow IPC or JSON output
- `GET /api/scatter/correlations`
- `GET /api/scatter/points`
- `POST /api/scatter/points`
  - frontend currently uses POST to avoid long query strings when many filters are active
- `POST /api/upload`
- `POST /api/upload/preview`

### Frontend modules

#### Main chart page
- `frontend/js/app.js`
- `frontend/js/chart.js`
- `frontend/js/ui/columns.js`
- `frontend/js/ui/toolbar.js`

#### Scatter / density analytics page
- `frontend/js/scatterPage.js`

#### Upload and dataset profiling
- `frontend/js/ui/upload.js`
- `frontend/js/ui/profile.js`

#### Shared state and transport helpers
- `frontend/js/state.js`
- `frontend/js/dataClient.js`

## Current feature set

- Multi-series temporal charting
- Per-series custom colors for the time-series plot
- Server-side time filtering with Arrow IPC streaming
- MinMaxLTTB downsampling
- Upload preview and partial ingestion
- Upload-time column subset selection
- Column profile grid
- Numeric range filters on temporal data
- Adaptive line filters created from Ctrl+click interactions on the main chart
- Adaptive filter target selection via Ctrl+click on a selected series chip
- Adaptive filter clear controls
- Drawing tools and export actions on the main chart
- Scatter and density analytics page with correlation suggestions
- Linked brush/filter propagation from the main chart into scatter queries
- WebGPU availability guard with a user-facing error
- Canvas fallback chart registration

## Current data flow

### Main chart page
1. Frontend fetches `/api/metadata`.
2. Frontend builds series chips, range controls, upload/profile UI, and chart state.
3. Frontend requests `/api/data?start=...&end=...&width=...&columns=...`.
4. Backend filters and downsamples in Polars.
5. Backend returns Arrow IPC.
6. Frontend decodes Arrow and renders through ChartGPU.
7. Frontend applies local numeric range filters, adaptive line filters, and custom series colors.
8. Zooming triggers a debounced re-fetch.

### Scatter page
1. Frontend fetches `/api/scatter/correlations` for X/Y suggestions.
2. Frontend sends a `POST /api/scatter/points` request for the selected X/Y pair.
3. Request payload may include linked time range, numeric filters, and adaptive line filters.
4. Backend applies lazy Polars filtering.
5. Backend returns scatter points as JSON.
6. Scatter mode renders points directly; density mode renders density bins.

### Upload flow
1. Frontend uploads a file to `/api/upload/preview`.
2. Backend scans the file and returns dataset metadata plus column profiles.
3. User optionally selects partial-load settings and a subset of columns.
4. Frontend uploads the file to `/api/upload` with those options.
5. Backend ingests the selection into the shared `DataFrame`.

## Transport guidance

- Keep Arrow IPC as the default transport for large tabular series payloads.
- JSON is acceptable for nested metadata, upload preview responses, correlation suggestions, and scatter payloads where the current frontend shape is convenient.
- If you move another endpoint to Arrow IPC, update both the backend route contract and `frontend/js/dataClient.js`.

## Coding guidance

### Rust guidance
- Prefer returning `Result<impl IntoResponse, AppError>` from handlers.
- Use `tracing` instead of `println!`.
- Avoid `unwrap()` and `expect()` on production paths.
- Keep read/write lock lifetimes short.
- Use lazy Polars queries for filtering/projection work.
- Keep heavy CPU or file work off the async executor via blocking helpers.

### Frontend guidance
- Keep the frontend framework-free.
- Reuse the existing modules instead of adding monolithic files.
- Preserve the current dark UI and plain CSS approach.
- Prefer typed-array-friendly data flow and avoid unnecessary copies.
- Keep ChartGPU integration lightweight.
- When changing static assets or dynamic imports, bump version query strings.

## File-level conventions

- `src/downsample.rs`: reuse existing downsampling helpers; do not reimplement LTTB.
- `src/arrow_export.rs`: keep Arrow export logic centralized here.
- `src/routes/*.rs`: document route changes in `src/main.rs`, `src/routes/mod.rs`, README, and this instructions file.
- `frontend/js/chart.js`: preserve external zoom/refetch behavior and overlay rendering.
- `frontend/js/scatterPage.js`: keep scatter/density rendering, color legend behavior, and linked filtering in sync.
- `frontend/js/ui/columns.js`: series chips, adaptive filter targeting, and range/filter controls live here.

## Implementation preferences

- Time columns should stay temporal throughout the backend pipeline.
- Timestamp display in the frontend should use date/time formatting when a column is temporal.
- Marker/helper series should not pollute user-facing legends.
- Numeric filter inputs should remain easy to adjust and human-readable.
- New controls should match the existing compact toolbar/modal style.
- Avoid refetching when a purely presentational change can be handled locally, such as series color changes.

## Practical reminders

- If a change affects both the time-series page and scatter page, verify both flows.
- Keep scatter legend and color behavior aligned with render mode.
- If adaptive filtering changes, verify overlay rendering, local filtering, and scatter propagation together.
- If upload behavior changes, verify preview, selection, and final ingest flows together.


