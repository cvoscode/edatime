# edatime

edatime is an interactive exploratory data analysis app for time-series datasets. It combines a Rust/Axum/Polars backend with a framework-free frontend and GPU-accelerated chart rendering.

## Current highlights

- Interactive multi-series time-series chart
- Per-series custom colors on the main chart
- Server-side time filtering with Arrow IPC transport for main series data
- MinMaxLTTB downsampling for large ranges
- Column range filters on temporal views
- Adaptive line filters created directly on the time-series plot
- Linked scatter and density plots
- Correlation suggestions for scatter plot exploration
- Upload preview with dataset profiling and selectable upload columns
- Partial ingestion by row count, skipped rows, and optional time range
- Chart drawing tools and PNG/SVG/HTML export
- WebGPU guard plus fallback chart registration

## Architecture

### Backend

- Rust + Axum HTTP server
- Polars for ingestion, filtering, aggregation, and lazy query execution
- Apache Arrow IPC for large tabular responses where columnar transport matters most
- `minmaxlttb` for downsampling time-series responses
- Shared in-memory `DataFrame` stored behind `Arc<RwLock<_>>`

Key backend routes:

- `GET /api/health`
- `GET /api/metadata`
- `GET /api/data`
- `GET /api/aggregate`
- `GET /api/scatter/correlations`
- `GET /api/scatter/points`
- `POST /api/scatter/points`
- `POST /api/upload`
- `POST /api/upload/preview`

### Frontend

- Vanilla JavaScript, HTML, and CSS
- ChartGPU-backed temporal and scatter rendering
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
2. User selects one or more numeric columns.
3. Frontend requests `/api/data` with time range, width, and selected columns.
4. Backend filters by time range and downsamples if needed.
5. Backend returns Arrow IPC.
6. Frontend decodes Arrow IPC and renders the selected series.
7. Local range filters, adaptive line filters, and custom series colors are applied in the frontend render/state flow.
8. Zooming triggers a debounced refetch.

### Scatter / density page

1. Frontend requests `/api/scatter/correlations` to build suggestions.
2. Frontend requests `/api/scatter/points` for the current X/Y pair.
3. Linked chart range, numeric filters, and adaptive line filters are sent with the scatter request.
4. Backend applies lazy Polars filtering and returns scatter points.
5. Scatter mode renders sampled points; density mode renders density bins.

### Upload flow

1. Frontend uploads a file to `/api/upload/preview`.
2. Backend scans the file and returns metadata plus column profile information.
3. User optionally selects a subset of columns and partial-load settings.
4. Frontend uploads the file to `/api/upload` with the chosen options.
5. Backend ingests the filtered selection into the shared in-memory dataframe.

## Transport choices

- Arrow IPC is the preferred transport for large time-series and aggregate payloads.
- Scatter points currently use JSON over both `GET` and `POST`, with `POST` used by the frontend to avoid long query strings when many filters are active.
- Metadata, upload preview, and correlation suggestions remain JSON because they are nested and not naturally columnar.

## Usage notes

- Ctrl+click a selected series chip to choose which column receives new adaptive line filters.
- Ctrl+click twice on the temporal chart to create adaptive filter segments.
- Use the chip color picker to change a series color without refetching.
- Use `Clear Filter` to remove adaptive line filters from the main chart.
- Double right-click a series chip to open its numeric range filter.

## Development

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
node --check frontend/js/app.js
node --check frontend/js/chart.js
node --check frontend/js/dataClient.js
node --check frontend/js/scatterPage.js
node --check frontend/js/ui/columns.js
node --check frontend/js/ui/toolbar.js
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
