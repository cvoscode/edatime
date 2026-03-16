# edatime

edatime is an interactive exploratory data analysis app for time-series datasets. It combines a Rust/Axum/Polars backend with a framework-free frontend and GPU-accelerated chart rendering.

## Feature set

### Time-series analysis

- Interactive multi-series time-series chart
- Per-series custom colors set directly from the series chips
- Server-side time filtering with Arrow IPC transport for main series data
- MinMaxLTTB downsampling for large ranges
- Zoom, zoom history, and reset-to-initial-view behavior
- Live analysis readouts for current range, Y-range, cursor, and clicked point
- Local numeric range filters on plotted columns
- Adaptive line filters created directly on the time-series plot
- Adaptive filter target selection via Ctrl+click on the active series chip
- Adaptive filter clear controls and overlay rendering
- Chart title, X-axis label, and Y-axis label overlays
- Drawing tools for arrows and boxes on the main chart
- PNG, SVG, HTML, CSV, and JSON export actions

### Scatter and density analysis

- Dedicated scatter and density analytics page
- Correlation suggestions for choosing X/Y pairs
- Scatter plot matrix for quick pairwise comparison
- Distribution cards for active scatter axes and color channels
- Linked time-range propagation from the main chart
- Linked numeric range and adaptive line filter propagation into scatter queries
- Scatter point rendering and density bin rendering modes
- Optional scatter color encoding with selectable color scales
- Scatter zoom and visibility stats
- Matrix cell selection keeps scatter exploration linked to the active pair

### Upload and profiling

- Upload preview before ingest
- Dataset metadata and time-range detection
- Upload-time column subset selection
- Partial ingestion by row count, skipped rows, and optional time range
- Column profile grid with null counts, bounds, and histograms
- Sortable, resizable, virtualized profile table

### Runtime and transport

- WebGPU availability guard with user-facing error handling
- Canvas fallback chart registration
- Arrow IPC as the default transport for large tabular payloads
- JSON transport for metadata, upload preview, correlation suggestions, and scatter payloads

## Architecture

### Backend

- Rust + Axum HTTP server
- Polars for ingestion, filtering, aggregation, and lazy query execution
- Apache Arrow IPC for large tabular responses where columnar transport matters most
- `minmaxlttb` for downsampling time-series responses
- Shared in-memory `DataFrame` stored behind `Arc<RwLock<_>>`

Key backend routes:

- `GET /api/health`
- `GET /api/v1/health`
- `GET /api/metadata`
- `GET /api/data`
- `GET /api/aggregate`
- `GET /api/metrics`
- `GET /api/scatter/correlations`
- `GET /api/scatter/points`
- `POST /api/scatter/points`
- `POST /api/upload`
- `POST /api/upload/preview`

All current routes are also exposed under `/api/v1/*` so existing frontend calls can stay on `/api/*` while external clients move to a stable versioned API surface.

### Frontend

- Vanilla JavaScript, HTML, and CSS
- ChartGPU-backed temporal and scatter rendering
- Chart-type registry with a Canvas fallback renderer
- Shared app state in `frontend/js/state.js`
- Modular UI logic in `frontend/js/ui/*`

Important frontend modules:

- `frontend/js/app.js` — main app bootstrap and temporal chart orchestration
- `frontend/js/chart.js` — time-series chart adapter, overlay rendering, exports, zoom
- `frontend/js/dataClient.js` — metadata, Arrow IPC, scatter, and aggregate fetch helpers
- `frontend/js/scatterPage.js` — scatter/density analytics page
- `frontend/js/ui/columns.js` — series chips, range chips, adaptive filter targeting, series color pickers
- `frontend/js/ui/toolbar.js` — zoom, draw, export, and chart controls
- `frontend/js/ui/upload.js` — upload preview and ingest flow
- `frontend/js/ui/profile.js` — upload preview column profile grid

## Data flow

### Main time-series page

1. Frontend loads metadata from `/api/metadata`.
2. Frontend builds series chips, range controls, analysis controls, upload/profile UI, and shared chart state.
3. User selects one or more numeric columns and optionally customizes per-series colors locally.
4. Frontend requests `/api/data` with time range, viewport width, and selected columns.
5. Backend filters by time range and downsamples if needed.
6. Backend returns Arrow IPC.
7. Frontend decodes Arrow IPC and rebuilds the selected series.
8. Local numeric range filters, adaptive line filters, and custom series colors are applied in the frontend render path.
9. Zooming triggers a debounced refetch, while purely presentational changes like series colors do not.

### Scatter / density page

1. Frontend requests `/api/scatter/correlations` to build X/Y suggestions.
2. Frontend requests `/api/scatter/points` for the selected X/Y pair.
3. Linked chart range, numeric filters, and adaptive line filters are included in the scatter request.
4. Backend applies lazy Polars filtering and returns scatter points as JSON.
5. Scatter mode renders sampled points directly; density mode renders density bins.
6. Optional color-column and color-scale settings are applied on the scatter side without changing main-chart series colors.

### Upload flow

1. Frontend uploads a file to `/api/upload/preview`.
2. Backend returns preview metadata and column profile information for the pending file.
3. Frontend hydrates the profile grid and lets the user select columns and partial-load settings.
4. Frontend uploads the file to `/api/upload` with the chosen options.
5. Backend ingests the filtered selection into the shared in-memory dataframe.
6. Frontend reloads against the new dataset metadata and time range.

## Transport choices

- Arrow IPC is the preferred transport for large time-series and aggregate payloads.
- Scatter points currently use JSON over both `GET` and `POST`, with `POST` used by the frontend to avoid long query strings when many filters are active.
- Metadata, upload preview, and correlation suggestions remain JSON because they are nested and not naturally columnar.

## Runtime safeguards

- `/api/data` responses are cached in memory for short-lived repeated range requests and invalidated automatically when a new dataset is uploaded.
- Query-heavy endpoints validate time windows, bucket counts, viewport widths, selected columns, and scatter limits before entering the Polars pipeline.
- Uploads are bounded by a request-size limit and cleaned up through temporary-file lifetimes instead of persistent temp paths.
- `/api/metrics` exposes request counts, cache hit/miss counters, rate-limit counters, scatter sampling stats, and dataset revision metadata.

## Configuration

- The backend can load optional runtime configuration from `config.toml` or from a path set in `EDATIME_CONFIG`.
- Environment overrides are supported for host, port, sample data path, cache sizing, rate limits, and max upload size.
- Useful variables include `EDATIME_HOST`, `EDATIME_PORT`, `EDATIME_SAMPLE_DATA`, `EDATIME_CACHE_TTL_SECONDS`, `EDATIME_RATE_LIMIT_MAX_REQUESTS`, and `EDATIME_MAX_UPLOAD_BYTES`.

## Usage notes

- Ctrl+click a selected series chip to choose which column receives new adaptive line filters.
- Ctrl+click twice on the temporal chart to create adaptive filter segments.
- Use the chip color picker to change a series color without refetching.
- Series colors affect the main time-series chart only; scatter color scales are configured separately on the scatter page.
- Use `Clear Filter` to remove adaptive line filters from the main chart.
- Double right-click a series chip to open its numeric range filter.

## Development

Additional docs:

- `docs/developer-guide.md` - local development, validation, benchmarks, and release workflow
- `SECURITY.md` - supported versions, reporting path, and automated audit coverage

### Requirements

- Rust stable toolchain
- A modern browser with WebGPU support recommended

### Run

```bash
cargo run
```

Then open http://127.0.0.1:3000.

### Validate

```bash
cargo check
cargo test
npm run check:frontend
```

### Benchmarks

```bash
cargo bench --bench pipeline_bench
```

### Security audit

```bash
cargo install cargo-audit --locked
cargo audit
```

## Project structure

- `src/`
  - `main.rs` — Axum router and server bootstrap
  - `pipeline.rs` — filter/reduce/serialize pipeline helpers
  - `query.rs` — shared query parsing and output format helpers
  - `routes/` — HTTP handlers
  - `ingest.rs` — CSV/Parquet ingest logic
  - `downsample.rs` — MinMaxLTTB integration
  - `arrow_export.rs` — Arrow IPC serialization helpers
- `frontend/`
  - `index.html` — application shell
  - `css/style.css` — application styling
  - `js/` — frontend modules
  - `libs/chartgpu/` — bundled chart renderer
