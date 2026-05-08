# Copilot Instructions for edatime

edatime is an interactive time-series analytics app with a Rust/Axum/Polars backend and a vanilla-JS frontend built around ChartGPU. The main time-series transport is Apache Arrow IPC over HTTP. Secondary analytics endpoints currently use a mix of Arrow IPC and JSON depending on payload shape.

## Runtime configuration

- The backend can load optional runtime configuration from `config.toml` or a path supplied through `EDATIME_CONFIG`.
- Prefer wiring operational defaults through `src/config.rs` instead of hardcoding them in handlers or `main.rs`.

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
  - returns dataset schema, numeric columns, time range, and column profiles
- `GET /api/health`
- `GET /api/aggregate`
  - supports Arrow IPC or JSON output
- `GET /api/metrics`
  - returns in-memory runtime metrics for request counts, caching, rate limiting, scatter sampling, and dataset revision
- `GET /api/scatter/correlations`
  - returns correlation suggestions and candidate columns for scatter analysis
- `GET /api/scatter/points`
- `POST /api/scatter/points`
  - returns Arrow IPC with `application/vnd.apache.arrow.stream`
  - metadata (total, returned, color_min/max) in response headers
  - frontend currently uses POST to avoid long query strings when many filters are active
- `POST /api/upload`
  - supports partial ingestion, column subset selection, and optional time slicing
- `POST /api/upload/preview`
  - returns preview metadata used to populate the profile grid before ingest
- All API routes are also available under `/api/v1/*` for versioned clients

### Frontend runtime structure

- Main app bootstrap in `frontend/js/app.js`
  - loads metadata
  - initializes upload/profile, chart, scatter page, and analysis controls
  - coordinates refetches and local re-rendering
- Shared state in `frontend/js/state.js`
  - selected series
  - per-series custom colors
  - numeric range filters
  - adaptive line filters
  - current chart viewport
  - chart text overlays
- Main chart adapter in `frontend/js/chart.js`
  - ChartGPU-backed time-series rendering
  - overlay rendering for adaptive filters and drawings
  - zoom handling
  - export helpers
- Chart registry in `frontend/js/charts/registry.js`
  - registers the primary ChartGPU line chart and Canvas fallback chart
- Scatter analytics in `frontend/js/scatterPage.js`
  - correlation suggestions
  - scatter/density rendering
  - linked filter propagation
  - optional scatter color-column rendering

### Frontend modules

#### Main chart page
- `frontend/js/app.js`
- `frontend/js/chart.js`
- `frontend/js/ui/columns.js`
- `frontend/js/ui/toolbar.js`
- `frontend/js/charts/registry.js`
- `frontend/js/charts/fallback.js`

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
- Zooming with history and reset-to-initial-view support
- Live analysis status for range, Y-range, cursor, and clicked point
- Server-side time filtering with Arrow IPC streaming
- MinMaxLTTB downsampling
- Chart title and axis label overlays
- Upload preview and partial ingestion
- Upload-time column subset selection
- Dataset metadata and time-range detection during preview
- Column profile grid with sorting, resizing, and virtualization
- Short-lived in-memory caching for repeated `/api/data` requests
- Request validation and upload-size enforcement on backend routes
- In-memory runtime metrics and per-client rate limiting
- Numeric range filters on temporal data
- Adaptive line filters created from Ctrl+click interactions on the main chart
- Adaptive filter target selection via Ctrl+click on a selected series chip
- Adaptive filter clear controls
- Drawing tools and export actions on the main chart
- Scatter and density analytics page with correlation suggestions
- Scatter matrix view for pairwise comparisons
- Distribution cards (histogram/KDE/box) for numeric columns
- Optional scatter color encoding with selectable color scales
- Linked brush/filter propagation from the main chart into scatter queries
- Filtered scatter export to PNG/SVG/HTML/CSV/JSON
- Filtered chart export to CSV/JSON
- Keyboard shortcuts for chart/scatter workflows
- WebGPU availability guard with a user-facing error
- Canvas fallback chart registration

## Known active issue (priority)

- Scatter color-by-column is currently unreliable in some datasets/modes and should be treated as the first implementation priority before broader roadmap changes.

## Roadmap priorities (2026-04-07)

Execution order: fix scatter color-by-column first, then deliver the requested feature set below.

1. Color-by-column reliability (scatter first)
  - Ensure `/api/scatter/points` returns a consistent color contract for numeric vs categorical color columns.
  - Make frontend scatter rendering resilient when color arrays are partially missing or contain non-finite values.
  - Verify colorbar and legend behavior across scatter and density modes.

2. UI installation without npm (`ui Installation ohne npm`)
  - Keep runtime/distribution npm-free (Rust backend + vendored frontend libs).
  - Treat Node tooling as optional developer convenience only.
  - Preserve Rust-based frontend validation path.

3. Time-series color column (`time series Plot color column`)
  - Support category and numeric color columns in the main time-series chart.
  - Keep legend/colorbar behavior consistent with column dtype.

4. Time-series UI with more columns (`ui timeseries Plot mehr columns`)
  - Improve column toggle ergonomics for wide schemas (scroll/overflow behavior).
  - Preserve chip actions: selection, custom color, adaptive-target interactions.

5. CSV import time parsing (`import csv time column Unix/string`)
  - Support Unix timestamps and string-formatted time columns with predictable parsing.
  - Keep preview metadata and ingest behavior aligned.

6. Scatter layout refinements (`scatter: colorscale und Pearson sind zu sehr im Plot`)
  - Rework scatter toolbar/overlay layout so color scale and Pearson/Spearman stats do not crowd the plot.
  - Keep responsive behavior for small screens.

7. Aggregation windows (`Features aggregationen Windows`)
  - Extend aggregate APIs with window-oriented semantics (initially tumbling windows, optional sliding later).
  - Add compatible frontend controls once API semantics are stable.

8. Export parquet (`Export in parquet`)
  - Add filtered dataset export as Parquet from backend routes.
  - Wire main chart/scatter export controls to the new endpoint.

## Current data flow

### Main chart page
1. Frontend fetches `/api/metadata`.
2. Frontend builds series chips, range controls, upload/profile UI, analysis controls, and chart state.
3. User may locally change per-series chart colors from the series chips.
4. Frontend requests `/api/data?start=...&end=...&width=...&columns=...`.
5. Backend filters and downsamples in Polars.
6. Backend returns Arrow IPC.
7. Frontend decodes Arrow and renders through ChartGPU.
8. Frontend applies local numeric range filters, adaptive line filters, and custom series colors.
9. Zooming triggers a debounced re-fetch, while purely presentational changes stay local.

### Scatter page
1. Frontend fetches `/api/scatter/correlations` for X/Y suggestions.
2. Frontend sends a `POST /api/scatter/points` request for the selected X/Y pair.
3. Request payload may include linked time range, numeric filters, adaptive line filters, and an optional scatter color column.
4. Backend applies lazy Polars filtering.
5. Backend returns scatter points as JSON.
6. Scatter mode renders points directly; density mode renders density bins.
7. Scatter-only color scale settings are applied in the scatter renderer.

### Upload flow
1. Frontend uploads a file to `/api/upload/preview`.
2. Backend scans the file and returns dataset metadata plus column profiles.
3. User optionally selects partial-load settings and a subset of columns.
4. Frontend uploads the file to `/api/upload` with those options.
5. Backend ingests the selection into the shared `DataFrame`.
6. Frontend reloads against the newly ingested dataset and rebuilds UI state from metadata.

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
- `frontend/js/ui/columns.js`: series chips, per-series color pickers, adaptive filter targeting, and range/filter controls live here.

## Implementation preferences

- Time columns should stay temporal throughout the backend pipeline.
- Timestamp display in the frontend should use date/time formatting when a column is temporal.
- Marker/helper series should not pollute user-facing legends.
- Numeric filter inputs should remain easy to adjust and human-readable.
- New controls should match the existing compact toolbar/modal style.
- Avoid refetching when a purely presentational change can be handled locally, such as series color changes.
- Keep main-chart series colors and scatter-page color-column rendering conceptually separate.

## Practical reminders

- If a change affects both the time-series page and scatter page, verify both flows.
- Keep scatter legend and color behavior aligned with render mode.
- If you change series chip behavior, verify color picking, adaptive target selection, and filter modal entry points together.
- If adaptive filtering changes, verify overlay rendering, local filtering, and scatter propagation together.
- If upload behavior changes, verify preview, selection, and final ingest flows together.


